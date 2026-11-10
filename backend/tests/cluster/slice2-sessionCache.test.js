// 조각 2 시험: 세션 캐시 지우기 — auth.revoked 방송·받으면 바로 확인·Redis down 캐시 끔·살아나면 바닥 시각
// MN-034·047~055·057~059·102 (메모리 받침 Node 2개, Redis 없이 npm test에서 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const { tick, waitFor, startPair, fakeSocket } = require('./helpers/slice2')
const sessionLifecycle = require('../../services/auth/sessionLifecycle')
const sessionCheck = require('../../socket/connection/sessionCheck')
const policy = require('../../socket/connection/sessionCachePolicy')
const { notifySessionsRevoked, onSessionsRevoked } = require('../../repositories/user/revokeSignal')
const sessionRepository = require('../../repositories/user/session')
const db = require('../../models')

const { revokedAt } = sessionCheck.__testables

// 세션 확인 가짜: 답을 바꿔 가며 부른 수 셈
function stubResolve(t, answer = { ok: true }) {
    const state = { calls: 0, answer }
    t.mock.method(sessionLifecycle, 'resolveSession', async () => {
        state.calls += 1
        return typeof state.answer === 'function' ? state.answer() : state.answer
    })
    return state
}

// 다른 Node가 보낸 auth.revoked가 이 Node에 닿을 때까지
const revokeFromN2 = async (n2, uuid) => {
    assert.equal(await n2.bus.publish('auth.revoked', { uuid }), true)
    await waitFor(() => revokedAt.has(uuid))
}

// 이 Node가 보낸 auth.revoked를 n2가 받는 목록
const listenN2 = (n2) => {
    const got = []
    n2.bus.on('auth.revoked', (msg) => got.push(msg))
    return got
}

test.afterEach(() => policy.__testables.resetFloor())

test('MN-055: 끊김 알림은 내 Node 받는 쪽 먼저(바로) 부르고 다른 Node에 방송, 내가 보낸 것은 다시 안 받음', async (t) => {
    const { n2 } = await startPair(t)
    const heard = []
    t.after(onSessionsRevoked((uuid, info) => heard.push([uuid, info.remote])))
    const got = listenN2(n2)
    notifySessionsRevoked('u-55')
    assert.deepEqual(heard, [['u-55', false]])
    await waitFor(() => got.length === 1)
    assert.equal(got[0].uuid, 'u-55')
    assert.equal(got[0].from, 'n1')
    await tick(20)
    assert.deepEqual(heard, [['u-55', false]])
    await n2.bus.publish('auth.revoked', { uuid: 'u-55b' })
    await waitFor(() => heard.length === 2)
    assert.deepEqual(heard[1], ['u-55b', true])
})

test('MN-047: 다른 Node 로그아웃 방송 → 이 Node 소켓 다음 사건은 5초 안 기다리고 DB 다시 봄·거절', async (t) => {
    const { n2 } = await startPair(t)
    const resolve = stubResolve(t)
    const socket = fakeSocket('u-47')
    sessionCheck.markChecked(socket, Date.now() - 1)
    assert.deepEqual(await sessionCheck.checkForEvent(socket), { ok: true })
    assert.equal(resolve.calls, 0)
    resolve.answer = { ok: false, message: '세션 끝' }
    await revokeFromN2(n2, 'u-47')
    assert.equal((await sessionCheck.checkForEvent(socket)).ok, false)
    assert.equal(resolve.calls, 1)
})

test('MN-047: 로그아웃 기록(recordLogout)이 다른 Node에 auth.revoked를 보냄', async (t) => {
    const { n2 } = await startPair(t)
    const got = listenN2(n2)
    t.mock.method(db.UserSession, 'update', async () => [1])
    t.mock.method(db.LoginHistory, 'findOne', async () => null)
    await sessionRepository.recordLogout('u-47b', 's-1')
    await waitFor(() => got.length === 1)
    assert.equal(got[0].uuid, 'u-47b')
})

test('MN-048·049·052: 비번 바꿈·새 로그인·refresh 재사용(세션 전부 끊기) → 다른 Node 소켓이 1초 안에 끊김', async (t) => {
    const { n2 } = await startPair(t)
    stubResolve(t, { ok: false, message: '세션 끝' })
    const socket = fakeSocket('u-48')
    const watcher = sessionCheck.startSessionRevocationWatcher(socket)
    t.after(() => watcher.stop())
    // n2가 세션 전부 끊기를 한 것처럼 방송 (n2 쪽 저장소는 MN-054 시험이 봄)
    const started = Date.now()
    await n2.bus.publish('auth.revoked', { uuid: 'u-48' })
    await waitFor(() => socket.disconnected, 1000)
    assert.ok(Date.now() - started < 1000)
    assert.deepEqual(socket.emitted[0], { event: 'force_disconnect', payload: { message: '세션 끝', code: 'SESSION_EXPIRED' } })
})

