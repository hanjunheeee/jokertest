// 서버 여러 대 대비 시험: 한 사람 보내기를 계정 전용 채널(user:<uuid>)로 맞춘 것
// 가짜 io로 어느 채널에 보냈는지·옛 접속 목록 Map을 안 보는지·연결 때 채널 넣는지 확인 (진짜 DB 안 씀)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const emitter = require('../../socket/emitter')
const socket = require('../../socket/socket')
const presence = require('../../socket/connection/presence')
const presenceService = require('../../services/presence/status')
const sessionLifecycle = require('../../services/auth/sessionLifecycle')
const matchmaking = require('../../socket/matchmaking')
const gameSessionCore = require('../../game-core/gameSession')
const gameSessionSocketLayer = require('../../socket/gameSession')
const { notifyPartyOfRoom } = require('../../socket/matchmaking/join/party')
const { handleJoinMatchmaking } = require('../../socket/matchmaking/join/queue')
const { createShutdown } = require('../../utils/processLifecycle')
const { createFakeSocket, createFakeIo } = require('../helpers/matchmakingFixtures')

// 보낸 기록만 남기는 가짜 io: to(채널 또는 채널 배열)·except·in(채널).socketsJoin/fetchSockets
function recordingIo({ socketsByChannel = new Map() } = {}) {
    const sent = []
    const joins = []
    const operator = (channels, excepts = []) => ({
        except(more) { return operator(channels, [...excepts, ...(Array.isArray(more) ? more : [more])]) },
        emit(event, payload) { sent.push({ channels, excepts, event, payload }) },
    })
    return {
        sent,
        joins,
        sockets: { sockets: new Map() },
        to(channel) { return operator(Array.isArray(channel) ? [...channel] : [channel]) },
        in(channel) {
            return {
                socketsJoin(room) { joins.push({ channel, room }) },
                fetchSockets: async () => socketsByChannel.get(channel) ?? [],
            }
        },
    }
}

function withIo(t, io) {
    const previous = emitter.getIo()
    emitter.setIo(io)
    t.after(() => emitter.setIo(previous))
}

test('계정 채널 이름: user:<uuid>, 빈 값은 null', () => {
    assert.equal(emitter.userChannelOf('abc'), 'user:abc')
    assert.equal(emitter.USER_CHANNEL_PREFIX, 'user:')
    assert.equal(emitter.userChannelOf(''), null)
    assert.equal(emitter.userChannelOf(undefined), null)
    assert.equal(emitter.userChannelOf(42), null)
})

test('emitToUser: 접속 목록 Map 안 보고 계정 채널로 보냄 (다른 서버 접속자도 어댑터가 이어 줌)', (t) => {
    const io = recordingIo()
    withIo(t, io)
    emitter.onlineUsers.delete('u-remote')

    emitter.emitToUser('u-remote', 'notification_created', { id: 1 })

    assert.deepEqual(io.sent, [{ channels: ['user:u-remote'], excepts: [], event: 'notification_created', payload: { id: 1 } }])
})

test('emitToUser: uuid 비었거나 io 없으면 안 보내고 안 던짐', (t) => {
    const io = recordingIo()
    withIo(t, io)
    emitter.emitToUser('', 'x', {})
    emitter.emitToUser(null, 'x', {})
    assert.deepEqual(io.sent, [])

    emitter.setIo(null)
    assert.doesNotThrow(() => emitter.emitToUser('u-1', 'x', {}))
})

test('emitToUser: 계정당 연결 하나 → 계정 채널에 든 지금 소켓 하나만 받음 (옛 Map 방식과 같은 결과)', (t) => {
    const current = createFakeSocket('u-1', { id: 'sock-new' })
    const other = createFakeSocket('u-2', { id: 'sock-other' })
    current.rooms.add('user:u-1')
    other.rooms.add('user:u-2')
    const io = createFakeIo([current, other])
    withIo(t, io)

    emitter.emitToUser('u-1', 'achievement_granted', { id: 'a' })

    assert.equal(current.countReceived('achievement_granted'), 1)
    assert.equal(other.countReceived('achievement_granted'), 0)
})

