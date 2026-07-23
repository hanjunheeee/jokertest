const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
const { createFakeSocket, createFakeIo, countingCallback, setupReadyRoomForStart } = require('./testHelpers/matchmakingFixtures')

const { handleCreateRoom, handleJoinRoomByCode, handleSetReady, handleStartGame } = matchmaking.__testables

// 이 파일은 game-core/gameSession.js(고유 registry)와 matchmaking.js(고유 registry)를
// 둘 다 실제로 구동하므로, 두 모듈의 registry를 각각 초기화해야 테스트 간 상태 누수가
// 없다(matchmaking.test.js의 기존 관례와 동일).
test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
})

function makePlayer(uuid, nickname = `nick-${uuid}`) {
    return { uuid, nickname, isReady: true }
}

/** game-core가 받는 room 형태를 흉내낸다(소켓 계층 테스트에서는 matchmaking을 거치지 않고 직접 커밋한다). */
function makeRoom({ id = 'room-1', players, jokerCount = 1 } = {}) {
    const playerList = players ?? [makePlayer('p1'), makePlayer('p2')]
    return {
        id,
        players: new Map(playerList.map((p) => [p.uuid, p])),
        settings: { jokerCount },
    }
}

/** game-core를 직접 구동해 2인 GameSession을 커밋하고, 두 uuid에 대응하는 fake socket도 채널에 join된 상태로 준비한다. */
function commitTwoPlayerSession({ roomId = 'room-1', uuidA = 'p1', uuidB = 'p2' } = {}) {
    const room = makeRoom({ id: roomId, players: [makePlayer(uuidA), makePlayer(uuidB)] })
    const prepared = gameSessionCore.prepareGameSession(room)
    gameSessionCore.commitGameSession(prepared.session)

    const socketA = createFakeSocket(uuidA)
    const socketB = createFakeSocket(uuidB)
    socketA.rooms.add(prepared.session.channelId)
    socketB.rooms.add(prepared.session.channelId)
    const io = createFakeIo([socketA, socketB])

    return { session: prepared.session, socketA, socketB, io }
}

// ---------------------------------------------------------------------------
// onDisconnect — 무동작 회귀
// ---------------------------------------------------------------------------

test('onDisconnect: 어떤 활성 GameSession에도 속하지 않은 uuid는 아무 것도 바꾸지 않는다', async () => {
    const socket = createFakeSocket('lonely-uuid')
    const io = createFakeIo([socket])

    await gameSessionSocketLayer.onDisconnect(io, 'lonely-uuid')

    assert.equal(io.broadcasts.length, 0)
    assert.equal(socket.rooms.size, 0)
})

// ---------------------------------------------------------------------------
// onDisconnect — 정상 케이스
// ---------------------------------------------------------------------------

test('onDisconnect: 정상 케이스에서 payload가 정확히 { gameId, reason }이고 registry/channel이 모두 정리된다', async () => {
    const { session, socketB, io } = commitTwoPlayerSession()

    await gameSessionSocketLayer.onDisconnect(io, 'p1')

    const gameEndedBroadcast = io.broadcasts.find((b) => b.event === 'game_ended')
    assert.equal(gameEndedBroadcast.roomId, session.channelId)
    assert.deepEqual(gameEndedBroadcast.payload, { gameId: session.id, reason: 'PARTICIPANT_LEFT' })
    assert.deepEqual(Object.keys(gameEndedBroadcast.payload).sort(), ['gameId', 'reason'])

    // 남은 참가자(p2)의 소켓이 더 이상 channel에 있지 않다.
    assert.equal(socketB.rooms.has(session.channelId), false)

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([gameId]) => gameId === session.id), false)
    assert.equal(snapshot.roomGameSession.some(([roomId]) => roomId === session.roomId), false)
    assert.equal(snapshot.playerSession.some(([uuid]) => uuid === 'p1' || uuid === 'p2'), false)
})

test('onDisconnect: room broadcast는 정확히 1건만 발생하고, channel에 있던 소켓 전부가 개별적으로 제거된다', async () => {
    // 같은 채널에 소켓이 2개 있는 상태(재접속 전환 중 등)를 가정한다. fake io.to().emit()은
    // 소켓별 전달을 시뮬레이션하지 않고 broadcasts 배열에 한 건만 기록하는 구조이므로, 이
    // 테스트가 실제로 증명하는 것은 "단일 room 방송 + 채널에 있던 소켓 전부가 제거됨"까지다
    // — "두 소켓이 실제로 수신했다"는 주장은 하지 않는다.
    const { session, socketA, socketB, io } = commitTwoPlayerSession()

    await gameSessionSocketLayer.onDisconnect(io, 'p1')

    const gameEndedBroadcasts = io.broadcasts.filter((b) => b.event === 'game_ended')
    assert.equal(gameEndedBroadcasts.length, 1)
    assert.equal(socketA.rooms.has(session.channelId), false)
    assert.equal(socketB.rooms.has(session.channelId), false)
})

