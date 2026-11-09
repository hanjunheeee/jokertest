// 소켓 세션 확인 줄이기 시험 (부하 줄이기 2026-11-09, docs/부하시험.md 11번)
// 주기 검사 타이머 하나·같은 차례 묶음 질의 · 사건 검사 5초 저장 · 이 서버 끊김 알림이면 바로 다시 봄 · 질의 로그 설정
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const db = require('../../models')
const sessionLifecycle = require('../../services/auth/sessionLifecycle')
const sessionCheckRepository = require('../../repositories/user/sessionCheck')
const { notifySessionsRevoked } = require('../../repositories/user/revokeSignal')
const sessionCheck = require('../../socket/connection/sessionCheck')
const auth = require('../../socket/connection/auth')
const { pickQueryLogging } = require('../../config/dbLogging')

const flush = async (rounds = 5) => {
    for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

function makeSocket(uuid, sessionId = `s-${uuid}`) {
    const listeners = new Map()
    return {
        data: { user: { uuid, sessionId } },
        emitted: [],
        disconnected: 0,
        on(event, fn) { listeners.set(event, fn) },
        emit(event, payload) { this.emitted.push({ event, payload }) },
        disconnect() { this.disconnected += 1 },
        fire(event, ...args) { return listeners.get(event)(...args) },
    }
}

// 가짜 DB 질의: 살아 있는 세션 id 목록만 답함, 부른 횟수·받은 id 기록
function fakeSessionQuery(t, alive) {
    const calls = []
    t.mock.method(db.sequelize, 'query', async (sql, { replacements }) => {
        calls.push(replacements.ids)
        return replacements.ids.filter((id) => alive.has(id)).map((id) => ({
            session_id: id, user_id: id.slice(2), is_online: 1, refresh_token_expires_at: null,
            status: 'ACTIVE', ban_id: null, ban_reason: null,
        }))
    })
    return calls
}

test('주기 검사: 접속자 여럿이어도 타이머 하나, 한 차례 확인은 DB 질의 1번 (사람마다 따로 2번 → 다 같이 1번)', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const people = ['a', 'b', 'c', 'd', 'e']
    const calls = fakeSessionQuery(t, new Set(people.filter((p) => p !== 'c').map((p) => `s-${p}`)))
    const sockets = people.map((p) => makeSocket(p))
    const watchers = sockets.map((s) => sessionCheck.startSessionRevocationWatcher(s))
    t.after(() => watchers.forEach((w) => w.stop()))

    t.mock.timers.tick(sessionCheck.SESSION_CHECK_INTERVAL_MS)
    await flush()

    assert.equal(calls.length, 1, '한 차례 확인이 질의 하나로 묶여야 함')
    assert.deepEqual(calls[0].sort(), people.map((p) => `s-${p}`).sort())
    assert.deepEqual(sockets.map((s) => s.disconnected), [0, 0, 1, 0, 0], '끊긴 세션(c)만 끊음')
    assert.equal(sockets[2].emitted[0].payload.code, 'SESSION_EXPIRED')
})

test('사건 검사: 주기 검사가 통과시킨 뒤 5초 안 사건은 DB 안 감', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const calls = fakeSessionQuery(t, new Set(['s-f']))
    const socket = auth.wrapSocketWithSessionGuard(makeSocket('f'))
    const watcher = sessionCheck.startSessionRevocationWatcher(socket)
    t.after(() => watcher.stop())
    let handled = 0
    socket.on('chat', () => { handled += 1 })

    t.mock.timers.tick(sessionCheck.SESSION_CHECK_INTERVAL_MS)
    await flush()
    await socket.fire('chat')
    await socket.fire('chat')

    assert.equal(calls.length, 1)
    assert.equal(handled, 2)
})

test('사건 검사: 이 서버에서 그 사람 세션이 끊기면(로그아웃 등) 저장 시간 안이어도 다음 사건은 DB 다시 보고 막음', async (t) => {
    const alive = new Set(['s-g'])
    const calls = fakeSessionQuery(t, alive)
    const socket = auth.wrapSocketWithSessionGuard(makeSocket('g'))
    let handled = 0
    socket.on('chat', () => { handled += 1 })

    await socket.fire('chat')
    assert.equal(handled, 1)
    assert.equal(calls.length, 1)

    // 로그아웃: DB에서 끊고 끊김 알림
    alive.delete('s-g')
    notifySessionsRevoked('g')
    let ack = null
    await socket.fire('chat', (res) => { ack = res })

    assert.equal(calls.length, 2, '끊김 알림 뒤엔 저장 결과 안 씀')
    assert.equal(handled, 1)
    assert.equal(ack.code, 'SESSION_EXPIRED')
    assert.equal(socket.disconnected, 1)
})

