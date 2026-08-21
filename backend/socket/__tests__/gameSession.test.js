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
    handleGetSessionSnapshot,
    handleSubmitGameChatMessage,
    resolveJokerTeammateSockets,
    resolveChatRecipientSockets,
} = gameSessionSocketLayer.__testables

/**
 * 이 파일의 압도적 다수 기존 테스트는 재접속 권한 자체를 검증 대상으로 삼지 않고, 오직
 * createFakeSocket(uuid)의 기본 규약(socket.id === `sock-${uuid}`)만 따르는 단일 소켓으로
 * 핸들러를 직접 호출한다. 그런 테스트마다 일일이 registry에 { uuid → socketId }를 채워주는
 * 대신, 그 규약을 그대로 따르는 "기본값 있는 Map"을 매 테스트마다 새로 설치한다 — 진짜
 * Map을 감싼 Proxy이므로 isCurrentSocketForUuid의 `registry instanceof Map` 검사를 그대로
 * 통과하고, 명시적으로 .set()한 uuid는 override를, 그 외 uuid는 `sock-${uuid}` 기본값을
 * 반환한다. 재접속 권한 자체(교체/거부/멱등 rebind)를 검증하는 테스트는 이 기본값에 기대지
 * 않고 실제 Map을 직접 만들어 setOnlineUsersRegistry로 명시적으로 주입한다.
 */
function createConventionFollowingRegistry() {
    const overrides = new Map()
    return new Proxy(overrides, {
        get(target, prop, receiver) {
            if (prop === 'get') {
                return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
            }
            return Reflect.get(target, prop, receiver)
        },
    })
}

// 이 파일은 game-core/gameSession.js(고유 registry)와 matchmaking.js(고유 registry),
// socket/gameSession.js(고유 onlineUsersRegistry)까지 셋 다 실제로 구동하므로, 세 모듈의
// registry를 각각 초기화해야 테스트 간 상태 누수가 없다(matchmaking.test.js의 기존 관례와 동일).
test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
})
// registry 불일치를 의도적으로 재현하는 테스트(SESSION_NOT_FOUND/NOT_A_PARTICIPANT 케이스)가
// 이 파일의 마지막 테스트로 실행되더라도 손상된 singleton 상태가 남지 않게 afterEach에서도
// 정리한다. 테스트 본문이 예외를 던져도 node:test는 afterEach를 실행하므로 이 정리는
// 실패한 테스트 뒤에도 보장된다.
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
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
// acknowledge_role_reveal (handleAcknowledgeRoleReveal) — ROLE_REVEAL → DAY 1 전이
// (게임의 첫 진행 단계는 밤이 아니라 낮이다 — 마지막 유효 확인 하나가 초기 DAY로 전이시킨다)
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
    const { session, sockets, io } = commitSessionWithPlayers(['p1', 'p2'])
    const { callback, getResponse } = countingCallback()

    handleAcknowledgeRoleReveal(io, sockets[0], 'p1', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(io.broadcasts.some((b) => b.event === 'game_phase_changed'), false)
})

test('acknowledge_role_reveal: 나머지 1명도 확인하면 콜백은 ok:true이고 game_phase_changed가 정확히 1건, payload가 정확히 {gameId, phase:"DAY", dayIndex:1}이다', () => {
    const { session, sockets, io } = commitSessionWithPlayers(['q1', 'q2'])

    handleAcknowledgeRoleReveal(io, sockets[0], 'q1', { gameId: session.id }, countingCallback().callback)
    // 첫 확인만으로는 아직 전이하지 않는다 — 마지막 유효 확인 하나만이 초기 DAY를 연다.
    assert.equal(io.broadcasts.filter((b) => b.event === 'game_phase_changed').length, 0)
    assert.equal(session.phase, 'ROLE_REVEAL')
    assert.equal(session.dayIndex, 0)

    const { callback, getResponse } = countingCallback()
    handleAcknowledgeRoleReveal(io, sockets[1], 'q2', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const broadcasts = io.broadcasts.filter((b) => b.event === 'game_phase_changed')
    assert.equal(broadcasts.length, 1)
    assert.equal(broadcasts[0].roomId, session.channelId)
    assert.deepEqual(broadcasts[0].payload, { gameId: session.id, phase: 'DAY', dayIndex: 1 })
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)

    // 전이 이후의 재확인은 INVALID_PHASE로 막히고 DAY를 다시 초기화하지도, 재방송하지도 않는다.
    const late = countingCallback()
    handleAcknowledgeRoleReveal(io, sockets[0], 'q1', { gameId: session.id }, late.callback)
    assert.deepEqual(late.getResponse(), { ok: false, code: 'INVALID_PHASE', message: '요청을 처리할 수 없습니다.' })
    assert.equal(io.broadcasts.filter((b) => b.event === 'game_phase_changed').length, 1)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
})

test('acknowledge_role_reveal: 3인 세션에서 전원 확인해도 game_phase_changed는 전체 과정에서 정확히 1건만 발생한다', () => {
    const { session, sockets, io } = commitSessionWithPlayers(['r1', 'r2', 'r3'])

    handleAcknowledgeRoleReveal(io, sockets[0], 'r1', { gameId: session.id }, countingCallback().callback)
    handleAcknowledgeRoleReveal(io, sockets[1], 'r2', { gameId: session.id }, countingCallback().callback)
    handleAcknowledgeRoleReveal(io, sockets[2], 'r3', { gameId: session.id }, countingCallback().callback)

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

    handleAcknowledgeRoleReveal(io, createFakeSocket('not-a-participant'), 'not-a-participant', { gameId: 'whatever' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'NOT_IN_SESSION', message: '요청을 처리할 수 없습니다.' })
})

