// 소켓 접속 버그 시험 (2026-11-09 버그 수정)
// BE-010·011·012·042·043 세션 검사, known 1-15 같은 브라우저 두 탭, 접속 상태 저장 순서, BE-031, BE-015
process.env.JWT_SECRET = process.env.JWT_SECRET || 'socket-connection-fixes-test-secret'
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const socketLayer = require('../../socket/socket')
const matchmaking = require('../../socket/matchmaking')
const emitter = require('../../socket/emitter')
const sessionLifecycle = require('../../services/auth/sessionLifecycle')
const presenceService = require('../../services/presence/status')
const friendService = require('../../services/friend')
const friendshipRepository = require('../../repositories/friend/friendship')
const blockRepository = require('../../repositories/friend/block')
const onlinePresenceRepository = require('../../repositories/presence/onlinePresence')
const economyService = require('../../services/economy')
const { createFakeSocket, createFakeIo, callAsPromise, validSettingsPayload } = require('../helpers/matchmakingFixtures')

const { wrapSocketWithSessionGuard, handleConnection, handleDisconnect } = socketLayer.__testables

// 미뤄진 일 몇 차례 비우기
async function flush(rounds = 5) {
    for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

function makeGuardedSocket(user = { uuid: 'g-user', sessionId: 's-1' }) {
    const handlers = {}
    return {
        data: { user },
        emitted: [],
        disconnectCalls: 0,
        on(event, cb) { handlers[event] = cb },
        emit(event, payload) { this.emitted.push({ event, payload }) },
        disconnect() { this.disconnectCalls += 1 },
        _handlers: handlers,
    }
}

test('BE-042: 세션 검사가 DB 오류면 답 함수에 실패로 답하고 연결은 안 끊는다', async (t) => {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => { throw new Error('db down') })
    const socket = wrapSocketWithSessionGuard(makeGuardedSocket())
    let ran = false
    socket.on('do_thing', () => { ran = true })

    let answer = null
    await socket._handlers.do_thing({}, (res) => { answer = res })

    assert.equal(ran, false)
    assert.equal(answer?.ok, false)
    assert.equal(answer?.code, 'SESSION_CHECK_FAILED')
    assert.equal(socket.disconnectCalls, 0)
})

test('BE-042: 끊긴 세션이면 답 함수에 실패로 답하고 끊는다', async (t) => {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: false, message: '세션 만료' }))
    const socket = wrapSocketWithSessionGuard(makeGuardedSocket())
    socket.on('do_thing', () => {})

    let answer = null
    await socket._handlers.do_thing({}, (res) => { answer = res })

    assert.deepEqual(answer, { ok: false, code: 'SESSION_EXPIRED', message: '세션 만료' })
    assert.equal(socket.disconnectCalls, 1)
})

test('BE-011: 앞 사건 검사가 늦어도 사건은 온 순서대로 처리기에 닿는다', async (t) => {
    let call = 0
    let releaseFirst
    t.mock.method(sessionLifecycle, 'resolveSession', () => {
        call += 1
        if (call === 1) return new Promise((resolve) => { releaseFirst = () => resolve({ ok: true }) })
        return Promise.resolve({ ok: true })
    })
    const socket = wrapSocketWithSessionGuard(makeGuardedSocket())
    const order = []
    socket.on('vote', (value) => { order.push(value) })

    const first = socket._handlers.vote('A')
    const second = socket._handlers.vote('B')
    await flush()
    releaseFirst()
    await Promise.all([first, second])

    assert.deepEqual(order, ['A', 'B'])
})

test('BE-012: 1초 안에 연달아 온 사건은 세션 조회를 한 번만 한다', async (t) => {
    const resolve = t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }))
    const socket = wrapSocketWithSessionGuard(makeGuardedSocket())
    let count = 0
    socket.on('chat', () => { count += 1 })

    await socket._handlers.chat()
    await socket._handlers.chat()
    await socket._handlers.chat()

    assert.equal(count, 3)
    assert.equal(resolve.mock.callCount(), 1)
})

test('BE-043: 로그인 유지 안 한 세션(긴 토큰)은 토큰이 만료되면 사건을 막고 끊는다', async (t) => {
    const resolve = t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }))
    const now = Math.floor(Date.now() / 1000)
    const socket = wrapSocketWithSessionGuard(makeGuardedSocket({
        uuid: 'long-user', sessionId: 's-long', iat: now - 2 * 24 * 3600, exp: now - 24 * 3600,
    }))
    let ran = false
    socket.on('chat', () => { ran = true })

    await socket._handlers.chat()

    assert.equal(ran, false)
    assert.equal(socket.disconnectCalls, 1)
    assert.equal(resolve.mock.callCount(), 0)
})

test('BE-043: 로그인 유지 세션(짧은 토큰)은 처음 받은 토큰이 만료돼도 세션이 살아 있으면 통과', async (t) => {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }))
    const now = Math.floor(Date.now() / 1000)
    const socket = wrapSocketWithSessionGuard(makeGuardedSocket({
        uuid: 'short-user', sessionId: 's-short', iat: now - 3600, exp: now - 2700,
    }))
    let ran = false
    socket.on('chat', () => { ran = true })

    await socket._handlers.chat()

    assert.equal(ran, true)
    assert.equal(socket.disconnectCalls, 0)
})