test('MN-034: 정지 → 다른 Node 판 중인 사람이 ACCOUNT_BANNED로 끊김', async (t) => {
    const { n2 } = await startPair(t)
    stubResolve(t, { ok: false, code: 'ACCOUNT_BANNED', message: '정지' })
    const socket = fakeSocket('u-34')
    const watcher = sessionCheck.startSessionRevocationWatcher(socket)
    t.after(() => watcher.stop())
    await n2.bus.publish('auth.revoked', { uuid: 'u-34' })
    await waitFor(() => socket.disconnected, 1000)
    assert.equal(socket.emitted[0].payload.code, 'ACCOUNT_BANNED')
})

test('MN-048: 주기 검사가 도는 중에 방송이 와도 끝난 뒤 한 번 더 확인해서 끊음', async (t) => {
    const { n2 } = await startPair(t)
    let release
    const answers = [new Promise((resolve) => { release = resolve }), { ok: false, message: '끝' }]
    const resolve = stubResolve(t, () => answers.shift())
    const socket = fakeSocket('u-48b')
    const watcher = sessionCheck.startSessionRevocationWatcher(socket)
    t.after(() => watcher.stop())
    sessionCheck.__testables.recheckUser('u-48b')
    await waitFor(() => resolve.calls === 1)
    await n2.bus.publish('auth.revoked', { uuid: 'u-48b' })
    await waitFor(() => revokedAt.has('u-48b'))
    release({ ok: true })
    await waitFor(() => socket.disconnected, 1000)
    assert.equal(resolve.calls, 2)
})

test('MN-050·049: 정지 즉시 끊기 통로의 세션 내림(markOnlineSessionsOffline)이 다른 Node 캐시를 지움', async (t) => {
    const { n2 } = await startPair(t)
    const got = listenN2(n2)
    t.mock.method(db.UserSession, 'findAll', async () => [{ id: 1 }])
    t.mock.method(db.UserSession, 'update', async () => [1])
    const { disconnectUser } = require('../../services/ops/disconnect')
    const uuid = 'aaaaaaaa-0000-4000-8000-000000000050'
    const userRepository = {
        checkActiveBan: async () => ({ reason: 'x' }),
        findByUuid: async () => ({ uuid, status: 'ACTIVE' }),
        markOnlineSessionsOffline: (id) => sessionRepository.markOnlineSessionsOffline(id),
    }
    const result = await disconnectUser(uuid, { getIo: () => null, userRepository })
    assert.equal(result.code, 'ACCOUNT_BANNED')
    await waitFor(() => got.length === 1)
    assert.equal(got[0].uuid, uuid)
})

test('MN-054: 거래 안 세션 끊기는 커밋 뒤에만 방송 (커밋 전엔 다른 Node가 모름)', async (t) => {
    const { n2 } = await startPair(t)
    const got = listenN2(n2)
    t.mock.method(db.UserSession, 'findAll', async () => [{ id: 7 }])
    t.mock.method(db.UserSession, 'update', async () => [1])
    const hooks = []
    await sessionRepository.markOnlineSessionsOffline('u-54', { transaction: { afterCommit: (fn) => hooks.push(fn) } })
    await tick(20)
    assert.equal(got.length, 0)
    assert.equal(hooks.length, 1)
    hooks[0]()
    await waitFor(() => got.length === 1)
    assert.equal(got[0].uuid, 'u-54')
})

test('MN-051: 탈퇴 → 다른 Node 소켓도 ACCOUNT_WITHDRAWN (Node 여러 개면 전 Node 소켓 찾기)', async (t) => {
    await startPair(t)
    const userRepository = require('../../repositories/user')
    const withdrawRepository = require('../../repositories/user/withdraw')
    const gameSession = require('../../game-core/gameSession')
    const emitter = require('../../socket/emitter')
    const withdrawService = require('../../services/auth/account/withdraw')
    const uuid = 'aaaaaaaa-0000-4000-8000-000000000051'
    const remote = fakeSocket(uuid)
    const channels = []
    t.mock.method(gameSession, 'isMatchmakingBlocked', () => false)
    t.mock.method(userRepository, 'withTransaction', async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }))
    t.mock.method(userRepository, 'findByUuid', async () => ({ uuid, has_local_password: false, email: 'a@b.c' }))
    t.mock.method(withdrawRepository, 'detachAccount', async () => {})
    t.mock.method(withdrawRepository, 'closeAccount', async () => {})
    // 어댑터가 다른 Node 소켓까지 모아 주는 io 흉내
    t.mock.method(emitter, 'getIo', () => ({ in: (ch) => { channels.push(ch); return { fetchSockets: async () => [remote] } } }))
    assert.deepEqual(await withdrawService.withdrawAccount({ uuid, confirmEmail: 'a@b.c' }), { ok: true })
    // 두 번 다 계정 채널: 처음은 소켓 찾기, 다음은 다른 Node가 안내·끊기를 다 처리했는지 기다리기 (묶음 6)
    assert.deepEqual(channels, [`user:${uuid}`, `user:${uuid}`])
    assert.equal(remote.emitted[0].payload.code, 'ACCOUNT_WITHDRAWN')
    assert.equal(remote.disconnected, true)
})