test('joinUserChannel: 계정 채널에 넣음, join이 Promise로 실패해도 던지지 않고 로그만', async (t) => {
    const ok = createFakeSocket('u-join')
    emitter.joinUserChannel(ok, 'u-join')
    await Promise.resolve()
    assert.deepEqual(ok.joined, ['user:u-join'])

    const logged = []
    t.mock.method(console, 'error', (...args) => logged.push(args))
    const bad = createFakeSocket('u-bad', { joinShouldReject: true })
    assert.doesNotThrow(() => emitter.joinUserChannel(bad, 'u-bad'))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(logged.length, 1)
    assert.equal(logged[0][1].code, 'USER_CHANNEL_JOIN_ERROR')

    const none = createFakeSocket('u-none')
    emitter.joinUserChannel(none, '')
    assert.deepEqual(none.joined, [])
})

test('fetchUserSockets: io.in(계정 채널).fetchSockets() 결과, io 없으면 빈 목록', async () => {
    const remote = { id: 'remote-1' }
    const io = recordingIo({ socketsByChannel: new Map([['user:u-1', [remote]]]) })
    assert.deepEqual(await emitter.fetchUserSockets('u-1', io), [remote])
    assert.deepEqual(await emitter.fetchUserSockets('u-1', null), [])
    assert.deepEqual(await emitter.fetchUserSockets('', io), [])
})

test('연결 처리기: 맨 먼저 계정 채널 넣고, 그 뒤 접속 목록 등록', async (t) => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    socket.__getOnlineUsersForTests().clear()
    t.after(() => {
        gameSessionCore.__resetStateForTests()
        matchmaking.__resetStateForTests()
        gameSessionSocketLayer.__resetStateForTests()
        socket.__getOnlineUsersForTests().clear()
    })
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }))
    t.mock.method(presenceService, 'setPresence', async () => {})
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => [])
    t.mock.method(matchmaking, 'resyncRoomChannelOnReconnect', async () => {})

    const fakeSocket = createFakeSocket('u-conn')
    const io = createFakeIo([fakeSocket])
    socket.__testables.registerConnectionHandlers(io, fakeSocket)
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(fakeSocket.joined[0], 'user:u-conn')
    assert.equal(fakeSocket.rooms.has('user:u-conn'), true)
    assert.equal(socket.__getOnlineUsersForTests().get('u-conn'), fakeSocket.id)
})

test('친구 접속 상태: 친구마다 계정 채널로 (접속 목록 Map에 없는 다른 서버 친구도)', async (t) => {
    t.mock.method(presenceService, 'setPresence', async () => {})
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => ['f-1', 'f-2'])
    t.mock.method(matchmaking, 'resyncRoomChannelOnReconnect', async () => {})
    emitter.onlineUsers.delete('f-1')
    emitter.onlineUsers.delete('f-2')
    t.after(() => emitter.onlineUsers.delete('me-friend'))
    const io = recordingIo()
    const mine = createFakeSocket('me-friend', { id: 'sock-me' })

    await presence.handleConnection(io, mine, 'me-friend')

    assert.deepEqual(io.sent.map((s) => [s.channels, s.event, s.payload]), [
        [['user:f-1'], 'friend_status_change', { uuid: 'me-friend', status: 'ONLINE' }],
        [['user:f-2'], 'friend_status_change', { uuid: 'me-friend', status: 'ONLINE' }],
    ])
})

test('다음 방 알림: 판 채널 한 번 + 참가자 계정 채널(판 채널 뺌) 한 번', (t) => {
    t.mock.method(gameSessionCore, 'getEndedPartyContext', () => ({
        gameId: 'g-1', channelId: 'game:g-1', participantUuids: ['p-1', 'p-2'],
    }))
    t.after(() => matchmaking.__resetStateForTests())
    const io = recordingIo()
    const room = {
        id: 'room-next', code: 'ABC123', hostUuid: 'p-1', instanceId: 'inst',
        players: new Map([['p-1', { uuid: 'p-1', nickname: 'p1', isReady: false }]]),
        settings: { maxPlayers: 8, jokerCount: 1 },
    }

    notifyPartyOfRoom(io, 'p-1', room)

    assert.equal(io.sent.length, 2)
    assert.deepEqual(io.sent[0].channels, ['game:g-1'])
    assert.deepEqual(io.sent[0].excepts, [])
    assert.deepEqual(io.sent[1].channels, ['user:p-1', 'user:p-2'])
    assert.deepEqual(io.sent[1].excepts, ['game:g-1'])
    assert.equal(io.sent[1].event, 'party_matching_room_ready')
    assert.equal(io.sent[1].payload.gameId, 'g-1')
})

