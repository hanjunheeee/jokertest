// 판 중 끊김·다시 붙음 알림 시험 (브라우저 시험 mobile M-2, 2026-11-09)
// 다른 사람이 끊기면 산 사람들에게 판 채널로 session_player_connection_changed { isConnected:false }, 다시 붙으면 true
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../../socket/gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../../socket/matchmaking')
const { createFakeSocket, createFakeIo, countingCallback } = require('../helpers/matchmakingFixtures')
const { PLAYER_CONNECTION_EVENT } = require('../../socket/gameSession/connection/presenceNotice')

const { handleGetSessionSnapshot } = gameSessionSocketLayer.__testables

const registry = () => new Proxy(new Map(), {
    get(target, prop, receiver) {
        if (prop === 'get') return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
        return Reflect.get(target, prop, receiver)
    },
})

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(registry())
})
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
})

// 4인 판 낮 단계
function commitDaySession(id) {
    const players = Array.from({ length: 4 }, (_, i) => ({ uuid: `cn-${id}-${i}`, nickname: `n${i}`, isReady: true }))
    const candidate = gameSessionCore.__testables.buildSessionCandidate(
        { id, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount: 1 } },
        { randomFn: () => 0.5 },
    )
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'DAY'
    session.dayIndex = 1
    return session
}

function wire(session) {
    const sockets = new Map()
    const io = createFakeIo([])
    for (const uuid of session.players.keys()) {
        const socket = createFakeSocket(uuid)
        socket.rooms.add(session.channelId)
        socket.data.activeGameId = session.id
        io.sockets.sockets.set(socket.id, socket)
        sockets.set(uuid, socket)
    }
    return { io, sockets }
}

const notices = (io) => io.broadcasts.filter((b) => b.event === PLAYER_CONNECTION_EVENT)

test('산 참가자 연결이 끊기면 판 채널에 끊김 알림 한 번', async () => {
    const session = commitDaySession('cn-a')
    const { io, sockets } = wire(session)
    const [target] = session.players.keys()

    sockets.get(target).connected = false
    await gameSessionSocketLayer.onDisconnect(io, sockets.get(target), target)

    const sent = notices(io)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].roomId, session.channelId)
    assert.deepEqual(sent[0].payload, { gameId: session.id, uuid: target, isConnected: false })
    // 역할 같은 비밀 값 없음
    assert.deepEqual(Object.keys(sent[0].payload).sort(), ['gameId', 'isConnected', 'uuid'])
})

test('끊긴 사람이 다시 붙어 스냅샷을 받으면 다시 붙음 알림 (isConnected:true), 그 뒤 또 받아도 안 보냄', async () => {
    const session = commitDaySession('cn-b')
    const { io, sockets } = wire(session)
    const [target] = session.players.keys()

    sockets.get(target).connected = false
    await gameSessionSocketLayer.onDisconnect(io, sockets.get(target), target)
    sockets.get(target).connected = true

    for (let i = 0; i < 2; i += 1) {
        const { callback, getResponse } = countingCallback()
        handleGetSessionSnapshot(io, sockets.get(target), target, { gameId: session.id }, callback)
        assert.equal(getResponse().ok, true)
    }

    const sent = notices(io).map((b) => b.payload.isConnected)
    assert.deepEqual(sent, [false, true])
})

test('새 소켓으로 판 채널에 다시 들어가면(재접속 라우팅) 다시 붙음 알림', async () => {
    const session = commitDaySession('cn-c')
    const { io, sockets } = wire(session)
    const [target] = session.players.keys()

    sockets.get(target).connected = false
    await gameSessionSocketLayer.onDisconnect(io, sockets.get(target), target)
    io.sockets.sockets.delete(sockets.get(target).id)

    const rejoin = createFakeSocket(target)
    io.sockets.sockets.set(rejoin.id, rejoin)
    await gameSessionSocketLayer.resyncSessionRouting(rejoin, target, io)

    assert.equal(rejoin.rooms.has(session.channelId), true)
    assert.deepEqual(notices(io).map((b) => b.payload.isConnected), [false, true])
})

test('끊김 알림 없던 사람은 첫 접속·새로고침에 다시 붙음 알림 안 보냄', async () => {
    const session = commitDaySession('cn-d')
    const { io, sockets } = wire(session)
    const [target] = session.players.keys()

    await gameSessionSocketLayer.resyncSessionRouting(sockets.get(target), target, io)
    const { callback, getResponse } = countingCallback()
    handleGetSessionSnapshot(io, sockets.get(target), target, { gameId: session.id }, callback)
    assert.equal(getResponse().ok, true)
    assert.equal(notices(io).length, 0)
})

test('죽은 참가자 끊김도 알림 (스냅샷 isConnected와 같은 뜻)', async () => {
    const session = commitDaySession('cn-e')
    const { io, sockets } = wire(session)
    const [target] = session.players.keys()
    session.players.get(target).alive = false

    sockets.get(target).connected = false
    await gameSessionSocketLayer.onDisconnect(io, sockets.get(target), target)

    assert.deepEqual(notices(io).map((b) => b.payload), [{ gameId: session.id, uuid: target, isConnected: false }])
})