test('MN-053: 방송 받기 전에 시작한 확인은 받은 뒤 사건이 같이 기다리지 않고 새로 물음 (경계 시각)', async (t) => {
    const { n2 } = await startPair(t)
    let release
    const answers = [new Promise((resolve) => { release = resolve })]
    const resolve = stubResolve(t, () => answers.shift() ?? { ok: false, message: '끝' })
    const socket = fakeSocket('u-53')
    const first = sessionCheck.checkForEvent(socket)
    await waitFor(() => resolve.calls === 1)
    await revokeFromN2(n2, 'u-53')
    const second = await sessionCheck.checkForEvent(socket)
    assert.equal(second.ok, false)
    assert.equal(resolve.calls, 2)
    release({ ok: true })
    assert.equal((await first).ok, true)
    // 옛 확인이 늦게 "통과"를 가져와도 끊김 뒤 사건은 다시 DB
    assert.equal((await sessionCheck.checkForEvent(socket)).ok, false)
    assert.equal(resolve.calls, 3)
})

test('MN-057: Redis 죽음 → 캐시 꺼짐, 사건마다 DB (SESSION_CACHE_FALLBACK_MS 기본 0)', async (t) => {
    const { hub } = await startPair(t)
    const resolve = stubResolve(t)
    const socket = fakeSocket('u-57')
    sessionCheck.markChecked(socket, Date.now() - 1)
    await sessionCheck.checkForEvent(socket)
    assert.equal(resolve.calls, 0)
    hub.setDown(true)
    await waitFor(() => require('../../cluster').state() === 'down')
    await sessionCheck.checkForEvent(socket)
    await sessionCheck.checkForEvent(socket)
    assert.equal(resolve.calls, 2)
})

test('MN-057: SESSION_CACHE_FALLBACK_MS를 주면 down 동안 그 시간만큼 캐시', async (t) => {
    const { hub } = await startPair(t, { env: { SESSION_CACHE_FALLBACK_MS: '60000' } })
    const resolve = stubResolve(t)
    hub.setDown(true)
    await tick(5)
    const socket = fakeSocket('u-57b')
    await sessionCheck.checkForEvent(socket)
    await sessionCheck.checkForEvent(socket)
    assert.equal(resolve.calls, 1)
})

test('MN-058·102: Redis 살아남 → 그 전 통과는 안 믿고 한 번 DB, 그 뒤로는 다시 5초 캐시', async (t) => {
    const { hub } = await startPair(t)
    const resolve = stubResolve(t)
    const socket = fakeSocket('u-58')
    sessionCheck.markChecked(socket, Date.now() - 1)
    hub.setDown(true)
    hub.setDown(false)
    assert.equal(require('../../cluster').state(), 'up')
    await tick(5)
    await sessionCheck.checkForEvent(socket)
    assert.equal(resolve.calls, 1)
    await sessionCheck.checkForEvent(socket)
    assert.equal(resolve.calls, 1)
})

test('MN-059: 죽은 동안 다른 Node 로그아웃(방송 못 감) → 살아난 뒤에도 옛 통과로 안 넘어감', async (t) => {
    const { hub, n2 } = await startPair(t)
    const resolve = stubResolve(t)
    const socket = fakeSocket('u-59')
    sessionCheck.markChecked(socket, Date.now() - 1)
    hub.setDown(true)
    assert.equal(await n2.bus.publish('auth.revoked', { uuid: 'u-59' }), false)
    resolve.answer = { ok: false, message: '끝' }
    hub.setDown(false)
    await tick(5)
    assert.equal(revokedAt.has('u-59'), false)
    assert.equal((await sessionCheck.checkForEvent(socket)).ok, false)
    assert.equal(resolve.calls, 1)
})

test('MN-089(조각 2): 단일 모드는 캐시 5초 그대로, 방송 안 감', async (t) => {
    const cluster = require('../../cluster')
    await cluster.close()
    const resolve = stubResolve(t)
    const socket = fakeSocket('u-single')
    sessionCheck.markChecked(socket, Date.now() - 1)
    await sessionCheck.checkForEvent(socket)
    assert.equal(resolve.calls, 0)
    assert.equal(policy.cacheWindowMs(5000), 5000)
    assert.equal(await cluster.bus.publish('auth.revoked', { uuid: 'x' }), false)
})