function makePresenceSocket(id, sessionId) {
    return {
        id,
        data: { user: { uuid: 'p-user', sessionId } },
        emitted: [],
        disconnectCalls: 0,
        rooms: new Set(),
        emit(event, payload) { this.emitted.push({ event, payload }) },
        disconnect() { this.disconnectCalls += 1 },
        join() {},
    }
}

test('known 1-15: 같은 로그인 세션(같은 브라우저 다른 탭)이 밀어내면 까닭 code가 다르다', async (t) => {
    t.mock.method(presenceService, 'setPresence', async () => {})
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => [])
    const onlineUsers = socketLayer.__getOnlineUsersForTests()
    t.after(() => onlineUsers.delete('p-user'))

    const oldTab = makePresenceSocket('sock-tab-1', 'same-session')
    const newTab = makePresenceSocket('sock-tab-2', 'same-session')
    const io = { sockets: { sockets: new Map([[oldTab.id, oldTab], [newTab.id, newTab]]) }, to: () => ({ emit() {} }) }
    onlineUsers.set('p-user', oldTab.id)

    await handleConnection(io, newTab, 'p-user')

    assert.equal(oldTab.emitted[0].event, 'force_disconnect')
    assert.equal(oldTab.emitted[0].payload.code, 'REPLACED_BY_SAME_SESSION')
})

test('빠른 재접속: 앞 저장이 늦게 끝나도 접속 상태는 ONLINE으로 남는다 (OFFLINE이 마지막에 안 덮음)', async (t) => {
    const pending = []
    const writes = []
    t.mock.method(presenceService, 'setPresence', (uuid, status) =>
        new Promise((resolve) => pending.push(() => { writes.push(status); resolve() })))
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => [])
    const onlineUsers = socketLayer.__getOnlineUsersForTests()
    t.after(() => onlineUsers.delete('p-user'))

    const first = makePresenceSocket('sock-first', 's-a')
    const second = makePresenceSocket('sock-second', 's-a')
    const io = { sockets: { sockets: new Map([[first.id, first], [second.id, second]]) }, to: () => ({ emit() {} }) }

    // 첫 접속은 저장까지 끝냄
    const c1 = handleConnection(io, first, 'p-user')
    await flush()
    pending.shift()()
    await c1
    // 끊김 뒤 바로 다시 접속, 늦게 시작한 저장부터 끝나게 (DB 순서 뒤바뀜 흉내)
    const d1 = handleDisconnect(io, first, 'p-user')
    const c2 = handleConnection(io, second, 'p-user')
    for (let i = 0; i < 10; i += 1) {
        await flush()
        const last = pending.pop()
        if (last) last()
    }
    await Promise.all([d1, c2])

    assert.equal(writes.at(-1), 'ONLINE', `마지막 저장이 ONLINE이어야 함: ${writes.join(',')}`)
})

test('BE-031: 새 탭에 밀려 끊긴 옛 소켓은 15초 방 빼기 예약을 안 건다', async () => {
    matchmaking.__resetStateForTests()
    matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: uuid }) })
    matchmaking.__setEconomyServiceForTests({
        async getPublicProfileLoadouts(ids) { return Object.fromEntries(ids.map((id) => [id, {}])) },
    })
    const registry = new Map()
    matchmaking.setOnlineUsersRegistry(registry)
    try {
        const oldSocket = createFakeSocket('r-user', { id: 'sock-old' })
        const io = createFakeIo([oldSocket])
        registry.set('r-user', oldSocket.id)
        const created = await callAsPromise(matchmaking.__testables.handleCreateRoom, io, oldSocket, 'r-user', validSettingsPayload())
        assert.equal(created.ok, true)

        // 새 탭이 접속 목록을 차지하고 옛 소켓은 밀려 끊김
        registry.set('r-user', 'sock-new')
        oldSocket.data.forcedLogout = true
        oldSocket.connected = false
        matchmaking.onDisconnect(io, oldSocket, 'r-user')

        assert.deepEqual(matchmaking.__getPendingRoomRemovalsForTests(), [])
    } finally {
        matchmaking.__resetStateForTests()
        matchmaking.setOnlineUsersRegistry(socketLayer.__getOnlineUsersForTests())
        matchmaking.__setUserRepositoryForTests(null)
        matchmaking.__setEconomyServiceForTests(null)
    }
})

test('BE-015: 접속 행이 ONLINE이어도 이 서버 접속 목록에 없으면 친구 목록엔 OFFLINE', async (t) => {
    t.mock.method(friendshipRepository, 'findFriendship', async (me) => [{
        requester_id: me,
        receiver_id: 'stale-friend',
        Friend1: { uuid: me, nickname: '나', profile_image_url: null },
        Friend2: { uuid: 'stale-friend', nickname: '친구', profile_image_url: null },
    }])
    t.mock.method(blockRepository, 'findBlockedCounterpartUuids', async () => [])
    t.mock.method(blockRepository, 'findFavoriteFriendIds', async () => [])
    t.mock.method(onlinePresenceRepository, 'findOnlinePresences', async () => [{ user_id: 'stale-friend', status: 'ONLINE' }])
    t.mock.method(economyService, 'getPublicProfileLoadouts', async () => ({}))
    // 소켓 서버가 켜진 상태 흉내 (재시작 뒤라 접속 목록이 비어 있음)
    emitter.setIo({ to: () => ({ emit() {} }) })
    t.after(() => emitter.setIo(null))

    const [friend] = await friendService.getFriendList('me')

    assert.equal(friend.status, 'OFFLINE')
    assert.equal(friend.online, false)
})
