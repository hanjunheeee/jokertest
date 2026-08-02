const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
const {
    callAsPromise,
    createFakeSocket,
    createFakeIo,
    validSettingsPayload,
    countingCallback,
    setupReadyRoomForStart,
} = require('./testHelpers/matchmakingFixtures')

const { handleCreateRoom, handleJoinRoomByCode, handleSetReady, handleStartGame } = matchmaking.__testables
const {
    handleAcknowledgeRoleReveal,
    handleSubmitNightAction,
    handleSubmitJokerChatMessage,
    handleResolveNight,
    handleSubmitDayVote,
    handleResolveDayVote,
    handleCastTribunalVote,
    handleLeaveGameSession,
    resolveJokerTeammateSockets,
} = gameSessionSocketLayer.__testables

// 이 파일은 game-core/gameSession.js(고유 registry)와 matchmaking.js(고유 registry)를
// 둘 다 실제로 구동하므로, 두 모듈의 registry를 각각 초기화해야 테스트 간 상태 누수가
// 없다(matchmaking.test.js의 기존 관례와 동일).
test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
})
// registry 불일치를 의도적으로 재현하는 테스트(SESSION_NOT_FOUND/NOT_A_PARTICIPANT 케이스)가
// 이 파일의 마지막 테스트로 실행되더라도 손상된 singleton 상태가 남지 않게 afterEach에서도
// 정리한다. 테스트 본문이 예외를 던져도 node:test는 afterEach를 실행하므로 이 정리는
// 실패한 테스트 뒤에도 보장된다.
test.afterEach(() => {
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
    // 실제로는 matchmaking.js의 handleStartGame이 게임 시작 시 심어주는 ABA 방지 결합
    // (socket.data.activeGameId)이다 — 이 헬퍼는 matchmaking을 거치지 않고 game-core를
    // 직접 구동하므로 그 결합을 여기서 직접 재현한다(onDisconnect가 이 값을 읽는다).
    socketA.data.activeGameId = prepared.session.id
    socketB.data.activeGameId = prepared.session.id
    const io = createFakeIo([socketA, socketB])

    return { session: prepared.session, socketA, socketB, io }
}

// ---------------------------------------------------------------------------
// onDisconnect — 무동작 회귀
// ---------------------------------------------------------------------------

test('onDisconnect: 어떤 활성 GameSession에도 속하지 않은 uuid는 아무 것도 바꾸지 않는다', async () => {
    const socket = createFakeSocket('lonely-uuid')
    const io = createFakeIo([socket])

    await gameSessionSocketLayer.onDisconnect(io, socket, 'lonely-uuid')

    assert.equal(io.broadcasts.length, 0)
    assert.equal(socket.rooms.size, 0)
})

// ---------------------------------------------------------------------------
// onDisconnect — 정상 케이스
// ---------------------------------------------------------------------------

test('onDisconnect: 정상 케이스에서 payload가 정확히 { gameId, reason }이고 registry/channel이 모두 정리된다', async () => {
    const { session, socketA, socketB, io } = commitTwoPlayerSession()

    await gameSessionSocketLayer.onDisconnect(io, socketA, 'p1')

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

    await gameSessionSocketLayer.onDisconnect(io, socketA, 'p1')

    const gameEndedBroadcasts = io.broadcasts.filter((b) => b.event === 'game_ended')
    assert.equal(gameEndedBroadcasts.length, 1)
    assert.equal(socketA.rooms.has(session.channelId), false)
    assert.equal(socketB.rooms.has(session.channelId), false)
})

// ---------------------------------------------------------------------------
// onDisconnect — 알림/channel 정리 양방향 실패 격리
// ---------------------------------------------------------------------------

test('onDisconnect: game_ended 알림 전송이 실패해도(io.to가 throw) registry 정리와 channel 정리는 정상 수행된다', async () => {
    const { session, socketA, socketB, io } = commitTwoPlayerSession()
    io.to = () => {
        throw new Error('emit 실패(테스트 주입)')
    }

    await assert.doesNotReject(() => gameSessionSocketLayer.onDisconnect(io, socketA, 'p1'))

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([gameId]) => gameId === session.id), false)
    assert.equal(socketB.rooms.has(session.channelId), false)
})

test('onDisconnect: channel 정리가 실패해도(io.in이 throw) registry 정리와 알림 방송은 정상 수행된다', async () => {
    const { session, socketA, io } = commitTwoPlayerSession()
    io.in = () => {
        throw new Error('socketsLeave 실패(테스트 주입)')
    }

    await assert.doesNotReject(() => gameSessionSocketLayer.onDisconnect(io, socketA, 'p1'))

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([gameId]) => gameId === session.id), false)

    const gameEndedBroadcast = io.broadcasts.find((b) => b.event === 'game_ended')
    assert.deepEqual(gameEndedBroadcast.payload, { gameId: session.id, reason: 'PARTICIPANT_LEFT' })
})

// ---------------------------------------------------------------------------
// onDisconnect — 소켓 계층 중복 disconnect 격리
// ---------------------------------------------------------------------------

test('onDisconnect: 같은 uuid로 연속 2회 호출하면 1회차만 처리되고 2회차는 조용히 no-op이다', async () => {
    const { socketA, io } = commitTwoPlayerSession()

    await gameSessionSocketLayer.onDisconnect(io, socketA, 'p1')
    const broadcastsAfterFirst = io.broadcasts.filter((b) => b.event === 'game_ended').length

    await gameSessionSocketLayer.onDisconnect(io, socketA, 'p1')
    const broadcastsAfterSecond = io.broadcasts.filter((b) => b.event === 'game_ended').length

    assert.equal(broadcastsAfterFirst, 1)
    assert.equal(broadcastsAfterSecond, 1)
})

// ---------------------------------------------------------------------------
// acknowledge_role_reveal (handleAcknowledgeRoleReveal) — ROLE_REVEAL → NIGHT 전이
// ---------------------------------------------------------------------------

/** game-core를 직접 구동해 N인 GameSession을 커밋하고, 각 uuid에 대응하는 fake socket도 채널에 join된 상태로 준비한다. */
function commitSessionWithPlayers(uuids, { roomId = 'room-ack' } = {}) {
    const room = makeRoom({ id: roomId, players: uuids.map((uuid) => makePlayer(uuid)) })
    const prepared = gameSessionCore.prepareGameSession(room)
    gameSessionCore.commitGameSession(prepared.session)

    const sockets = uuids.map((uuid) => {
        const s = createFakeSocket(uuid)
        s.rooms.add(prepared.session.channelId)
        // commitTwoPlayerSession과 동일한 이유로 ABA 방지 결합을 직접 재현한다.
        s.data.activeGameId = prepared.session.id
        return s
    })
    const io = createFakeIo(sockets)

    return { session: prepared.session, sockets, io }
}