// ---------------------------------------------------------------------------
// onDisconnect — 알림/channel 정리 양방향 실패 격리
// ---------------------------------------------------------------------------

test('onDisconnect: game_ended 알림 전송이 실패해도(io.to가 throw) registry 정리와 channel 정리는 정상 수행된다', async () => {
    const { session, socketB, io } = commitTwoPlayerSession()
    io.to = () => {
        throw new Error('emit 실패(테스트 주입)')
    }

    await assert.doesNotReject(() => gameSessionSocketLayer.onDisconnect(io, 'p1'))

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([gameId]) => gameId === session.id), false)
    assert.equal(socketB.rooms.has(session.channelId), false)
})

test('onDisconnect: channel 정리가 실패해도(io.in이 throw) registry 정리와 알림 방송은 정상 수행된다', async () => {
    const { session, io } = commitTwoPlayerSession()
    io.in = () => {
        throw new Error('socketsLeave 실패(테스트 주입)')
    }

    await assert.doesNotReject(() => gameSessionSocketLayer.onDisconnect(io, 'p1'))

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([gameId]) => gameId === session.id), false)

    const gameEndedBroadcast = io.broadcasts.find((b) => b.event === 'game_ended')
    assert.deepEqual(gameEndedBroadcast.payload, { gameId: session.id, reason: 'PARTICIPANT_LEFT' })
})

// ---------------------------------------------------------------------------
// onDisconnect — 소켓 계층 중복 disconnect 격리
// ---------------------------------------------------------------------------

test('onDisconnect: 같은 uuid로 연속 2회 호출하면 1회차만 처리되고 2회차는 조용히 no-op이다', async () => {
    const { io } = commitTwoPlayerSession()

    await gameSessionSocketLayer.onDisconnect(io, 'p1')
    const broadcastsAfterFirst = io.broadcasts.filter((b) => b.event === 'game_ended').length

    await gameSessionSocketLayer.onDisconnect(io, 'p1')
    const broadcastsAfterSecond = io.broadcasts.filter((b) => b.event === 'game_ended').length

    assert.equal(broadcastsAfterFirst, 1)
    assert.equal(broadcastsAfterSecond, 1)
})

// ---------------------------------------------------------------------------
// 통합 테스트: 정리 후 새 게임 시작 가능
// ---------------------------------------------------------------------------

test('참가자 disconnect로 GameSession이 정리된 뒤, 같은 uuid를 포함한 새 Room에서 다시 게임을 시작할 수 있다', async () => {
    matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: uuid }) })
    const readyRoomHandlers = { handleCreateRoom, handleJoinRoomByCode, handleSetReady }

    // --- Room A: host + joiner, 최소 인원/전원 준비/전원 channel 가입까지 setupReadyRoomForStart로 충족 ---
    const hostSocketA = createFakeSocket('uuid-cleanup-host')
    const ioA = createFakeIo([hostSocketA])
    await setupReadyRoomForStart(ioA, 'uuid-cleanup-host', 'uuid-cleanup-joiner', readyRoomHandlers)

    const { callback: cbA, getResponse: getResponseA } = countingCallback()
    await handleStartGame(ioA, hostSocketA, 'uuid-cleanup-host', cbA)
    assert.equal(getResponseA().ok, true) // Room A → GameSession 커밋 성공

    // --- joiner의 disconnect를 소켓 계층 onDisconnect로 직접 재현 ---
    await gameSessionSocketLayer.onDisconnect(ioA, 'uuid-cleanup-joiner')

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.length, 0)
    assert.equal(snapshot.playerSession.length, 0)
    assert.equal(snapshot.roomGameSession.length, 0)

    // --- Room B: 정리된 uuid('uuid-cleanup-joiner')를 포함해 최소 인원/준비/channel 가입을 처음부터 다시 충족 ---
    const hostSocketB = createFakeSocket('uuid-cleanup-host2')
    const ioB = createFakeIo([hostSocketB])
    await setupReadyRoomForStart(ioB, 'uuid-cleanup-host2', 'uuid-cleanup-joiner', readyRoomHandlers)

    const { callback: cbB, getResponse: getResponseB } = countingCallback()
    await handleStartGame(ioB, hostSocketB, 'uuid-cleanup-host2', cbB)

    assert.equal(getResponseB().ok, true)
    assert.notEqual(getResponseB().code, 'PLAYER_ALREADY_IN_SESSION')
})