test('사건 검사: 끊김 알림 전에 시작한 확인은 알림 뒤 사건이 같이 기다리지 않고 새로 물음 (커밋 전 옛 값 막기)', async (t) => {
    let release
    let call = 0
    t.mock.method(sessionLifecycle, 'resolveSession', () => {
        call += 1
        if (call === 1) return new Promise((resolve) => { release = () => resolve({ ok: true }) })
        return Promise.resolve({ ok: false, message: '끊김' })
    })
    t.mock.timers.enable({ apis: ['setInterval'] })
    const socket = auth.wrapSocketWithSessionGuard(makeSocket('h'))
    const watcher = sessionCheck.startSessionRevocationWatcher(socket)
    t.after(() => watcher.stop())
    socket.on('chat', () => {})

    // 주기 검사 시작(아직 답 없음) → 그사이 끊김 알림 → 사건
    t.mock.timers.tick(sessionCheck.SESSION_CHECK_INTERVAL_MS)
    await new Promise((resolve) => setImmediate(resolve))
    notifySessionsRevoked('h')
    const event = socket.fire('chat')
    await flush()
    release()
    await event
    await flush()

    assert.equal(call, 2, '알림 뒤 사건은 새로 물어야 함')
    assert.ok(socket.emitted.some((e) => e.event === 'force_disconnect'))
})

test('끊김 알림: 거래 안이면 커밋 뒤에 알림', () => {
    const heard = []
    const { onSessionsRevoked } = require('../../repositories/user/revokeSignal')
    const off = onSessionsRevoked((uuid) => heard.push(uuid))
    try {
        const hooks = []
        notifySessionsRevoked('tx-user', { afterCommit: (fn) => hooks.push(fn) })
        assert.deepEqual(heard, [], '커밋 전엔 안 알림')
        hooks.forEach((fn) => fn())
        assert.deepEqual(heard, ['tx-user'])
    } finally {
        off()
    }
})

test('묶음 저장소: 토큰 uuid와 세션 주인이 다르면 세션 없음, 정지 줄은 정지로', () => {
    const { toSessionAndBan } = sessionCheckRepository.__testables
    const row = { session_id: 's1', user_id: 'u1', is_online: 1, refresh_token_expires_at: null, status: 'ACTIVE', ban_id: 7, ban_reason: '욕설' }
    assert.deepEqual(toSessionAndBan(row, 'other'), [null, null])
    const [session, ban] = toSessionAndBan(row, 'u1')
    assert.equal(session.User.status, 'ACTIVE')
    assert.deepEqual(ban, { id: 7, reason: '욕설' })
    assert.deepEqual(toSessionAndBan({ ...row, status: null, ban_id: null }, 'u1')[0].User, null)
})

test('질의 로그: 운영은 늘 끔, 개발은 DB_LOG_QUERIES=1일 때만 console.log', () => {
    assert.equal(pickQueryLogging('production', { DB_LOG_QUERIES: '1' }), false)
    assert.equal(pickQueryLogging('development', {}), false)
    assert.equal(pickQueryLogging('development', { DB_LOG_QUERIES: '1' }), console.log)
    assert.equal(pickQueryLogging(undefined, { DB_LOG_QUERIES: '0' }), false)
    assert.equal(db.sequelize.options.logging, false, '시험 환경(값 없음)도 끔')
})

test('확인 시간 초과: DB가 말없이 안 답하면 정한 시간 뒤 실패로 답하고(연결 유지), 다음 사건은 새로 물음', async (t) => {
    let calls = 0
    t.mock.method(sessionLifecycle, 'resolveSession', () => {
        calls += 1
        if (calls === 1) return new Promise(() => {})
        return Promise.resolve({ ok: true })
    })
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const socket = auth.wrapSocketWithSessionGuard(makeSocket('stuck'))
    let handled = 0
    socket.on('chat', () => { handled += 1 })

    let ack = null
    const first = socket.fire('chat', (res) => { ack = res })
    await flush(2)
    t.mock.timers.tick(sessionCheck.SESSION_CHECK_TIMEOUT_MS)
    await first
    assert.equal(ack?.code, 'SESSION_CHECK_FAILED')
    assert.equal(socket.disconnected, 0)

    await socket.fire('chat')
    assert.equal(calls, 2, '멈춘 확인을 계속 기다리지 않고 새로 물음')
    assert.equal(handled, 1)
})