test('acknowledge_role_reveal: 2인 세션 중 1명만 확인하면 콜백은 ok:true이고 game_phase_changed는 방송되지 않는다', () => {
    const { session, io } = commitSessionWithPlayers(['p1', 'p2'])
    const { callback, getResponse } = countingCallback()

    handleAcknowledgeRoleReveal(io, null, 'p1', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(io.broadcasts.some((b) => b.event === 'game_phase_changed'), false)
})

test('acknowledge_role_reveal: 나머지 1명도 확인하면 콜백은 ok:true이고 game_phase_changed가 정확히 1건, payload가 정확히 일치한다', () => {
    const { session, io } = commitSessionWithPlayers(['q1', 'q2'])

    handleAcknowledgeRoleReveal(io, null, 'q1', { gameId: session.id }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()
    handleAcknowledgeRoleReveal(io, null, 'q2', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const broadcasts = io.broadcasts.filter((b) => b.event === 'game_phase_changed')
    assert.equal(broadcasts.length, 1)
    assert.equal(broadcasts[0].roomId, session.channelId)
    assert.deepEqual(broadcasts[0].payload, { gameId: session.id, phase: 'NIGHT', dayIndex: 0 })
})

test('acknowledge_role_reveal: 3인 세션에서 전원 확인해도 game_phase_changed는 전체 과정에서 정확히 1건만 발생한다', () => {
    const { session, io } = commitSessionWithPlayers(['r1', 'r2', 'r3'])

    handleAcknowledgeRoleReveal(io, null, 'r1', { gameId: session.id }, countingCallback().callback)
    handleAcknowledgeRoleReveal(io, null, 'r2', { gameId: session.id }, countingCallback().callback)
    handleAcknowledgeRoleReveal(io, null, 'r3', { gameId: session.id }, countingCallback().callback)

    const broadcasts = io.broadcasts.filter((b) => b.event === 'game_phase_changed')
    assert.equal(broadcasts.length, 1)
})

test('acknowledge_role_reveal: callback이 함수가 아니면 무동작이다(상태 불변, 방송 없음)', () => {
    const { session, io } = commitSessionWithPlayers(['s1', 's2'])

    handleAcknowledgeRoleReveal(io, null, 's1', { gameId: session.id }, undefined)

    assert.equal(session.roleRevealAcks.size, 0)
    assert.equal(io.broadcasts.length, 0)
})

test('acknowledge_role_reveal: 세션 없는 uuid는 {ok:false, code:"NOT_IN_SESSION"}이다', () => {
    const { io } = commitSessionWithPlayers(['t1', 't2'])
    const { callback, getResponse } = countingCallback()

    handleAcknowledgeRoleReveal(io, null, 'not-a-participant', { gameId: 'whatever' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'NOT_IN_SESSION', message: '요청을 처리할 수 없습니다.' })
})

test('acknowledge_role_reveal: gameId 누락/타입 오류 payload는 {ok:false, code:"INVALID_PAYLOAD"}이다', () => {
    const { session, io } = commitSessionWithPlayers(['u1', 'u2'])

    const missing = countingCallback()
    handleAcknowledgeRoleReveal(io, null, 'u1', {}, missing.callback)
    assert.deepEqual(missing.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    const wrongType = countingCallback()
    handleAcknowledgeRoleReveal(io, null, 'u1', { gameId: 123 }, wrongType.callback)
    assert.deepEqual(wrongType.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    assert.equal(session.roleRevealAcks.size, 0)
})

test('acknowledge_role_reveal: onDisconnect로 세션이 먼저 종료된 뒤 도착한 늦은 확인은 NOT_IN_SESSION이고 방송이 없다', async () => {
    const { session, sockets, io } = commitSessionWithPlayers(['v1', 'v2'])
    await gameSessionSocketLayer.onDisconnect(io, sockets[0], 'v1') // 세션 전체 종료(정책 확정)

    const { callback, getResponse } = countingCallback()
    handleAcknowledgeRoleReveal(io, null, 'v2', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'NOT_IN_SESSION', message: '요청을 처리할 수 없습니다.' })
    assert.equal(io.broadcasts.filter((b) => b.event === 'game_phase_changed').length, 0)
})

// ---------------------------------------------------------------------------
// cast_tribunal_vote (handleCastTribunalVote)
// ---------------------------------------------------------------------------

/** DAY→TRIBUNAL 전이가 끝난 3인 세션을 커밋하고, 각 uuid에 대응하는 fake socket도 채널에 join된 상태로 준비한다. */
function commitTribunalReadySession({ roomId = 'room-tribunal', uuidA = 'w1', uuidB = 'w2', uuidC = 'w3', defendantUuid = 'w3' } = {}) {
    const room = makeRoom({ id: roomId, players: [makePlayer(uuidA), makePlayer(uuidB), makePlayer(uuidC)] })
    const prepared = gameSessionCore.prepareGameSession(room)
    gameSessionCore.commitGameSession(prepared.session)
    const session = prepared.session
    session.phase = 'TRIBUNAL'
    session.dayVoteResolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'TRIBUNAL',
        tribunalTargetUuid: defendantUuid,
        publicVoteCount: 3,
        publicAbstainCount: 0,
    }
    session.tribunal = { candidateId: defendantUuid, dayIndex: session.dayIndex, defendantUuid, votes: new Map() }

    const socketA = createFakeSocket(uuidA)
    const socketB = createFakeSocket(uuidB)
    const socketC = createFakeSocket(uuidC)
    for (const s of [socketA, socketB, socketC]) {
        s.rooms.add(session.channelId)
        s.data.activeGameId = session.id
    }
    const io = createFakeIo([socketA, socketB, socketC])

    return { session, socketA, socketB, socketC, io }
}

test('cast_tribunal_vote: 성공 ack는 정확히 {ok, gameId, dayIndex, vote}만 담고 broadcast가 없다', () => {
    const { session, io } = commitTribunalReadySession()
    const { callback, getResponse } = countingCallback()

    handleCastTribunalVote(io, null, 'w1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, callback)

    assert.deepEqual(getResponse(), { ok: true, gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' })
    assert.deepEqual(Object.keys(getResponse()).sort(), ['dayIndex', 'gameId', 'ok', 'vote'])
    assert.equal(io.broadcasts.length, 0)
    assert.equal(session.tribunal.votes.get('w1'), 'GUILTY')
})

test('cast_tribunal_vote: payload 형태 오류(gameId/dayIndex 누락·타입 오류)는 INVALID_PAYLOAD이다', () => {
    const { session, io } = commitTribunalReadySession()

    const missing = countingCallback()
    handleCastTribunalVote(io, null, 'w1', {}, missing.callback)
    assert.deepEqual(missing.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    const badDayIndex = countingCallback()
    handleCastTribunalVote(io, null, 'w1', { gameId: session.id, dayIndex: '0', vote: 'GUILTY' }, badDayIndex.callback)
    assert.deepEqual(badDayIndex.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    assert.equal(session.tribunal.votes.size, 0)
})

test('cast_tribunal_vote: 클라이언트 입력만으로 도달 가능한 공개 코드(INVALID_TRIBUNAL_VOTE)는 그대로 전달된다', () => {
    const { session, io } = commitTribunalReadySession()
    const { callback, getResponse } = countingCallback()

    handleCastTribunalVote(io, null, 'w1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'APPROVE' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_TRIBUNAL_VOTE', message: '요청을 처리할 수 없습니다.' })
})

test('cast_tribunal_vote: internal-only 코드는 INTERNAL_ERROR로 정규화되고, 로그는 정확히 {gameId, dayIndex, requesterUuid, internalCode} 4필드만 담는다', () => {
    const { session, io } = commitTribunalReadySession()
    session.tribunal = null // TRIBUNAL_STATE_NOT_FOUND 유도

    const originalError = console.error
    const calls = []
    console.error = (...args) => calls.push(args)
    let response
    try {
        const { callback, getResponse } = countingCallback()
        handleCastTribunalVote(io, null, 'w1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, callback)
        response = getResponse()
    } finally {
        console.error = originalError
    }

    assert.deepEqual(response, { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(calls.length, 1)
    const [, logPayload] = calls[0]
    assert.deepEqual(Object.keys(logPayload).sort(), ['dayIndex', 'gameId', 'internalCode', 'requesterUuid'])
    assert.deepEqual(logPayload, {
        gameId: session.id,
        dayIndex: session.dayIndex,
        requesterUuid: 'w1',
        internalCode: 'TRIBUNAL_STATE_NOT_FOUND',
    })
})

test('cast_tribunal_vote: callback이 던지면 CALLBACK_ERROR로 4필드 로그만 남기고 예외가 새지 않는다', () => {
    const { session, io } = commitTribunalReadySession()
    const originalError = console.error
    const calls = []
    console.error = (...args) => calls.push(args)

    const throwingCallback = () => {
        throw new Error('콜백 실패(테스트 주입)')
    }
    try {
        assert.doesNotThrow(() =>
            handleCastTribunalVote(io, null, 'w1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, throwingCallback),
        )
    } finally {
        console.error = originalError
    }

    assert.equal(calls.length, 1)
    const [, logPayload] = calls[0]
    assert.deepEqual(Object.keys(logPayload).sort(), ['dayIndex', 'gameId', 'internalCode', 'requesterUuid'])
    assert.equal(logPayload.internalCode, 'CALLBACK_ERROR')
})

test('acknowledge_role_reveal: 콜백이 throw해도 game_phase_changed 방송은 정상적으로 발생한다', () => {
    const { session, io } = commitSessionWithPlayers(['w1', 'w2'])
    const throwingCallback = () => {
        throw new Error('콜백 실패(테스트 주입)')
    }

    handleAcknowledgeRoleReveal(io, null, 'w1', { gameId: session.id }, countingCallback().callback)
    assert.doesNotThrow(() => handleAcknowledgeRoleReveal(io, null, 'w2', { gameId: session.id }, throwingCallback))

    const broadcasts = io.broadcasts.filter((b) => b.event === 'game_phase_changed')
    assert.equal(broadcasts.length, 1)
})

test('acknowledge_role_reveal: N인 세션에서 N번 확인하면 콜백은 N회, game_phase_changed 방송은 정확히 1회다', () => {
    const uuids = ['x1', 'x2', 'x3', 'x4']
    const { session, io } = commitSessionWithPlayers(uuids)
    let callbackCalls = 0

    for (const uuid of uuids) {
        handleAcknowledgeRoleReveal(io, null, uuid, { gameId: session.id }, () => {
            callbackCalls += 1
        })
    }

    assert.equal(callbackCalls, uuids.length)
    assert.equal(io.broadcasts.filter((b) => b.event === 'game_phase_changed').length, 1)
})

test('acknowledge_role_reveal: core가 SESSION_NOT_FOUND를 반환하는 registry 불일치는 소켓 응답에서 INTERNAL_ERROR로 정규화된다', () => {
    const { session, io } = commitSessionWithPlayers(['y1', 'y2'])
    gameSessionCore.__testables.__deleteGameSessionOnlyForTests(session.id)

    const { callback, getResponse } = countingCallback()
    handleAcknowledgeRoleReveal(io, null, 'y1', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
})

test('acknowledge_role_reveal: core가 NOT_A_PARTICIPANT를 반환하는 registry 불일치는 소켓 응답에서 INTERNAL_ERROR로 정규화된다', () => {
    const { session, io } = commitSessionWithPlayers(['z1', 'z2'])
    session.players.delete('z1')

    const { callback, getResponse } = countingCallback()
    handleAcknowledgeRoleReveal(io, null, 'z1', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
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
    const { joinerSocket: joinerSocketA } = await setupReadyRoomForStart(ioA, 'uuid-cleanup-host', 'uuid-cleanup-joiner', readyRoomHandlers)

    const { callback: cbA, getResponse: getResponseA } = countingCallback()
    await handleStartGame(ioA, hostSocketA, 'uuid-cleanup-host', cbA)
    assert.equal(getResponseA().ok, true) // Room A → GameSession 커밋 성공

    // --- joiner의 disconnect를 소켓 계층 onDisconnect로 직접 재현 ---
    // (handleStartGame이 실제로 joinerSocketA.data.activeGameId를 심어뒀으므로 그대로 재사용한다)
    await gameSessionSocketLayer.onDisconnect(ioA, joinerSocketA, 'uuid-cleanup-joiner')

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

// ---------------------------------------------------------------------------
// submit_night_action (handleSubmitNightAction) — NIGHT 행동 제출
// ---------------------------------------------------------------------------

/** game-core를 직접 구동해 playerCount=10·jokerCount=1 세션을 NIGHT로 전이시켜 커밋한다. 5개 역할 전부가 정확히 1명씩(CITIZEN은 6명) 배정된다. */
function commitFullRoleSessionAtNight({ id = 'room-full', gameIdFn } = {}) {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`fp-${id}-${i}`))
    const room = makeRoom({ id, players, jokerCount: 1 })
    const opts = { randomFn: () => 0.999, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, opts)
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) {
        gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    }
    const byRole = (role) => [...session.players.values()].find((p) => p.role === role).uuid
    return {
        session,
        jokerUuid: byRole('JOKER'),
        doctorUuid: byRole('DOCTOR'),
        guardUuid: byRole('GUARD'),
        witchHunterUuid: byRole('WITCH_HUNTER'),
        citizenUuid: byRole('CITIZEN'),
    }
}

/** playerCount=3·jokerCount=2 세션을 NIGHT로 전이시켜 커밋한다 — JOKER 2명 + CITIZEN 1명. */
function commitJokerTrioSessionAtNight({ id = 'room-joker', gameIdFn } = {}) {
    const players = [makePlayer(`ja-${id}`), makePlayer(`jb-${id}`), makePlayer(`jc-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 2 })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, opts)
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) {
        gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    }
    const jokerUuids = [...session.players.values()].filter((p) => p.role === 'JOKER').map((p) => p.uuid)
    const citizenUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    return { session, jokerUuids, citizenUuid }
}

function throwingCallback(message) {
    return () => {
        throw new Error(message)
    }
}

// --- 기본 계약: malformed payload / callback 부재 / 브로드캐스트 없음 ---

test('submit_night_action: payload가 객체가 아니거나 배열이면 INVALID_PAYLOAD이고 Map은 불변이다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()

    for (const badPayload of [null, 'x', 42, []]) {
        const { callback, getResponse } = countingCallback()
        handleSubmitNightAction(doctorUuid, badPayload, callback)
        assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    }
    assert.equal(session.nightActions.size, 0)
})

test('submit_night_action: gameId가 비문자열이면 INVALID_PAYLOAD이고 Map은 불변이다', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight()
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(doctorUuid, { gameId: 123, targetId: citizenUuid }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    assert.equal(session.nightActions.size, 0)
})

test('submit_night_action: targetId가 null도 문자열도 아니면 INVALID_PAYLOAD이고 Map은 불변이다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(doctorUuid, { gameId: session.id, targetId: 42 }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    assert.equal(session.nightActions.size, 0)
})

test('submit_night_action: targetId 키 자체가 없어도(undefined) INVALID_PAYLOAD다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(doctorUuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
})

test('submit_night_action: callback이 함수가 아니면 완전한 no-op이다(예외도 없고 Map도 불변)', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight()

    assert.doesNotThrow(() => handleSubmitNightAction(doctorUuid, { gameId: session.id, targetId: citizenUuid }, undefined))
    assert.equal(session.nightActions.size, 0)
})

test('submit_night_action: core가 SESSION_NOT_FOUND를 반환하는 registry 불일치는 INTERNAL_ERROR로 정규화된다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    gameSessionCore.__testables.__deleteGameSessionOnlyForTests(session.id)
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(doctorUuid, { gameId: session.id, targetId: null }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
})

test('submit_night_action: 성공/실패 어느 경로에서도 브로드캐스트가 발생하지 않는다', () => {
    const { session, doctorUuid, citizenUuid, guardUuid } = commitFullRoleSessionAtNight()
    const io = createFakeIo([])

    handleSubmitNightAction(doctorUuid, { gameId: session.id, targetId: citizenUuid }, countingCallback().callback)
    handleSubmitNightAction(guardUuid, { gameId: session.id, targetId: guardUuid }, countingCallback().callback) // 실패(INVALID_TARGET)

    assert.equal(io.broadcasts.length, 0)
})

// --- JOKER no-op 계약: 소켓 계층 외부 callback 테스트 ---
// client가 실제로 받는 ack만 검증한다. nightActions 내부 상태 차이(엔트리 없음 vs 실제 target
// 저장)는 game-core/__tests__/gameSession.test.js의 core 직접 호출 테스트가 전담한다 — 이
// 테스트 파일에서는 그 상태를 assertion하지 않는다.

test('submit_night_action(JOKER): 자기 자신·다른 JOKER·CITIZEN 세 대상 모두 외부 ack가 정확히 {ok:true}다(추가 키·gameId 없음)', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight()
    const [actor, teammate] = jokerUuids

    const self = countingCallback()
    handleSubmitNightAction(actor, { gameId: session.id, targetId: actor }, self.callback)

    const teammateResult = countingCallback()
    handleSubmitNightAction(actor, { gameId: session.id, targetId: teammate }, teammateResult.callback)

    const citizenResult = countingCallback()
    handleSubmitNightAction(actor, { gameId: session.id, targetId: citizenUuid }, citizenResult.callback)

    assert.deepEqual(self.getResponse(), { ok: true })
    assert.deepEqual(teammateResult.getResponse(), { ok: true })
    assert.deepEqual(citizenResult.getResponse(), { ok: true })
})

test('submit_night_action(JOKER, 오라클 방지 회귀): 자기 자신·다른 JOKER·CITIZEN 세 외부 ack가 구조적으로 구분 불가능하다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight()
    const [actor, teammate] = jokerUuids

    const self = countingCallback()
    handleSubmitNightAction(actor, { gameId: session.id, targetId: actor }, self.callback)
    const teammateResult = countingCallback()
    handleSubmitNightAction(actor, { gameId: session.id, targetId: teammate }, teammateResult.callback)
    const citizenResult = countingCallback()
    handleSubmitNightAction(actor, { gameId: session.id, targetId: citizenUuid }, citizenResult.callback)

    // client 쪽에서 이 세 응답만으로는 대상이 자기 자신인지, 다른 JOKER인지, 시민인지 전혀
    // 구분할 수 없다는 것이 이 테스트의 핵심 — deepEqual로 세 payload가 구조적으로 완전히
    // 동일함을 직접 증명한다.
    assert.deepEqual(self.getResponse(), teammateResult.getResponse())
    assert.deepEqual(teammateResult.getResponse(), citizenResult.getResponse())
    assert.deepEqual(self.getResponse(), { ok: true })
})

// --- 로그 비밀성: registry 불일치 경로 ---

test('로그 비밀성(registry 불일치): console.error 인자가 정확히 {code, uuid, gameId:undefined}뿐이고 원본 Error가 아니다', (t) => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    gameSessionCore.__testables.__deleteGameSessionOnlyForTests(session.id)
    const errorSpy = t.mock.method(console, 'error', () => {})

    handleSubmitNightAction(doctorUuid, { gameId: session.id, targetId: null }, countingCallback().callback)

    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[밤 행동 제출 registry 불일치]')
    assert.deepEqual(Object.keys(loggedObj).sort(), ['code', 'gameId', 'uuid'])
    assert.equal(loggedObj instanceof Error, false)
    assert.equal(loggedObj.code, 'SESSION_NOT_FOUND')
    assert.equal(loggedObj.uuid, doctorUuid)
    assert.equal(loggedObj.gameId, undefined)
})

// --- 로그 비밀성: 일반 예외 경로 ---

test('로그 비밀성(일반 예외): 의도적으로 민감한 문자열을 담은 Error를 던져도 로그·ack 어디에도 새지 않고 gameId는 undefined다', (t) => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    t.mock.method(gameSessionCore, 'submitNightAction', () => {
        throw new Error('SECRET role=JOKER targetId=citizen-uuid-X')
    })
    const errorSpy = t.mock.method(console, 'error', () => {})
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(doctorUuid, { gameId: session.id, targetId: null }, callback)

    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[밤 행동 제출 처리 에러]')
    assert.deepEqual(loggedObj, { code: 'UNEXPECTED_ERROR', uuid: doctorUuid, gameId: undefined })
    assert.equal(loggedObj instanceof Error, false)

    const serialized = JSON.stringify(errorSpy.mock.calls[0].arguments)
    assert.equal(serialized.includes('SECRET'), false)
    assert.equal(serialized.includes('role=JOKER'), false)
    assert.equal(serialized.includes('targetId=citizen-uuid-X'), false)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(JSON.stringify(getResponse()).includes('SECRET'), false)
})

// --- 로그 비밀성: callback 전달 실패 경로 ---

test('로그 비밀성(callback 전달 실패, 성공 응답 전달 중): gameId는 core가 반환한 canonical session.id고, 이미 반영된 Map 쓰기는 롤백되지 않는다', (t) => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight()
    const errorSpy = t.mock.method(console, 'error', () => {})
    const io = createFakeIo([])

    assert.doesNotThrow(() =>
        handleSubmitNightAction(doctorUuid, { gameId: session.id, targetId: citizenUuid }, throwingCallback('SECRET stack leak role=DOCTOR')),
    )

    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[밤 행동 제출 ack 전달 실패]')
    assert.deepEqual(Object.keys(loggedObj).sort(), ['code', 'gameId', 'uuid'])
    assert.equal(loggedObj.code, 'CALLBACK_ERROR')
    assert.equal(loggedObj.gameId, session.id) // client 원본이 아니라 core가 반환한 canonical 값
    assert.equal(loggedObj instanceof Error, false)

    const serialized = JSON.stringify(errorSpy.mock.calls[0].arguments)
    assert.equal(serialized.includes('SECRET'), false)
    assert.equal(serialized.includes('stack leak'), false)
    assert.equal(serialized.includes('role=DOCTOR'), false)

    // callback이 throw하기 이전에 이미 일어난 Map 쓰기는 그대로 유지된다.
    assert.equal(session.nightActions.get(doctorUuid), citizenUuid)
    assert.equal(io.broadcasts.length, 0)
})

test('로그 비밀성(callback 전달 실패, 실패 응답 전달 중): gameId는 undefined다(canonical 값을 쓸 근거가 없음)', (t) => {
    const { session, guardUuid } = commitFullRoleSessionAtNight()
    const errorSpy = t.mock.method(console, 'error', () => {})

    // GUARD 자기 자신 대상 → INVALID_TARGET(실패).
    assert.doesNotThrow(() =>
        handleSubmitNightAction(guardUuid, { gameId: session.id, targetId: guardUuid }, throwingCallback('SECRET-FAIL role=GUARD')),
    )

    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(loggedObj.gameId, undefined)
    assert.equal(JSON.stringify(errorSpy.mock.calls[0].arguments).includes('SECRET-FAIL'), false)
})

// --- 로그 비밀성: 일반 예외 + callback 전달 실패 중첩 경로 ---

test('로그 비밀성(중첩): submitNightAction과 callback이 동시에 throw해도 정확히 2건의 고정 구조 로그만 남고 gameId는 둘 다 undefined다', (t) => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    t.mock.method(gameSessionCore, 'submitNightAction', () => {
        throw new Error('SECRET-A role=JOKER')
    })
    const errorSpy = t.mock.method(console, 'error', () => {})

    assert.doesNotThrow(() =>
        handleSubmitNightAction(doctorUuid, { gameId: session.id, targetId: null }, throwingCallback('SECRET-B stack role=GUARD')),
    )

    assert.equal(errorSpy.mock.calls.length, 2)
    const [firstPrefix, firstLogged] = errorSpy.mock.calls[0].arguments
    const [secondPrefix, secondLogged] = errorSpy.mock.calls[1].arguments
    assert.equal(firstPrefix, '[밤 행동 제출 처리 에러]')
    assert.deepEqual(firstLogged, { code: 'UNEXPECTED_ERROR', uuid: doctorUuid, gameId: undefined })
    assert.equal(secondPrefix, '[밤 행동 제출 ack 전달 실패]')
    assert.deepEqual(secondLogged, { code: 'CALLBACK_ERROR', uuid: doctorUuid, gameId: undefined })

    const serialized = JSON.stringify(errorSpy.mock.calls.map((c) => c.arguments))
    for (const secret of ['SECRET-A', 'SECRET-B', 'role=JOKER', 'role=GUARD', 'stack']) {
        assert.equal(serialized.includes(secret), false)
    }
})

// --- 로그 비밀성: 개행·초장문 gameId + callback throw ---

test('로그 비밀성(개행·초장문 gameId): malformed payload의 gameId에 개행·10만자 문자열이 있어도 로그·ack 어디에도 새지 않는다', (t) => {
    const { doctorUuid } = commitFullRoleSessionAtNight()
    const errorSpy = t.mock.method(console, 'error', () => {})
    const longInjection = '\n[admin] login succeeded\nrole=JOKER' + 'x'.repeat(100000)

    assert.doesNotThrow(() =>
        handleSubmitNightAction(doctorUuid, { gameId: longInjection, targetId: null }, throwingCallback('late leak')),
    )

    // gameId가 문자열이긴 하지만(payload 자체는 형태상 유효) 실제 세션과 일치하지 않으므로
    // core에서 STALE_SESSION_MISMATCH로 실패한다 — 실패 경로이므로 gameId는 undefined다.
    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(loggedObj.gameId, undefined)

    const serialized = JSON.stringify(errorSpy.mock.calls[0].arguments)
    assert.equal(serialized.includes('admin'), false)
    assert.equal(serialized.includes('role=JOKER'), false)
    assert.equal(serialized.includes('xxxxx'), false)
})

// --- 9라운드 회귀: 검증을 통과한 client 원본 gameId(공백·개행 포함)라도 외부 ack에는 절대
// 노출되지 않고, callback 실패 로그에는 core가 반환한 canonical session.id만 남는다 ---

test('9라운드 회귀: gameId 앞뒤에 개행·공백이 있어도 trim 후 세션과 일치하면 정상 저장 성공이고, 외부 ack는 정확히 {ok:true}뿐이다(gameId 키 없음)', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'room-abc', gameIdFn: () => 'abc' })
    assert.equal(session.id, 'abc')
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(doctorUuid, { gameId: '\n  abc  \n', targetId: citizenUuid }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(Object.hasOwn(getResponse(), 'gameId'), false)
    assert.equal(session.nightActions.get(doctorUuid), citizenUuid)
})

test('9라운드 회귀: 같은 성공 제출에서 callback이 throw하면 CALLBACK_ERROR 로그의 gameId는 정확히 "abc"이고 원본 개행·공백 문자열은 어디에도 없다', (t) => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'room-abc2', gameIdFn: () => 'abc' })
    const errorSpy = t.mock.method(console, 'error', () => {})

    handleSubmitNightAction(doctorUuid, { gameId: '\n  abc  \n', targetId: citizenUuid }, throwingCallback('late leak'))

    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(loggedObj.gameId, 'abc')

    const serialized = JSON.stringify(errorSpy.mock.calls[0].arguments)
    assert.equal(serialized.includes('\n  abc  \n'), false)
    assert.equal(serialized.includes('  abc  '), false)
})

test('9라운드 회귀: JOKER no-op 성공에서도 callback이 throw하면 CALLBACK_ERROR 로그의 gameId는 client 원본이 아닌 canonical "abc"다', (t) => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-abc-joker', gameIdFn: () => 'abc' })
    const [actor, teammate] = jokerUuids
    const errorSpy = t.mock.method(console, 'error', () => {})

    handleSubmitNightAction(actor, { gameId: '\n  abc  \n', targetId: teammate }, throwingCallback('late leak'))

    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(loggedObj.gameId, 'abc')
})

// ---------------------------------------------------------------------------
// submit_joker_chat_message (handleSubmitJokerChatMessage) — NIGHT 단계 JOKER 전용 채팅
// ---------------------------------------------------------------------------

/** game-core를 직접 구동해 NIGHT 단계의 JOKER 전용 채팅 테스트용 세션 + fake socket/io를 준비한다. jokerCount만큼 JOKER, 나머지는 CITIZEN으로 배정된다. */
function commitJokerChatSessionWithSockets(uuids, { roomId = 'room-jc', jokerCount = 2, gameIdFn } = {}) {
    const room = makeRoom({ id: roomId, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, opts)
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) {
        gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    }
    const sockets = uuids.map((uuid) => {
        const s = createFakeSocket(uuid)
        s.rooms.add(session.channelId)
        return s
    })
    const io = createFakeIo(sockets)
    const jokerUuids = [...session.players.values()].filter((p) => p.role === 'JOKER').map((p) => p.uuid)
    const citizenUuids = [...session.players.values()].filter((p) => p.role !== 'JOKER').map((p) => p.uuid)
    const socketByUuid = new Map(sockets.map((s) => [s.data.user.uuid, s]))
    return { session, io, sockets, socketByUuid, jokerUuids, citizenUuids }
}

test('submit_joker_chat_message: payload가 객체가 아니거나 배열이면 INVALID_PAYLOAD이고 Map은 불변이다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc1a', 'jc1b', 'jc1c'], { roomId: 'room-jc-1' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)

    for (const badPayload of [null, 'x', 42, []]) {
        const { callback, getResponse } = countingCallback()
        handleSubmitJokerChatMessage(io, socket, actor, badPayload, callback)
        assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    }
    assert.equal(session.jokerChatRateLimit.size, 0)
})

test('submit_joker_chat_message: gameId가 비문자열이면 INVALID_PAYLOAD이고 Map은 불변이다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc2a', 'jc2b', 'jc2c'], { roomId: 'room-jc-2' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: 123, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    assert.equal(session.jokerChatRateLimit.size, 0)
})

test('submit_joker_chat_message: text가 비문자열이면 INVALID_PAYLOAD이고 Map은 불변이다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc3a', 'jc3b', 'jc3c'], { roomId: 'room-jc-3' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 42 }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    assert.equal(session.jokerChatRateLimit.size, 0)
})

test('submit_joker_chat_message: callback이 함수가 아니면 완전한 no-op이다(예외도 없고 Map도 emit도 불변)', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc4a', 'jc4b', 'jc4c'], { roomId: 'room-jc-4' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)

    assert.doesNotThrow(() => handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, undefined))

    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(socket.emitted.length, 0)
})

test('submit_joker_chat_message: registerGameHandlers로 실제 배선하면 socket.trigger가 직접 호출과 동일한 결과를 낸다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc5a', 'jc5b', 'jc5c'], { roomId: 'room-jc-5' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    gameSessionSocketLayer.registerGameHandlers(io, socket, actor)

    const { callback, getResponse } = countingCallback()
    socket.trigger('submit_joker_chat_message', { gameId: session.id, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const delivered = socket.emitted.filter((e) => e.event === 'joker_chat_message')
    assert.equal(delivered.length, 1)
})

test('submit_joker_chat_message: 정확히-한-번 전달 — JOKER 두 소켓(발신자 포함) 각각 정확히 1개, CITIZEN은 0개, io.broadcasts는 비어있다', () => {
    const { session, io, jokerUuids, citizenUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc6a', 'jc6b', 'jc6c'], { roomId: 'room-jc-6' })
    const [actor, teammate] = jokerUuids
    const [citizen] = citizenUuids
    const senderSocket = socketByUuid.get(actor)

    const { callback, getResponse } = countingCallback()
    handleSubmitJokerChatMessage(io, senderSocket, actor, { gameId: session.id, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(socketByUuid.get(actor).emitted.filter((e) => e.event === 'joker_chat_message').length, 1)
    assert.equal(socketByUuid.get(teammate).emitted.filter((e) => e.event === 'joker_chat_message').length, 1)
    assert.equal(socketByUuid.get(citizen).emitted.filter((e) => e.event === 'joker_chat_message').length, 0)
    assert.equal(io.broadcasts.length, 0)
})

test('submit_joker_chat_message: deps.prepare가 실패 응답을 반환하면 그 code 그대로 ack되고 Map은 불변, emit은 0회다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc7a', 'jc7b', 'jc7c'], { roomId: 'room-jc-7' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const deps = { prepare: () => ({ ok: false, code: 'RATE_LIMITED' }) }
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback, deps)

    assert.deepEqual(getResponse(), { ok: false, code: 'RATE_LIMITED', message: '요청을 처리할 수 없습니다.' })
    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(socket.emitted.length, 0)
})

test('submit_joker_chat_message: deps.prepare가 throw하면 ack INTERNAL_ERROR이고 로그가 정확히 {code, uuid, gameId:undefined} 3키이며 raw err가 없다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc8a', 'jc8b', 'jc8c'], { roomId: 'room-jc-8' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const errorSpy = t.mock.method(console, 'error', () => {})
    const deps = { prepare: () => { throw new Error('시계 오류(테스트 주입)') } }
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback, deps)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(socket.emitted.length, 0)
    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[조커 채팅 오류]')
    assert.deepEqual(loggedObj, { code: 'PREPARE_UNEXPECTED_ERROR', uuid: actor, gameId: undefined })
    assert.equal(loggedObj instanceof Error, false)
})

test('submit_joker_chat_message: prepare가 INVALID_CLOCK_VALUE를 반환하면 ack INTERNAL_ERROR이고 로그가 정확히 {code:"INVALID_CLOCK_VALUE", uuid, gameId:undefined}다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc9a', 'jc9b', 'jc9c'], { roomId: 'room-jc-9' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const errorSpy = t.mock.method(console, 'error', () => {})
    const deps = { prepare: () => ({ ok: false, code: 'INVALID_CLOCK_VALUE' }) }
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback, deps)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.deepEqual(loggedObj, { code: 'INVALID_CLOCK_VALUE', uuid: actor, gameId: undefined })
})

test('submit_joker_chat_message: deps.resolveTeammateSockets가 throw하면 ack INTERNAL_ERROR이고 Map은 불변(commit 미호출), emit 0회, 로그 {code:"RECIPIENT_RESOLVE_ERROR", uuid, gameId}다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc10a', 'jc10b', 'jc10c'], { roomId: 'room-jc-10' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const errorSpy = t.mock.method(console, 'error', () => {})
    const deps = { resolveTeammateSockets: () => { throw new Error('resolver 실패(테스트 주입)') } }
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback, deps)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(socket.emitted.length, 0)
    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[조커 채팅 오류]')
    assert.deepEqual(loggedObj, { code: 'RECIPIENT_RESOLVE_ERROR', uuid: actor, gameId: session.id })
})

test('submit_joker_chat_message: resolveTeammateSockets가 발신자를 제외한 나머지만 반환하면 ack INTERNAL_ERROR이고 Map 불변, 아무에게도 emit되지 않으며 로그 {code:"SENDER_NOT_IN_RECIPIENTS", uuid, gameId}다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc11a', 'jc11b', 'jc11c'], { roomId: 'room-jc-11' })
    const [actor, teammate] = jokerUuids
    const socket = socketByUuid.get(actor)
    const teammateSocket = socketByUuid.get(teammate)
    const errorSpy = t.mock.method(console, 'error', () => {})
    const deps = { resolveTeammateSockets: () => [teammateSocket] }
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback, deps)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(socket.emitted.length, 0)
    assert.equal(teammateSocket.emitted.length, 0)
    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.deepEqual(loggedObj, { code: 'SENDER_NOT_IN_RECIPIENTS', uuid: actor, gameId: session.id })
})

test('submit_joker_chat_message: deps.idFn이 throw하면 ack INTERNAL_ERROR이고 Map 불변, emit 0회, 로그 {code:"ID_GENERATION_ERROR", uuid, gameId}다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc12a', 'jc12b', 'jc12c'], { roomId: 'room-jc-12' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const errorSpy = t.mock.method(console, 'error', () => {})
    const deps = { idFn: () => { throw new Error('id 생성 실패(테스트 주입)') } }
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback, deps)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(socket.emitted.length, 0)
    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.deepEqual(loggedObj, { code: 'ID_GENERATION_ERROR', uuid: actor, gameId: session.id })
})

test('submit_joker_chat_message: deps.idFn이 빈 문자열/공백을 반환하면 ack INTERNAL_ERROR(로그 code는 INVALID_MESSAGE_ID)이고 Map 불변, emit 0회다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc13a', 'jc13b', 'jc13c'], { roomId: 'room-jc-13' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const errorSpy = t.mock.method(console, 'error', () => {})

    for (const badId of ['', '   ']) {
        const deps = { idFn: () => badId }
        const { callback, getResponse } = countingCallback()
        handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback, deps)
        assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    }

    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(socket.emitted.length, 0)
    assert.equal(errorSpy.mock.calls.length, 2)
    for (const call of errorSpy.mock.calls) {
        assert.deepEqual(call.arguments[1], { code: 'INVALID_MESSAGE_ID', uuid: actor, gameId: session.id })
    }
})

test('submit_joker_chat_message: deps.commit이 throw하면 ack INTERNAL_ERROR이고 성공 ack·emit이 전혀 없으며 로그 {code:"COMMIT_ERROR", uuid, gameId}다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc14a', 'jc14b', 'jc14c'], { roomId: 'room-jc-14' })
    const [actor, teammate] = jokerUuids
    const socket = socketByUuid.get(actor)
    const teammateSocket = socketByUuid.get(teammate)
    const errorSpy = t.mock.method(console, 'error', () => {})
    const deps = { commit: () => { throw new Error('commit 실패(테스트 주입)') } }
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback, deps)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(socket.emitted.length, 0)
    assert.equal(teammateSocket.emitted.length, 0)
    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.deepEqual(loggedObj, { code: 'COMMIT_ERROR', uuid: actor, gameId: session.id })
})

test('submit_joker_chat_message: registry 불일치(SESSION_NOT_FOUND)는 ack INTERNAL_ERROR이고 로그가 정확히 {code:"SESSION_NOT_FOUND", uuid, gameId:undefined}다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc15a', 'jc15b', 'jc15c'], { roomId: 'room-jc-15' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    gameSessionCore.__testables.__deleteGameSessionOnlyForTests(session.id)
    const errorSpy = t.mock.method(console, 'error', () => {})
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.deepEqual(loggedObj, { code: 'SESSION_NOT_FOUND', uuid: actor, gameId: undefined })
})

test('submit_joker_chat_message: callback이 throw해도 예외가 새지 않고 commit은 이미 반영되며 수신자 전원(발신자 포함)이 정상 수신하고 로그 {code:"CALLBACK_ERROR", uuid, gameId}다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc16a', 'jc16b', 'jc16c'], { roomId: 'room-jc-16' })
    const [actor, teammate] = jokerUuids
    const socket = socketByUuid.get(actor)
    const teammateSocket = socketByUuid.get(teammate)
    const errorSpy = t.mock.method(console, 'error', () => {})

    assert.doesNotThrow(() =>
        handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, throwingCallback('콜백 실패(테스트 주입)')),
    )

    assert.equal(session.jokerChatRateLimit.get(actor) !== undefined, true)
    assert.equal(socket.emitted.filter((e) => e.event === 'joker_chat_message').length, 1)
    assert.equal(teammateSocket.emitted.filter((e) => e.event === 'joker_chat_message').length, 1)
    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[조커 채팅 오류]')
    assert.deepEqual(loggedObj, { code: 'CALLBACK_ERROR', uuid: actor, gameId: session.id })
})

test('submit_joker_chat_message: 한 recipient만 emit이 throw해도 나머지(발신자 포함)는 정상 수신하고 로그는 {code:"DELIVERY_ERROR", uuid, gameId}만 남는다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc17a', 'jc17b', 'jc17c'], { roomId: 'room-jc-17' })
    const [actor, teammate] = jokerUuids
    const socket = socketByUuid.get(actor)
    const teammateSocket = socketByUuid.get(teammate)
    teammateSocket.emitShouldThrowOn = 'joker_chat_message'
    const errorSpy = t.mock.method(console, 'error', () => {})
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(socket.emitted.filter((e) => e.event === 'joker_chat_message').length, 1)
    assert.equal(teammateSocket.emitted.filter((e) => e.event === 'joker_chat_message').length, 0)
    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[조커 채팅 오류]')
    assert.deepEqual(loggedObj, { code: 'DELIVERY_ERROR', uuid: actor, gameId: session.id })
})

test('submit_joker_chat_message: callback throw와 recipient emit throw가 동시에 발생해도 commit은 반영되고 실패하지 않은 recipient는 정상 수신하며 두 로그가 서로 오염되지 않는다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc18a', 'jc18b', 'jc18c'], { roomId: 'room-jc-18' })
    const [actor, teammate] = jokerUuids
    const socket = socketByUuid.get(actor)
    const teammateSocket = socketByUuid.get(teammate)
    teammateSocket.emitShouldThrowOn = 'joker_chat_message'
    const errorSpy = t.mock.method(console, 'error', () => {})

    assert.doesNotThrow(() =>
        handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, throwingCallback('콜백 실패(테스트 주입)')),
    )

    assert.equal(session.jokerChatRateLimit.get(actor) !== undefined, true)
    assert.equal(socket.emitted.filter((e) => e.event === 'joker_chat_message').length, 1)
    assert.equal(teammateSocket.emitted.filter((e) => e.event === 'joker_chat_message').length, 0)
    assert.equal(errorSpy.mock.calls.length, 2)
    const [firstPrefix, firstLogged] = errorSpy.mock.calls[0].arguments
    const [secondPrefix, secondLogged] = errorSpy.mock.calls[1].arguments
    assert.equal(firstPrefix, '[조커 채팅 오류]')
    assert.deepEqual(firstLogged, { code: 'CALLBACK_ERROR', uuid: actor, gameId: session.id })
    assert.equal(secondPrefix, '[조커 채팅 오류]')
    assert.deepEqual(secondLogged, { code: 'DELIVERY_ERROR', uuid: actor, gameId: session.id })
})

test('submit_joker_chat_message: CITIZEN이 직접 호출하면 NOT_ELIGIBLE이고 어떤 소켓에도 브로드캐스트되지 않는다', () => {
    const { session, io, citizenUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc19a', 'jc19b', 'jc19c'], { roomId: 'room-jc-19' })
    const [citizen] = citizenUuids
    const socket = socketByUuid.get(citizen)
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, citizen, { gameId: session.id, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
    for (const s of [...socketByUuid.values()]) {
        assert.equal(s.emitted.filter((e) => e.event === 'joker_chat_message').length, 0)
    }
})

test('submit_joker_chat_message: 다른 GameSession의 JOKER 소켓에는 전달되지 않는다(두 세션 동시 커밋, 교차 오염 없음)', () => {
    const roomA = makeRoom({ id: 'room-cross-a', players: [makePlayer('crossA1'), makePlayer('crossA2'), makePlayer('crossA3')], jokerCount: 2 })
    const roomB = makeRoom({ id: 'room-cross-b', players: [makePlayer('crossB1'), makePlayer('crossB2'), makePlayer('crossB3')], jokerCount: 2 })
    const candidateA = gameSessionCore.__testables.buildSessionCandidate(roomA, { randomFn: () => 0 })
    const candidateB = gameSessionCore.__testables.buildSessionCandidate(roomB, { randomFn: () => 0 })
    gameSessionCore.commitGameSession(candidateA.session)
    gameSessionCore.commitGameSession(candidateB.session)
    const sessionA = candidateA.session
    const sessionB = candidateB.session
    for (const uuid of sessionA.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, sessionA.id)
    for (const uuid of sessionB.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, sessionB.id)

    const socketsA = [...sessionA.players.keys()].map((uuid) => {
        const s = createFakeSocket(uuid)
        s.rooms.add(sessionA.channelId)
        return s
    })
    const socketsB = [...sessionB.players.keys()].map((uuid) => {
        const s = createFakeSocket(uuid)
        s.rooms.add(sessionB.channelId)
        return s
    })
    const io = createFakeIo([...socketsA, ...socketsB])

    const actorA = [...sessionA.players.values()].find((p) => p.role === 'JOKER').uuid
    const socketA = socketsA.find((s) => s.data.user.uuid === actorA)
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socketA, actorA, { gameId: sessionA.id, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    for (const s of socketsB) {
        assert.equal(s.emitted.filter((e) => e.event === 'joker_chat_message').length, 0)
    }
})

test('submit_joker_chat_message: connected:false인 JOKER 소켓은 수신자에서 제외된다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc21a', 'jc21b', 'jc21c'], { roomId: 'room-jc-21' })
    const [actor, teammate] = jokerUuids
    const socket = socketByUuid.get(actor)
    const teammateSocket = socketByUuid.get(teammate)
    teammateSocket.connected = false
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(socket.emitted.filter((e) => e.event === 'joker_chat_message').length, 1)
    assert.equal(teammateSocket.emitted.filter((e) => e.event === 'joker_chat_message').length, 0)
})

test('submit_joker_chat_message: session.channelId room 밖의 JOKER 소켓은 수신자에서 제외된다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc22a', 'jc22b', 'jc22c'], { roomId: 'room-jc-22' })
    const [actor, teammate] = jokerUuids
    const socket = socketByUuid.get(actor)
    const teammateSocket = socketByUuid.get(teammate)
    teammateSocket.rooms.delete(session.channelId)
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(socket.emitted.filter((e) => e.event === 'joker_chat_message').length, 1)
    assert.equal(teammateSocket.emitted.filter((e) => e.event === 'joker_chat_message').length, 0)
})

test('submit_joker_chat_message: payload에 senderUuid/role/team/nickname을 위조해도 브로드캐스트된 senderUuid는 항상 인증 uuid이고 다른 필드는 전달되지 않는다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc23a', 'jc23b', 'jc23c'], { roomId: 'room-jc-23' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(
        io, socket, actor,
        { gameId: session.id, text: 'hello', senderUuid: 'forged-uuid', role: 'CITIZEN', team: 'CITIZEN', nickname: 'forged-nickname' },
        callback,
    )

    assert.deepEqual(getResponse(), { ok: true })
    const delivered = socket.emitted.find((e) => e.event === 'joker_chat_message')
    assert.equal(delivered.payload.senderUuid, actor)
    assert.deepEqual(Object.keys(delivered.payload).sort(), ['gameId', 'messageId', 'senderUuid', 'sentAt', 'text'])
})

test('submit_joker_chat_message: 공백으로 감싼 유효 gameId로 성공 요청 후 canonical gameId가 노출되고, 연속 두 메시지가 서로 다른 messageId로 도착 순서대로 append된다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc24a', 'jc24b', 'jc24c'], { roomId: 'room-jc-24' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    let clock = 1000
    const nowFn = () => { const v = clock; clock += 1000; return v }
    const idQueue = ['msg-jc24-1', 'msg-jc24-2']
    let idIndex = 0
    const deps = {
        prepare: (uuid, gameId, text) => gameSessionCore.prepareJokerChatMessage(uuid, gameId, text, { now: nowFn }),
        idFn: () => idQueue[idIndex++],
    }

    const first = countingCallback()
    handleSubmitJokerChatMessage(io, socket, actor, { gameId: `  ${session.id}  `, text: 'first' }, first.callback, deps)
    assert.deepEqual(first.getResponse(), { ok: true })

    const second = countingCallback()
    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'second' }, second.callback, deps)
    assert.deepEqual(second.getResponse(), { ok: true })

    const delivered = socket.emitted.filter((e) => e.event === 'joker_chat_message')
    assert.equal(delivered.length, 2)
    assert.equal(delivered[0].payload.gameId, session.id)
    assert.equal(delivered[1].payload.gameId, session.id)
    assert.equal(delivered[0].payload.messageId, 'msg-jc24-1')
    assert.equal(delivered[1].payload.messageId, 'msg-jc24-2')
    assert.equal(delivered[0].payload.text, 'first')
    assert.equal(delivered[1].payload.text, 'second')
})

test('submit_joker_chat_message(중첩): deps.prepare가 throw하고 동시에 callback도 throw하면 두 로그가 각각 독립적으로 3키 고정 구조로 남고 Map은 완전히 불변이며 emit도 없다', (t) => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc25a', 'jc25b', 'jc25c'], { roomId: 'room-jc-25' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const errorSpy = t.mock.method(console, 'error', () => {})
    const deps = { prepare: () => { throw new Error('SECRET prepare fail') } }
    const beforeSnapshot = [...session.jokerChatRateLimit.entries()]

    assert.doesNotThrow(() =>
        handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hi' }, throwingCallback('SECRET callback fail'), deps),
    )

    assert.equal(errorSpy.mock.calls.length, 2)
    const [firstPrefix, firstLogged] = errorSpy.mock.calls[0].arguments
    const [secondPrefix, secondLogged] = errorSpy.mock.calls[1].arguments
    assert.equal(firstPrefix, '[조커 채팅 오류]')
    assert.deepEqual(firstLogged, { code: 'PREPARE_UNEXPECTED_ERROR', uuid: actor, gameId: undefined })
    assert.equal(secondPrefix, '[조커 채팅 오류]')
    assert.deepEqual(secondLogged, { code: 'CALLBACK_ERROR', uuid: actor, gameId: undefined })
    assert.deepEqual([...session.jokerChatRateLimit.entries()], beforeSnapshot)
    assert.equal(socket.emitted.filter((e) => e.event === 'joker_chat_message').length, 0)

    const serialized = JSON.stringify(errorSpy.mock.calls.map((c) => c.arguments))
    assert.equal(serialized.includes('SECRET'), false)
})

test('submit_joker_chat_message: deps.idFn이 앞뒤 공백이 있는 유효 문자열을 반환해도 성공하고 브로드캐스트된 messageId는 trim된 값과 정확히 일치한다', () => {
    const { session, io, jokerUuids, socketByUuid } = commitJokerChatSessionWithSockets(['jc26a', 'jc26b', 'jc26c'], { roomId: 'room-jc-26' })
    const [actor] = jokerUuids
    const socket = socketByUuid.get(actor)
    const deps = { idFn: () => '  msg-1  ' }
    const { callback, getResponse } = countingCallback()

    handleSubmitJokerChatMessage(io, socket, actor, { gameId: session.id, text: 'hi' }, callback, deps)

    assert.deepEqual(getResponse(), { ok: true })
    const delivered = socket.emitted.find((e) => e.event === 'joker_chat_message')
    assert.equal(delivered.payload.messageId, 'msg-1')
})

// ---------------------------------------------------------------------------
// leave_game_session (handleLeaveGameSession) — 명시적 이탈
// ---------------------------------------------------------------------------

/**
 * matchmaking.js의 실제 handleCreateRoom/handleJoinRoomByCode/handleSetReady/handleStartGame을
 * 실제로 구동해 2인 GameSession을 시작한다(game-core를 직접 커밋하는 다른 헬퍼들과 달리, 이
 * 절은 activeGameId/activeRoomId 결합과 matchmaking Room 정리까지 실제 production 코드
 * 경로로 검증해야 하므로 matchmaking을 우회하지 않는다).
 */
async function startRealTwoPlayerSession(hostUuid, joinerUuid) {
    matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: uuid }) })
    const readyRoomHandlers = { handleCreateRoom, handleJoinRoomByCode, handleSetReady }
    const hostSocket = createFakeSocket(hostUuid)
    const io = createFakeIo([hostSocket])
    const { joinerSocket, room } = await setupReadyRoomForStart(io, hostUuid, joinerUuid, readyRoomHandlers)
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, hostUuid, callback)
    const startResponse = getResponse()
    if (!startResponse.ok) throw new Error(`테스트 셋업 실패: ${JSON.stringify(startResponse)}`)
    return { io, hostSocket, joinerSocket, gameId: startResponse.gameId, channelId: room.roomId }
}

test('leave_game_session: payload가 객체가 아니거나 gameId 누락/타입 오류/빈 문자열이면 INVALID_PAYLOAD이고 세션은 불변이다', async () => {
    const { io } = await startRealTwoPlayerSession('leave-inv-host', 'leave-inv-joiner')
    const badPayloads = [null, 'x', 42, [], {}, { gameId: 123 }, { gameId: '' }, { gameId: '   ' }]

    for (const payload of badPayloads) {
        const { callback, getResponse } = countingCallback()
        handleLeaveGameSession(io, 'leave-inv-host', payload, callback)
        assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    }

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.length, 1) // 종료되지 않음
})

test('leave_game_session: callback이 함수가 아니면 완전한 no-op이다(상태 불변, 새 방송 없음)', async () => {
    const { io } = await startRealTwoPlayerSession('leave-nocb-host', 'leave-nocb-joiner')
    const broadcastsBefore = io.broadcasts.length

    assert.doesNotThrow(() => handleLeaveGameSession(io, 'leave-nocb-host', { gameId: 'whatever' }, undefined))

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.length, 1)
    assert.equal(io.broadcasts.length, broadcastsBefore)
})

test('leave_game_session: 정상 이탈은 ack {ok:true}이고 game_ended가 정확히 한 번 {gameId, reason:"PLAYER_LEFT"}로 방송되며 참가자 전원의 channel과 registry가 정리된다', async () => {
    const { io, hostSocket, joinerSocket, gameId, channelId } = await startRealTwoPlayerSession('leave-ok-host', 'leave-ok-joiner')
    const { callback, getResponse } = countingCallback()

    handleLeaveGameSession(io, 'leave-ok-host', { gameId }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const ended = io.broadcasts.filter((b) => b.event === 'game_ended')
    assert.equal(ended.length, 1)
    assert.deepEqual(ended[0].payload, { gameId, reason: 'PLAYER_LEFT' })
    assert.equal(hostSocket.rooms.has(channelId), false)
    assert.equal(joinerSocket.rooms.has(channelId), false)

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([id]) => id === gameId), false)
    assert.equal(snapshot.playerSession.length, 0)
})

test('leave_game_session: 이미 종료된 세션에 대한 뒤늦은 이탈 요청은 멱등하게 {ok:true}이고 추가 game_ended 방송이 없다', async () => {
    const { io, gameId } = await startRealTwoPlayerSession('leave-idem-host', 'leave-idem-joiner')
    handleLeaveGameSession(io, 'leave-idem-host', { gameId }, countingCallback().callback)
    const before = io.broadcasts.filter((b) => b.event === 'game_ended').length

    const { callback, getResponse } = countingCallback()
    handleLeaveGameSession(io, 'leave-idem-host', { gameId }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const after = io.broadcasts.filter((b) => b.event === 'game_ended').length
    assert.equal(after, before)
})

test('leave_game_session: 명시적 이탈 성공 뒤 같은 Socket의 disconnect가 중첩되어도 game_ended는 정확히 한 번뿐이다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('leave-overlap-a-host', 'leave-overlap-a-joiner')

    handleLeaveGameSession(io, 'leave-overlap-a-host', { gameId }, countingCallback().callback)
    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'leave-overlap-a-host') // 뒤늦게 도착한 disconnect

    const ended = io.broadcasts.filter((b) => b.event === 'game_ended')
    assert.equal(ended.length, 1)
})

test('leave_game_session: disconnect가 먼저 처리된 뒤 도착한 명시적 이탈 요청도 game_ended는 정확히 한 번뿐이고 이탈 ack는 여전히 {ok:true}다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('leave-overlap-b-host', 'leave-overlap-b-joiner')

    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'leave-overlap-b-host')
    const { callback, getResponse } = countingCallback()
    handleLeaveGameSession(io, 'leave-overlap-b-host', { gameId }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const ended = io.broadcasts.filter((b) => b.event === 'game_ended')
    assert.equal(ended.length, 1)
})

test('leave_game_session(ABA, 동일 Socket): 세션 A를 종료한 뒤 같은 Socket으로 세션 B를 시작하면, 그 뒤의 disconnect는 정상적으로 B를 종료한다', async () => {
    const { io, hostSocket, gameId: gameIdA } = await startRealTwoPlayerSession('aba-same-host', 'aba-same-joinerA')
    handleLeaveGameSession(io, 'aba-same-host', { gameId: gameIdA }, countingCallback().callback)
    assert.equal(hostSocket.data.activeGameId, gameIdA) // 이탈 성공 후에도 결합은 지워지지 않고 A를 가리킨다

    // setupReadyRoomForStart는 io.sockets.sockets에 이미 등록된 `sock-${hostUuid}` 소켓을
    // 재사용하므로, 아래 두 번째 세션도 동일한 hostSocket 인스턴스로 시작된다.
    const readyRoomHandlers = { handleCreateRoom, handleJoinRoomByCode, handleSetReady }
    await setupReadyRoomForStart(io, 'aba-same-host', 'aba-same-joinerB', readyRoomHandlers)
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocket, 'aba-same-host', callback)
    const gameIdB = getResponse().gameId
    assert.notEqual(gameIdB, gameIdA)
    assert.equal(hostSocket.data.activeGameId, gameIdB) // 같은 Socket이 새 세션을 시작하면 결합이 B로 갱신된다

    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'aba-same-host')

    const endedB = io.broadcasts.filter((b) => b.event === 'game_ended' && b.payload.gameId === gameIdB)
    assert.equal(endedB.length, 1)
    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([id]) => id === gameIdB), false)
})

test('leave_game_session(ABA, 다른 Socket): 세션 A 종료 후 같은 uuid가 다른 Socket으로 세션 B를 시작하면, A의 지연 disconnect는 B의 registry·방송에 영향을 주지 않는다', async () => {
    const readyRoomHandlers = { handleCreateRoom, handleJoinRoomByCode, handleSetReady }
    const targetUuid = 'aba-cross-target'

    const { io, joinerSocket: staleSocket, gameId: gameIdA } = await startRealTwoPlayerSession('aba-cross-host-a', targetUuid)
    handleLeaveGameSession(io, targetUuid, { gameId: gameIdA }, countingCallback().callback)
    assert.equal(staleSocket.data.activeGameId, gameIdA)

    // 같은 uuid가 다른(새) Socket으로 새 Room에 참가해 세션 B를 시작한다. setupReadyRoomForStart는
    // joiner 소켓을 매번 새로 만들고 같은 키로 io.sockets.sockets에 등록하므로, 이전 staleSocket은
    // 더 이상 io에 등록돼 있지 않은 "낡은" 소켓이 된다(실제로는 재연결로 교체되는 상황과 동등).
    const hostSocketB = createFakeSocket('aba-cross-host-b')
    io.sockets.sockets.set(hostSocketB.id, hostSocketB)
    const { joinerSocket: freshSocket } = await setupReadyRoomForStart(io, 'aba-cross-host-b', targetUuid, readyRoomHandlers)
    assert.notEqual(freshSocket, staleSocket)
    const { callback, getResponse } = countingCallback()
    await handleStartGame(io, hostSocketB, 'aba-cross-host-b', callback)
    const gameIdB = getResponse().gameId
    assert.notEqual(gameIdB, gameIdA)

    // 낡은 Socket(staleSocket)의 지연 disconnect가 뒤늦게 도착한다.
    await gameSessionSocketLayer.onDisconnect(io, staleSocket, targetUuid)

    const endedB = io.broadcasts.filter((b) => b.event === 'game_ended' && b.payload.gameId === gameIdB)
    assert.equal(endedB.length, 0) // B는 건드려지지 않았다
    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([id]) => id === gameIdB), true) // B는 여전히 살아있다
})

test('leave_game_session: core가 예외를 던지면 ack는 INTERNAL_ERROR이고 원본 Error가 로그에 노출되지 않는다', (t) => {
    const errorSpy = t.mock.method(console, 'error', () => {})
    t.mock.method(gameSessionCore, 'endGameSessionForPlayer', () => {
        throw new Error('SECRET internal detail')
    })
    const io = createFakeIo([])
    const { callback, getResponse } = countingCallback()

    handleLeaveGameSession(io, 'leave-throw-uuid', { gameId: 'whatever' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(errorSpy.mock.calls.length, 1)
    const serialized = JSON.stringify(errorSpy.mock.calls[0].arguments)
    assert.equal(serialized.includes('SECRET'), false)
})

test('leave_game_session: callback이 throw해도 registry 정리·matchmaking 정리·game_ended 방송은 정상적으로 완료된다', async () => {
    const { io, gameId } = await startRealTwoPlayerSession('leave-cbthrow-host', 'leave-cbthrow-joiner')

    assert.doesNotThrow(() =>
        handleLeaveGameSession(io, 'leave-cbthrow-host', { gameId }, () => {
            throw new Error('콜백 실패(테스트 주입)')
        }),
    )

    const ended = io.broadcasts.filter((b) => b.event === 'game_ended')
    assert.equal(ended.length, 1)
    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([id]) => id === gameId), false)
})

test('leave_game_session: registerGameHandlers로 실제 배선하면 socket.trigger가 직접 호출과 동일한 결과를 낸다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('leave-wiring-host', 'leave-wiring-joiner')
    gameSessionSocketLayer.registerGameHandlers(io, hostSocket, 'leave-wiring-host')
    const { callback, getResponse } = countingCallback()

    hostSocket.trigger('leave_game_session', { gameId }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const ended = io.broadcasts.filter((b) => b.event === 'game_ended')
    assert.equal(ended.length, 1)
})

// ---------------------------------------------------------------------------
// leave_game_session — matchmaking Room 정리(cleanupRoomStateForSessionParticipants)
// ---------------------------------------------------------------------------

test('세션 종료 시 세션 진행 중 만든 Room B에 비참가자 Q가 참가해 있으면 Room B는 삭제되지 않고 host가 Q로 이전되며, 참가자 Socket은 Room B channel에서 실제로 leave된다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('cleanup-b-host', 'cleanup-b-joiner')

    // 활성 세션 참가자의 create_room은 계약대로 허용된다(게임 시작 시 원래 Room 매핑은 이미
    // 삭제됐으므로 host는 새 Room B를 자유롭게 만들 수 있다).
    const createdB = await callAsPromise(
        handleCreateRoom, io, hostSocket, 'cleanup-b-host', validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    )
    assert.equal(createdB.ok, true)

    const qSocket = createFakeSocket('cleanup-b-q')
    io.sockets.sockets.set(qSocket.id, qSocket)
    await handleJoinRoomByCode(io, qSocket, 'cleanup-b-q', createdB.room.roomCode)

    handleLeaveGameSession(io, 'cleanup-b-host', { gameId }, countingCallback().callback)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    const roomEntry = snapshot.gameRooms.find(([id]) => id === createdB.room.roomId)
    assert.ok(roomEntry, 'Room B가 통째로 삭제되면 안 된다(비참가자 Q가 있음)')
    const [, roomB] = roomEntry
    assert.equal(roomB.hostUuid, 'cleanup-b-q')
    assert.deepEqual(roomB.players.map(([uuid]) => uuid), ['cleanup-b-q'])

    const hostChanged = io.broadcasts.find((b) => b.event === 'host_changed' && b.roomId === createdB.room.roomId)
    assert.ok(hostChanged)
    assert.equal(hostChanged.payload.hostUuid, 'cleanup-b-q')

    assert.equal(hostSocket.rooms.has(createdB.room.roomId), false) // Map 정리만이 아니라 실제 channel leave까지 확인
    assert.equal(qSocket.rooms.has(createdB.room.roomId), true) // Q는 그대로 유지
})

test('세션 종료 시 한 참가자의 Socket leave 실패가 다른 참가자·registry 정리를 막지 않는다', async () => {
    const { io, hostSocket, joinerSocket, gameId } = await startRealTwoPlayerSession('cleanup-iso-host', 'cleanup-iso-joiner')

    const createdHostRoom = await callAsPromise(handleCreateRoom, io, hostSocket, 'cleanup-iso-host', validSettingsPayload())
    const createdJoinerRoom = await callAsPromise(handleCreateRoom, io, joinerSocket, 'cleanup-iso-joiner', validSettingsPayload())

    joinerSocket.leave = () => {
        throw new Error('leave 실패(테스트 주입)')
    }

    assert.doesNotThrow(() => handleLeaveGameSession(io, 'cleanup-iso-host', { gameId }, countingCallback().callback))

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.gameRooms.some(([id]) => id === createdHostRoom.room.roomId), false)
    assert.equal(snapshot.gameRooms.some(([id]) => id === createdJoinerRoom.room.roomId), false)
    assert.equal(snapshot.playerRoom.length, 0)

    const gameSnapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(gameSnapshot.gameSessions.length, 0) // leave 실패와 무관하게 registry 정리는 끝까지 완료됨
})

test('세션 종료 정리는 세션 진행 중 만든 Room/queue만 제거하고, 다른 활성 세션이나 종료 이후 새로 만든 Room에는 영향이 없다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('cleanup-scope-host', 'cleanup-scope-joiner')
    matchmaking.__seedMatchmakingQueueForTests('cleanup-scope-host', { uuid: 'cleanup-scope-host', nickname: 'x', socketId: hostSocket.id })

    // 완전히 무관한 다른 세션이 이미 진행 중이다 — 이번 종료 정리가 여기 영향을 주면 안 된다.
    const { gameId: otherGameId } = await startRealTwoPlayerSession('cleanup-scope-other-host', 'cleanup-scope-other-joiner')

    handleLeaveGameSession(io, 'cleanup-scope-host', { gameId }, countingCallback().callback)

    const snapshot = matchmaking.__getStateSnapshotForTests()
    assert.equal(snapshot.matchmakingQueue.some(([uuid]) => uuid === 'cleanup-scope-host'), false)

    const otherSnapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(otherSnapshot.gameSessions.some(([id]) => id === otherGameId), true)

    // 종료 이후에 새로 만든 Room은 이번 정리 대상이 아니다(애초에 존재하지 않았으므로).
    const afterRoom = await callAsPromise(handleCreateRoom, io, hostSocket, 'cleanup-scope-host', validSettingsPayload())
    assert.equal(afterRoom.ok, true)
    const afterSnapshot = matchmaking.__getStateSnapshotForTests()
    assert.ok(afterSnapshot.gameRooms.some(([id]) => id === afterRoom.room.roomId))
})

test('세션 종료 직후 참가자별로 새 방 생성과 새 방 코드 참가가 모두 즉시 가능하다', async () => {
    const { io, hostSocket, joinerSocket, gameId } = await startRealTwoPlayerSession('reentry-host', 'reentry-joiner')

    handleLeaveGameSession(io, 'reentry-host', { gameId }, countingCallback().callback)

    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'reentry-host', validSettingsPayload())
    assert.equal(created.ok, true)

    await handleJoinRoomByCode(io, joinerSocket, 'reentry-joiner', created.room.roomCode)
    assert.ok(joinerSocket.emitted.some((e) => e.event === 'room_joined'))
})

// ---------------------------------------------------------------------------
// resolve_night (handleResolveNight) — NIGHT 결과 적용 + DAY 전이
// ---------------------------------------------------------------------------

/** 3인(JOKER 1 + CITIZEN 2) NIGHT 세션을 커밋하고 fake socket/io를 채널에 join된 상태로 준비한다. */
function commitTrioSessionWithSocketsAtNight({ id = 'room-rn' } = {}) {
    const uuids = [`${id}-a`, `${id}-b`, `${id}-c`]
    const room = makeRoom({ id, players: uuids.map((u) => makePlayer(u)), jokerCount: 1 })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of uuids) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    const sockets = uuids.map((uuid) => {
        const s = createFakeSocket(uuid)
        s.rooms.add(session.channelId)
        return s
    })
    const io = createFakeIo(sockets)
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const citizenUuids = [...session.players.values()].filter((p) => p.role !== 'JOKER').map((p) => p.uuid)
    const socketByUuid = new Map(sockets.map((s) => [s.data.user.uuid, s]))
    return { session, io, sockets, uuids, jokerUuid, citizenUuids, socketByUuid }
}

test('resolve_night: 보호 안 된 유효 희생자 — night_result_applied가 참가자 전원(발신자 포함)에게 정확히 1건씩, payload가 buildNightResultAppliedPayload와 동일하다', () => {
    const { session, io, uuids, jokerUuid, citizenUuids, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-1' })
    const [victimUuid] = citizenUuids
    gameSessionCore.submitNightAction(jokerUuid, session.id, victimUuid)

    const { callback, getResponse } = countingCallback()
    handleResolveNight(io, socketByUuid.get(jokerUuid) ?? null, jokerUuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.players.get(victimUuid).alive, false)

    const expectedPayload = gameSessionCore.buildNightResultAppliedPayload(session, victimUuid)
    for (const uuid of uuids) {
        const socket = socketByUuid.get(uuid)
        const delivered = socket.emitted.filter((e) => e.event === 'night_result_applied')
        assert.equal(delivered.length, 1)
        assert.deepEqual(delivered[0].payload, expectedPayload)
        assert.equal(Object.hasOwn(delivered[0].payload, 'role'), false)
        assert.equal(Object.hasOwn(delivered[0].payload, 'team'), false)
    }
})

test('resolve_night: 무득표(전원 SKIP)면 victimUuid:null이고 전원 alive:true가 유지된다', () => {
    const { session, io, uuids, jokerUuid, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-2' })
    gameSessionCore.submitNightAction(jokerUuid, session.id, null)

    const { callback, getResponse } = countingCallback()
    handleResolveNight(io, null, uuids[0], { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    for (const uuid of uuids) assert.equal(session.players.get(uuid).alive, true)
    const delivered = socketByUuid.get(uuids[1]).emitted.find((e) => e.event === 'night_result_applied')
    assert.deepEqual(delivered.payload.victimUuid, null)
})

test('resolve_night: 중복 호출 — 두 번째 호출은 NIGHT_ALREADY_RESOLVED이고 phase/dayIndex 변경과 night_result_applied 방송은 전체 과정에서 정확히 1회다', () => {
    const { session, io, uuids, jokerUuid, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-3' })
    gameSessionCore.submitNightAction(jokerUuid, session.id, null)

    handleResolveNight(io, null, uuids[0], { gameId: session.id }, countingCallback().callback)
    const second = countingCallback()
    handleResolveNight(io, null, uuids[1], { gameId: session.id }, second.callback)

    assert.deepEqual(second.getResponse(), { ok: false, code: 'NIGHT_ALREADY_RESOLVED', message: '요청을 처리할 수 없습니다.' })
    assert.equal(session.dayIndex, 1)
    const totalDelivered = uuids.reduce(
        (sum, uuid) => sum + socketByUuid.get(uuid).emitted.filter((e) => e.event === 'night_result_applied').length,
        0,
    )
    assert.equal(totalDelivered, 3)
})

test('resolve_night: 오염된 resolution(세션 밖 uuid를 가리키는 pendingEliminationTargetId)은 INTERNAL_ERROR ack이고, night_result_applied가 없으며, 상태가 호출 전과 동일하다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-4' })
    const deps = {
        prepare: () => ({
            ok: true,
            session,
            resolution: { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: 'not-a-participant', privateResults: new Map(), resolved: true },
        }),
    }

    const { callback, getResponse } = countingCallback()
    handleResolveNight(io, null, uuids[0], { gameId: session.id }, callback, deps)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(session.nightResolution, null)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 0)
    const totalDelivered = uuids.reduce(
        (sum, uuid) => sum + socketByUuid.get(uuid).emitted.filter((e) => e.event === 'night_result_applied').length,
        0,
    )
    assert.equal(totalDelivered, 0)
})

test('resolve_night: 로그 비밀성 — commit 실패 로그가 정확히 {code:"COMMIT_ERROR", uuid, gameId} 3키뿐이다', (t) => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-5' })
    const errorSpy = t.mock.method(console, 'error', () => {})
    const deps = {
        prepare: () => ({
            ok: true,
            session,
            resolution: { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: 'not-a-participant', privateResults: new Map(), resolved: true },
        }),
    }

    handleResolveNight(io, null, uuids[0], { gameId: session.id }, countingCallback().callback, deps)

    const call = errorSpy.mock.calls.find(
        (entry) => entry.arguments[0] === '[밤 행동 판정 오류]',
    )
    assert.ok(call)
    assert.deepEqual(Object.keys(call.arguments[1]).sort(), ['code', 'gameId', 'uuid'])
    assert.equal(call.arguments[1].code, 'COMMIT_ERROR')
})

test('resolve_night: 한 recipient의 night_result_applied emit이 throw해도 나머지 recipient는 정상 수신하고 커밋된 상태는 롤백되지 않는다', () => {
    const { session, io, uuids, jokerUuid, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-6' })
    gameSessionCore.submitNightAction(jokerUuid, session.id, null)
    const throwingSocket = socketByUuid.get(uuids[0])
    const originalEmit = throwingSocket.emit.bind(throwingSocket)
    throwingSocket.emit = (event, ...args) => {
        if (event === 'night_result_applied') throw new Error('전달 실패(테스트 주입)')
        return originalEmit(event, ...args)
    }

    assert.doesNotThrow(() => handleResolveNight(io, null, uuids[0], { gameId: session.id }, countingCallback().callback))

    assert.equal(session.phase, 'DAY')
    const otherDelivered = socketByUuid.get(uuids[1]).emitted.filter((e) => e.event === 'night_result_applied')
    assert.equal(otherDelivered.length, 1)
})

// ---------------------------------------------------------------------------
// cast_day_vote (handleSubmitDayVote) — DAY 투표/기권 제출
// ---------------------------------------------------------------------------

/** 3인 NIGHT 세션을 무득표로 판정해 DAY(dayIndex 1, 전원 alive)까지 전이하고, fake socket/io를 재사용한다. */
function commitTrioSessionWithSocketsAtDay({ id = 'room-dv' } = {}) {
    const { session, io, sockets, uuids, jokerUuid, citizenUuids, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id })
    gameSessionCore.submitNightAction(jokerUuid, session.id, null)
    handleResolveNight(io, null, jokerUuid, { gameId: session.id }, countingCallback().callback)
    return { session, io, sockets, uuids, socketByUuid }
}

test('cast_day_vote: 정상 대상 투표는 ack {ok:true}이고 dayVotes에 저장되며 브로드캐스트가 없다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-1' })
    const [actor, target] = uuids
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: target }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.dayVotes.get(actor), target)
    assert.equal(io.broadcasts.length, 0)
})

test('cast_day_vote: 기권(targetId:null) 제출은 ack {ok:true}이고 dayVotes에 null로 저장된다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-2' })
    const [actor] = uuids
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: null }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.dayVotes.get(actor), null)
    assert.equal(session.dayVotes.has(actor), true)
})

test('cast_day_vote: payload의 위조 uuid/alive/role/phase는 전부 무시되고 인증된 uuid·registry 기준으로만 처리된다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-3' })
    const [actor, target] = uuids
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(
        io, null, actor,
        { gameId: session.id, targetId: target, uuid: 'forged-uuid', alive: false, role: 'JOKER', phase: 'NIGHT' },
        callback,
    )

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.dayVotes.get(actor), target)
    assert.equal(session.dayVotes.has('forged-uuid'), false)
})

test('cast_day_vote: callback이 함수가 아니면 완전한 no-op이다(예외 없고 dayVotes 불변)', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-4' })
    const [actor, target] = uuids

    assert.doesNotThrow(() => handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: target }, undefined))
    assert.equal(session.dayVotes.size, 0)
})

test('cast_day_vote: callback이 throw해도 예외가 새지 않고 이미 반영된 dayVotes는 유지된다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-5' })
    const [actor, target] = uuids

    assert.doesNotThrow(() =>
        handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: target }, throwingCallback('콜백 실패(테스트 주입)')),
    )

    assert.equal(session.dayVotes.get(actor), target)
})

test('cast_day_vote: payload가 객체가 아니거나 배열이면 INVALID_PAYLOAD이고 dayVotes는 불변이다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-6' })
    const [actor] = uuids

    for (const badPayload of [null, 'x', 42, []]) {
        const { callback, getResponse } = countingCallback()
        handleSubmitDayVote(io, null, actor, badPayload, callback)
        assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    }
    assert.equal(session.dayVotes.size, 0)
})

test('cast_day_vote: gameId가 비문자열이거나 targetId가 null/문자열이 아니면 INVALID_PAYLOAD다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-7' })
    const [actor, target] = uuids

    const badGameId = countingCallback()
    handleSubmitDayVote(io, null, actor, { gameId: 123, targetId: target }, badGameId.callback)
    assert.deepEqual(badGameId.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    const badTarget = countingCallback()
    handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: 42 }, badTarget.callback)
    assert.deepEqual(badTarget.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    assert.equal(session.dayVotes.size, 0)
})

test('cast_day_vote: core가 SESSION_NOT_FOUND를 반환하는 registry 불일치는 INTERNAL_ERROR로 정규화된다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-8' })
    const [actor, target] = uuids
    gameSessionCore.__testables.__deleteGameSessionOnlyForTests(session.id)
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: target }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
})

test('cast_day_vote: core가 throw하면 INTERNAL_ERROR로 정규화되고 원본 Error가 로그에 노출되지 않는다', (t) => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-9' })
    const [actor, target] = uuids
    const errorSpy = t.mock.method(console, 'error', () => {})
    t.mock.method(gameSessionCore, 'submitDayVote', () => {
        throw new Error('SECRET internal detail')
    })
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: target }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    const serialized = JSON.stringify(errorSpy.mock.calls.map((c) => c.arguments))
    assert.equal(serialized.includes('SECRET'), false)
})

test('cast_day_vote: 성공/실패 어느 경로에서도 io.broadcasts는 비어있다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-10' })
    const [actor, target] = uuids

    handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: target }, countingCallback().callback)
    handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: actor }, countingCallback().callback) // 실패(SELF_TARGET_NOT_ALLOWED)

    assert.equal(io.broadcasts.length, 0)
})

test('cast_day_vote: stale gameId 요청은 실패 code 그대로 ack되고 dayVotes는 불변이다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-11' })
    const [actor, target] = uuids
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, null, actor, { gameId: 'not-the-real-game-id', targetId: target }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'STALE_SESSION_MISMATCH', message: '요청을 처리할 수 없습니다.' })
    assert.equal(session.dayVotes.size, 0)
})

test('cast_day_vote: 교차 세션 요청(다른 GameSession의 gameId)은 거부되고 두 세션의 dayVotes 모두 불변이다', () => {
    const dayA = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-cross-a' })
    const dayB = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-cross-b' })
    const [actorA] = dayA.uuids
    const [, targetB] = dayB.uuids
    const { callback, getResponse } = countingCallback()

    // actorA(세션 A 소속)가 세션 B의 gameId로 요청 — playerSession상 actorA의 활성 세션은 A이므로
    // STALE_SESSION_MISMATCH로 거부된다.
    handleSubmitDayVote(dayA.io, null, actorA, { gameId: dayB.session.id, targetId: targetB }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'STALE_SESSION_MISMATCH', message: '요청을 처리할 수 없습니다.' })
    assert.equal(dayB.session.dayVotes.size, 0)
    assert.equal(dayA.session.dayVotes.size, 0)
})

test('cast_day_vote: 같은 uuid가 두 번 제출하면 dayVotes에는 마지막 값만 저장된다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-12' })
    const [actor, targetB, targetC] = uuids

    handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: targetB }, countingCallback().callback)
    handleSubmitDayVote(io, null, actor, { gameId: session.id, targetId: targetC }, countingCallback().callback)

    assert.equal(session.dayVotes.get(actor), targetC)
    assert.equal(session.dayVotes.size, 1)
})

test('cast_day_vote: registerGameHandlers로 실제 배선하면 socket.trigger가 직접 호출과 동일한 결과를 낸다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-13' })
    const [actor, target] = uuids
    const socket = socketByUuid.get(actor)
    gameSessionSocketLayer.registerGameHandlers(io, socket, actor)
    const { callback, getResponse } = countingCallback()

    socket.trigger('cast_day_vote', { gameId: session.id, targetId: target }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.dayVotes.get(actor), target)
})

// ---------------------------------------------------------------------------
// resolve_day_vote (handleResolveDayVote) — DAY 투표 판정
// ---------------------------------------------------------------------------

test('resolve_day_vote: TRIBUNAL 판정 ack가 정확히 {ok:true, gameId, dayIndex, outcome:"TRIBUNAL", tribunalTargetUuid}이고 phase가 TRIBUNAL로 전이된다', () => {
    const { session, io, uuids } = commitTrioSessionWithSocketsAtDay({ id: 'room-rdv-1' })
    const [a, b, c] = uuids
    handleSubmitDayVote(io, null, a, { gameId: session.id, targetId: c }, countingCallback().callback)
    handleSubmitDayVote(io, null, b, { gameId: session.id, targetId: c }, countingCallback().callback)
    handleSubmitDayVote(io, null, c, { gameId: session.id, targetId: null }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()

    handleResolveDayVote(io, null, a, { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'TRIBUNAL',
        tribunalTargetUuid: c,
    })
    assert.equal(session.phase, 'TRIBUNAL')
})

test('resolve_day_vote: TIE 판정 ack의 outcome은 "TIE"이고 phase는 DAY로 유지되며, day_vote_resolved 방송 payload.phase도 DAY다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-rdv-2' })
    const [a, b, c] = uuids
    handleSubmitDayVote(io, null, a, { gameId: session.id, targetId: b }, countingCallback().callback)
    handleSubmitDayVote(io, null, b, { gameId: session.id, targetId: c }, countingCallback().callback)
    handleSubmitDayVote(io, null, c, { gameId: session.id, targetId: a }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()

    handleResolveDayVote(io, null, a, { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'TIE',
        tribunalTargetUuid: null,
    })
    assert.equal(session.phase, 'DAY')

    const broadcast = socketByUuid.get(a).emitted.find((e) => e.event === 'day_vote_resolved')
    assert.equal(broadcast.payload.phase, 'DAY')
    assert.equal(broadcast.payload.outcome, 'TIE')
})

test('resolve_day_vote: 이미 판정된 dayIndex 재요청은 멱등하게 동일한 결과 필드를 반환하고 재방송하지 않는다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-rdv-3' })
    const [a, b, c] = uuids
    for (const uuid of uuids) {
        handleSubmitDayVote(io, null, uuid, { gameId: session.id, targetId: null }, countingCallback().callback)
    }

    handleResolveDayVote(io, null, a, { gameId: session.id, dayIndex: session.dayIndex }, countingCallback().callback)
    const countBroadcasts = () =>
        [a, b, c]
            .map((uuid) => socketByUuid.get(uuid).emitted.filter((e) => e.event === 'day_vote_resolved').length)
            .reduce((sum, n) => sum + n, 0)
    const countAfterFirst = countBroadcasts()

    const { callback, getResponse } = countingCallback()
    handleResolveDayVote(io, null, b, { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'ABSTAINED',
        tribunalTargetUuid: null,
    })
    assert.equal(countBroadcasts(), countAfterFirst)
})

test('resolve_day_vote: registerGameHandlers로 실제 배선하면 socket.trigger가 직접 호출과 동일한 결과를 낸다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-rdv-4' })
    const [a] = uuids
    for (const uuid of uuids) {
        handleSubmitDayVote(io, null, uuid, { gameId: session.id, targetId: null }, countingCallback().callback)
    }
    const socket = socketByUuid.get(a)
    gameSessionSocketLayer.registerGameHandlers(io, socket, a)
    const { callback, getResponse } = countingCallback()

    socket.trigger('resolve_day_vote', { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'ABSTAINED',
        tribunalTargetUuid: null,
    })
})

// ---------------------------------------------------------------------------
// resolve_tribunal_vote (handleResolveTribunalVote) — tribunal_resolved 판정
// ---------------------------------------------------------------------------

test('handleResolveTribunalVote: 성공 시 commit 이후 canonical에서 빌드한 payload로 ACK와 broadcast 1회(tribunal_resolved 계약)', () => {
    const { session, socketA, socketB, socketC } = commitTribunalReadySession({ roomId: 'room-rtv-1', uuidA: 'r1', uuidB: 'r2', uuidC: 'r3', defendantUuid: 'r3' })
    const io = createFakeIo([socketA, socketB, socketC])
    handleCastTribunalVote(io, null, 'r1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, null, 'r2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()

    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, null, 'r1', { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), { ok: true, gameId: session.id, dayIndex: session.dayIndex, outcome: 'GUILTY', counts: { guilty: 2, notGuilty: 0 }, executedUuid: 'r3' })
    assert.equal(session.players.get('r3').alive, false)
    for (const s of [socketA, socketB, socketC]) {
        const delivered = s.emitted.filter((e) => e.event === 'tribunal_vote_resolved')
        assert.equal(delivered.length, 1)
        assert.deepEqual(Object.keys(delivered[0].payload).sort(), ['counts', 'dayIndex', 'defendantUuid', 'executedUuid', 'gameId', 'outcome', 'phase'])
    }
})

test('handleResolveTribunalVote: commit 실패 시 실패 ACK, broadcast 0회, payload 빌드 0회', () => {
    const { session, socketA, socketB, socketC } = commitTribunalReadySession({ roomId: 'room-rtv-2', uuidA: 's1', uuidB: 's2', uuidC: 's3', defendantUuid: 's3' })
    const io = createFakeIo([socketA, socketB, socketC])
    handleCastTribunalVote(io, null, 's1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, null, 's2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    let buildCalls = 0
    const deps = {
        commit: () => ({ ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' }),
    }
    const originalBuild = gameSessionCore.buildTribunalVoteResolvedPayload
    gameSessionCore.buildTribunalVoteResolvedPayload = (...args) => {
        buildCalls += 1
        return originalBuild(...args)
    }
    const { callback, getResponse } = countingCallback()

    try {
        gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, null, 's1', { gameId: session.id, dayIndex: session.dayIndex }, callback, deps)
    } finally {
        gameSessionCore.buildTribunalVoteResolvedPayload = originalBuild
    }

    assert.deepEqual(getResponse(), { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH', message: '요청을 처리할 수 없습니다.' })
    assert.equal(buildCalls, 0)
    for (const s of [socketA, socketB, socketC]) {
        assert.equal(s.emitted.filter((e) => e.event === 'tribunal_vote_resolved').length, 0)
    }
})

test('resolve_tribunal_vote: 권한 없는 요청 거부(NOT_A_PARTICIPANT → INTERNAL_ERROR)', () => {
    const { session, socketA, socketB, socketC } = commitTribunalReadySession({ roomId: 'room-rtv-3', uuidA: 't1', uuidB: 't2', uuidC: 't3', defendantUuid: 't3' })
    const io = createFakeIo([socketA, socketB, socketC])
    session.players.delete('t1')
    const { callback, getResponse } = countingCallback()

    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, null, 't1', { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
})

test('resolve_tribunal_vote: callback 없는 요청은 mutation 없음', () => {
    const { session, socketA, socketB, socketC } = commitTribunalReadySession({ roomId: 'room-rtv-4', uuidA: 'u1', uuidB: 'u2', uuidC: 'u3', defendantUuid: 'u3' })
    const io = createFakeIo([socketA, socketB, socketC])
    handleCastTribunalVote(io, null, 'u1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, null, 'u2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)

    assert.doesNotThrow(() =>
        gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, null, 'u1', { gameId: session.id, dayIndex: session.dayIndex }, undefined),
    )

    assert.equal(session.players.get('u3').alive, true)
})

test('resolve_tribunal_vote: ACK와 broadcast에 raw ballot·private role 없음(public snapshot만 노출)', () => {
    const { session, socketA, socketB, socketC } = commitTribunalReadySession({ roomId: 'room-rtv-5', uuidA: 'v1', uuidB: 'v2', uuidC: 'v3', defendantUuid: 'v3' })
    const io = createFakeIo([socketA, socketB, socketC])
    handleCastTribunalVote(io, null, 'v1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, null, 'v2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()

    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, null, 'v1', { gameId: session.id, dayIndex: session.dayIndex }, callback)

    const ackSerialized = JSON.stringify(getResponse())
    assert.equal(ackSerialized.includes('ballotSnapshot'), false)
    assert.equal(ackSerialized.includes('voterUuid'), false)
    assert.equal(ackSerialized.includes('role'), false)
    const broadcast = socketA.emitted.find((e) => e.event === 'tribunal_vote_resolved')
    const broadcastSerialized = JSON.stringify(broadcast.payload)
    assert.equal(broadcastSerialized.includes('ballotSnapshot'), false)
    assert.equal(broadcastSerialized.includes('voterUuid'), false)
})

test('resolve_tribunal_vote: 중복 resolve 시 broadcast 증가분 0', () => {
    const { session, socketA, socketB, socketC } = commitTribunalReadySession({ roomId: 'room-rtv-6', uuidA: 'w1', uuidB: 'w2', uuidC: 'w3', defendantUuid: 'w3' })
    const io = createFakeIo([socketA, socketB, socketC])
    handleCastTribunalVote(io, null, 'w1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, null, 'w2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, null, 'w1', { gameId: session.id, dayIndex: session.dayIndex }, countingCallback().callback)
    const countBefore = socketA.emitted.filter((e) => e.event === 'tribunal_vote_resolved').length

    const { callback, getResponse } = countingCallback()
    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, null, 'w2', { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'TRIBUNAL_ALREADY_RESOLVED', message: '요청을 처리할 수 없습니다.' })
    const countAfter = socketA.emitted.filter((e) => e.event === 'tribunal_vote_resolved').length
    assert.equal(countAfter, countBefore)
})