test('acknowledge_role_reveal: gameId 누락/타입 오류 payload는 {ok:false, code:"INVALID_PAYLOAD"}이다', () => {
    const { session, sockets, io } = commitSessionWithPlayers(['u1', 'u2'])

    const missing = countingCallback()
    handleAcknowledgeRoleReveal(io, sockets[0], 'u1', {}, missing.callback)
    assert.deepEqual(missing.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    const wrongType = countingCallback()
    handleAcknowledgeRoleReveal(io, sockets[0], 'u1', { gameId: 123 }, wrongType.callback)
    assert.deepEqual(wrongType.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    assert.equal(session.roleRevealAcks.size, 0)
})

test('acknowledge_role_reveal: onDisconnect로 세션이 먼저 종료된 뒤 도착한 늦은 확인은 NOT_IN_SESSION이고 방송이 없다', async () => {
    const { session, sockets, io } = commitSessionWithPlayers(['v1', 'v2'])
    await gameSessionSocketLayer.onDisconnect(io, sockets[0], 'v1') // 세션 전체 종료(정책 확정)

    const { callback, getResponse } = countingCallback()
    handleAcknowledgeRoleReveal(io, sockets[1], 'v2', { gameId: session.id }, callback)

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
    const { session, socketA, io } = commitTribunalReadySession()
    const { callback, getResponse } = countingCallback()

    handleCastTribunalVote(io, socketA, 'w1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, callback)

    assert.deepEqual(getResponse(), { ok: true, gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' })
    assert.deepEqual(Object.keys(getResponse()).sort(), ['dayIndex', 'gameId', 'ok', 'vote'])
    assert.equal(io.broadcasts.length, 0)
    assert.equal(session.tribunal.votes.get('w1'), 'GUILTY')
})

test('cast_tribunal_vote: payload 형태 오류(gameId/dayIndex 누락·타입 오류)는 INVALID_PAYLOAD이다', () => {
    const { session, socketA, io } = commitTribunalReadySession()

    const missing = countingCallback()
    handleCastTribunalVote(io, socketA, 'w1', {}, missing.callback)
    assert.deepEqual(missing.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    const badDayIndex = countingCallback()
    handleCastTribunalVote(io, socketA, 'w1', { gameId: session.id, dayIndex: '0', vote: 'GUILTY' }, badDayIndex.callback)
    assert.deepEqual(badDayIndex.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    assert.equal(session.tribunal.votes.size, 0)
})

test('cast_tribunal_vote: 클라이언트 입력만으로 도달 가능한 공개 코드(INVALID_TRIBUNAL_VOTE)는 그대로 전달된다', () => {
    const { session, socketA, io } = commitTribunalReadySession()
    const { callback, getResponse } = countingCallback()

    handleCastTribunalVote(io, socketA, 'w1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'APPROVE' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_TRIBUNAL_VOTE', message: '요청을 처리할 수 없습니다.' })
})

test('cast_tribunal_vote: internal-only 코드는 INTERNAL_ERROR로 정규화되고, 로그는 정확히 {gameId, dayIndex, requesterUuid, internalCode} 4필드만 담는다', () => {
    const { session, socketA, io } = commitTribunalReadySession()
    session.tribunal = null // TRIBUNAL_STATE_NOT_FOUND 유도

    const originalError = console.error
    const calls = []
    console.error = (...args) => calls.push(args)
    let response
    try {
        const { callback, getResponse } = countingCallback()
        handleCastTribunalVote(io, socketA, 'w1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, callback)
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
    const { session, sockets, io } = commitSessionWithPlayers(['w1', 'w2'])
    const throwingCallback = () => {
        throw new Error('콜백 실패(테스트 주입)')
    }

    handleAcknowledgeRoleReveal(io, sockets[0], 'w1', { gameId: session.id }, countingCallback().callback)
    assert.doesNotThrow(() => handleAcknowledgeRoleReveal(io, sockets[1], 'w2', { gameId: session.id }, throwingCallback))

    const broadcasts = io.broadcasts.filter((b) => b.event === 'game_phase_changed')
    assert.equal(broadcasts.length, 1)
})

test('acknowledge_role_reveal: N인 세션에서 N번 확인하면 콜백은 N회, game_phase_changed 방송은 정확히 1회다', () => {
    const uuids = ['x1', 'x2', 'x3', 'x4']
    const { session, sockets, io } = commitSessionWithPlayers(uuids)
    let callbackCalls = 0

    uuids.forEach((uuid, index) => {
        handleAcknowledgeRoleReveal(io, sockets[index], uuid, { gameId: session.id }, () => {
            callbackCalls += 1
        })
    })

    assert.equal(callbackCalls, uuids.length)
    assert.equal(io.broadcasts.filter((b) => b.event === 'game_phase_changed').length, 1)
})

test('acknowledge_role_reveal: core가 SESSION_NOT_FOUND를 반환하는 registry 불일치는 소켓 응답에서 INTERNAL_ERROR로 정규화된다', () => {
    const { session, sockets, io } = commitSessionWithPlayers(['y1', 'y2'])
    gameSessionCore.__testables.__deleteGameSessionOnlyForTests(session.id)

    const { callback, getResponse } = countingCallback()
    handleAcknowledgeRoleReveal(io, sockets[0], 'y1', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
})

test('acknowledge_role_reveal: core가 NOT_A_PARTICIPANT를 반환하는 registry 불일치는 소켓 응답에서 INTERNAL_ERROR로 정규화된다', () => {
    const { session, sockets, io } = commitSessionWithPlayers(['z1', 'z2'])
    session.players.delete('z1')

    const { callback, getResponse } = countingCallback()
    handleAcknowledgeRoleReveal(io, sockets[0], 'z1', { gameId: session.id }, callback)

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

/**
 * 테스트 전용 NIGHT 픽스처: 참가자 전원의 canonical 역할 확인으로 초기 DAY(dayIndex 1)까지
 * 전이시킨 뒤, NIGHT 규칙을 격리해 검증하기 위해 세션을 "그 밤"(기본값은 첫 밤 — NIGHT,
 * dayIndex 0) 상태로 직접 되돌린다. game-core/__tests__/gameSession.test.js의 동명 헬퍼와
 * 계약이 같다(공유 테스트 헬퍼 파일을 새로 추가할 수 없는 이번 슬라이스의 허용 파일 목록
 * 제약상 이 파일에도 동일하게 둔다 — assertNoForbiddenPrivateData 등과 같은 이유다).
 *
 * ROLE_REVEAL → 전원 확인 → 초기 DAY 전이 자체는 위 acknowledge_role_reveal 절이 별도로
 * 검증한다 — 이 헬퍼는 밤 행동 제출·밤 판정·JOKER 비밀 채팅·NIGHT 스냅샷처럼 NIGHT 위에서만
 * 성립하는 규칙들을 dayIndex 경계(0 = 마녀사냥꾼 비활성)까지 포함해 재현하기 위한 픽스처
 * 조립이며, production 진입 순서를 흉내내지 않는다.
 *
 * 되돌릴 때는 phase/dayIndex만이 아니라 밤 제출·판정 상태(nightActions/nightResolution)와 지난
 * 낮/재판 기록(dayVotes/dayVoteResolution/tribunal)까지 전부 신선한 값으로 함께 맞춘다 —
 * production이 매 NIGHT 진입에서 보장하는 상태와 같은 모양이어야, 이 픽스처 위의 테스트가 초기
 * DAY가 남긴 잔여 상태에 의존하거나 그것 때문에 조용히 어긋나지 않는다.
 */
function ackAllAndRewindToFirstNight(session, { dayIndex = 0 } = {}) {
    for (const uuid of session.players.keys()) {
        gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    }
    session.phase = 'NIGHT'
    session.dayIndex = dayIndex
    session.nightActions = new Map()
    session.nightResolution = null
    session.dayVotes = new Map()
    session.dayVoteResolution = null
    session.tribunal = null
}

/** game-core를 직접 구동해 playerCount=10·jokerCount=1 세션을 커밋하고 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다. 5개 역할 전부가 정확히 1명씩(CITIZEN은 6명) 배정된다. */
function commitFullRoleSessionAtNight({ id = 'room-full', gameIdFn } = {}) {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`fp-${id}-${i}`))
    const room = makeRoom({ id, players, jokerCount: 1 })
    const opts = { randomFn: () => 0.999, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, opts)
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
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

/** playerCount=3·jokerCount=2 세션을 커밋하고 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다 — JOKER 2명 + CITIZEN 1명. */
function commitJokerTrioSessionAtNight({ id = 'room-joker', gameIdFn } = {}) {
    const players = [makePlayer(`ja-${id}`), makePlayer(`jb-${id}`), makePlayer(`jc-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 2 })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, opts)
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
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
        handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, badPayload, callback)
        assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    }
    assert.equal(session.nightActions.size, 0)
})

test('submit_night_action: gameId가 비문자열이면 INVALID_PAYLOAD이고 Map은 불변이다', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight()
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, { gameId: 123, targetId: citizenUuid }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    assert.equal(session.nightActions.size, 0)
})

test('submit_night_action: targetId가 null도 문자열도 아니면 INVALID_PAYLOAD이고 Map은 불변이다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, { gameId: session.id, targetId: 42 }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    assert.equal(session.nightActions.size, 0)
})

test('submit_night_action: targetId 키 자체가 없어도(undefined) INVALID_PAYLOAD다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
})

test('submit_night_action: callback이 함수가 아니면 완전한 no-op이다(예외도 없고 Map도 불변)', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight()

    assert.doesNotThrow(() => handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, { gameId: session.id, targetId: citizenUuid }, undefined))
    assert.equal(session.nightActions.size, 0)
})

test('submit_night_action: core가 SESSION_NOT_FOUND를 반환하는 registry 불일치는 INTERNAL_ERROR로 정규화된다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    gameSessionCore.__testables.__deleteGameSessionOnlyForTests(session.id)
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, { gameId: session.id, targetId: null }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
})

test('submit_night_action: 성공/실패 어느 경로에서도 브로드캐스트가 발생하지 않는다', () => {
    const { session, doctorUuid, citizenUuid, guardUuid } = commitFullRoleSessionAtNight()
    const io = createFakeIo([])

    handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, { gameId: session.id, targetId: citizenUuid }, countingCallback().callback)
    handleSubmitNightAction(createFakeSocket(guardUuid), guardUuid, { gameId: session.id, targetId: guardUuid }, countingCallback().callback) // 실패(INVALID_TARGET)

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
    handleSubmitNightAction(createFakeSocket(actor), actor, { gameId: session.id, targetId: actor }, self.callback)

    const teammateResult = countingCallback()
    handleSubmitNightAction(createFakeSocket(actor), actor, { gameId: session.id, targetId: teammate }, teammateResult.callback)

    const citizenResult = countingCallback()
    handleSubmitNightAction(createFakeSocket(actor), actor, { gameId: session.id, targetId: citizenUuid }, citizenResult.callback)

    assert.deepEqual(self.getResponse(), { ok: true })
    assert.deepEqual(teammateResult.getResponse(), { ok: true })
    assert.deepEqual(citizenResult.getResponse(), { ok: true })
})

test('submit_night_action(JOKER, 오라클 방지 회귀): 자기 자신·다른 JOKER·CITIZEN 세 외부 ack가 구조적으로 구분 불가능하다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight()
    const [actor, teammate] = jokerUuids

    const self = countingCallback()
    handleSubmitNightAction(createFakeSocket(actor), actor, { gameId: session.id, targetId: actor }, self.callback)
    const teammateResult = countingCallback()
    handleSubmitNightAction(createFakeSocket(actor), actor, { gameId: session.id, targetId: teammate }, teammateResult.callback)
    const citizenResult = countingCallback()
    handleSubmitNightAction(createFakeSocket(actor), actor, { gameId: session.id, targetId: citizenUuid }, citizenResult.callback)

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

    handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, { gameId: session.id, targetId: null }, countingCallback().callback)

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
    // 이 밤의 현재 턴 역할(JOKER)이 아니면 submitNightAction에 도달하기도 전에 턴 게이트가
    // 거부하므로, mock이 실제로 개입하는 경로를 재현하려면 actor가 현재 턴 역할이어야 한다.
    const { session, jokerUuid } = commitFullRoleSessionAtNight()
    t.mock.method(gameSessionCore, 'submitNightAction', () => {
        throw new Error('SECRET role=JOKER targetId=citizen-uuid-X')
    })
    const errorSpy = t.mock.method(console, 'error', () => {})
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(createFakeSocket(jokerUuid), jokerUuid, { gameId: session.id, targetId: null }, callback)

    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[밤 행동 제출 처리 에러]')
    assert.deepEqual(loggedObj, { code: 'UNEXPECTED_ERROR', uuid: jokerUuid, gameId: undefined })
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
    // 현재 턴 역할(JOKER)이어야 실제 성공(mutation) 경로를 재현할 수 있다(DOCTOR는 아직
    // 자기 턴이 아니므로 턴 게이트가 먼저 거부한다).
    const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight()
    const errorSpy = t.mock.method(console, 'error', () => {})
    const io = createFakeIo([])

    assert.doesNotThrow(() =>
        handleSubmitNightAction(createFakeSocket(jokerUuid), jokerUuid, { gameId: session.id, targetId: citizenUuid }, throwingCallback('SECRET stack leak role=DOCTOR')),
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
    assert.equal(session.nightActions.get(jokerUuid), citizenUuid)
    assert.equal(io.broadcasts.length, 0)
})

test('로그 비밀성(callback 전달 실패, 실패 응답 전달 중): gameId는 undefined다(canonical 값을 쓸 근거가 없음)', (t) => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight()
    // GUARD의 자기 자신 대상 제출이 INVALID_TARGET에 도달하려면 먼저 JOKER→DOCTOR 턴이 끝나
    // 있어야 한다(그렇지 않으면 턴 불일치로 먼저 거부된다) — errorSpy 설치 전에 미리 진행한다.
    handleSubmitNightAction(createFakeSocket(jokerUuid), jokerUuid, { gameId: session.id, targetId: citizenUuid }, countingCallback().callback)
    handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, { gameId: session.id, targetId: citizenUuid }, countingCallback().callback)

    const errorSpy = t.mock.method(console, 'error', () => {})

    // GUARD 자기 자신 대상 → INVALID_TARGET(실패).
    assert.doesNotThrow(() =>
        handleSubmitNightAction(createFakeSocket(guardUuid), guardUuid, { gameId: session.id, targetId: guardUuid }, throwingCallback('SECRET-FAIL role=GUARD')),
    )

    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(loggedObj.gameId, undefined)
    assert.equal(JSON.stringify(errorSpy.mock.calls[0].arguments).includes('SECRET-FAIL'), false)
})

// --- 로그 비밀성: 일반 예외 + callback 전달 실패 중첩 경로 ---

test('로그 비밀성(중첩): submitNightAction과 callback이 동시에 throw해도 정확히 2건의 고정 구조 로그만 남고 gameId는 둘 다 undefined다', (t) => {
    // 현재 턴 역할(JOKER)이어야 턴 게이트를 통과해 mock이 실제로 개입한다.
    const { session, jokerUuid } = commitFullRoleSessionAtNight()
    t.mock.method(gameSessionCore, 'submitNightAction', () => {
        throw new Error('SECRET-A role=JOKER')
    })
    const errorSpy = t.mock.method(console, 'error', () => {})

    assert.doesNotThrow(() =>
        handleSubmitNightAction(createFakeSocket(jokerUuid), jokerUuid, { gameId: session.id, targetId: null }, throwingCallback('SECRET-B stack role=GUARD')),
    )

    assert.equal(errorSpy.mock.calls.length, 2)
    const [firstPrefix, firstLogged] = errorSpy.mock.calls[0].arguments
    const [secondPrefix, secondLogged] = errorSpy.mock.calls[1].arguments
    assert.equal(firstPrefix, '[밤 행동 제출 처리 에러]')
    assert.deepEqual(firstLogged, { code: 'UNEXPECTED_ERROR', uuid: jokerUuid, gameId: undefined })
    assert.equal(secondPrefix, '[밤 행동 제출 ack 전달 실패]')
    assert.deepEqual(secondLogged, { code: 'CALLBACK_ERROR', uuid: jokerUuid, gameId: undefined })

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
        handleSubmitNightAction(createFakeSocket(doctorUuid), doctorUuid, { gameId: longInjection, targetId: null }, throwingCallback('late leak')),
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
    // 현재 턴 역할(JOKER)이어야 실제 성공(mutation) 경로를 재현할 수 있다.
    const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'room-abc', gameIdFn: () => 'abc' })
    assert.equal(session.id, 'abc')
    const { callback, getResponse } = countingCallback()

    handleSubmitNightAction(createFakeSocket(jokerUuid), jokerUuid, { gameId: '\n  abc  \n', targetId: citizenUuid }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(Object.hasOwn(getResponse(), 'gameId'), false)
    assert.equal(session.nightActions.get(jokerUuid), citizenUuid)
})

test('9라운드 회귀: 같은 성공 제출에서 callback이 throw하면 CALLBACK_ERROR 로그의 gameId는 정확히 "abc"이고 원본 개행·공백 문자열은 어디에도 없다', (t) => {
    const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'room-abc2', gameIdFn: () => 'abc' })
    const errorSpy = t.mock.method(console, 'error', () => {})

    handleSubmitNightAction(createFakeSocket(jokerUuid), jokerUuid, { gameId: '\n  abc  \n', targetId: citizenUuid }, throwingCallback('late leak'))

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

    handleSubmitNightAction(createFakeSocket(actor), actor, { gameId: '\n  abc  \n', targetId: teammate }, throwingCallback('late leak'))

    assert.equal(errorSpy.mock.calls.length, 1)
    const [, loggedObj] = errorSpy.mock.calls[0].arguments
    assert.equal(loggedObj.gameId, 'abc')
})

// ---------------------------------------------------------------------------
// submit_joker_chat_message (handleSubmitJokerChatMessage) — NIGHT 단계 JOKER 전용 채팅
// ---------------------------------------------------------------------------

/** game-core를 직접 구동해 첫 밤(NIGHT, dayIndex 0) JOKER 전용 채팅 테스트용 세션 + fake socket/io를 준비한다. jokerCount만큼 JOKER, 나머지는 CITIZEN으로 배정된다. */
function commitJokerChatSessionWithSockets(uuids, { roomId = 'room-jc', jokerCount = 2, gameIdFn } = {}) {
    const room = makeRoom({ id: roomId, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, opts)
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    // JOKER 비밀 채팅은 NIGHT 전용 경로다 — 전원 확인이 도달시키는 초기 DAY가 아니라 첫 밤
    // 픽스처에서 구동한다.
    ackAllAndRewindToFirstNight(session)
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
    // 두 세션 모두 JOKER 비밀 채팅이 성립하는 첫 밤 상태로 맞춘다(commitJokerChatSessionWithSockets와 동일한 픽스처 계약).
    ackAllAndRewindToFirstNight(sessionA)
    ackAllAndRewindToFirstNight(sessionB)

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
// submit_game_chat_message (handleSubmitGameChatMessage) — 공개 DAY 채팅 / 사망자 전용 채팅
// 소켓 계층의 실제 함수를 그대로 구동한다(handleSubmitGameChatMessage ·
// resolveChatRecipientSockets · registerGameHandlers 배선). game-core도 mock하지 않고 canonical
// registry를 그대로 쓰므로, 라우팅·전달 건수·payload는 전부 실제 계약이 만들어낸 값이다.
// ---------------------------------------------------------------------------

const DAY_CHAT_EVENT = 'day_chat_message_received'
const DEAD_CHAT_EVENT = 'dead_chat_message_received'

/**
 * 공개/사망자 채팅 테스트용 세션 + fake socket/io를 준비한다. jokerCount 1 + randomFn:()=>0
 * 고정 셔플이라 JOKER 배정이 결정적이다. deadUuids로 넘긴 참가자는 canonical roster에서 사망
 * 처리하고 phase는 인자로 맞춘다 — game-core의 채널 라우팅은 이 둘(생존 여부·phase)만 보므로,
 * 밤 판정을 전부 재현하지 않고도 실제 라우팅 규칙을 그대로 구동할 수 있다.
 */
function commitGameChatSessionWithSockets(uuids, { roomId = 'room-gc', phase = 'DAY', deadUuids = [], jokerCount = 1 } = {}) {
    const room = makeRoom({ id: roomId, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    for (const uuid of deadUuids) session.players.get(uuid).alive = false
    session.phase = phase

    const sockets = uuids.map((uuid) => {
        const s = createFakeSocket(uuid)
        s.rooms.add(session.channelId)
        return s
    })
    const io = createFakeIo(sockets)
    const socketByUuid = new Map(sockets.map((s) => [s.data.user.uuid, s]))
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    return { session, io, sockets, socketByUuid, jokerUuid }
}

/** 그 소켓이 그 이벤트를 받은 횟수(수신자별 정확한 전달 건수 검증용). */
function deliveredCount(socket, event) {
    return socket.emitted.filter((e) => e.event === event).length
}

function deliveredPayloads(socket, event) {
    return socket.emitted.filter((e) => e.event === event).map((e) => e.payload)
}

test('submit_game_chat_message: 생존 발신자의 DAY는 생존 소켓 전원(발신자 포함)에게 정확히 1건씩만 가고 사망자는 0건이며 io 브로드캐스트가 없다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcs1a', 'gcs1b', 'gcs1c', 'gcs1d'], {
        roomId: 'room-gcs-1',
        phase: 'DAY',
        deadUuids: ['gcs1d'],
    })
    const actor = 'gcs1a'
    const { callback, getResponse } = countingCallback()

    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '안녕하세요' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    for (const alive of ['gcs1a', 'gcs1b', 'gcs1c']) {
        assert.equal(deliveredCount(socketByUuid.get(alive), DAY_CHAT_EVENT), 1, `${alive}는 정확히 1건 받아야 한다`)
        assert.equal(deliveredCount(socketByUuid.get(alive), DEAD_CHAT_EVENT), 0)
    }
    assert.equal(deliveredCount(socketByUuid.get('gcs1d'), DAY_CHAT_EVENT), 0, '사망자는 공개 DAY 메시지를 받지 않는다')
    assert.equal(deliveredCount(socketByUuid.get('gcs1d'), DEAD_CHAT_EVENT), 0)
    // 개별 소켓 emit만 쓴다 — io 전역/room 브로드캐스트로 새어나가지 않는다.
    assert.equal(io.broadcasts.length, 0)
    for (const s of socketByUuid.values()) {
        assert.equal(s.emitted.every((e) => e.broadcastTo === undefined), true)
    }
    // 유도된 채널의 rate limit만 소비된다.
    assert.deepEqual([...session.dayChatRateLimit.keys()], [actor])
    assert.equal(session.deadChatRateLimit.size, 0)
})

test('submit_game_chat_message: 공개 payload는 정확히 7개 키뿐이고 비공개 값(role/team/alive/allies)이 하나도 없다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcs2a', 'gcs2b', 'gcs2c', 'gcs2d'], {
        roomId: 'room-gcs-2',
        phase: 'DAY',
    })
    const actor = 'gcs2a'
    const { callback, getResponse } = countingCallback()

    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '  안녕  ' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const [payload] = deliveredPayloads(socketByUuid.get('gcs2b'), DAY_CHAT_EVENT)
    assert.deepEqual(Object.keys(payload).sort(), [
        'dayIndex',
        'gameId',
        'messageId',
        'nickname',
        'senderUuid',
        'sentAt',
        'text',
    ])
    // 모든 값이 canonical 서버 상태에서 왔다(클라이언트 payload에서 온 값이 아니다).
    assert.equal(payload.gameId, session.id)
    assert.equal(payload.senderUuid, actor)
    assert.equal(payload.nickname, session.players.get(actor).nickname)
    assert.equal(payload.text, '안녕', 'sanitize된 canonical 텍스트가 나간다')
    assert.equal(payload.dayIndex, session.dayIndex)
    assert.equal(Number.isInteger(payload.sentAt), true)
    const serialized = JSON.stringify(payload)
    for (const secret of ['role', 'team', 'alive', 'allies', 'JOKER', 'CITIZEN']) {
        assert.equal(serialized.includes(secret), false, `${secret}가 노출되면 안 된다`)
    }
})

test('submit_game_chat_message: payload에 채널·발신자·닉네임을 위조해도 라우팅과 payload는 canonical 상태만 따른다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcs3a', 'gcs3b', 'gcs3c', 'gcs3d'], {
        roomId: 'room-gcs-3',
        phase: 'DAY',
        deadUuids: ['gcs3d'],
    })
    const actor = 'gcs3a'
    const { callback, getResponse } = countingCallback()

    handleSubmitGameChatMessage(
        io,
        socketByUuid.get(actor),
        actor,
        {
            gameId: session.id,
            text: '위조 시도',
            channel: 'DEAD',
            senderUuid: 'forged-uuid',
            nickname: 'forged-nickname',
            role: 'JOKER',
            team: 'JOKER',
            alive: false,
            dayIndex: 99,
            messageId: 'forged-message-id',
            sentAt: 1,
            recipient: 'gcs3d',
            recipients: ['gcs3d'],
            recipientUuids: ['gcs3d'],
        },
        callback,
    )

    assert.deepEqual(getResponse(), { ok: true })
    // 위조한 channel:'DEAD'와 수신자 지정은 전부 무시된다 — 생존자는 언제나 DAY로만 라우팅되고,
    // 수신자는 canonical 생존 상태에서만 유도된다.
    assert.equal(deliveredCount(socketByUuid.get('gcs3d'), DEAD_CHAT_EVENT), 0)
    assert.equal(deliveredCount(socketByUuid.get('gcs3d'), DAY_CHAT_EVENT), 0)
    for (const alive of ['gcs3a', 'gcs3b', 'gcs3c']) {
        assert.equal(deliveredCount(socketByUuid.get(alive), DAY_CHAT_EVENT), 1)
    }
    const [payload] = deliveredPayloads(socketByUuid.get('gcs3b'), DAY_CHAT_EVENT)
    assert.deepEqual(Object.keys(payload).sort(), [
        'dayIndex',
        'gameId',
        'messageId',
        'nickname',
        'senderUuid',
        'sentAt',
        'text',
    ])
    assert.equal(payload.senderUuid, actor)
    assert.equal(payload.nickname, session.players.get(actor).nickname)
    assert.equal(payload.dayIndex, session.dayIndex)
    assert.equal(payload.text, '위조 시도')
    assert.notEqual(payload.messageId, 'forged-message-id')
    assert.notEqual(payload.sentAt, 1)
    // 위조된 값들은 canonical 상태에도 남지 않는다.
    assert.deepEqual([...session.dayChatRateLimit.keys()], [actor])
    assert.equal(session.deadChatRateLimit.size, 0)
})

test('submit_game_chat_message: prepare~commit 사이에 prepared 번들이 변조되면 전달 없이 원자적으로 거부된다', (t) => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcsIa', 'gcsIb', 'gcsIc'], {
        roomId: 'room-gcs-i',
        phase: 'DAY',
    })
    const actor = 'gcsIa'
    const errorSpy = t.mock.method(console, 'error', () => {})

    // production prepare를 그대로 구동한 뒤, 핸들러가 받는 번들만 손댄다(중간자 변조 재현).
    // commit이 쓰는 값은 모듈 사설 능력 기록이므로 이 변조는 전달되지 않고 요청 전체가 거부된다.
    const tamperingPrepare = (uuid, gameId, text, options) => {
        const prepared = gameSessionCore.prepareGameChatMessage(uuid, gameId, text, options)
        if (!prepared.ok) return prepared
        prepared.sentAt += 1
        prepared.message.sentAt += 1
        prepared.message.text = '변조된 본문'
        prepared.message.senderUuid = 'gcsIb'
        return prepared
    }

    const { callback, getResponse } = countingCallback()
    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '원문' }, callback, {
        prepare: tamperingPrepare,
    })

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    for (const s of socketByUuid.values()) assert.equal(s.emitted.length, 0, '변조된 요청은 아무에게도 전달되지 않는다')
    assert.equal(session.dayChatRateLimit.size, 0, '변조된 요청은 rate limit을 소비하지 않는다')
    assert.equal(session.deadChatRateLimit.size, 0)
    assert.deepEqual(
        errorSpy.mock.calls.map((c) => c.arguments[1]),
        [{ code: 'STALE_CHAT_REQUEST', uuid: actor, gameId: session.id }],
    )

    // 변조하지 않은 같은 요청은 정상적으로 전달된다(양성 대조).
    const clean = countingCallback()
    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '원문' }, clean.callback)
    assert.deepEqual(clean.getResponse(), { ok: true })
    const [payload] = deliveredPayloads(socketByUuid.get('gcsIb'), DAY_CHAT_EVENT)
    assert.equal(payload.text, '원문')
    assert.equal(payload.senderUuid, actor)
})

test('submit_game_chat_message: 사망 발신자는 DEAD 채널로만 라우팅돼 사망 소켓 전원(발신자 포함)이 1건씩 받고 생존자는 0건이다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcs4a', 'gcs4b', 'gcs4c', 'gcs4d'], {
        roomId: 'room-gcs-4',
        phase: 'NIGHT',
        deadUuids: ['gcs4a', 'gcs4b'],
    })
    const actor = 'gcs4a'
    const { callback, getResponse } = countingCallback()

    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '사망자 대화' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(deliveredCount(socketByUuid.get('gcs4a'), DEAD_CHAT_EVENT), 1)
    assert.equal(deliveredCount(socketByUuid.get('gcs4b'), DEAD_CHAT_EVENT), 1)
    for (const alive of ['gcs4c', 'gcs4d']) {
        assert.equal(deliveredCount(socketByUuid.get(alive), DEAD_CHAT_EVENT), 0, '생존자는 사망자 대화를 받지 않는다')
        assert.equal(deliveredCount(socketByUuid.get(alive), DAY_CHAT_EVENT), 0)
    }
    assert.deepEqual([...session.deadChatRateLimit.keys()], [actor])
    assert.equal(session.dayChatRateLimit.size, 0)
    assert.equal(io.broadcasts.length, 0)
})

test('submit_game_chat_message: 같은 uuid의 정상 소켓이 여럿이어도 각 소켓이 정확히 1건씩 받고 중복 전달이 없다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcs5a', 'gcs5b', 'gcs5c'], {
        roomId: 'room-gcs-5',
        phase: 'DAY',
    })
    // 같은 참가자의 두 번째 소켓(다른 socket id)도 같은 channel에 들어와 있다.
    const secondSocket = createFakeSocket('gcs5b', { id: 'sock-gcs5b-2' })
    secondSocket.rooms.add(session.channelId)
    io.sockets.sockets.set(secondSocket.id, secondSocket)
    const actor = 'gcs5a'
    const { callback, getResponse } = countingCallback()

    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '여러 소켓' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    for (const uuid of ['gcs5a', 'gcs5b', 'gcs5c']) {
        assert.equal(deliveredCount(socketByUuid.get(uuid), DAY_CHAT_EVENT), 1)
    }
    assert.equal(deliveredCount(secondSocket, DAY_CHAT_EVENT), 1)
    // 전체 전달 건수가 수신 소켓 수와 정확히 같다 — 어느 소켓도 두 번 받지 않는다.
    const total = [...io.sockets.sockets.values()].reduce((sum, s) => sum + deliveredCount(s, DAY_CHAT_EVENT), 0)
    assert.equal(total, 4)
})

test('submit_game_chat_message: 다른 GameSession의 소켓에는 전달되지 않는다(교차 오염 없음)', () => {
    const a = commitGameChatSessionWithSockets(['gcs6a1', 'gcs6a2', 'gcs6a3'], { roomId: 'room-gcs-6a', phase: 'DAY' })
    const b = commitGameChatSessionWithSockets(['gcs6b1', 'gcs6b2', 'gcs6b3'], { roomId: 'room-gcs-6b', phase: 'DAY' })
    const io = createFakeIo([...a.sockets, ...b.sockets])
    const actor = 'gcs6a1'
    const { callback, getResponse } = countingCallback()

    handleSubmitGameChatMessage(io, a.socketByUuid.get(actor), actor, { gameId: a.session.id, text: 'hello' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    for (const s of a.sockets) assert.equal(deliveredCount(s, DAY_CHAT_EVENT), 1)
    for (const s of b.sockets) assert.equal(deliveredCount(s, DAY_CHAT_EVENT), 0)
    assert.equal(b.session.dayChatRateLimit.size, 0)
})

test('submit_game_chat_message: connected:false·session channel 밖 소켓은 수신자에서 제외된다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcs7a', 'gcs7b', 'gcs7c'], {
        roomId: 'room-gcs-7',
        phase: 'DAY',
    })
    socketByUuid.get('gcs7b').connected = false
    socketByUuid.get('gcs7c').rooms.delete(session.channelId)
    const actor = 'gcs7a'
    const { callback, getResponse } = countingCallback()

    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '제외 확인' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(deliveredCount(socketByUuid.get(actor), DAY_CHAT_EVENT), 1)
    assert.equal(deliveredCount(socketByUuid.get('gcs7b'), DAY_CHAT_EVENT), 0)
    assert.equal(deliveredCount(socketByUuid.get('gcs7c'), DAY_CHAT_EVENT), 0)
})

test('resolveChatRecipientSockets: 채널별 canonical 수신자만 돌려주고 연결 끊김·channel 밖·다른 세션 소켓은 제외한다', () => {
    const { session, sockets, socketByUuid } = commitGameChatSessionWithSockets(['gcs8a', 'gcs8b', 'gcs8c', 'gcs8d'], {
        roomId: 'room-gcs-8',
        phase: 'DAY',
        deadUuids: ['gcs8c', 'gcs8d'],
    })
    const other = commitGameChatSessionWithSockets(['gcs8x', 'gcs8y', 'gcs8z'], { roomId: 'room-gcs-8-other', phase: 'DAY' })
    const mergedIo = createFakeIo([...sockets, ...other.sockets])
    socketByUuid.get('gcs8b').connected = false // 생존자지만 연결이 끊겼다
    socketByUuid.get('gcs8d').rooms.delete(session.channelId) // 사망자지만 channel 밖이다

    const dayIds = resolveChatRecipientSockets(mergedIo, session, gameSessionCore.CHAT_CHANNELS.DAY).map((s) => s.id)
    const deadIds = resolveChatRecipientSockets(mergedIo, session, gameSessionCore.CHAT_CHANNELS.DEAD).map((s) => s.id)

    assert.deepEqual(dayIds, ['sock-gcs8a'])
    assert.deepEqual(deadIds, ['sock-gcs8c'])
    // 알 수 없는 채널은 빈 배열이다(fail-closed) — 발신자 포함 검사가 반드시 실패한다.
    for (const channel of [null, undefined, '', 'day', 'UNKNOWN', 42]) {
        assert.deepEqual(resolveChatRecipientSockets(mergedIo, session, channel), [])
    }
})

test('submit_game_chat_message: 사망이 확정되면 같은 발신자의 다음 메시지가 즉시 DEAD 채널로 라우팅된다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcs9a', 'gcs9b', 'gcs9c', 'gcs9d'], {
        roomId: 'room-gcs-9',
        phase: 'DAY',
        deadUuids: ['gcs9d'],
    })
    const actor = 'gcs9a'

    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '살아있을 때' }, countingCallback().callback)
    assert.equal(deliveredCount(socketByUuid.get('gcs9b'), DAY_CHAT_EVENT), 1)
    assert.equal(deliveredCount(socketByUuid.get('gcs9d'), DEAD_CHAT_EVENT), 0)

    // 밤 판정으로 발신자가 사망하고 phase가 넘어간다.
    session.players.get(actor).alive = false
    session.phase = 'NIGHT'

    const second = countingCallback()
    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '죽은 뒤' }, second.callback)

    assert.deepEqual(second.getResponse(), { ok: true })
    assert.equal(deliveredCount(socketByUuid.get(actor), DEAD_CHAT_EVENT), 1)
    assert.equal(deliveredCount(socketByUuid.get('gcs9d'), DEAD_CHAT_EVENT), 1)
    assert.equal(deliveredCount(socketByUuid.get('gcs9b'), DEAD_CHAT_EVENT), 0, '생존자에게는 사망자 대화가 가지 않는다')
    assert.equal(deliveredCount(socketByUuid.get('gcs9b'), DAY_CHAT_EVENT), 1, '생존자에게 새 DAY 메시지가 추가되지 않는다')
})

test('submit_game_chat_message: 한 recipient의 emit이 throw해도 나머지는 정상 수신하고 커밋은 롤백되지 않는다', (t) => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcsAa', 'gcsAb', 'gcsAc'], {
        roomId: 'room-gcs-a',
        phase: 'DAY',
    })
    const actor = 'gcsAa'
    socketByUuid.get('gcsAb').emitShouldThrowOn = DAY_CHAT_EVENT
    const errorSpy = t.mock.method(console, 'error', () => {})
    const { callback, getResponse } = countingCallback()

    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '전달 실패 격리' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(deliveredCount(socketByUuid.get(actor), DAY_CHAT_EVENT), 1)
    assert.equal(deliveredCount(socketByUuid.get('gcsAb'), DAY_CHAT_EVENT), 0)
    assert.equal(deliveredCount(socketByUuid.get('gcsAc'), DAY_CHAT_EVENT), 1)
    assert.equal(session.dayChatRateLimit.get(actor) !== undefined, true, '전달 실패로 커밋이 되돌아가지 않는다')
    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, logged] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[게임 채팅 오류]')
    assert.deepEqual(logged, { code: 'DELIVERY_ERROR', uuid: actor, gameId: session.id })
})

test('submit_game_chat_message: callback이 throw해도 예외가 새지 않고 커밋·전달은 그대로 유지된다', (t) => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcsBa', 'gcsBb', 'gcsBc'], {
        roomId: 'room-gcs-b',
        phase: 'DAY',
    })
    const actor = 'gcsBa'
    const errorSpy = t.mock.method(console, 'error', () => {})

    assert.doesNotThrow(() =>
        handleSubmitGameChatMessage(
            io,
            socketByUuid.get(actor),
            actor,
            { gameId: session.id, text: '콜백 실패' },
            throwingCallback('콜백 실패(테스트 주입)'),
        ),
    )

    assert.equal(session.dayChatRateLimit.get(actor) !== undefined, true)
    for (const uuid of ['gcsBa', 'gcsBb', 'gcsBc']) {
        assert.equal(deliveredCount(socketByUuid.get(uuid), DAY_CHAT_EVENT), 1)
    }
    assert.equal(errorSpy.mock.calls.length, 1)
    const [prefix, logged] = errorSpy.mock.calls[0].arguments
    assert.equal(prefix, '[게임 채팅 오류]')
    assert.deepEqual(logged, { code: 'CALLBACK_ERROR', uuid: actor, gameId: session.id })
})

test('submit_game_chat_message: 수신자 해석·messageId 생성 실패는 전부 원자적이다(INTERNAL_ERROR, emit 0회, 두 Map 불변)', (t) => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcsCa', 'gcsCb', 'gcsCc'], {
        roomId: 'room-gcs-c',
        phase: 'DAY',
    })
    const actor = 'gcsCa'
    const errorSpy = t.mock.method(console, 'error', () => {})

    // messageId는 game-core의 prepare가 만드는 canonical 값이라(commit이 대조하는 능력에 함께
    // 묶인다) 그 실패는 prepare 단계의 실패다 — 아직 canonical session.id를 모르는 시점이므로
    // 다른 prepare 실패와 동일하게 gameId: undefined로 기록된다.
    const cases = [
        [{ resolveRecipientSockets: () => { throw new Error('resolve 실패(테스트 주입)') } }, 'RECIPIENT_RESOLVE_ERROR', session.id],
        [{ resolveRecipientSockets: () => [] }, 'SENDER_NOT_IN_RECIPIENTS', session.id],
        [{ idFn: () => { throw new Error('id 실패(테스트 주입)') } }, 'ID_GENERATION_ERROR', undefined],
        [{ idFn: () => '   ' }, 'INVALID_MESSAGE_ID', undefined],
        [{ idFn: () => 42 }, 'INVALID_MESSAGE_ID', undefined],
    ]
    for (const [deps] of cases) {
        const { callback, getResponse } = countingCallback()
        handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: '원자성' }, callback, deps)
        assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    }

    assert.equal(session.dayChatRateLimit.size, 0, '실패한 요청은 rate limit을 소비하지 않는다')
    assert.equal(session.deadChatRateLimit.size, 0)
    for (const s of socketByUuid.values()) assert.equal(s.emitted.length, 0)
    assert.deepEqual(
        errorSpy.mock.calls.map((c) => c.arguments[1]),
        cases.map(([, code, gameId]) => ({ code, uuid: actor, gameId })),
    )
})

test('submit_game_chat_message: 브로드캐스트되는 messageId는 game-core가 만든 canonical 값(trim된 idFn 결과)이다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcsHa', 'gcsHb', 'gcsHc'], {
        roomId: 'room-gcs-h',
        phase: 'DAY',
    })
    const actor = 'gcsHa'
    const { callback, getResponse } = countingCallback()

    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: 'ID 확인' }, callback, {
        idFn: () => '  msg-canonical  ',
    })

    assert.deepEqual(getResponse(), { ok: true })
    // 모든 수신자가 정확히 같은 canonical messageId 하나를 받는다.
    for (const uuid of ['gcsHa', 'gcsHb', 'gcsHc']) {
        const [payload] = deliveredPayloads(socketByUuid.get(uuid), DAY_CHAT_EVENT)
        assert.equal(payload.messageId, 'msg-canonical')
    }
})

test('submit_game_chat_message: commit 실패는 전달 없이 끝나고, 요청 바인딩 실패는 내부 코드를 노출하지 않는다', (t) => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcsDa', 'gcsDb', 'gcsDc'], {
        roomId: 'room-gcs-d',
        phase: 'DAY',
    })
    const actor = 'gcsDa'
    const errorSpy = t.mock.method(console, 'error', () => {})

    // (1) 그 사이 게임이 끝났다 — UI가 반응해야 하는 상황이라 code를 그대로 전달한다.
    const ended = countingCallback()
    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: 'x' }, ended.callback, {
        commit: () => ({ ok: false, code: 'GAME_ALREADY_ENDED' }),
    })
    assert.deepEqual(ended.getResponse(), { ok: false, code: 'GAME_ALREADY_ENDED', message: '요청을 처리할 수 없습니다.' })

    // (2) 준비된 그 요청이 아니다(경쟁·변조) — 내부 코드는 감추고 INTERNAL_ERROR로 정규화한다.
    const stale = countingCallback()
    handleSubmitGameChatMessage(io, socketByUuid.get(actor), actor, { gameId: session.id, text: 'y' }, stale.callback, {
        commit: () => ({ ok: false, code: 'STALE_CHAT_REQUEST' }),
    })
    assert.deepEqual(stale.getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.deepEqual(
        errorSpy.mock.calls.map((c) => c.arguments[1]),
        [{ code: 'STALE_CHAT_REQUEST', uuid: actor, gameId: session.id }],
    )

    // 어느 쪽도 전달되지 않았고 rate limit도 소비되지 않았다.
    for (const s of socketByUuid.values()) assert.equal(s.emitted.length, 0)
    assert.equal(session.dayChatRateLimit.size, 0)
    assert.equal(session.deadChatRateLimit.size, 0)
})

test('submit_game_chat_message: payload 형태 오류는 INVALID_PAYLOAD이고 callback이 함수가 아니면 완전한 no-op이다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcsEa', 'gcsEb', 'gcsEc'], {
        roomId: 'room-gcs-e',
        phase: 'DAY',
    })
    const actor = 'gcsEa'
    const socket = socketByUuid.get(actor)

    for (const badPayload of [null, 'x', 42, [], { gameId: 123, text: 'hi' }, { gameId: session.id, text: 42 }]) {
        const { callback, getResponse } = countingCallback()
        handleSubmitGameChatMessage(io, socket, actor, badPayload, callback)
        assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    }
    assert.doesNotThrow(() => handleSubmitGameChatMessage(io, socket, actor, { gameId: session.id, text: 'hi' }, undefined))

    assert.equal(session.dayChatRateLimit.size, 0)
    for (const s of socketByUuid.values()) assert.equal(s.emitted.length, 0)
})

test('submit_game_chat_message: registerGameHandlers로 실제 배선하면 socket.trigger가 직접 호출과 동일한 결과를 낸다', () => {
    const { session, io, socketByUuid } = commitGameChatSessionWithSockets(['gcsFa', 'gcsFb', 'gcsFc'], {
        roomId: 'room-gcs-f',
        phase: 'DAY',
    })
    const actor = 'gcsFa'
    const socket = socketByUuid.get(actor)
    gameSessionSocketLayer.registerGameHandlers(io, socket, actor)
    const { callback, getResponse } = countingCallback()

    socket.trigger('submit_game_chat_message', { gameId: session.id, text: '배선 확인' }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(deliveredCount(socket, DAY_CHAT_EVENT), 1)
    assert.equal(deliveredCount(socketByUuid.get('gcsFb'), DAY_CHAT_EVENT), 1)
    assert.equal(deliveredCount(socketByUuid.get('gcsFc'), DAY_CHAT_EVENT), 1)
    assert.equal(io.broadcasts.length, 0)
})

test('submit_game_chat_message: 사망한 JOKER는 JOKER 채팅을 쓸 수 없고 수신자에서도 빠지며, 대신 DEAD 채널을 쓴다', () => {
    const uuids = ['gcsGa', 'gcsGb', 'gcsGc', 'gcsGd']
    const { session, io, socketByUuid, jokerUuid } = commitGameChatSessionWithSockets(uuids, {
        roomId: 'room-gcs-g',
        phase: 'NIGHT',
    })
    const jokerSocket = socketByUuid.get(jokerUuid)

    // 살아있는 동안에는 JOKER 채널의 수신자다(양성 대조).
    assert.deepEqual(
        resolveChatRecipientSockets(io, session, gameSessionCore.CHAT_CHANNELS.JOKER).map((s) => s.id),
        [jokerSocket.id],
    )

    session.players.get(jokerUuid).alive = false

    // 사망 즉시 JOKER 채널에서 사라지고 제출도 거부된다.
    assert.deepEqual(resolveChatRecipientSockets(io, session, gameSessionCore.CHAT_CHANNELS.JOKER), [])
    const jokerChat = countingCallback()
    handleSubmitJokerChatMessage(io, jokerSocket, jokerUuid, { gameId: session.id, text: '죽은 JOKER' }, jokerChat.callback)
    assert.deepEqual(jokerChat.getResponse(), { ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
    for (const s of socketByUuid.values()) assert.equal(deliveredCount(s, 'joker_chat_message'), 0)
    assert.equal(session.jokerChatRateLimit.size, 0)

    // 대신 사망자 전용 채팅은 정상 동작한다 — 지금 사망자는 본인뿐이라 본인에게만 간다.
    const deadChat = countingCallback()
    handleSubmitGameChatMessage(io, jokerSocket, jokerUuid, { gameId: session.id, text: '사망자 대화' }, deadChat.callback)

    assert.deepEqual(deadChat.getResponse(), { ok: true })
    assert.equal(deliveredCount(jokerSocket, DEAD_CHAT_EVENT), 1)
    for (const uuid of uuids.filter((u) => u !== jokerUuid)) {
        assert.equal(deliveredCount(socketByUuid.get(uuid), DEAD_CHAT_EVENT), 0)
    }
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
        handleLeaveGameSession(io, createFakeSocket('leave-inv-host'), 'leave-inv-host', payload, callback)
        assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    }

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.length, 1) // 종료되지 않음
})

test('leave_game_session: callback이 함수가 아니면 완전한 no-op이다(상태 불변, 새 방송 없음)', async () => {
    const { io } = await startRealTwoPlayerSession('leave-nocb-host', 'leave-nocb-joiner')
    const broadcastsBefore = io.broadcasts.length

    assert.doesNotThrow(() => handleLeaveGameSession(io, createFakeSocket('leave-nocb-host'), 'leave-nocb-host', { gameId: 'whatever' }, undefined))

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.length, 1)
    assert.equal(io.broadcasts.length, broadcastsBefore)
})

test('leave_game_session: 정상 이탈은 ack {ok:true}이고 game_ended가 정확히 한 번 {gameId, reason:"PLAYER_LEFT"}로 방송되며 참가자 전원의 channel과 registry가 정리된다', async () => {
    const { io, hostSocket, joinerSocket, gameId, channelId } = await startRealTwoPlayerSession('leave-ok-host', 'leave-ok-joiner')
    const { callback, getResponse } = countingCallback()

    handleLeaveGameSession(io, createFakeSocket('leave-ok-host'), 'leave-ok-host', { gameId }, callback)

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
    handleLeaveGameSession(io, createFakeSocket('leave-idem-host'), 'leave-idem-host', { gameId }, countingCallback().callback)
    const before = io.broadcasts.filter((b) => b.event === 'game_ended').length

    const { callback, getResponse } = countingCallback()
    handleLeaveGameSession(io, createFakeSocket('leave-idem-host'), 'leave-idem-host', { gameId }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const after = io.broadcasts.filter((b) => b.event === 'game_ended').length
    assert.equal(after, before)
})

test('leave_game_session: 명시적 이탈 성공 뒤 같은 Socket의 disconnect가 중첩되어도 game_ended는 정확히 한 번뿐이다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('leave-overlap-a-host', 'leave-overlap-a-joiner')

    handleLeaveGameSession(io, createFakeSocket('leave-overlap-a-host'), 'leave-overlap-a-host', { gameId }, countingCallback().callback)
    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'leave-overlap-a-host') // 뒤늦게 도착한 disconnect

    const ended = io.broadcasts.filter((b) => b.event === 'game_ended')
    assert.equal(ended.length, 1)
})

test('leave_game_session: disconnect가 먼저 처리된 뒤 도착한 명시적 이탈 요청도 game_ended는 정확히 한 번뿐이고 이탈 ack는 여전히 {ok:true}다', async () => {
    const { io, hostSocket, gameId } = await startRealTwoPlayerSession('leave-overlap-b-host', 'leave-overlap-b-joiner')

    await gameSessionSocketLayer.onDisconnect(io, hostSocket, 'leave-overlap-b-host')
    const { callback, getResponse } = countingCallback()
    handleLeaveGameSession(io, createFakeSocket('leave-overlap-b-host'), 'leave-overlap-b-host', { gameId }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    const ended = io.broadcasts.filter((b) => b.event === 'game_ended')
    assert.equal(ended.length, 1)
})

test('leave_game_session(ABA, 동일 Socket): 세션 A를 종료한 뒤 같은 Socket으로 세션 B를 시작하면, 그 뒤의 disconnect는 정상적으로 B를 종료한다', async () => {
    const { io, hostSocket, gameId: gameIdA } = await startRealTwoPlayerSession('aba-same-host', 'aba-same-joinerA')
    handleLeaveGameSession(io, createFakeSocket('aba-same-host'), 'aba-same-host', { gameId: gameIdA }, countingCallback().callback)
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
    handleLeaveGameSession(io, createFakeSocket(targetUuid), targetUuid, { gameId: gameIdA }, countingCallback().callback)
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

    handleLeaveGameSession(io, createFakeSocket('leave-throw-uuid'), 'leave-throw-uuid', { gameId: 'whatever' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
    assert.equal(errorSpy.mock.calls.length, 1)
    const serialized = JSON.stringify(errorSpy.mock.calls[0].arguments)
    assert.equal(serialized.includes('SECRET'), false)
})

test('leave_game_session: callback이 throw해도 registry 정리·matchmaking 정리·game_ended 방송은 정상적으로 완료된다', async () => {
    const { io, gameId } = await startRealTwoPlayerSession('leave-cbthrow-host', 'leave-cbthrow-joiner')

    assert.doesNotThrow(() =>
        handleLeaveGameSession(io, createFakeSocket('leave-cbthrow-host'), 'leave-cbthrow-host', { gameId }, () => {
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

    handleLeaveGameSession(io, createFakeSocket('cleanup-b-host'), 'cleanup-b-host', { gameId }, countingCallback().callback)

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

    assert.doesNotThrow(() => handleLeaveGameSession(io, createFakeSocket('cleanup-iso-host'), 'cleanup-iso-host', { gameId }, countingCallback().callback))

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

    handleLeaveGameSession(io, createFakeSocket('cleanup-scope-host'), 'cleanup-scope-host', { gameId }, countingCallback().callback)

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

    handleLeaveGameSession(io, createFakeSocket('reentry-host'), 'reentry-host', { gameId }, countingCallback().callback)

    const created = await callAsPromise(handleCreateRoom, io, hostSocket, 'reentry-host', validSettingsPayload())
    assert.equal(created.ok, true)

    await handleJoinRoomByCode(io, joinerSocket, 'reentry-joiner', created.room.roomCode)
    assert.ok(joinerSocket.emitted.some((e) => e.event === 'room_joined'))
})

// ---------------------------------------------------------------------------
// resolve_night (handleResolveNight) — NIGHT 결과 적용 + DAY 전이
// ---------------------------------------------------------------------------

/** 3인(JOKER 1 + CITIZEN 2) 세션을 커밋해 첫 밤(NIGHT, dayIndex 0) 픽스처로 만들고 fake socket/io를 채널에 join된 상태로 준비한다. */
function commitTrioSessionWithSocketsAtNight({ id = 'room-rn' } = {}) {
    const uuids = [`${id}-a`, `${id}-b`, `${id}-c`]
    const room = makeRoom({ id, players: uuids.map((u) => makePlayer(u)), jokerCount: 1 })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
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

/**
 * 비-JOKER 한 명이 제거되어도 생존 JOKER 1명 < 생존 비-JOKER 2명이므로
 * 승리 조건이 성립하지 않는 4인 세션을 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다.
 */
function commitFourPlayerSessionWithSocketsAtNight({ id = 'room-rn-four' } = {}) {
    const uuids = [`${id}-a`, `${id}-b`, `${id}-c`, `${id}-d`]
    const room = makeRoom({ id, players: uuids.map((u) => makePlayer(u)), jokerCount: 1 })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session

    ackAllAndRewindToFirstNight(session)

    const sockets = uuids.map((uuid) => {
        const socket = createFakeSocket(uuid)
        socket.rooms.add(session.channelId)
        return socket
    })

    const io = createFakeIo(sockets)
    const jokerUuid = [...session.players.values()].find((player) => player.role === 'JOKER').uuid
    const citizenUuids = [...session.players.values()]
        .filter((player) => player.role !== 'JOKER')
        .map((player) => player.uuid)
    const socketByUuid = new Map(
        sockets.map((socket) => [socket.data.user.uuid, socket]),
    )

    return {
        session,
        io,
        sockets,
        uuids,
        jokerUuid,
        citizenUuids,
        socketByUuid,
    }
}

test('resolve_night: 보호 안 된 유효 희생자 — night_result_applied가 참가자 전원(발신자 포함)에게 정확히 1건씩, payload가 buildNightResultAppliedPayload와 동일하다', () => {
    const { session, io, uuids, jokerUuid, citizenUuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-rn-1' })
    const [victimUuid] = citizenUuids
    gameSessionCore.submitNightAction(jokerUuid, session.id, victimUuid)

    const { callback, getResponse } = countingCallback()
    handleResolveNight(io, socketByUuid.get(jokerUuid) ?? null, jokerUuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.players.get(victimUuid).alive, false)

    // 이번 밤은 JOKER의 암살이 실제로 alive→dead를 만들었으므로 공개 reveal은 정확히 한 건
    // ({victimUuid, source:'JOKER'})이고, 방송 payload도 그 목록을 그대로 실어 나른다.
    const expectedPayload = gameSessionCore.buildNightResultAppliedPayload(session, victimUuid, [
        { victimUuid, source: 'JOKER' },
    ])
    assert.deepEqual(expectedPayload.deathReveals, [{ victimUuid, source: 'JOKER' }])
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
    handleResolveNight(io, socketByUuid.get(uuids[0]), uuids[0], { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    for (const uuid of uuids) assert.equal(session.players.get(uuid).alive, true)
    const delivered = socketByUuid.get(uuids[1]).emitted.find((e) => e.event === 'night_result_applied')
    assert.deepEqual(delivered.payload.victimUuid, null)
})

test('resolve_night: 중복 호출 — 두 번째 호출은 NIGHT_ALREADY_RESOLVED이고 phase/dayIndex 변경과 night_result_applied 방송은 전체 과정에서 정확히 1회다', () => {
    const { session, io, uuids, jokerUuid, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-3' })
    gameSessionCore.submitNightAction(jokerUuid, session.id, null)

    handleResolveNight(io, socketByUuid.get(uuids[0]), uuids[0], { gameId: session.id }, countingCallback().callback)
    const second = countingCallback()
    handleResolveNight(io, socketByUuid.get(uuids[1]), uuids[1], { gameId: session.id }, second.callback)

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
    handleResolveNight(io, socketByUuid.get(uuids[0]), uuids[0], { gameId: session.id }, callback, deps)

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

    handleResolveNight(io, socketByUuid.get(uuids[0]), uuids[0], { gameId: session.id }, countingCallback().callback, deps)

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

    assert.doesNotThrow(() => handleResolveNight(io, throwingSocket, uuids[0], { gameId: session.id }, countingCallback().callback))

    assert.equal(session.phase, 'DAY')
    const otherDelivered = socketByUuid.get(uuids[1]).emitted.filter((e) => e.event === 'night_result_applied')
    assert.equal(otherDelivered.length, 1)
})

// ---------------------------------------------------------------------------
// resolve_night — 승리 조건 충족 시 ENDED 종료(terminal payload)
// ---------------------------------------------------------------------------

/** canonical session.players에서 기대 winResult.reveals 배열을 그대로 계산한다(삽입 순서 포함). */
function expectedRevealsOf(session) {
    return [...session.players.values()].map((p) => ({
        uuid: p.uuid,
        nickname: p.nickname,
        role: p.role,
        team: gameSessionCore.ROLE_TEAMS[p.role],
        alive: p.alive,
    }))
}

/**
 * 종료 payload에서 winResult.reveals/mvp만 도려낸 나머지에 기존 금지 substring 검사를 그대로
 * 적용한다 — role/team이 "오직 winResult.reveals 안에서만" 나타난다는, 기존 검사보다 더 강한
 * 회귀 단정이 된다(목록에서 '"role"'/'"team"'을 빼버리면 다른 위치의 leak도 통과해버린다).
 */
function assertRoleTeamOnlyInsideReveals(payload, forbiddenSubstrings) {
    const { winResult: { reveals, mvp, ...winnerOnly }, ...rest } = payload
    const serialized = JSON.stringify({ ...rest, winResult: winnerOnly })
    for (const forbidden of forbiddenSubstrings) {
        assert.equal(serialized.includes(forbidden), false, `${forbidden}이(가) winResult.reveals 밖에서 발견됨`)
    }
    assert.equal(Array.isArray(reveals), true)
    assert.equal(mvp, null)
    return reveals
}

test('resolve_night 종료(CITIZEN 승리): 마지막 생존 JOKER가 NIGHT 희생자로 반영되면 phase ENDED와 canonical winResult로 종료되고, 참가자 전원이 night_result_applied를 정확히 1건씩 수신하며 payload가 canonical game-core 빌더 결과와 완전히 일치한다', () => {
    // JOKER는 실제 submit_night_action 경로로는 다른 JOKER(자기 자신 포함)를 대상으로 지정할 수
    // 없으므로(오라클 방지 no-op), "NIGHT 희생자가 마지막 JOKER인" 시나리오는 이미 존재하는
    // '오염된 resolution' 테스트와 동일한 deps.prepare 주입 기법으로 결정적으로 재현한다 — 승리
    // 판정 자체는 commitNightResolution이 커밋한 victim을 그대로 소비하므로 이 경로로도 실제
    // 판정 로직을 정확히 구동한다.
    const { session, io, uuids, jokerUuid, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-term-citizen' })
    const deps = {
        prepare: () => ({
            ok: true,
            session,
            resolution: {
                gameId: session.id,
                dayIndex: session.dayIndex,
                pendingEliminationTargetId: jokerUuid,
                privateResults: new Map(),
                resolved: true,
            },
        }),
    }

    const { callback, getResponse } = countingCallback()
    handleResolveNight(io, socketByUuid.get(uuids[0]), uuids[0], { gameId: session.id }, callback, deps)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.players.get(jokerUuid).alive, false)

    // canonical sourcing: 소켓 계층이 방송한 payload는 game-core의 두 빌더를 커밋 이후 session에
    // 그대로 적용한 결과와 완전히 동일해야 한다(별도 파생·가공 없음).
    // 주입된 resolution에는 assassinationTargetId도 witchHunterExecutionTargetId도 없으므로
    // resolveNightDeathSource가 귀속을 하나도 찾지 못한다 — 공개 출처는 "밤사이 사망"만 뜻하는
    // UNKNOWN_NIGHT다(사망 자체는 실제로 일어났으므로 목록이 비어 있지는 않다).
    const expectedPayload = {
        ...gameSessionCore.buildNightResultAppliedPayload(session, jokerUuid, [
            { victimUuid: jokerUuid, source: 'UNKNOWN_NIGHT' },
        ]),
        ...gameSessionCore.buildTerminalFields(session),
    }
    assert.deepEqual(
        Object.keys(expectedPayload).sort(),
        ['dayIndex', 'deathReveals', 'gameId', 'phase', 'players', 'victimUuid', 'winResult'],
    )
    // ENDED이므로 winResult에는 winner 외에 전원 공개 목록(reveals)과 예약된 mvp 슬롯이 함께 온다.
    assert.equal(expectedPayload.winResult.winner, 'CITIZEN')
    assert.equal(expectedPayload.winResult.mvp, null)
    assert.deepEqual(Object.keys(expectedPayload.winResult).sort(), ['mvp', 'reveals', 'winner'])
    assert.deepEqual(expectedPayload.winResult.reveals, expectedRevealsOf(session))
    assert.deepEqual(expectedPayload.deathReveals, [{ victimUuid: jokerUuid, source: 'UNKNOWN_NIGHT' }])
    assert.deepEqual(
        expectedPayload.players.map((p) => p.uuid).sort(),
        [...uuids].sort(),
    )

    for (const uuid of uuids) {
        const delivered = socketByUuid.get(uuid).emitted.filter((e) => e.event === 'night_result_applied')
        assert.equal(delivered.length, 1)
        assert.deepEqual(delivered[0].payload, expectedPayload)

        // 실제로 배달된 payload에도 전원 role/team이 실려 있다(보는 사람과 무관하게 동일하다).
        const reveals = assertRoleTeamOnlyInsideReveals(
            delivered[0].payload,
            ['"role"', '"team"', '"allies"', 'privateResults', 'ballotSnapshot', 'nightActions'],
        )
        assert.deepEqual(reveals, expectedRevealsOf(session))
        assert.equal(reveals.find((r) => r.uuid === jokerUuid).role, 'JOKER')
    }
})

test('resolve_night 종료(JOKER 승리): NIGHT 희생으로 parity(생존 JOKER ≥ 생존 비-JOKER) 도달 시 phase ENDED와 canonical winResult로 종료되고, 참가자 전원이 night_result_applied를 정확히 1건씩 수신하며 payload가 canonical game-core 빌더 결과와 완전히 일치한다', () => {
    const { session, io, uuids, jokerUuid, citizenUuids, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-term-joker' })
    const [victimUuid] = citizenUuids
    gameSessionCore.submitNightAction(jokerUuid, session.id, victimUuid)

    const { callback, getResponse } = countingCallback()
    handleResolveNight(io, socketByUuid.get(jokerUuid) ?? null, jokerUuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    assert.equal(session.players.get(victimUuid).alive, false)

    // 종료 payload에도 그 밤의 공개 reveal이 그대로 함께 실린다 — JOKER 암살이 만든 사망이므로
    // 출처는 JOKER 하나뿐이다.
    const expectedPayload = {
        ...gameSessionCore.buildNightResultAppliedPayload(session, victimUuid, [
            { victimUuid, source: 'JOKER' },
        ]),
        ...gameSessionCore.buildTerminalFields(session),
    }
    assert.deepEqual(
        Object.keys(expectedPayload).sort(),
        ['dayIndex', 'deathReveals', 'gameId', 'phase', 'players', 'victimUuid', 'winResult'],
    )
    assert.equal(expectedPayload.winResult.winner, 'JOKER')
    assert.equal(expectedPayload.winResult.mvp, null)
    assert.deepEqual(Object.keys(expectedPayload.winResult).sort(), ['mvp', 'reveals', 'winner'])
    assert.deepEqual(expectedPayload.winResult.reveals, expectedRevealsOf(session))
    assert.deepEqual(expectedPayload.deathReveals, [{ victimUuid, source: 'JOKER' }])

    for (const uuid of uuids) {
        const delivered = socketByUuid.get(uuid).emitted.filter((e) => e.event === 'night_result_applied')
        assert.equal(delivered.length, 1)
        assert.deepEqual(delivered[0].payload, expectedPayload)

        const reveals = assertRoleTeamOnlyInsideReveals(
            delivered[0].payload,
            ['"role"', '"team"', '"allies"', 'privateResults', 'ballotSnapshot', 'nightActions'],
        )
        assert.deepEqual(reveals, expectedRevealsOf(session))
        // 죽은 희생자도, 살아남은 JOKER도 모두 공개된다.
        assert.equal(reveals.find((r) => r.uuid === victimUuid).alive, false)
        assert.equal(reveals.find((r) => r.uuid === jokerUuid).role, 'JOKER')
    }
})

test('불변성: NIGHT 종료 payload를 캡처해 중첩 필드를 변형해도 canonical session.winResult와 이후 재구성된 payload는 오염되지 않는다', () => {
    const { session, io, uuids, jokerUuid, citizenUuids, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id: 'room-rn-immut' })
    const [victimUuid] = citizenUuids
    gameSessionCore.submitNightAction(jokerUuid, session.id, victimUuid)
    handleResolveNight(io, socketByUuid.get(jokerUuid) ?? null, jokerUuid, { gameId: session.id }, countingCallback().callback)
    assert.equal(session.phase, 'ENDED')
    const originalWinner = session.winResult.winner

    const captured = socketByUuid.get(uuids[0]).emitted.find((e) => e.event === 'night_result_applied').payload
    captured.winResult.winner = 'TAMPERED'
    captured.winResult.reveals[0].role = 'TAMPERED_ROLE'
    captured.players.push({ uuid: 'forged-uuid', isAlive: true })

    assert.equal(session.winResult.winner, originalWinner)
    assert.equal(session.players.has('forged-uuid'), false)
    assert.notEqual([...session.players.values()][0].role, 'TAMPERED_ROLE')

    const rebuilt = gameSessionCore.buildTerminalFields(session)
    assert.equal(rebuilt.winResult.winner, originalWinner)
    assert.equal(rebuilt.players.length, session.players.size)
    assert.equal(rebuilt.winResult.reveals.length, session.players.size)
    assert.deepEqual(rebuilt.winResult.reveals, expectedRevealsOf(session))
})

// ---------------------------------------------------------------------------
// cast_day_vote (handleSubmitDayVote) — DAY 투표/기권 제출
// ---------------------------------------------------------------------------

/** 3인 NIGHT 세션을 무득표로 판정해 DAY(dayIndex 1, 전원 alive)까지 전이하고, fake socket/io를 재사용한다. */
function commitTrioSessionWithSocketsAtDay({ id = 'room-dv' } = {}) {
    const { session, io, sockets, uuids, jokerUuid, citizenUuids, socketByUuid } = commitTrioSessionWithSocketsAtNight({ id })
    gameSessionCore.submitNightAction(jokerUuid, session.id, null)
    handleResolveNight(io, socketByUuid.get(jokerUuid), jokerUuid, { gameId: session.id }, countingCallback().callback)
    return { session, io, sockets, uuids, jokerUuid, citizenUuids, socketByUuid }
}

test('cast_day_vote: 정상 대상 투표는 ack {ok:true}이고 dayVotes에 저장되며 브로드캐스트가 없다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-1' })
    const [actor, target] = uuids
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: session.id, targetId: target }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.dayVotes.get(actor), target)
    assert.equal(io.broadcasts.length, 0)
})

test('cast_day_vote: 기권(targetId:null) 제출은 ack {ok:true}이고 dayVotes에 null로 저장된다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-2' })
    const [actor] = uuids
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: session.id, targetId: null }, callback)

    assert.deepEqual(getResponse(), { ok: true })
    assert.equal(session.dayVotes.get(actor), null)
    assert.equal(session.dayVotes.has(actor), true)
})

test('cast_day_vote: payload의 위조 uuid/alive/role/phase는 전부 무시되고 인증된 uuid·registry 기준으로만 처리된다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-3' })
    const [actor, target] = uuids
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(
        io, socketByUuid.get(actor), actor,
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
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-5' })
    const [actor, target] = uuids

    assert.doesNotThrow(() =>
        handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: session.id, targetId: target }, throwingCallback('콜백 실패(테스트 주입)')),
    )

    assert.equal(session.dayVotes.get(actor), target)
})

test('cast_day_vote: payload가 객체가 아니거나 배열이면 INVALID_PAYLOAD이고 dayVotes는 불변이다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-6' })
    const [actor] = uuids

    for (const badPayload of [null, 'x', 42, []]) {
        const { callback, getResponse } = countingCallback()
        handleSubmitDayVote(io, socketByUuid.get(actor), actor, badPayload, callback)
        assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })
    }
    assert.equal(session.dayVotes.size, 0)
})

test('cast_day_vote: gameId가 비문자열이거나 targetId가 null/문자열이 아니면 INVALID_PAYLOAD다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-7' })
    const [actor, target] = uuids

    const badGameId = countingCallback()
    handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: 123, targetId: target }, badGameId.callback)
    assert.deepEqual(badGameId.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    const badTarget = countingCallback()
    handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: session.id, targetId: 42 }, badTarget.callback)
    assert.deepEqual(badTarget.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    assert.equal(session.dayVotes.size, 0)
})

test('cast_day_vote: core가 SESSION_NOT_FOUND를 반환하는 registry 불일치는 INTERNAL_ERROR로 정규화된다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-8' })
    const [actor, target] = uuids
    // actor를 registry상 현재 canonical socket으로 먼저 확립한 뒤(재접속 권한 가드 통과),
    // game-core 세션만 별도로 지워 registry 불일치(SESSION_NOT_FOUND)를 재현한다 — 그래야 이
    // 테스트가 의도한 "더 깊은" 핸들러 경로(가드 통과 이후 core 호출 정규화)를 실제로 구동한다.
    gameSessionCore.__testables.__deleteGameSessionOnlyForTests(session.id)
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: session.id, targetId: target }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
})

test('cast_day_vote: core가 throw하면 INTERNAL_ERROR로 정규화되고 원본 Error가 로그에 노출되지 않는다', (t) => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-9' })
    const [actor, target] = uuids
    const errorSpy = t.mock.method(console, 'error', () => {})
    t.mock.method(gameSessionCore, 'submitDayVote', () => {
        throw new Error('SECRET internal detail')
    })
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: session.id, targetId: target }, callback)

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
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-11' })
    const [actor, target] = uuids
    const { callback, getResponse } = countingCallback()

    handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: 'not-the-real-game-id', targetId: target }, callback)

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
    handleSubmitDayVote(dayA.io, dayA.socketByUuid.get(actorA), actorA, { gameId: dayB.session.id, targetId: targetB }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'STALE_SESSION_MISMATCH', message: '요청을 처리할 수 없습니다.' })
    assert.equal(dayB.session.dayVotes.size, 0)
    assert.equal(dayA.session.dayVotes.size, 0)
})

test('cast_day_vote: 같은 uuid가 두 번 제출하면 dayVotes에는 마지막 값만 저장된다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-dv-12' })
    const [actor, targetB, targetC] = uuids

    handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: session.id, targetId: targetB }, countingCallback().callback)
    handleSubmitDayVote(io, socketByUuid.get(actor), actor, { gameId: session.id, targetId: targetC }, countingCallback().callback)

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
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-rdv-1' })
    const [a, b, c] = uuids
    handleSubmitDayVote(io, socketByUuid.get(a), a, { gameId: session.id, targetId: c }, countingCallback().callback)
    handleSubmitDayVote(io, socketByUuid.get(b), b, { gameId: session.id, targetId: c }, countingCallback().callback)
    handleSubmitDayVote(io, socketByUuid.get(c), c, { gameId: session.id, targetId: null }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()

    handleResolveDayVote(io, socketByUuid.get(a), a, { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'TRIBUNAL',
        tribunalTargetUuid: c,
    })
    assert.equal(session.phase, 'TRIBUNAL')
})

test('resolve_day_vote: TIE 판정 ack의 outcome은 "TIE"이고 phase는 NIGHT로 전이하며(dayIndex 불변), day_vote_resolved 방송 payload.phase도 NIGHT다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-rdv-2' })
    const [a, b, c] = uuids
    const dayIndexBefore = session.dayIndex
    handleSubmitDayVote(io, socketByUuid.get(a), a, { gameId: session.id, targetId: b }, countingCallback().callback)
    handleSubmitDayVote(io, socketByUuid.get(b), b, { gameId: session.id, targetId: c }, countingCallback().callback)
    handleSubmitDayVote(io, socketByUuid.get(c), c, { gameId: session.id, targetId: a }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()

    handleResolveDayVote(io, socketByUuid.get(a), a, { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: dayIndexBefore,
        outcome: 'TIE',
        tribunalTargetUuid: null,
    })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, dayIndexBefore)
    assert.equal(session.nightActions.size, 0)
    assert.equal(session.nightResolution, null)

    const broadcast = socketByUuid.get(a).emitted.find((e) => e.event === 'day_vote_resolved')
    assert.equal(broadcast.payload.phase, 'NIGHT')
    assert.equal(broadcast.payload.dayIndex, dayIndexBefore)
    assert.equal(broadcast.payload.outcome, 'TIE')
    for (const uuid of uuids) {
        assert.equal(socketByUuid.get(uuid).emitted.filter((e) => e.event === 'day_vote_resolved').length, 1)
    }
})

test('resolve_day_vote: ABSTAINED 판정도 phase가 NIGHT로 전이하며(dayIndex 불변), 이후 새 NIGHT 행동이 정상 접수된다', () => {
    const { session, io, uuids, socketByUuid, jokerUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-rdv-abstain' })
    const dayIndexBefore = session.dayIndex
    for (const uuid of uuids) {
        handleSubmitDayVote(io, socketByUuid.get(uuid), uuid, { gameId: session.id, targetId: null }, countingCallback().callback)
    }
    const { callback, getResponse } = countingCallback()

    handleResolveDayVote(io, socketByUuid.get(uuids[0]), uuids[0], { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: dayIndexBefore,
        outcome: 'ABSTAINED',
        tribunalTargetUuid: null,
    })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, dayIndexBefore)

    const nightSubmitResult = gameSessionCore.submitNightAction(jokerUuid, session.id, null)
    assert.deepEqual(nightSubmitResult, { ok: true, gameId: session.id })
})

test('resolve_day_vote: 이미 판정된 dayIndex 재요청은 멱등하게 동일한 결과 필드를 반환하고 재방송하지 않으며 NIGHT 상태를 다시 초기화하지 않는다', () => {
    const { session, io, uuids, socketByUuid, jokerUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-rdv-3' })
    const [a, b, c] = uuids
    for (const uuid of uuids) {
        handleSubmitDayVote(io, socketByUuid.get(uuid), uuid, { gameId: session.id, targetId: null }, countingCallback().callback)
    }

    handleResolveDayVote(io, socketByUuid.get(a), a, { gameId: session.id, dayIndex: session.dayIndex }, countingCallback().callback)
    // 전이 이후 새 NIGHT에서 실제로 행동을 제출해, 지연된 중복 재요청이 이 진행 상태를
    // 되돌리지 않는지 확인할 수 있는 상태를 만든다.
    gameSessionCore.submitNightAction(jokerUuid, session.id, null)
    const countBroadcasts = () =>
        [a, b, c]
            .map((uuid) => socketByUuid.get(uuid).emitted.filter((e) => e.event === 'day_vote_resolved').length)
            .reduce((sum, n) => sum + n, 0)
    const countAfterFirst = countBroadcasts()

    const { callback, getResponse } = countingCallback()
    handleResolveDayVote(io, socketByUuid.get(b), b, { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'ABSTAINED',
        tribunalTargetUuid: null,
    })
    assert.equal(countBroadcasts(), countAfterFirst)
    // 지연된 중복 요청은 alreadyResolved로 멱등 처리되어 commit을 다시 타지 않으므로, 새
    // NIGHT에서 이미 제출된 행동이 지워지지 않는다.
    assert.equal(session.nightActions.size, 1)
})

test('resolve_day_vote: registerGameHandlers로 실제 배선하면 socket.trigger가 직접 호출과 동일한 결과를 낸다', () => {
    const { session, io, uuids, socketByUuid } = commitTrioSessionWithSocketsAtDay({ id: 'room-rdv-4' })
    const [a] = uuids
    for (const uuid of uuids) {
        handleSubmitDayVote(io, socketByUuid.get(uuid), uuid, { gameId: session.id, targetId: null }, countingCallback().callback)
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
    handleCastTribunalVote(io, socketA, 'r1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, socketB, 'r2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()

    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, socketA, 'r1', { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), { ok: true, gameId: session.id, dayIndex: session.dayIndex, outcome: 'NOT_GUILTY', counts: { guilty: 0, notGuilty: 2 }, executedUuid: null })
    assert.equal(session.players.get('r3').alive, true)
    for (const s of [socketA, socketB, socketC]) {
        const delivered = s.emitted.filter((e) => e.event === 'tribunal_vote_resolved')
        assert.equal(delivered.length, 1)
        assert.deepEqual(Object.keys(delivered[0].payload).sort(), ['counts', 'dayIndex', 'defendantUuid', 'executedUuid', 'gameId', 'outcome', 'phase'])
    }
})

test('handleResolveTribunalVote: commit 실패 시 실패 ACK, broadcast 0회, payload 빌드 0회', () => {
    const { session, socketA, socketB, socketC } = commitTribunalReadySession({ roomId: 'room-rtv-2', uuidA: 's1', uuidB: 's2', uuidC: 's3', defendantUuid: 's3' })
    const io = createFakeIo([socketA, socketB, socketC])
    handleCastTribunalVote(io, socketA, 's1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, socketB, 's2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
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
        gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, socketA, 's1', { gameId: session.id, dayIndex: session.dayIndex }, callback, deps)
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

    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, socketA, 't1', { gameId: session.id, dayIndex: session.dayIndex }, callback)

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
    handleCastTribunalVote(io, socketA, 'v1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, socketB, 'v2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()

    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, socketA, 'v1', { gameId: session.id, dayIndex: session.dayIndex }, callback)

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
    handleCastTribunalVote(io, socketA, 'w1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, socketB, 'w2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, socketA, 'w1', { gameId: session.id, dayIndex: session.dayIndex }, countingCallback().callback)
    const countBefore = socketA.emitted.filter((e) => e.event === 'tribunal_vote_resolved').length

    const { callback, getResponse } = countingCallback()
    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, socketB, 'w2', { gameId: session.id, dayIndex: session.dayIndex }, callback)

    // NOT_GUILTY(무죄)는 아무도 죽지 않아 승리 조건이 성립하지 않으므로, 첫 번째 resolve가 이미
    // phase를 TRIBUNAL 밖(NIGHT)으로 옮겨놨다 — 두 번째 요청은 TRIBUNAL_ALREADY_RESOLVED가
    // 아니라 INVALID_PHASE로 거부된다(prepareTribunalVoteResolution의 phase 검사가 먼저 걸림).
    assert.equal(session.phase, 'NIGHT')
    assert.deepEqual(getResponse(), { ok: false, code: 'INVALID_PHASE', message: '요청을 처리할 수 없습니다.' })
    const countAfter = socketA.emitted.filter((e) => e.event === 'tribunal_vote_resolved').length
    assert.equal(countAfter, countBefore)
})

// ---------------------------------------------------------------------------
// resolve_tribunal_vote — 승리 없음(no-winner) TRIBUNAL 판정 → NIGHT 전이
// ---------------------------------------------------------------------------

test('resolve_tribunal_vote 전이(no-winner): 승리 조건 미충족 판정은 phase가 NIGHT로 전이하고, 참가자 전원이 tribunal_vote_resolved를 정확히 1건씩 수신하며 payload가 canonical public 상태와 일치한다', () => {
    const { session, socketA, socketB, socketC } = commitTribunalReadySession({
        roomId: 'room-rtv-night',
        uuidA: 'x1',
        uuidB: 'x2',
        uuidC: 'x3',
        defendantUuid: 'x3',
    })
    const io = createFakeIo([socketA, socketB, socketC])
    const dayIndexBefore = session.dayIndex
    // 기본 3인 fixture에서 무죄(NOT_GUILTY)는 아무도 죽지 않아 항상 승리 조건 미충족이다.
    handleCastTribunalVote(io, socketA, 'x1', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    handleCastTribunalVote(io, socketB, 'x2', { gameId: session.id, dayIndex: session.dayIndex, vote: 'NOT_GUILTY' }, countingCallback().callback)
    const { callback, getResponse } = countingCallback()

    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, socketA, 'x1', { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'NOT_GUILTY',
        counts: { guilty: 0, notGuilty: 2 },
        executedUuid: null,
    })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, dayIndexBefore)
    assert.equal(Object.hasOwn(session, 'winResult'), false)

    const expectedPayload = gameSessionCore.buildTribunalVoteResolvedPayload(session)
    assert.deepEqual(Object.keys(expectedPayload).sort(), ['counts', 'dayIndex', 'defendantUuid', 'executedUuid', 'gameId', 'outcome', 'phase'])
    assert.equal(expectedPayload.phase, 'NIGHT')

    for (const s of [socketA, socketB, socketC]) {
        const delivered = s.emitted.filter((e) => e.event === 'tribunal_vote_resolved')
        assert.equal(delivered.length, 1)
        assert.deepEqual(delivered[0].payload, expectedPayload)

        const serialized = JSON.stringify(delivered[0].payload)
        for (const forbidden of ['"role"', '"team"', '"allies"', 'ballotSnapshot', 'voterUuid', 'privateResults', 'nightActions']) {
            assert.equal(serialized.includes(forbidden), false)
        }
    }
})

// ---------------------------------------------------------------------------
// resolve_tribunal_vote — 승리 조건 충족 시 ENDED 종료(terminal payload)
// ---------------------------------------------------------------------------

/**
 * 결정적 역할 배정으로 TRIBUNAL 판정 직전(투표 미제출) 상태까지 세션을 구성한다.
 * commitTribunalReadySession(위)은 기본 Math.random으로 역할을 배정해 defendantUuid를
 * 특정 역할로 고정할 수 없으므로, 승리 시나리오를 결정적으로 재현하기 위해 buildSessionCandidate에
 * randomFn을 주입하는 별도 헬퍼를 둔다. jokerCount와 defendantRole로 CITIZEN/JOKER 승리를 통제한다.
 */
function commitDeterministicTribunalReadySession({ id, uuids, jokerCount, defendantRole }) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of uuids) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)

    const defendantUuid = [...session.players.values()].find((p) => p.role === defendantRole).uuid
    session.phase = 'TRIBUNAL'
    session.dayVoteResolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'TRIBUNAL',
        tribunalTargetUuid: defendantUuid,
        publicVoteCount: uuids.length,
        publicAbstainCount: 0,
    }
    session.tribunal = { candidateId: defendantUuid, dayIndex: session.dayIndex, defendantUuid, votes: new Map() }

    const sockets = uuids.map((uuid) => {
        const s = createFakeSocket(uuid)
        s.rooms.add(session.channelId)
        s.data.activeGameId = session.id
        return s
    })
    const io = createFakeIo(sockets)
    const socketByUuid = new Map(sockets.map((s) => [s.data.user.uuid, s]))
    return { session, io, socketByUuid, defendantUuid }
}

test('resolve_tribunal_vote 종료(CITIZEN 승리): 피고인이 마지막 생존 JOKER고 GUILTY 판정이면 phase ENDED와 canonical winResult로 종료되고, 참가자 전원이 tribunal_vote_resolved를 정확히 1건씩 수신하며 ACK/broadcast가 현재 production 계약과 정확히 일치한다', () => {
    const uuids = ['tc-a', 'tc-b', 'tc-c']
    const { session, io, socketByUuid, defendantUuid } = commitDeterministicTribunalReadySession({
        id: 'room-tv-term-citizen',
        uuids,
        jokerCount: 1,
        defendantRole: 'JOKER',
    })
    const voterUuids = uuids.filter((uuid) => uuid !== defendantUuid)
    for (const voterUuid of voterUuids) {
        handleCastTribunalVote(io, socketByUuid.get(voterUuid), voterUuid, { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    }

    const { callback, getResponse } = countingCallback()
    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, socketByUuid.get(voterUuids[0]), voterUuids[0], { gameId: session.id, dayIndex: session.dayIndex }, callback)

    // ACK 계약: 현재 production 코드는 terminal이어도 phase/players/winResult를 ACK에 포함하지
    // 않는다 — 이 여섯 키만 정확히 담아야 한다(그 이상도 이하도 아님).
    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'GUILTY',
        counts: { guilty: 2, notGuilty: 0 },
        executedUuid: defendantUuid,
    })
    assert.deepEqual(Object.keys(getResponse()).sort(), ['counts', 'dayIndex', 'executedUuid', 'gameId', 'ok', 'outcome'])

    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.players.get(defendantUuid).alive, false)

    const expectedPayload = {
        ...gameSessionCore.buildTribunalVoteResolvedPayload(session),
        ...gameSessionCore.buildTerminalFields(session),
    }
    assert.deepEqual(
        Object.keys(expectedPayload).sort(),
        ['counts', 'dayIndex', 'defendantUuid', 'executedUuid', 'gameId', 'outcome', 'phase', 'players', 'winResult'],
    )
    // ENDED이므로 재판 종료 방송에도 전원 공개 목록(reveals)과 예약된 mvp 슬롯이 함께 실린다.
    assert.equal(expectedPayload.winResult.winner, 'CITIZEN')
    assert.equal(expectedPayload.winResult.mvp, null)
    assert.deepEqual(Object.keys(expectedPayload.winResult).sort(), ['mvp', 'reveals', 'winner'])
    assert.deepEqual(expectedPayload.winResult.reveals, expectedRevealsOf(session))

    for (const uuid of uuids) {
        const delivered = socketByUuid.get(uuid).emitted.filter((e) => e.event === 'tribunal_vote_resolved')
        assert.equal(delivered.length, 1)
        assert.deepEqual(delivered[0].payload, expectedPayload)

        const reveals = assertRoleTeamOnlyInsideReveals(
            delivered[0].payload,
            ['"role"', '"team"', '"allies"', 'ballotSnapshot', 'voterUuid'],
        )
        assert.deepEqual(reveals, expectedRevealsOf(session))
        assert.equal(reveals.find((r) => r.uuid === defendantUuid).role, 'JOKER')
    }
})

test('resolve_tribunal_vote 종료(JOKER 승리): 피고인이 비-JOKER고 처형 후 parity 도달 시 phase ENDED와 canonical winResult로 종료되고, 참가자 전원이 tribunal_vote_resolved를 정확히 1건씩 수신하며 ACK/broadcast가 현재 production 계약과 정확히 일치한다', () => {
    const uuids = ['tj-a', 'tj-b', 'tj-c']
    const { session, io, socketByUuid, defendantUuid } = commitDeterministicTribunalReadySession({
        id: 'room-tv-term-joker',
        uuids,
        jokerCount: 2,
        defendantRole: 'CITIZEN',
    })
    const voterUuids = uuids.filter((uuid) => uuid !== defendantUuid)
    for (const voterUuid of voterUuids) {
        handleCastTribunalVote(io, socketByUuid.get(voterUuid), voterUuid, { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    }

    const { callback, getResponse } = countingCallback()
    gameSessionSocketLayer.__testables.handleResolveTribunalVote(io, socketByUuid.get(voterUuids[0]), voterUuids[0], { gameId: session.id, dayIndex: session.dayIndex }, callback)

    assert.deepEqual(getResponse(), {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        outcome: 'GUILTY',
        counts: { guilty: 2, notGuilty: 0 },
        executedUuid: defendantUuid,
    })
    assert.deepEqual(Object.keys(getResponse()).sort(), ['counts', 'dayIndex', 'executedUuid', 'gameId', 'ok', 'outcome'])

    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    assert.equal(session.players.get(defendantUuid).alive, false)

    const expectedPayload = {
        ...gameSessionCore.buildTribunalVoteResolvedPayload(session),
        ...gameSessionCore.buildTerminalFields(session),
    }
    assert.deepEqual(
        Object.keys(expectedPayload).sort(),
        ['counts', 'dayIndex', 'defendantUuid', 'executedUuid', 'gameId', 'outcome', 'phase', 'players', 'winResult'],
    )
    assert.equal(expectedPayload.winResult.winner, 'JOKER')
    assert.equal(expectedPayload.winResult.mvp, null)
    assert.deepEqual(Object.keys(expectedPayload.winResult).sort(), ['mvp', 'reveals', 'winner'])
    assert.deepEqual(expectedPayload.winResult.reveals, expectedRevealsOf(session))

    for (const uuid of uuids) {
        const delivered = socketByUuid.get(uuid).emitted.filter((e) => e.event === 'tribunal_vote_resolved')
        assert.equal(delivered.length, 1)
        assert.deepEqual(delivered[0].payload, expectedPayload)

        const reveals = assertRoleTeamOnlyInsideReveals(
            delivered[0].payload,
            ['"role"', '"team"', '"allies"', 'ballotSnapshot', 'voterUuid'],
        )
        assert.deepEqual(reveals, expectedRevealsOf(session))
        // 처형된 피고인은 CITIZEN이었다 — 종료 후에는 그 사실도 그대로 공개된다.
        assert.equal(reveals.find((r) => r.uuid === defendantUuid).role, 'CITIZEN')
        assert.equal(reveals.find((r) => r.uuid === defendantUuid).alive, false)
    }
})

test('불변성: TRIBUNAL 종료 payload를 캡처해 중첩 필드를 변형해도 canonical session.winResult와 이후 재구성된 payload는 오염되지 않는다', () => {
    const uuids = ['ti-a', 'ti-b', 'ti-c']
    const { session, io, socketByUuid, defendantUuid } = commitDeterministicTribunalReadySession({
        id: 'room-tv-immut',
        uuids,
        jokerCount: 1,
        defendantRole: 'JOKER',
    })
    const voterUuids = uuids.filter((uuid) => uuid !== defendantUuid)
    for (const voterUuid of voterUuids) {
        handleCastTribunalVote(io, socketByUuid.get(voterUuid), voterUuid, { gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' }, countingCallback().callback)
    }
    gameSessionSocketLayer.__testables.handleResolveTribunalVote(
        io, socketByUuid.get(voterUuids[0]), voterUuids[0], { gameId: session.id, dayIndex: session.dayIndex }, countingCallback().callback,
    )
    assert.equal(session.phase, 'ENDED')
    const originalWinner = session.winResult.winner

    const captured = socketByUuid.get(uuids[0]).emitted.find((e) => e.event === 'tribunal_vote_resolved').payload
    captured.winResult.winner = 'TAMPERED'
    captured.winResult.reveals[0].role = 'TAMPERED_ROLE'
    captured.players.push({ uuid: 'forged-uuid', isAlive: true })

    assert.equal(session.winResult.winner, originalWinner)
    assert.equal(session.players.has('forged-uuid'), false)
    assert.notEqual([...session.players.values()][0].role, 'TAMPERED_ROLE')

    const rebuilt = gameSessionCore.buildTerminalFields(session)
    assert.equal(rebuilt.winResult.winner, originalWinner)
    assert.equal(rebuilt.players.length, session.players.size)
    assert.equal(rebuilt.winResult.reveals.length, session.players.size)
    assert.deepEqual(rebuilt.winResult.reveals, expectedRevealsOf(session))
})

// ---------------------------------------------------------------------------
// get_session_snapshot (handleGetSessionSnapshot) — 인증된 재접속 스냅샷 조회
// ---------------------------------------------------------------------------

/** votesByUuid(uuid→targetUuid|null) 전원 제출 후 DAY 투표 판정을 core로 직접 커밋한다 — 이
 * 이벤트 자체가 테스트 대상이므로 DAY/TRIBUNAL 진행은 다른 핸들러를 거치지 않고 core로
 * 직접 전진시킨다(commitDeterministicTribunalReadySession과 달리 실제 NIGHT를 거쳐야
 * session.nightResolution이 채워지므로 이 방식을 쓴다). */
function resolveDayVotesDirect(session, votesByUuid) {
    for (const [voterUuid, targetUuid] of Object.entries(votesByUuid)) {
        gameSessionCore.submitDayVote(voterUuid, session.id, targetUuid)
    }
    const [anyVoter] = Object.keys(votesByUuid)
    const prepared = gameSessionCore.prepareDayVoteResolution(anyVoter, session.id, session.dayIndex)
    return gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution)
}

/** votesByUuid(uuid→'GUILTY'|'NOT_GUILTY') 전원 제출 후 TRIBUNAL 판정을 core로 직접 커밋한다. */
function resolveTribunalVotesDirect(session, votesByUuid) {
    for (const [voterUuid, vote] of Object.entries(votesByUuid)) {
        gameSessionCore.submitTribunalVote(voterUuid, session.id, session.dayIndex, vote)
    }
    const [anyVoter] = Object.keys(votesByUuid)
    const prepared = gameSessionCore.prepareTribunalVoteResolution(anyVoter, session.id, session.dayIndex)
    return gameSessionCore.commitTribunalVoteResolution(prepared.session, prepared.resolution)
}

/** JOKER 전용 밤 행동(target 없으면 SKIP)을 제출하고 판정을 core로 직접 커밋한다. */
function resolveJokerOnlyNightDirect(session, jokerUuid, targetUuid) {
    gameSessionCore.submitNightAction(jokerUuid, session.id, targetUuid)
    const prepared = gameSessionCore.prepareNightResolution(jokerUuid, session.id)
    return gameSessionCore.commitNightResolution(prepared.session, prepared.resolution)
}

// -- 경로 인식(path-aware) 재귀 비밀 데이터 검사기 --------------------------------------------
// backend/game-core/__tests__/gameSession.test.js의 동일한 검사기와 설계가 같다(Codex P1 지적:
// 키 이름만으로 전역 예외 처리하지 않는다 — 명시적으로 승인된 스키마 경로에서만 값 비교를
// 건너뛴다). 공유 테스트 헬퍼 파일을 새로 추가할 수 없는 이번 슬라이스의 허용 파일 목록
// 제약상 이 파일에도 동일하게 둔다.

const FORBIDDEN_PRIVATE_KEYS = new Set([
    'role', 'team', 'allies',
    'votes', 'nightActions', 'dayVotes', 'roleRevealAcks',
    'nightTargetUuid', 'dayVoteTargetUuid', 'tribunalVoteUuid', 'tribunalVote',
])

// nightResult.deathReveals.*.source는 game-core 쪽 동일 검사기와 같은 이유로 명시 승인한다 —
// 공개 사망 출처 열거값('JOKER'/'WITCH_HUNTER'/'UNKNOWN_NIGHT')은 "어떤 공개 사건이 이 죽음을
// 만들었는가"만 뜻하고 특정 참가자의 role 배정을 뜻하지 않는데, 문자열로는 다른 참가자의 role
// 값과 겹칠 수 있다. victimUuid는 이미 공개된 사망자 식별자다(players.*.uuid /
// nightResult.victimUuid와 동일).
const APPROVED_PUBLIC_VALUE_PATHS = new Set([
    'players.*.uuid',
    'nightResult.victimUuid',
    'nightResult.deathReveals.*.victimUuid',
    'nightResult.deathReveals.*.source',
    'dayVoteResolution.tribunalTargetUuid',
    'tribunal.defendantUuid',
    'tribunal.executedUuid',
    'tribunal.outcome',
    'winResult.winner',
])

function normalizeSnapshotPath(path) {
    return path.map((segment) => (typeof segment === 'number' ? '*' : segment)).join('.')
}

// winResult.reveals는 "게임이 끝났으므로 전원 공개"가 명시적 계약인 유일한 서브트리다 — self와
// 같은 이유로 키 이름이 아니라 위치 자체를 예외로 둔다(game-core 쪽 동일 검사기와 같다).
// 이 경로 밖의 role/team은 여전히 즉시 실패한다.
function isEndedRevealPath(path) {
    return path[0] === 'winResult' && path[1] === 'reveals'
}

function assertNoForbiddenPrivateData(value, secretValues, path = [], insideSelf = false) {
    if (Array.isArray(value)) {
        value.forEach((item, i) => assertNoForbiddenPrivateData(item, secretValues, [...path, i], insideSelf))
        return
    }
    if (value !== null && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
            const nextInsideSelf = insideSelf || (path.length === 0 && key === 'self')
            assert.ok(
                nextInsideSelf || isEndedRevealPath([...path, key]) || !FORBIDDEN_PRIVATE_KEYS.has(key),
                `forbidden key "${key}" found at ${[...path, key].join('.') || '(root)'}`,
            )
            assertNoForbiddenPrivateData(val, secretValues, [...path, key], nextInsideSelf)
        }
        return
    }
    if (
        typeof value === 'string' &&
        !insideSelf &&
        !isEndedRevealPath(path) &&
        !APPROVED_PUBLIC_VALUE_PATHS.has(normalizeSnapshotPath(path))
    ) {
        for (const secret of secretValues) {
            assert.notStrictEqual(value, secret.value, `leaked ${secret.label} at ${path.join('.') || '(root)'}`)
        }
    }
}

function collectOtherPlayerRoleSecrets(session, viewerUuid) {
    const secrets = []
    for (const player of session.players.values()) {
        if (player.uuid === viewerUuid) continue
        secrets.push({ value: player.role, label: `role(${player.uuid})=${player.role}` })
    }
    return secrets
}

test('get_session_snapshot: 재접속으로 교체된 낡은 socket은 STALE_SOCKET이고 core 직렬화 함수가 호출되지 않는다', (t) => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-stale' })
    const [uuid] = uuids
    const staleSocket = socketByUuid.get(uuid)
    // 같은 uuid로 새 소켓이 재접속해 registry의 canonical socketId를 교체한 상황을 재현한다
    // (이 파일의 관례대로, 재접속 권한 자체를 검증할 때만 convention proxy 대신 실제 Map을 쓴다).
    const freshSocket = createFakeSocket(uuid, { id: `${staleSocket.id}-fresh` })
    gameSessionSocketLayer.setOnlineUsersRegistry(new Map([[uuid, freshSocket.id]]))
    const spy = t.mock.method(gameSessionCore, 'getSessionSnapshotForPlayer', () => {
        throw new Error('교체된 소켓 요청인데 core 직렬화 함수가 호출됨')
    })
    const { callback, getResponse } = countingCallback()

    handleGetSessionSnapshot(io, staleSocket, uuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
    assert.equal(spy.mock.calls.length, 0)
})

test('get_session_snapshot: canonical socket 요청은 core 직렬화 함수를 (uuid, gameId)로 정확히 1회 호출하고 결과를 그대로 ack한다', (t) => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-current' })
    const [uuid] = uuids
    const original = gameSessionCore.getSessionSnapshotForPlayer
    const spy = t.mock.method(gameSessionCore, 'getSessionSnapshotForPlayer', (...args) => original(...args))
    const { callback, getResponse } = countingCallback()

    handleGetSessionSnapshot(io, socketByUuid.get(uuid), uuid, { gameId: session.id }, callback)

    assert.equal(getResponse().ok, true)
    assert.equal(spy.mock.calls.length, 1)
    assert.deepEqual(spy.mock.calls[0].arguments, [uuid, session.id])
})

test('get_session_snapshot: callback이 함수가 아니면 무동작이다(core 호출 없음)', (t) => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-nocb' })
    const [uuid] = uuids
    const spy = t.mock.method(gameSessionCore, 'getSessionSnapshotForPlayer', () => {
        throw new Error('callback이 없는데 core가 호출됨')
    })

    handleGetSessionSnapshot(io, socketByUuid.get(uuid), uuid, { gameId: session.id }, undefined)

    assert.equal(spy.mock.calls.length, 0)
})

test('get_session_snapshot: payload 형태 오류(비객체/배열/gameId 타입 오류)는 INVALID_PAYLOAD이고 core를 호출하지 않는다', (t) => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-badpayload' })
    const [uuid] = uuids
    const socket = socketByUuid.get(uuid)
    const spy = t.mock.method(gameSessionCore, 'getSessionSnapshotForPlayer', () => {
        throw new Error('잘못된 payload인데 core가 호출됨')
    })

    const nullPayload = countingCallback()
    handleGetSessionSnapshot(io, socket, uuid, null, nullPayload.callback)
    assert.deepEqual(nullPayload.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    const arrayPayload = countingCallback()
    handleGetSessionSnapshot(io, socket, uuid, [], arrayPayload.callback)
    assert.deepEqual(arrayPayload.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    const badGameIdType = countingCallback()
    handleGetSessionSnapshot(io, socket, uuid, { gameId: 42 }, badGameIdType.callback)
    assert.deepEqual(badGameIdType.getResponse(), { ok: false, code: 'INVALID_PAYLOAD', message: '잘못된 요청입니다.' })

    assert.equal(spy.mock.calls.length, 0)
})

test('get_session_snapshot: gameId를 생략해도 성공한다(선택 필드)', () => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-omitted' })
    const [uuid] = uuids
    const { callback, getResponse } = countingCallback()

    handleGetSessionSnapshot(io, socketByUuid.get(uuid), uuid, {}, callback)

    assert.equal(getResponse().ok, true)
    assert.equal(getResponse().gameId, session.id)
})

test('get_session_snapshot: 인증됐지만 세션 참가자가 아닌 uuid는 INTERNAL_ERROR로 정규화된다(NOT_A_PARTICIPANT)', () => {
    const { session, io } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-nonmember' })
    const outsiderUuid = 'outsider-uuid'
    const outsiderSocket = createFakeSocket(outsiderUuid) // convention 기본값(sock-${uuid})을 그대로 따름
    const { callback, getResponse } = countingCallback()

    handleGetSessionSnapshot(io, outsiderSocket, outsiderUuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
})

test('get_session_snapshot: registry 불일치(SESSION_NOT_FOUND)는 INTERNAL_ERROR로 정규화된다', () => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-sessionnotfound' })
    const [uuid] = uuids
    gameSessionCore.__testables.__deleteGameSessionOnlyForTests(session.id)
    const { callback, getResponse } = countingCallback()

    handleGetSessionSnapshot(io, socketByUuid.get(uuid), uuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다.' })
})

test('get_session_snapshot: 잘못된 expected gameId는 GAME_ID_MISMATCH가 그대로 전달된다(INTERNAL_ERROR로 정규화되지 않음)', () => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-gidmismatch' })
    const [uuid] = uuids
    const { callback, getResponse } = countingCallback()

    handleGetSessionSnapshot(io, socketByUuid.get(uuid), uuid, { gameId: 'not-the-real-game-id' }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'GAME_ID_MISMATCH', message: '요청을 처리할 수 없습니다.' })
})

test('get_session_snapshot: 성공/실패/STALE_SOCKET 어느 경로에서도 room broadcast가 없다(ack 전용)', () => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-nobroadcast' })
    const [uuid] = uuids

    handleGetSessionSnapshot(io, socketByUuid.get(uuid), uuid, { gameId: session.id }, countingCallback().callback)
    handleGetSessionSnapshot(io, socketByUuid.get(uuid), uuid, { gameId: 'wrong-id' }, countingCallback().callback)
    handleGetSessionSnapshot(io, null, uuid, { gameId: session.id }, countingCallback().callback) // STALE_SOCKET

    assert.equal(io.broadcasts.length, 0)
})

test('get_session_snapshot: roster의 isConnected는 registry상 canonical socket이 실제로 연결돼 있는지를 반영한다', () => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-connected' })
    const [viewerUuid, connectedUuid, disconnectedUuid, missingUuid] = uuids
    socketByUuid.get(disconnectedUuid).connected = false
    io.sockets.sockets.delete(socketByUuid.get(missingUuid).id) // registry엔 남아있지만 io에서 소켓 자체가 사라짐

    const { callback, getResponse } = countingCallback()
    handleGetSessionSnapshot(io, socketByUuid.get(viewerUuid), viewerUuid, { gameId: session.id }, callback)

    const players = getResponse().players
    assert.equal(players.find((p) => p.uuid === viewerUuid).isConnected, true)
    assert.equal(players.find((p) => p.uuid === connectedUuid).isConnected, true)
    assert.equal(players.find((p) => p.uuid === disconnectedUuid).isConnected, false)
    assert.equal(players.find((p) => p.uuid === missingUuid).isConnected, false)
})

test('get_session_snapshot: 반복 요청은 deep-equal하고 canonical registry 상태를 바꾸지 않는다(멱등)', () => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-idempotent' })
    const [uuid] = uuids
    const socket = socketByUuid.get(uuid)
    const beforeState = gameSessionCore.__getStateSnapshotForTests()

    const first = countingCallback()
    handleGetSessionSnapshot(io, socket, uuid, { gameId: session.id }, first.callback)
    const afterFirstState = gameSessionCore.__getStateSnapshotForTests()

    const second = countingCallback()
    handleGetSessionSnapshot(io, socket, uuid, { gameId: session.id }, second.callback)
    const afterSecondState = gameSessionCore.__getStateSnapshotForTests()

    assert.deepEqual(first.getResponse(), second.getResponse())
    assert.notEqual(first.getResponse(), second.getResponse())
    assert.deepEqual(beforeState, afterFirstState)
    assert.deepEqual(afterFirstState, afterSecondState)
})

test('get_session_snapshot: 첫 ack 응답 객체를 변형해도 canonical session과 재요청 결과는 오염되지 않는다(defensive copy)', () => {
    const { session, io, uuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-defcopy' })
    const [uuid, otherUuid] = uuids
    const socket = socketByUuid.get(uuid)

    const first = countingCallback()
    handleGetSessionSnapshot(io, socket, uuid, { gameId: session.id }, first.callback)
    const response1 = first.getResponse()
    response1.players.find((p) => p.uuid === otherUuid).isAlive = false
    response1.players.find((p) => p.uuid === otherUuid).isConnected = false
    response1.self.hasActedThisPhase = true
    response1.players.push({ uuid: 'forged', nickname: 'forged', isAlive: true, isConnected: true })

    assert.equal(session.players.get(otherUuid).alive, true)
    assert.equal(session.players.has('forged'), false)

    const second = countingCallback()
    handleGetSessionSnapshot(io, socket, uuid, { gameId: session.id }, second.callback)
    const response2 = second.getResponse()
    assert.equal(response2.players.find((p) => p.uuid === otherUuid).isAlive, true)
    assert.equal(response2.players.length, session.players.size)
})

test('get_session_snapshot: self 블록은 요청자 본인의 정보만 담고, 다른 참가자로 요청하면 self가 그 참가자 자신으로 바뀐다', () => {
    const { session, io, jokerUuid, citizenUuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-selfonly' })
    const [citizenA] = citizenUuids

    const jokerAck = countingCallback()
    handleGetSessionSnapshot(io, socketByUuid.get(jokerUuid), jokerUuid, { gameId: session.id }, jokerAck.callback)
    const citizenAck = countingCallback()
    handleGetSessionSnapshot(io, socketByUuid.get(citizenA), citizenA, { gameId: session.id }, citizenAck.callback)

    assert.equal(jokerAck.getResponse().self.uuid, jokerUuid)
    assert.equal(jokerAck.getResponse().self.role, 'JOKER')
    assert.equal(citizenAck.getResponse().self.uuid, citizenA)
    assert.equal(citizenAck.getResponse().self.role, 'CITIZEN')
    assert.notEqual(jokerAck.getResponse().self.uuid, citizenAck.getResponse().self.uuid)
})

test('get_session_snapshot: TRIBUNAL 유죄 처형으로 CITIZEN 승리 — 소켓 계층 ack에도 nightResult/dayVoteResolution/tribunal/winResult가 전부 포함되고 비밀 데이터가 없다', () => {
    const { session, io, jokerUuid, citizenUuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-sock-tribunal-end' })
    const [citizenA, citizenB, citizenC] = citizenUuids

    const nightOutcome = resolveJokerOnlyNightDirect(session, jokerUuid, null) // 아무도 죽지 않음
    assert.deepEqual(nightOutcome, { ok: true, victimUuid: null, terminal: null })
    assert.equal(session.phase, 'DAY')

    const dayOutcome = resolveDayVotesDirect(session, {
        [citizenA]: jokerUuid, [jokerUuid]: citizenA, [citizenB]: jokerUuid, [citizenC]: jokerUuid,
    })
    assert.deepEqual(dayOutcome, { ok: true })
    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(session.tribunal.defendantUuid, jokerUuid)

    const tribunalOutcome = resolveTribunalVotesDirect(session, { [citizenA]: 'GUILTY', [citizenB]: 'GUILTY', [citizenC]: 'GUILTY' })
    assert.deepEqual(tribunalOutcome, { ok: true, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')

    const { callback, getResponse } = countingCallback()
    handleGetSessionSnapshot(io, socketByUuid.get(citizenA), citizenA, { gameId: session.id }, callback)
    const snapshot = getResponse()

    assert.deepEqual(
        Object.keys(snapshot).sort(),
        ['dayIndex', 'dayVoteResolution', 'gameId', 'nightResult', 'ok', 'phase', 'players', 'self', 'tribunal', 'winResult'],
    )
    // ENDED 하이드레이션에는 전원 공개 목록(reveals)과 예약된 mvp 슬롯이 함께 온다 — 방송을
    // 놓친 재접속 클라이언트도 같은 결과 화면을 만들 수 있어야 하기 때문이다.
    assert.equal(snapshot.winResult.winner, 'CITIZEN')
    assert.equal(snapshot.winResult.mvp, null)
    assert.deepEqual(Object.keys(snapshot.winResult).sort(), ['mvp', 'reveals', 'winner'])
    assert.deepEqual(snapshot.winResult.reveals, expectedRevealsOf(session))
    assert.equal(snapshot.winResult.reveals.find((r) => r.uuid === jokerUuid).role, 'JOKER')
    assert.equal(snapshot.tribunal.executedUuid, jokerUuid)
    // reveals 밖의 어떤 위치에서도 다른 참가자의 role이 새지 않는다(경로 예외는 이 서브트리뿐).
    assertNoForbiddenPrivateData(snapshot, collectOtherPlayerRoleSecrets(session, citizenA))
    assert.equal(io.broadcasts.length, 0)
})

test('get_session_snapshot: NIGHT→DAY→TRIBUNAL(무죄)→post-tribunal NIGHT→night-kill ENDED(JOKER 승리) 전체 진행에서 소켓 계층 ack도 매 단계 top-level 키 집합이 정확하다', () => {
    const { session, io, jokerUuid, citizenUuids, socketByUuid } = commitFourPlayerSessionWithSocketsAtNight({ id: 'room-snap-sock-progress' })
    const [citizenA, citizenB, citizenC] = citizenUuids

    // --- 1) 활성 NIGHT ---
    const nightAck = countingCallback()
    handleGetSessionSnapshot(io, socketByUuid.get(jokerUuid), jokerUuid, { gameId: session.id }, nightAck.callback)
    const nightSnapshot = nightAck.getResponse()
    assert.equal(nightSnapshot.ok, true)
    assert.deepEqual(Object.keys(nightSnapshot).sort(), ['dayIndex', 'gameId', 'ok', 'phase', 'players', 'self'])
    assert.equal(nightSnapshot.phase, 'NIGHT')
    assertNoForbiddenPrivateData(nightSnapshot, collectOtherPlayerRoleSecrets(session, jokerUuid))

    const nightOutcome = resolveJokerOnlyNightDirect(session, jokerUuid, citizenA)
    assert.deepEqual(nightOutcome, { ok: true, victimUuid: citizenA, terminal: null })
    assert.equal(session.phase, 'DAY')

    // --- 2) 활성 DAY ---
    const dayAck = countingCallback()
    handleGetSessionSnapshot(io, socketByUuid.get(citizenB), citizenB, { gameId: session.id }, dayAck.callback)
    const daySnapshot = dayAck.getResponse()
    assert.deepEqual(Object.keys(daySnapshot).sort(), ['dayIndex', 'gameId', 'nightResult', 'ok', 'phase', 'players', 'self'])
    assert.deepEqual(daySnapshot.nightResult, {
        dayIndex: session.dayIndex,
        victimUuid: citizenA,
        deathReveals: [{ victimUuid: citizenA, source: 'JOKER' }],
    })
    assertNoForbiddenPrivateData(daySnapshot, collectOtherPlayerRoleSecrets(session, citizenB))

    const dayOutcome = resolveDayVotesDirect(session, { [jokerUuid]: citizenB, [citizenC]: citizenB, [citizenB]: jokerUuid })
    assert.deepEqual(dayOutcome, { ok: true })
    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(session.tribunal.defendantUuid, citizenB)

    // --- 3) 활성 TRIBUNAL(판정 전) ---
    const tribunalAck = countingCallback()
    handleGetSessionSnapshot(io, socketByUuid.get(jokerUuid), jokerUuid, { gameId: session.id }, tribunalAck.callback)
    const tribunalSnapshot = tribunalAck.getResponse()
    assert.deepEqual(
        Object.keys(tribunalSnapshot).sort(),
        ['dayIndex', 'dayVoteResolution', 'gameId', 'nightResult', 'ok', 'phase', 'players', 'self', 'tribunal'],
    )
    assert.deepEqual(tribunalSnapshot.tribunal, { defendantUuid: citizenB, resolved: false })
    assertNoForbiddenPrivateData(tribunalSnapshot, collectOtherPlayerRoleSecrets(session, jokerUuid))

    const tribunalOutcome = resolveTribunalVotesDirect(session, { [jokerUuid]: 'NOT_GUILTY', [citizenC]: 'NOT_GUILTY' })
    assert.deepEqual(tribunalOutcome, { ok: true, terminal: null })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.players.get(citizenB).alive, true)

    // --- 4) post-tribunal NIGHT(필수 회귀) — dayVoteResolution/tribunal의 dayIndex가 여전히
    // session.dayIndex와 수치상 일치해도 phase가 NIGHT이면 제외돼야 한다.
    assert.equal(session.dayVoteResolution.dayIndex, session.dayIndex)
    assert.equal(session.tribunal.dayIndex, session.dayIndex)
    const postTribunalAck = countingCallback()
    handleGetSessionSnapshot(io, socketByUuid.get(citizenB), citizenB, { gameId: session.id }, postTribunalAck.callback)
    const postTribunalSnapshot = postTribunalAck.getResponse()
    assert.deepEqual(Object.keys(postTribunalSnapshot).sort(), ['dayIndex', 'gameId', 'ok', 'phase', 'players', 'self'])
    assert.equal(Object.hasOwn(postTribunalSnapshot, 'nightResult'), false)
    assert.equal(Object.hasOwn(postTribunalSnapshot, 'dayVoteResolution'), false)
    assert.equal(Object.hasOwn(postTribunalSnapshot, 'tribunal'), false)

    // --- 5) night-kill ENDED(필수 회귀, JOKER 승리) ---
    const nightKillOutcome = resolveJokerOnlyNightDirect(session, jokerUuid, citizenC)
    assert.deepEqual(nightKillOutcome, { ok: true, victimUuid: citizenC, terminal: { winner: 'JOKER' } })
    assert.equal(session.phase, 'ENDED')

    const endedAck = countingCallback()
    handleGetSessionSnapshot(io, socketByUuid.get(citizenB), citizenB, { gameId: session.id }, endedAck.callback)
    const endedSnapshot = endedAck.getResponse()
    assert.deepEqual(
        Object.keys(endedSnapshot).sort(),
        ['dayIndex', 'gameId', 'nightResult', 'ok', 'phase', 'players', 'self', 'winResult'],
    )
    assert.deepEqual(endedSnapshot.nightResult, {
        dayIndex: session.dayIndex,
        victimUuid: citizenC,
        deathReveals: [{ victimUuid: citizenC, source: 'JOKER' }],
    })
    assert.equal(endedSnapshot.winResult.winner, 'JOKER')
    assert.equal(endedSnapshot.winResult.mvp, null)
    assert.deepEqual(endedSnapshot.winResult.reveals, expectedRevealsOf(session))
    // 진행 중이던 앞선 단계(1~4)의 ack에는 winResult 키 자체가 없었다(위 top-level 키 집합 단정) —
    // 공개는 오직 ENDED 이후에만 일어난다.
    assert.equal(Object.hasOwn(endedSnapshot, 'dayVoteResolution'), false)
    assert.equal(Object.hasOwn(endedSnapshot, 'tribunal'), false)
    assertNoForbiddenPrivateData(endedSnapshot, collectOtherPlayerRoleSecrets(session, citizenB))
    assert.equal(io.broadcasts.length, 0)
})