test('다음 방 알림: 판 채널 안 소켓은 한 번만, 판 채널 밖 참가자 소켓도 한 번 (예전 동작과 같음)', (t) => {
    t.mock.method(gameSessionCore, 'getEndedPartyContext', () => ({
        gameId: 'g-2', channelId: 'game:g-2', participantUuids: ['in-1', 'out-1'],
    }))
    t.after(() => matchmaking.__resetStateForTests())
    const inside = createFakeSocket('in-1')
    inside.rooms.add('game:g-2')
    inside.rooms.add('user:in-1')
    const outside = createFakeSocket('out-1')
    outside.rooms.add('user:out-1')
    const stranger = createFakeSocket('stranger')
    stranger.rooms.add('user:stranger')
    // 배열 채널을 받는 가짜 io (to([...])는 어느 하나라도 든 소켓에 한 번)
    const base = createFakeIo([inside, outside, stranger])
    const io = {
        ...base,
        to(channel) {
            const channels = Array.isArray(channel) ? channel : [channel]
            const deliver = (excepts) => ({
                except(more) { return deliver([...excepts, ...(Array.isArray(more) ? more : [more])]) },
                emit(event, payload) {
                    for (const s of [inside, outside, stranger]) {
                        if (!channels.some((c) => s.rooms.has(c))) continue
                        if (excepts.some((c) => s.rooms.has(c))) continue
                        s.emit(event, payload)
                    }
                },
            })
            return deliver([])
        },
    }
    const room = {
        id: 'room-next-2', code: 'XYZ789', hostUuid: 'in-1', instanceId: 'inst',
        players: new Map([['in-1', { uuid: 'in-1', nickname: 'i', isReady: false }]]),
        settings: { maxPlayers: 8, jokerCount: 1 },
    }

    notifyPartyOfRoom(io, 'in-1', room)

    assert.equal(inside.countReceived('party_matching_room_ready'), 1)
    assert.equal(outside.countReceived('party_matching_room_ready'), 1)
    assert.equal(stranger.countReceived('party_matching_room_ready'), 0)
})

test('빠른 매칭 match_found: 이 서버 소켓은 그대로, 이 서버에 없는 소켓은 소켓 id 채널로 넣기·알림', async (t) => {
    matchmaking.__resetStateForTests()
    matchmaking.__setRandomMatchmakingEnabledForTests(true)
    matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: uuid }) })
    const savedMin = process.env.GAME_DEV_MIN_PLAYERS
    process.env.GAME_DEV_MIN_PLAYERS = '2'
    t.after(() => {
        matchmaking.__setRandomMatchmakingEnabledForTests(null)
        matchmaking.__setUserRepositoryForTests(null)
        matchmaking.__resetStateForTests()
        if (savedMin === undefined) delete process.env.GAME_DEV_MIN_PLAYERS
        else process.env.GAME_DEV_MIN_PLAYERS = savedMin
    })
    matchmaking.__seedMatchmakingQueueForTests('remote-user', {
        uuid: 'remote-user', nickname: 'remote', socketId: 'remote-sock', generation: 0,
    })
    const local = createFakeSocket('local-user', { id: 'local-sock' })
    const io = recordingIo()
    io.sockets.sockets.set(local.id, local)

    await handleJoinMatchmaking(io, local, 'local-user')

    const localFound = local.emitted.find((e) => e.event === 'match_found')
    assert.ok(localFound, '이 서버 소켓은 바로 받음')
    const roomId = localFound.payload.roomId
    assert.equal(local.data.activeRoomId, roomId)
    assert.deepEqual(io.joins, [{ channel: 'remote-sock', room: roomId }])
    const remoteSent = io.sent.filter((s) => s.event === 'match_found')
    assert.equal(remoteSent.length, 1)
    assert.deepEqual(remoteSent[0].channels, ['remote-sock'])
    assert.equal(remoteSent[0].payload.roomId, roomId)
})

test('종료 안내: io.local.emit (서버 여러 대여도 이 서버 사람만), local 없는 가짜 io는 그냥 emit', async () => {
    const calls = []
    const io = {
        emit: (event) => calls.push(['all', event]),
        local: { emit: (event) => calls.push(['local', event]) },
        close: (done) => { calls.push(['close']); done() },
    }
    const shutdown = createShutdown({
        io, server: { listening: false }, exit: () => {}, graceMs: 0, forceMs: 1000,
        log: { warn() {}, error() {}, info() {} },
    })
    await shutdown('SIGTERM', 0)
    assert.deepEqual(calls.filter((c) => c[0] !== 'close').map((c) => c[0]), ['local'])
})
