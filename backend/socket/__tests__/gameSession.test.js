const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
const { createFakeSocket, createFakeIo, countingCallback, setupReadyRoomForStart } = require('./testHelpers/matchmakingFixtures')

const { handleCreateRoom, handleJoinRoomByCode, handleSetReady, handleStartGame } = matchmaking.__testables
const { handleAcknowledgeRoleReveal, handleSubmitNightAction } = gameSessionSocketLayer.__testables

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
    const { session, io } = commitSessionWithPlayers(['v1', 'v2'])
    await gameSessionSocketLayer.onDisconnect(io, 'v1') // 세션 전체 종료(정책 확정)

    const { callback, getResponse } = countingCallback()
    handleAcknowledgeRoleReveal(io, null, 'v2', { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'NOT_IN_SESSION', message: '요청을 처리할 수 없습니다.' })
    assert.equal(io.broadcasts.filter((b) => b.event === 'game_phase_changed').length, 0)
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
