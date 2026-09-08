// 세션 생명주기 계약: 입력 검증·커밋·ROLE_REVEAL→DAY 전이·종료·재접속 스냅샷·3채널 채팅.

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const {
    enterDayPhase,
    validateSessionInput,
    buildSessionCandidate,
    checkGameSessionPreconditions,
    assertValidSessionForCommit,
    sanitizeJokerChatText,
    __deleteGameSessionOnlyForTests,
} = gameSession.__testables
const {
    prepareGameSession,
    commitGameSession,
    buildGameStartedPayload,
    endGameSessionForPlayer,
    acknowledgeRoleReveal,
    buildPhaseChangedPayload,
    acknowledgeDayVoteReady,
    submitNightAction,
    submitDayVote,
    commitNightResolution,
    buildNightResultAppliedPayload,
    getSessionSnapshotForPlayer,
    buildSessionSnapshot,
    prepareJokerChatMessage,
    commitJokerChatMessage,
    prepareGameChatMessage,
    commitGameChatMessage,
    getChatRecipientUuids,
    CHAT_CHANNELS,
    CHAT_MAX_LENGTH,
    CHAT_MIN_INTERVAL_MS,
    CHAT_COMMIT_MAX_AGE_MS,
    GAME_ROLES,
    ROLE_TEAMS,
} = gameSession
const {
    makePlayer,
    makeRoom,
    validSession,
    commitRoleRevealSession,
    commitFullRoleSessionAtNight,
    commitJokerTrioSessionAtNight,
    nightSessionOf3,
    commitTrioSessionAtDay,
    advanceQuadToRevote,
    buildSnapQuadSession,
    ackAll,
    resolveJokerOnlyNight,
    resolveDayVotes,
    resolveTribunalVotes,
    assertNoForbiddenPrivateData,
    collectOtherPlayerRoleSecrets,
    setupGameChatSession,
    chatRateLimitSnapshot,
    commitPrepared,
    tamperPrepared,
    handBuiltPrepared,
} = require('./gameSession.testUtils')

// 이 파일의 테스트들은 모듈 싱글턴인 gameSessions/playerSession/roomGameSession을 공유하므로,
// 각 테스트가 이전 테스트가 남긴 상태의 영향을 받지 않도록 매번 초기화한다.
test.beforeEach(() => {
    gameSession.__resetStateForTests()
})
// registry 불일치를 의도적으로 재현하는 테스트(예: __deleteGameSessionOnlyForTests)가 이
// 파일의 마지막 테스트로 실행되더라도, beforeEach만으로는 "다음 테스트 시작 전"에만
// 정리된다 — afterEach로 테스트가 끝난 직후에도 즉시 정리해 손상된 singleton 상태가
// 파일 실행 종료 후까지 남지 않게 한다. 테스트 본문에서 예외가 나도 node:test는 afterEach를
// 실행하므로 이 정리는 실패한 테스트 뒤에도 보장된다.
test.afterEach(() => {
    gameSession.__resetStateForTests()
})

// ---------------------------------------------------------------------------
// validateSessionInput / buildSessionCandidate — 입력 검증
// ---------------------------------------------------------------------------

test('validateSessionInput: 빈 players는 EMPTY_PLAYERS로 거부된다', () => {
    const result = validateSessionInput([], 0)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SESSION_INPUT')
    assert.equal(result.reason, 'EMPTY_PLAYERS')
})

test('validateSessionInput: players.length이 1명이면 PLAYER_COUNT_OUT_OF_RANGE로 거부된다', () => {
    const result = validateSessionInput([makePlayer('a')], 0)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'PLAYER_COUNT_OUT_OF_RANGE')
})

test('validateSessionInput: players.length이 11명이면 PLAYER_COUNT_OUT_OF_RANGE로 거부된다', () => {
    const players = Array.from({ length: 11 }, (_, i) => makePlayer(`p${i}`))
    const result = validateSessionInput(players, 0)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'PLAYER_COUNT_OUT_OF_RANGE')
})

test('validateSessionInput: players.length이 2명 또는 10명이면(경계값) 통과한다', () => {
    const twoPlayers = [makePlayer('a'), makePlayer('b')]
    assert.deepEqual(validateSessionInput(twoPlayers, 0), { ok: true })

    const tenPlayers = Array.from({ length: 10 }, (_, i) => makePlayer(`p${i}`))
    assert.deepEqual(validateSessionInput(tenPlayers, 1), { ok: true })
})

test('validateSessionInput: players 값 내부 uuid 중복은 DUPLICATE_UUID로 거부된다', () => {
    const result = validateSessionInput([makePlayer('a'), makePlayer('a')], 0)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'DUPLICATE_UUID')
})

test('validateSessionInput: uuid 누락은 INVALID_UUID로 거부된다', () => {
    const result = validateSessionInput([{ nickname: 'x' }, makePlayer('b')], 0)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'INVALID_UUID')
})

test('validateSessionInput: uuid가 빈 문자열이면 INVALID_UUID로 거부된다', () => {
    const result = validateSessionInput([{ uuid: '', nickname: 'x' }, makePlayer('b')], 0)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'INVALID_UUID')
})

test('validateSessionInput: nickname 누락은 INVALID_NICKNAME으로 거부된다', () => {
    const result = validateSessionInput([{ uuid: 'a' }, makePlayer('b')], 0)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'INVALID_NICKNAME')
})

test('validateSessionInput: nickname이 공백뿐인 문자열이면 INVALID_NICKNAME으로 거부된다', () => {
    const result = validateSessionInput([{ uuid: 'a', nickname: '   ' }, makePlayer('b')], 0)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'INVALID_NICKNAME')
})

test('validateSessionInput: jokerCount가 정수가 아니면 INVALID_JOKER_COUNT로 거부된다', () => {
    const players = [makePlayer('a'), makePlayer('b')]
    assert.equal(validateSessionInput(players, 0.5).reason, 'INVALID_JOKER_COUNT')
    assert.equal(validateSessionInput(players, '1').reason, 'INVALID_JOKER_COUNT')
})

test('validateSessionInput: jokerCount가 음수면 INVALID_JOKER_COUNT로 거부된다', () => {
    const players = [makePlayer('a'), makePlayer('b')]
    assert.equal(validateSessionInput(players, -1).reason, 'INVALID_JOKER_COUNT')
})

test('validateSessionInput: jokerCount >= players.length이면 JOKER_COUNT_TOO_HIGH로 거부된다', () => {
    const players = [makePlayer('a'), makePlayer('b')]
    const result = validateSessionInput(players, 2)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'JOKER_COUNT_TOO_HIGH')
})

test('validateSessionInput: 정상 입력은 통과한다', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c')]
    assert.deepEqual(validateSessionInput(players, 1), { ok: true })
})

test('buildSessionCandidate: 입력 검증 실패 시 session 필드 자체가 없다(Map이 만들어지지 않음)', () => {
    const room = makeRoom({ players: [], jokerCount: 0 })
    const result = buildSessionCandidate(room)
    assert.equal(result.ok, false)
    assert.equal(Object.hasOwn(result, 'session'), false)
})

test('buildSessionCandidate: 정상 입력은 참가자 전원을 포함한 candidate를 만든다', () => {
    const room = makeRoom()
    const result = buildSessionCandidate(room, { randomFn: () => 0.999 })
    assert.equal(result.ok, true)
    assert.equal(result.session.players.size, 3)
    assert.equal(result.session.roomId, 'room-1')
    assert.equal(result.session.channelId, 'room-1')
    assert.equal(result.session.phase, 'ROLE_REVEAL')
    assert.equal(result.session.dayIndex, 0)
    assert.equal(result.session.jokerCount, 1)
})

test('buildSessionCandidate: gameIdFn을 주입하면 그 값을 그대로 쓰고, 기본값은 매 호출 다른 id를 만든다', () => {
    const room = makeRoom()
    const injected = buildSessionCandidate(room, { gameIdFn: () => 'fixed-id' })
    assert.equal(injected.session.id, 'fixed-id')

    const a = buildSessionCandidate(makeRoom({ id: 'room-a' }))
    const b = buildSessionCandidate(makeRoom({ id: 'room-b' }))
    assert.notEqual(a.session.id, b.session.id)
})

test('buildSessionCandidate: 어떤 registry Map도 건드리지 않는다', () => {
    const before = gameSession.__getStateSnapshotForTests()
    buildSessionCandidate(makeRoom())
    const after = gameSession.__getStateSnapshotForTests()
    assert.deepEqual(after, before)
})

// ---------------------------------------------------------------------------
// checkGameSessionPreconditions
// ---------------------------------------------------------------------------

test('checkGameSessionPreconditions: 정상 Room은 통과한다', () => {
    assert.deepEqual(checkGameSessionPreconditions(makeRoom()), { ok: true })
})

test('checkGameSessionPreconditions: 이미 활성 GameSession이 있는 roomId는 DUPLICATE_ROOM_SESSION으로 거부된다', () => {
    const room = makeRoom({ id: 'room-dup' })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const result = checkGameSessionPreconditions(room)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'DUPLICATE_ROOM_SESSION')
})

test('checkGameSessionPreconditions: 참가자 중 한 명이라도 이미 다른 세션에 속하면 PLAYER_ALREADY_IN_SESSION으로 거부되고 Map은 불변이다', () => {
    const firstRoom = makeRoom({ id: 'room-first', players: [makePlayer('shared'), makePlayer('x')] })
    commitGameSession(buildSessionCandidate(firstRoom).session)

    const secondRoom = makeRoom({ id: 'room-second', players: [makePlayer('shared'), makePlayer('y'), makePlayer('z')] })
    const before = gameSession.__getStateSnapshotForTests()
    const result = checkGameSessionPreconditions(secondRoom)
    const after = gameSession.__getStateSnapshotForTests()

    assert.equal(result.ok, false)
    assert.equal(result.code, 'PLAYER_ALREADY_IN_SESSION')
    assert.deepEqual(after, before)
})

// ---------------------------------------------------------------------------
// commitGameSession — 정상 경로 + registry 재검증
// ---------------------------------------------------------------------------

test('commitGameSession: 정상 케이스에서 3개 Map이 정확히 반영된다', () => {
    const room = makeRoom({ id: 'room-commit' })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const snapshot = gameSession.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.length, 1)
    assert.equal(snapshot.roomGameSession.some(([roomId, gameId]) => roomId === 'room-commit' && gameId === candidate.session.id), true)
    assert.equal(snapshot.playerSession.length, 3)
})

test('commitGameSession: 이미 커밋된 session.id로 다시 호출하면 throw하고 어떤 Map도 바뀌지 않는다', () => {
    const room = makeRoom({ id: 'room-x' })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const before = gameSession.__getStateSnapshotForTests()
    assert.throws(() => commitGameSession(candidate.session))
    const after = gameSession.__getStateSnapshotForTests()
    assert.deepEqual(after, before)
})

test('commitGameSession: 이미 활성 세션이 있는 roomId로 다시 호출하면 throw하고 Map이 불변이다', () => {
    const room = makeRoom({ id: 'room-y' })
    commitGameSession(buildSessionCandidate(room).session)

    const otherCandidate = buildSessionCandidate(makeRoom({ id: 'room-y', players: [makePlayer('n1'), makePlayer('n2')] }))
    // roomId를 강제로 충돌시킨다(정상 흐름에서는 checkGameSessionPreconditions가 먼저 막지만,
    // commitGameSession 자체의 재검증을 단위 테스트로 직접 확인한다).
    otherCandidate.session.roomId = 'room-y'
    otherCandidate.session.channelId = 'room-y'

    const before = gameSession.__getStateSnapshotForTests()
    assert.throws(() => commitGameSession(otherCandidate.session))
    const after = gameSession.__getStateSnapshotForTests()
    assert.deepEqual(after, before)
})

test('commitGameSession: 참가자 uuid가 이미 다른 세션에 속하면 throw하고 Map이 불변이다', () => {
    commitGameSession(buildSessionCandidate(makeRoom({ id: 'room-z1', players: [makePlayer('shared2'), makePlayer('p1')] })).session)

    const candidate = buildSessionCandidate(makeRoom({ id: 'room-z2', players: [makePlayer('shared2'), makePlayer('p2'), makePlayer('p3')] }))

    const before = gameSession.__getStateSnapshotForTests()
    assert.throws(() => commitGameSession(candidate.session))
    const after = gameSession.__getStateSnapshotForTests()
    assert.deepEqual(after, before)
})

// ---------------------------------------------------------------------------
// acknowledgeRoleReveal / buildPhaseChangedPayload — ROLE_REVEAL → DAY 1 전이
// ---------------------------------------------------------------------------

test('acknowledgeRoleReveal: 2인 세션에서 1명만 확인하면 전이하지 않는다', () => {
    const room = makeRoom({ id: 'room-ack-1', players: [makePlayer('a1'), makePlayer('a2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const result = acknowledgeRoleReveal('a1', candidate.session.id)

    assert.equal(result.ok, true)
    assert.equal(result.transitioned, false)
    assert.equal(candidate.session.phase, 'ROLE_REVEAL')
})

test('acknowledgeRoleReveal: 전원(2인)이 확인하면 마지막 호출에서만 DAY로 전이하고 dayIndex는 정확히 1이다', () => {
    const room = makeRoom({ id: 'room-ack-2', players: [makePlayer('b1'), makePlayer('b2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const first = acknowledgeRoleReveal('b1', candidate.session.id)
    assert.equal(first.transitioned, false)
    assert.equal(candidate.session.phase, 'ROLE_REVEAL')
    assert.equal(candidate.session.dayIndex, 0)

    const second = acknowledgeRoleReveal('b2', candidate.session.id)
    assert.equal(second.transitioned, true)
    assert.equal(candidate.session.phase, 'DAY')
    assert.equal(candidate.session.dayIndex, 1)
})

test('acknowledgeRoleReveal: 3인 세션은 세 번째 확인에서만 전이한다', () => {
    const room = makeRoom({ id: 'room-ack-3', players: [makePlayer('c1'), makePlayer('c2'), makePlayer('c3')], jokerCount: 1 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    assert.equal(acknowledgeRoleReveal('c1', candidate.session.id).transitioned, false)
    assert.equal(acknowledgeRoleReveal('c2', candidate.session.id).transitioned, false)
    assert.equal(acknowledgeRoleReveal('c3', candidate.session.id).transitioned, true)
})

test('acknowledgeRoleReveal: 같은 uuid가 완료 전 두 번 확인해도 멱등하고 재전이 카운트에 영향 없다', () => {
    const room = makeRoom({ id: 'room-ack-4', players: [makePlayer('d1'), makePlayer('d2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const first = acknowledgeRoleReveal('d1', candidate.session.id)
    const second = acknowledgeRoleReveal('d1', candidate.session.id)

    assert.deepEqual(first, { ok: true, transitioned: false, session: candidate.session })
    assert.deepEqual(second, { ok: true, transitioned: false, session: candidate.session })
    assert.equal(candidate.session.roleRevealAcks.size, 1)
    assert.equal(candidate.session.phase, 'ROLE_REVEAL')
})

test('acknowledgeRoleReveal: playerSession에 없는 uuid는 NOT_IN_SESSION이고 상태가 불변이다', () => {
    const room = makeRoom({ id: 'room-ack-5', players: [makePlayer('e1'), makePlayer('e2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const result = acknowledgeRoleReveal('no-such-uuid', candidate.session.id)

    assert.deepEqual(result, { ok: false, code: 'NOT_IN_SESSION' })
    assert.equal(candidate.session.roleRevealAcks.size, 0)
})

test('acknowledgeRoleReveal: 자신의 실제 세션과 다른 gameId는 STALE_SESSION_MISMATCH이고 상태가 불변이다', () => {
    const room = makeRoom({ id: 'room-ack-6', players: [makePlayer('f1'), makePlayer('f2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const result = acknowledgeRoleReveal('f1', 'not-the-real-game-id')

    assert.deepEqual(result, { ok: false, code: 'STALE_SESSION_MISMATCH' })
    assert.equal(candidate.session.roleRevealAcks.size, 0)
})

test('acknowledgeRoleReveal: gameId가 빈 문자열/공백만이면 INVALID_GAME_ID이고 상태가 불변이다', () => {
    const room = makeRoom({ id: 'room-ack-7', players: [makePlayer('g1'), makePlayer('g2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    assert.deepEqual(acknowledgeRoleReveal('g1', ''), { ok: false, code: 'INVALID_GAME_ID' })
    assert.deepEqual(acknowledgeRoleReveal('g1', '   '), { ok: false, code: 'INVALID_GAME_ID' })
    assert.equal(candidate.session.roleRevealAcks.size, 0)
})

test('acknowledgeRoleReveal: 이미 DAY인 세션에 확인하면 INVALID_PHASE이고 재전이하지 않는다', () => {
    const room = makeRoom({ id: 'room-ack-8', players: [makePlayer('h1'), makePlayer('h2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    acknowledgeRoleReveal('h1', candidate.session.id)
    acknowledgeRoleReveal('h2', candidate.session.id) // 여기서 이미 DAY로 전이됨

    const result = acknowledgeRoleReveal('h1', candidate.session.id)

    assert.deepEqual(result, { ok: false, code: 'INVALID_PHASE' })
    assert.equal(candidate.session.phase, 'DAY')
    assert.equal(candidate.session.dayIndex, 1)
})

test('acknowledgeRoleReveal: registry 불일치(playerSession엔 있지만 gameSessions엔 없음)는 SESSION_NOT_FOUND이고 상태가 불변이다', () => {
    const room = makeRoom({ id: 'room-ack-9', players: [makePlayer('i1'), makePlayer('i2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    __deleteGameSessionOnlyForTests(candidate.session.id)

    const result = acknowledgeRoleReveal('i1', candidate.session.id)

    assert.deepEqual(result, { ok: false, code: 'SESSION_NOT_FOUND' })
    // 다음 테스트는 test.beforeEach의 __resetStateForTests()로 격리되므로 여기서 남긴 불일치
    // 상태(playerSession에만 남은 항목)가 새어나가지 않는다.
})

test('acknowledgeRoleReveal: registry 불일치(세션은 있지만 players에 uuid가 없음)는 NOT_A_PARTICIPANT이고 상태가 불변이다', () => {
    const room = makeRoom({ id: 'room-ack-10', players: [makePlayer('j1'), makePlayer('j2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    candidate.session.players.delete('j1') // playerSession엔 여전히 j1→gameId가 남아있는 불일치를 재현

    const result = acknowledgeRoleReveal('j1', candidate.session.id)

    assert.deepEqual(result, { ok: false, code: 'NOT_A_PARTICIPANT' })
})

test('buildPhaseChangedPayload: 결과 키가 정확히 {gameId, phase, dayIndex} 셋뿐이고 players/self/role은 없다', () => {
    const room = makeRoom({ id: 'room-ack-11', players: [makePlayer('k1'), makePlayer('k2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    acknowledgeRoleReveal('k1', candidate.session.id)
    acknowledgeRoleReveal('k2', candidate.session.id)

    const payload = buildPhaseChangedPayload(candidate.session)

    assert.deepEqual(Object.keys(payload).sort(), ['dayIndex', 'gameId', 'phase'])
    assert.deepEqual(payload, { gameId: candidate.session.id, phase: 'DAY', dayIndex: 1 })
})

// --- 슬라이스 1: GAME START → ROLE_REVEAL → 전원 확인 → DAY 1 ---

test('슬라이스1: 마지막 한 명이 확인하기 전까지 세션은 ROLE_REVEAL에 그대로 머문다', () => {
    const uuids = ['s1a', 's1b', 's1c', 's1d']
    const session = commitRoleRevealSession({ id: 'room-slice1-pending', uuids })

    for (const uuid of uuids.slice(0, uuids.length - 1)) {
        const result = acknowledgeRoleReveal(uuid, session.id)
        assert.equal(result.ok, true)
        assert.equal(result.transitioned, false)
        assert.equal(session.phase, 'ROLE_REVEAL')
        assert.equal(session.dayIndex, 0)
    }

    assert.equal(session.roleRevealAcks.size, uuids.length - 1)
    assert.equal(session.phase, 'ROLE_REVEAL')
    assert.equal(session.dayIndex, 0)
})

test('슬라이스1: 마지막 유효 확인 하나만 DAY로 전이하고(transitioned:true는 정확히 1회) dayIndex는 정확히 1이다', () => {
    const uuids = ['s2a', 's2b', 's2c', 's2d']
    const session = commitRoleRevealSession({ id: 'room-slice1-final', uuids })

    const transitions = uuids.map((uuid) => acknowledgeRoleReveal(uuid, session.id))

    assert.deepEqual(
        transitions.map((r) => r.transitioned),
        [false, false, false, true],
    )
    assert.equal(transitions.filter((r) => r.transitioned === true).length, 1)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
})

test('슬라이스1: 초기 DAY 상태 — dayVotes/nightActions는 빈 Map, tribunal/dayVoteResolution/nightResolution은 null이다', () => {
    const uuids = ['s3a', 's3b', 's3c', 's3d']
    const session = commitRoleRevealSession({ id: 'room-slice1-state', uuids })
    const dayVotesBefore = session.dayVotes

    for (const uuid of uuids) acknowledgeRoleReveal(uuid, session.id)

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.ok(session.dayVotes instanceof Map)
    assert.equal(session.dayVotes.size, 0)
    // 이전 DAY의 표를 이어받지 않는다는 계약대로, 매 DAY 진입은 새 Map을 놓는다.
    assert.notEqual(session.dayVotes, dayVotesBefore)
    assert.ok(session.nightActions instanceof Map)
    assert.equal(session.nightActions.size, 0)
    assert.equal(session.nightResolution, null)
    assert.equal(session.dayVoteResolution, null)
    assert.equal(session.tribunal, null)
    // 초기 DAY는 토론부터 시작하고 준비 집합은 비어 있다.
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')
    assert.ok(session.dayVoteReadyUuids instanceof Set)
    assert.equal(session.dayVoteReadyUuids.size, 0)
    // 초기 DAY의 스냅샷에는 낮/재판/밤 결과 필드가 하나도 실리지 않는다(하위 구간만 실린다).
    const snapshot = getSessionSnapshotForPlayer('s3a', session.id).snapshot
    assert.deepEqual(Object.keys(snapshot).sort(), ['dayIndex', 'dayPhase', 'gameId', 'phase', 'players', 'self'])
    assert.equal(snapshot.dayPhase, 'DAY_DISCUSSION')
})

test('슬라이스1: 초기 DAY 진입은 NIGHT→DAY 전이와 동일한 canonical 헬퍼(enterDayPhase)만 사용한다', () => {
    // 헬퍼 자체의 계약: phase=DAY · dayIndex 정확히 +1 · dayVotes를 새 빈 Map으로 교체하고,
    // 그 외 필드는 건드리지 않는다. 두 진입점(acknowledgeRoleReveal / commitNightResolution)이
    // 모두 이 함수만 호출하므로 부분 초기화된 DAY가 생길 수 없다.
    const tribunalMarker = { candidateId: 'x', dayIndex: 3, defendantUuid: 'x', votes: new Map() }
    const nightActionsMarker = new Map([['u1', null]])
    const session = {
        phase: 'NIGHT',
        dayIndex: 4,
        dayVotes: new Map([['stale', 'vote']]),
        nightActions: nightActionsMarker,
        nightResolution: { dayIndex: 4 },
        dayVoteResolution: { dayIndex: 4 },
        tribunal: tribunalMarker,
    }

    enterDayPhase(session)

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 5)
    assert.equal(session.dayVotes.size, 0)
    assert.equal(session.nightActions, nightActionsMarker)
    assert.deepEqual(session.nightResolution, { dayIndex: 4 })
    assert.deepEqual(session.dayVoteResolution, { dayIndex: 4 })
    assert.equal(session.tribunal, tribunalMarker)
})

test('슬라이스1: 중복·반복·전이 이후 확인은 DAY를 재초기화하지 않고 dayIndex를 올리지 않는다(멱등)', () => {
    const uuids = ['s4a', 's4b', 's4c']
    const session = commitRoleRevealSession({ id: 'room-slice1-idempotent', uuids })

    // 전이 전 중복 확인: 같은 uuid가 두 번 확인해도 acks는 하나로만 센다.
    assert.equal(acknowledgeRoleReveal('s4a', session.id).transitioned, false)
    assert.equal(acknowledgeRoleReveal('s4a', session.id).transitioned, false)
    assert.equal(session.roleRevealAcks.size, 1)
    assert.equal(session.phase, 'ROLE_REVEAL')

    assert.equal(acknowledgeRoleReveal('s4b', session.id).transitioned, false)
    assert.equal(acknowledgeRoleReveal('s4c', session.id).transitioned, true)

    const dayVotesAfterTransition = session.dayVotes
    session.dayVotes.set('s4a', null) // 이 DAY에서 실제로 접수된 표

    // 전이 이후의 모든 확인(중복·미확인자 없음·비참가자)은 상태를 전혀 바꾸지 않는다.
    for (const uuid of uuids) {
        assert.deepEqual(acknowledgeRoleReveal(uuid, session.id), { ok: false, code: 'INVALID_PHASE' })
    }
    assert.deepEqual(acknowledgeRoleReveal('not-a-member', session.id), { ok: false, code: 'NOT_IN_SESSION' })

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.dayVotes, dayVotesAfterTransition) // 새 Map으로 덮어쓰이지 않았다
    assert.equal(session.dayVotes.get('s4a'), null)
    assert.equal(session.roleRevealAcks.size, uuids.length)
})

test('슬라이스1: 마지막 확인이 동시에 두 번 들어와도 DAY 전이는 정확히 한 번뿐이다', () => {
    const uuids = ['s5a', 's5b']
    const session = commitRoleRevealSession({ id: 'room-slice1-concurrent', uuids, jokerCount: 0 })
    acknowledgeRoleReveal('s5a', session.id)

    // 동기 함수라 "동시"는 곧 연속 호출이다 — 두 번째 호출은 이미 DAY인 세션에 도달한다.
    const first = acknowledgeRoleReveal('s5b', session.id)
    const second = acknowledgeRoleReveal('s5b', session.id)

    assert.equal(first.transitioned, true)
    assert.deepEqual(second, { ok: false, code: 'INVALID_PHASE' })
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
})

test('슬라이스1: 초기 DAY에서 생존자의 DAY 투표와 공개 채팅은 통과하고 NIGHT 행동은 거부된다', () => {
    const uuids = ['s6a', 's6b', 's6c']
    const session = commitRoleRevealSession({ id: 'room-slice1-guards', uuids })
    for (const uuid of uuids) acknowledgeRoleReveal(uuid, session.id)
    assert.equal(session.phase, 'DAY')

    // 토론 구간에서는 투표를 받지 않는다 — 생존자 전원이 준비를 마쳐야 투표가 열린다.
    assert.deepEqual(submitDayVote('s6a', session.id, 's6b'), { ok: false, code: 'INVALID_DAY_PHASE' })
    assert.equal(session.dayVotes.size, 0)
    for (const uuid of uuids) acknowledgeDayVoteReady(uuid, session.id)
    assert.equal(session.dayPhase, 'DAY_VOTE')

    // DAY 투표: 생존자 → 생존 대상
    assert.deepEqual(submitDayVote('s6a', session.id, 's6b'), { ok: true })
    assert.equal(session.dayVotes.get('s6a'), 's6b')

    // 생존자의 공개 DAY 채팅: canonical 채널 라우팅이 DAY로 해석된다(하위 구간과 무관하게 열려 있다).
    const prepared = prepareGameChatMessage('s6a', session.id, '안녕하세요', {
        now: () => 1_000_000,
        idFn: () => 'msg-slice1',
    })
    assert.equal(prepared.ok, true)
    assert.equal(prepared.channel, 'DAY')
    assert.equal(prepared.dayIndex, 1)

    // NIGHT 전용 행동은 phase 가드에서 거부된다(역할과 무관).
    for (const uuid of uuids) {
        assert.deepEqual(submitNightAction(uuid, session.id, null), { ok: false, code: 'INVALID_PHASE' })
    }
    assert.equal(session.nightActions.size, 0)
})

test('슬라이스1: 초기 DAY 재접속 스냅샷은 DAY/dayIndex 1과 요청자 본인 역할만 복원한다', () => {
    const uuids = ['s7a', 's7b', 's7c']
    const session = commitRoleRevealSession({ id: 'room-slice1-snapshot', uuids })
    for (const uuid of uuids) acknowledgeRoleReveal(uuid, session.id)

    const result = getSessionSnapshotForPlayer('s7a', session.id)

    assert.equal(result.ok, true)
    assert.equal(result.snapshot.phase, 'DAY')
    assert.equal(result.snapshot.dayIndex, 1)
    assert.equal(result.snapshot.self.uuid, 's7a')
    assert.equal(result.snapshot.self.role, session.players.get('s7a').role)
    assert.equal(result.snapshot.self.hasActedThisPhase, false) // 아직 이 DAY에 투표하지 않았다
    for (const player of result.snapshot.players) {
        assert.deepEqual(Object.keys(player).sort(), ['isAlive', 'nickname', 'themeIndex', 'uuid'])
        assert.equal(Number.isInteger(player.themeIndex), true)
    }
    assertNoForbiddenPrivateData(result.snapshot, collectOtherPlayerRoleSecrets(session, 's7a'))
})

test('재접속 스냅샷은 game_started와 같은 결정적 플레이어 themeIndex를 공개 roster에 보존한다', () => {
    const uuids = ['s7-theme-a', 's7-theme-b', 's7-theme-c']
    const session = commitRoleRevealSession({ id: 'room-slice1-theme-snapshot', uuids })
    const result = getSessionSnapshotForPlayer(uuids[0], session.id)
    const repeated = getSessionSnapshotForPlayer(uuids[0], session.id)

    assert.equal(result.ok, true)
    assert.deepEqual(result.snapshot.players, repeated.snapshot.players)
    assert.equal(new Set(result.snapshot.players.map((player) => player.themeIndex)).size, uuids.length)
    assert.ok(result.snapshot.players.every((player) => Number.isInteger(player.themeIndex)))
    assertNoForbiddenPrivateData(result.snapshot, collectOtherPlayerRoleSecrets(session, uuids[0]))
})

// ---------------------------------------------------------------------------
// assertValidSessionForCommit — 수동 조립된 malformed session 방어
// ---------------------------------------------------------------------------

const malformedSessionCases = [
    ['session.dayVoteRound 필드 누락', { dayVoteRound: undefined }],
    ['session.dayVoteRound가 재투표 중간값', { dayVoteRound: 2 }],
    ['session.dayVoteExcludedUuids 필드 누락', { dayVoteExcludedUuids: undefined }],
    ['session.dayVoteExcludedUuids가 Set이 아닌 배열', { dayVoteExcludedUuids: [] }],
    ['session.dayVoteExcludedUuids가 처음부터 비어있지 않음', { dayVoteExcludedUuids: new Set(['u1']) }],
    ['session.nightActions 필드 누락', { nightActions: undefined }],
    ['session.nightActions가 Map이 아닌 배열', { nightActions: [] }],
    ['session.nightActions가 Map이 아닌 일반 객체', { nightActions: {} }],
    ['session.nightActions가 처음부터 비어있지 않음', { nightActions: new Map([['u1', null]]) }],
    ['session.id 없음', { id: undefined }],
    ['session.id 빈 문자열', { id: '' }],
    ['session.roomId 없음', { roomId: undefined }],
    ['session.roomId 빈 문자열', { roomId: '' }],
    ['session.players가 Map이 아님', { players: [] }],
    ['session.players가 빈 Map', { players: new Map() }],
    ['channelId가 roomId와 다름', { channelId: 'other-room' }],
    ['phase가 ROLE_REVEAL이 아님', { phase: 'NIGHT' }],
    ['dayIndex가 0이 아님', { dayIndex: 1 }],
    ['jokerCount가 정수가 아님', { jokerCount: 1.5 }],
    ['jokerCount가 음수', { jokerCount: -1 }],
    ['jokerCount가 players.size 이상', { jokerCount: 3 }],
    [
        'session.players.size가 1명(지원 인원 2~10명 밖)',
        {
            jokerCount: 0,
            players: new Map([['u1', { uuid: 'u1', nickname: 'A', role: GAME_ROLES.CITIZEN }]]),
        },
    ],
    [
        'session.players.size가 11명(지원 인원 2~10명 밖)',
        {
            jokerCount: 0,
            players: new Map(
                Array.from({ length: 11 }, (_, i) => [
                    `u${i}`,
                    { uuid: `u${i}`, nickname: `N${i}`, role: GAME_ROLES.CITIZEN },
                ]),
            ),
        },
    ],
    [
        '8명 세션에 DOCTOR 2명·GUARD 0명(기대 구성은 DOCTOR 1·GUARD 1)',
        {
            jokerCount: 1,
            players: new Map([
                ['u1', { uuid: 'u1', nickname: 'A', role: GAME_ROLES.JOKER }],
                ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.DOCTOR }],
                ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.DOCTOR }],
                ['u4', { uuid: 'u4', nickname: 'D', role: GAME_ROLES.CITIZEN }],
                ['u5', { uuid: 'u5', nickname: 'E', role: GAME_ROLES.CITIZEN }],
                ['u6', { uuid: 'u6', nickname: 'F', role: GAME_ROLES.CITIZEN }],
                ['u7', { uuid: 'u7', nickname: 'G', role: GAME_ROLES.CITIZEN }],
                ['u8', { uuid: 'u8', nickname: 'H', role: GAME_ROLES.CITIZEN }],
            ]),
        },
    ],
    [
        '참가자 전원이 JOKER(jokerCount도 실제 인원수와 같게 설정)',
        {
            jokerCount: 3,
            players: new Map([
                ['u1', { uuid: 'u1', nickname: 'A', role: GAME_ROLES.JOKER }],
                ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.JOKER }],
                ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.JOKER }],
            ]),
        },
    ],
    [
        '실제 JOKER 수와 session.jokerCount 불일치(0명 실제, jokerCount:1)',
        {
            jokerCount: 1,
            players: new Map([
                ['u1', { uuid: 'u1', nickname: 'A', role: GAME_ROLES.CITIZEN }],
                ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.CITIZEN }],
                ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.CITIZEN }],
            ]),
        },
    ],
    [
        '실제 JOKER 수와 session.jokerCount 불일치(2명 실제, jokerCount:1)',
        {
            jokerCount: 1,
            players: new Map([
                ['u1', { uuid: 'u1', nickname: 'A', role: GAME_ROLES.JOKER }],
                ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.JOKER }],
                ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.CITIZEN }],
            ]),
        },
    ],
    [
        'players Map key와 player.uuid 불일치',
        {
            players: new Map([
                ['wrong-key', { uuid: 'u1', nickname: 'A', role: GAME_ROLES.JOKER }],
                ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.CITIZEN }],
                ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.CITIZEN }],
            ]),
        },
    ],
    [
        'player.uuid 없음',
        {
            players: new Map([
                ['u1', { nickname: 'A', role: GAME_ROLES.JOKER }],
                ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.CITIZEN }],
                ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.CITIZEN }],
            ]),
        },
    ],
    [
        'player.nickname 공백뿐',
        {
            players: new Map([
                ['u1', { uuid: 'u1', nickname: '   ', role: GAME_ROLES.JOKER }],
                ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.CITIZEN }],
                ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.CITIZEN }],
            ]),
        },
    ],
    [
        'player.role이 허용되지 않은 값',
        {
            jokerCount: 0,
            players: new Map([
                ['u1', { uuid: 'u1', nickname: 'A', role: 'MAYOR' }],
                ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.CITIZEN }],
                ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.CITIZEN }],
            ]),
        },
    ],
    ['session.roleRevealAcks 필드 누락', { roleRevealAcks: undefined }],
    ['session.roleRevealAcks가 Set이 아닌 배열', { roleRevealAcks: [] }],
    ['session.roleRevealAcks가 Set이 아닌 일반 객체', { roleRevealAcks: {} }],
    ['session.roleRevealAcks가 처음부터 비어있지 않음', { roleRevealAcks: new Set(['u1']) }],
]

for (const [label, overrides] of malformedSessionCases) {
    test(`assertValidSessionForCommit / commitGameSession: ${label} → throw하고 registry가 불변이다`, () => {
        const session = validSession(overrides)
        assert.throws(() => assertValidSessionForCommit(session))

        const before = gameSession.__getStateSnapshotForTests()
        assert.throws(() => commitGameSession(session))
        const after = gameSession.__getStateSnapshotForTests()
        assert.deepEqual(after, before)
    })
}

test('assertValidSessionForCommit: 정상 session은 통과한다', () => {
    assert.doesNotThrow(() => assertValidSessionForCommit(validSession()))
})

// ---------------------------------------------------------------------------
// buildGameStartedPayload — 역할 비밀성 구조 검증
// ---------------------------------------------------------------------------

test('buildGameStartedPayload: 공용 players[]에는 role/team 키가 없다', () => {
    const room = makeRoom()
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    const payload = buildGameStartedPayload(candidate.session, 'u1')

    for (const player of payload.state.players) {
        assert.equal(Object.hasOwn(player, 'role'), false)
        assert.equal(Object.hasOwn(player, 'team'), false)
    }
})

// JSON 문자열 카운트 대신 구조(own-property)로 검증한다 — 문자열 카운트는 무관한 필드
// 추가나 값 안의 우연한 문자열 일치에 취약하다(원격 리뷰 반영).
test('buildGameStartedPayload: state.self는 role에 따라 정확한 키만 가지고, role/team이 실제 값과 일치한다', () => {
    const room = makeRoom()
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })

    for (const uuid of candidate.session.players.keys()) {
        const payload = buildGameStartedPayload(candidate.session, uuid)
        const actualPlayer = candidate.session.players.get(uuid)

        // JOKER는 allies 키가 추가로 있고(같은 방에 다른 JOKER가 없으면 빈 배열), 그 외 역할은 없다.
        const expectedKeys =
            actualPlayer.role === 'JOKER'
                ? ['allies', 'nickname', 'role', 'team', 'uuid']
                : ['nickname', 'role', 'team', 'uuid']
        assert.deepEqual(Object.keys(payload.state.self).sort(), expectedKeys)
        assert.equal(payload.state.self.uuid, uuid)
        assert.equal(payload.state.self.role, actualPlayer.role)
        assert.equal(payload.state.self.team, ROLE_TEAMS[actualPlayer.role])
        if (actualPlayer.role === 'JOKER') {
            assert.deepEqual(payload.state.self.allies, [])
        }

        // 공개 players[] 어디에도 role/team/allies own-property가 없어야 한다(비밀 유지).
        for (const player of payload.state.players) {
            assert.equal(Object.hasOwn(player, 'role'), false)
            assert.equal(Object.hasOwn(player, 'team'), false)
            assert.equal(Object.hasOwn(player, 'allies'), false)
        }
    }
})

// jokerCount는 특수직업 공통 상한(MAX_SPECIAL_ROLE_COUNT = 2)을 넘을 수 없으므로 2로 구성한다.
// allies 집합 계약(자기 제외·전체 포함·중복 없음)은 JOKER가 2명일 때도 그대로 검증된다.
test('buildGameStartedPayload: allies는 다른 JOKER uuid의 정확한 전체 집합이다(부분 누락·CITIZEN 혼입·자기 포함·중복 없음)', () => {
    const room = makeRoom({
        players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3'), makePlayer('u4'), makePlayer('u5')],
        jokerCount: 2,
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })

    const jokerUuids = [...candidate.session.players.values()]
        .filter((p) => p.role === 'JOKER')
        .map((p) => p.uuid)
    assert.equal(jokerUuids.length, 2)

    for (const uuid of jokerUuids) {
        const payload = buildGameStartedPayload(candidate.session, uuid)
        const expectedAllies = jokerUuids.filter((u) => u !== uuid).sort()
        assert.deepEqual([...payload.state.self.allies].sort(), expectedAllies)
    }

    const citizenUuid = [...candidate.session.players.values()].find((p) => p.role !== 'JOKER').uuid
    const citizenPayload = buildGameStartedPayload(candidate.session, citizenUuid)
    assert.equal(Object.hasOwn(citizenPayload.state.self, 'allies'), false)
})

// 10명 방(jokerCount:1)은 getSpecialRoleBudget(10) === {DOCTOR:1, GUARD:1, WITCH_HUNTER:1}이므로
// 5개 역할 전부가 결정적으로 한 세션에 존재한다 — CITIZEN만이 아니라 DOCTOR/GUARD/WITCH_HUNTER도
// self.allies own-property가 없어야 한다는 계약을 직접 순회 검증한다(원격 리뷰 반영).
test('buildGameStartedPayload: DOCTOR/GUARD/WITCH_HUNTER(및 CITIZEN) viewer의 self에는 allies own-property가 없다', () => {
    const room = makeRoom({
        players: Array.from({ length: 10 }, (_, i) => makePlayer(`u${i + 1}`)),
        jokerCount: 1,
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })

    const nonJokerPlayers = [...candidate.session.players.values()].filter((p) => p.role !== 'JOKER')
    const presentRoles = new Set(nonJokerPlayers.map((p) => p.role))
    assert.deepEqual(presentRoles, new Set(['CITIZEN', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']))

    for (const { uuid, role } of nonJokerPlayers) {
        const payload = buildGameStartedPayload(candidate.session, uuid)
        assert.equal(Object.hasOwn(payload.state.self, 'allies'), false, `role=${role}`)

        // 공개 players[] 비밀성 계약도 이 결정적 fixture에서 함께 유지되는지 재확인한다.
        for (const player of payload.state.players) {
            assert.equal(Object.hasOwn(player, 'role'), false)
            assert.equal(Object.hasOwn(player, 'team'), false)
            assert.equal(Object.hasOwn(player, 'allies'), false)
        }
    }
})

test('buildGameStartedPayload: 세션에 없는 uuid로 호출하면 self는 null이고 players[]는 그대로 채워진다', () => {
    const room = makeRoom()
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    const payload = buildGameStartedPayload(candidate.session, 'not-a-participant')

    assert.equal(payload.state.self, null)
    assert.equal(payload.state.players.length, 3)
})

// ---------------------------------------------------------------------------
// endGameSessionForPlayer — GameSession 정리(반대 방향 뮤테이터)
// ---------------------------------------------------------------------------

test('BUG-090: final old ENDED detach preserves an early leaver new active session mapping', () => {
    const old = buildSessionCandidate(makeRoom({ id: 'old-ended', players: [makePlayer('early-a'), makePlayer('late-b')] })).session
    commitGameSession(old)
    old.phase = 'ENDED'
    endGameSessionForPlayer('early-a', 'LEAVE', old.id)
    const next = buildSessionCandidate(makeRoom({ id: 'new-active', players: [makePlayer('early-a'), makePlayer('new-c')] })).session
    commitGameSession(next)
    const result = endGameSessionForPlayer('late-b', 'LEAVE', old.id)
    assert.equal(result.sessionDeleted, true)
    assert.deepEqual(result.cleanupUuids, ['late-b'])
    assert.equal(gameSession.getActiveSessionRoutingInfo('early-a').gameId, next.id)
    assert.equal(gameSession.getActiveSessionRoutingInfo('new-c').gameId, next.id)
})

test('endGameSessionForPlayer: 어떤 활성 GameSession에도 속하지 않은 uuid는 NOT_IN_SESSION이고 registry가 불변이다', () => {
    const before = gameSession.__getStateSnapshotForTests()
    const result = endGameSessionForPlayer('no-such-uuid', 'PARTICIPANT_LEFT')
    const after = gameSession.__getStateSnapshotForTests()

    assert.deepEqual(result, { ok: false, code: 'NOT_IN_SESSION' })
    assert.deepEqual(after, before)
})

test('endGameSessionForPlayer: 정상 케이스에서 세션에 속했던 참가자 전원이 3개 registry에서 전부 사라진다', () => {
    const room = makeRoom({ id: 'room-end', players: [makePlayer('end-a'), makePlayer('end-b'), makePlayer('end-c')] })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const result = endGameSessionForPlayer('end-b', 'PARTICIPANT_LEFT')

    assert.equal(result.ok, true)
    assert.equal(result.reason, 'PARTICIPANT_LEFT')
    assert.equal(result.session.id, candidate.session.id)
    assert.equal(result.session.roomId, 'room-end')

    const snapshot = gameSession.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([gameId]) => gameId === candidate.session.id), false)
    assert.equal(snapshot.roomGameSession.some(([roomId]) => roomId === 'room-end'), false)
    for (const uuid of ['end-a', 'end-b', 'end-c']) {
        assert.equal(snapshot.playerSession.some(([playerUuid]) => playerUuid === uuid), false)
    }
})

test('endGameSessionForPlayer: 정리 직후 같은 세션의 다른 참가자 uuid로 다시 호출해도 멱등하게 NOT_IN_SESSION이다', () => {
    const room = makeRoom({ id: 'room-idem', players: [makePlayer('idem-a'), makePlayer('idem-b')] })
    commitGameSession(buildSessionCandidate(room).session)

    endGameSessionForPlayer('idem-a', 'PARTICIPANT_LEFT')
    const result = endGameSessionForPlayer('idem-b', 'PARTICIPANT_LEFT')

    assert.deepEqual(result, { ok: false, code: 'NOT_IN_SESSION' })
})

test('endGameSessionForPlayer: 정리된 uuid를 포함한 새 Room으로 다시 게임을 시작할 수 있다', () => {
    const room = makeRoom({ id: 'room-restart-1', players: [makePlayer('restart-uuid'), makePlayer('restart-other')] })
    commitGameSession(buildSessionCandidate(room).session)
    endGameSessionForPlayer('restart-uuid', 'PARTICIPANT_LEFT')

    const newRoom = makeRoom({ id: 'room-restart-2', players: [makePlayer('restart-uuid'), makePlayer('restart-third')] })
    const prepared = prepareGameSession(newRoom)
    assert.equal(prepared.ok, true)
    assert.doesNotThrow(() => commitGameSession(prepared.session))
})

test('endGameSessionForPlayer: ABA 방지 — 세션 A 종료 후 시작된 세션 B는 A에 대한 지연 종료 요청으로부터 안전하다', () => {
    const roomA = makeRoom({ id: 'room-aba-1', players: [makePlayer('aba-uuid'), makePlayer('aba-a-other')] })
    const candidateA = buildSessionCandidate(roomA)
    commitGameSession(candidateA.session)
    const gameIdA = candidateA.session.id

    const endedA = endGameSessionForPlayer('aba-uuid', 'PARTICIPANT_LEFT')
    assert.equal(endedA.ok, true)

    const roomB = makeRoom({ id: 'room-aba-2', players: [makePlayer('aba-uuid'), makePlayer('aba-b-other')] })
    const candidateB = buildSessionCandidate(roomB)
    commitGameSession(candidateB.session)
    const gameIdB = candidateB.session.id

    const before = gameSession.__getStateSnapshotForTests()
    // A에 대한 지연·중복 종료 요청이 B가 이미 시작된 뒤에야 도착한 상황을 재현한다.
    const staleResult = endGameSessionForPlayer('aba-uuid', 'PARTICIPANT_LEFT', gameIdA)
    const after = gameSession.__getStateSnapshotForTests()

    assert.deepEqual(staleResult, { ok: false, code: 'STALE_SESSION_MISMATCH' })
    assert.deepEqual(after, before)
    assert.equal(after.gameSessions.some(([gameId]) => gameId === gameIdB), true)
    assert.equal(after.roomGameSession.some(([roomId, gameId]) => roomId === 'room-aba-2' && gameId === gameIdB), true)
    assert.equal(after.playerSession.some(([uuid, gameId]) => uuid === 'aba-uuid' && gameId === gameIdB), true)
})

// ---------------------------------------------------------------------------
// prepareGameSession — 통합 진입점
// ---------------------------------------------------------------------------

test('prepareGameSession: precondition 실패를 그대로 전달한다', () => {
    const room = makeRoom({ id: 'room-p' })
    commitGameSession(buildSessionCandidate(room).session)

    const result = prepareGameSession(room)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'DUPLICATE_ROOM_SESSION')
})

test('prepareGameSession: precondition을 통과하면 candidate를 만든다', () => {
    const room = makeRoom({ id: 'room-q' })
    const result = prepareGameSession(room)
    assert.equal(result.ok, true)
    assert.equal(result.session.roomId, 'room-q')
})

// ---------------------------------------------------------------------------
// sanitizeJokerChatText
// ---------------------------------------------------------------------------

test('sanitizeJokerChatText: 일반 텍스트는 그대로 통과한다', () => {
    assert.deepEqual(sanitizeJokerChatText('hello world'), { ok: true, text: 'hello world' })
})

test('sanitizeJokerChatText: 앞뒤 공백은 trim된다', () => {
    assert.deepEqual(sanitizeJokerChatText('  hello  '), { ok: true, text: 'hello' })
})

test('sanitizeJokerChatText: 한글 텍스트는 통과한다', () => {
    assert.deepEqual(sanitizeJokerChatText('안녕하세요'), { ok: true, text: '안녕하세요' })
})

test('sanitizeJokerChatText: 이모지(서로게이트 쌍)는 통과한다', () => {
    assert.deepEqual(sanitizeJokerChatText('😀'), { ok: true, text: '😀' })
})

test('sanitizeJokerChatText: 내부 개행(LF)은 통과한다', () => {
    assert.deepEqual(sanitizeJokerChatText('line1\nline2'), { ok: true, text: 'line1\nline2' })
})

test('sanitizeJokerChatText: CRLF는 LF로 정규화된 뒤 통과한다', () => {
    assert.deepEqual(sanitizeJokerChatText('line1\r\nline2'), { ok: true, text: 'line1\nline2' })
})

test('sanitizeJokerChatText: 단독 CR은 LF로 정규화된 뒤 통과한다', () => {
    assert.deepEqual(sanitizeJokerChatText('line1\rline2'), { ok: true, text: 'line1\nline2' })
})

test('sanitizeJokerChatText: 빈 문자열은 EMPTY_MESSAGE다', () => {
    assert.deepEqual(sanitizeJokerChatText(''), { ok: false, code: 'EMPTY_MESSAGE' })
})

test('sanitizeJokerChatText: 공백/개행만 있으면 EMPTY_MESSAGE다', () => {
    assert.deepEqual(sanitizeJokerChatText('   \n\n  '), { ok: false, code: 'EMPTY_MESSAGE' })
})

test('sanitizeJokerChatText: TAB이 포함되면 INVALID_CHARACTERS다', () => {
    assert.deepEqual(sanitizeJokerChatText('a\tb'), { ok: false, code: 'INVALID_CHARACTERS' })
})

test('sanitizeJokerChatText: NUL이 포함되면 INVALID_CHARACTERS다', () => {
    assert.deepEqual(sanitizeJokerChatText('a\u0000b'), { ok: false, code: 'INVALID_CHARACTERS' })
})

test('sanitizeJokerChatText: DEL이 포함되면 INVALID_CHARACTERS다', () => {
    assert.deepEqual(sanitizeJokerChatText('a\u007fb'), { ok: false, code: 'INVALID_CHARACTERS' })
})

test('sanitizeJokerChatText: C1 NEL(\u0085)이 포함되면 INVALID_CHARACTERS다', () => {
    assert.deepEqual(sanitizeJokerChatText('a\u0085b'), { ok: false, code: 'INVALID_CHARACTERS' })
})

test('sanitizeJokerChatText: Arabic Letter Mark(\u061c)가 포함되면 INVALID_CHARACTERS다', () => {
    assert.deepEqual(sanitizeJokerChatText('a\u061cb'), { ok: false, code: 'INVALID_CHARACTERS' })
})

test('sanitizeJokerChatText: LRM(\u200e)이 포함되면 INVALID_CHARACTERS다', () => {
    assert.deepEqual(sanitizeJokerChatText('a\u200eb'), { ok: false, code: 'INVALID_CHARACTERS' })
})

test('sanitizeJokerChatText: RLM(\u200f)이 포함되면 INVALID_CHARACTERS다', () => {
    assert.deepEqual(sanitizeJokerChatText('a\u200fb'), { ok: false, code: 'INVALID_CHARACTERS' })
})

test('sanitizeJokerChatText: bidi embedding/override(\u202e)가 포함되면 INVALID_CHARACTERS다', () => {
    assert.deepEqual(sanitizeJokerChatText('a\u202eb'), { ok: false, code: 'INVALID_CHARACTERS' })
})

test('sanitizeJokerChatText: bidi isolate(\u2066)가 포함되면 INVALID_CHARACTERS다', () => {
    assert.deepEqual(sanitizeJokerChatText('a\u2066b'), { ok: false, code: 'INVALID_CHARACTERS' })
})

test('sanitizeJokerChatText: 정확히 150 code unit은 통과한다', () => {
    const text = 'a'.repeat(150)
    assert.deepEqual(sanitizeJokerChatText(text), { ok: true, text })
})

test('sanitizeJokerChatText: 151 code unit은 MESSAGE_TOO_LONG이다', () => {
    const text = 'a'.repeat(151)
    assert.deepEqual(sanitizeJokerChatText(text), { ok: false, code: 'MESSAGE_TOO_LONG' })
})

// ---------------------------------------------------------------------------
// prepareJokerChatMessage / commitJokerChatMessage
// ---------------------------------------------------------------------------

test('prepareJokerChatMessage: 정상 호출은 성공하고 jokerChatRateLimit은 호출 전후 완전히 동일하다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-1' })
    const [actor] = jokerUuids
    const beforeSnapshot = [...session.jokerChatRateLimit.entries()]

    const result = prepareJokerChatMessage(actor, session.id, 'hello', { now: () => 1000 })

    assert.equal(result.ok, true)
    assert.equal(result.session, session)
    assert.equal(result.actorUuid, actor)
    assert.equal(result.sanitizedText, 'hello')
    assert.equal(result.sentAt, 1000)
    assert.deepEqual([...session.jokerChatRateLimit.entries()], beforeSnapshot)
})

test('prepareJokerChatMessage: gameId가 공백만이면 INVALID_GAME_ID다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-2' })
    const [actor] = jokerUuids

    const result = prepareJokerChatMessage(actor, '   ', 'hello')

    assert.deepEqual(result, { ok: false, code: 'INVALID_GAME_ID' })
})

test('prepareJokerChatMessage: playerSession에 없는 uuid는 NOT_IN_SESSION이다', () => {
    const { session } = commitJokerTrioSessionAtNight({ id: 'room-pjc-3' })

    const result = prepareJokerChatMessage('no-such-uuid', session.id, 'hello')

    assert.deepEqual(result, { ok: false, code: 'NOT_IN_SESSION' })
})

test('prepareJokerChatMessage: 요청 gameId가 실제 세션과 다르면 STALE_SESSION_MISMATCH다', () => {
    const { jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-4' })
    const [actor] = jokerUuids

    const result = prepareJokerChatMessage(actor, 'not-the-real-game-id', 'hello')

    assert.deepEqual(result, { ok: false, code: 'STALE_SESSION_MISMATCH' })
})

test('prepareJokerChatMessage: ROLE_REVEAL 단계에서는 INVALID_PHASE다', () => {
    const players = [makePlayer('pjc-5-a'), makePlayer('pjc-5-b'), makePlayer('pjc-5-c')]
    const room = makeRoom({ id: 'room-pjc-5', players, jokerCount: 2 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid

    const result = prepareJokerChatMessage(jokerUuid, session.id, 'hello')

    assert.deepEqual(result, { ok: false, code: 'INVALID_PHASE' })
})

test('prepareJokerChatMessage: 생존 CITIZEN 발신자는 canonical CITIZEN 채널로 라우팅된다', () => {
    const { session, citizenUuid } = commitFullRoleSessionAtNight({ id: 'room-pjc-6' })

    const result = prepareJokerChatMessage(citizenUuid, session.id, 'hello')

    assert.equal(result.ok, true)
    assert.equal(result.channel, 'CITIZEN')
    assert.equal(result.actorUuid, citizenUuid)
})

test('prepareJokerChatMessage: text 검증 실패(빈 문자열)는 EMPTY_MESSAGE 그대로 전파된다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-7' })
    const [actor] = jokerUuids

    const result = prepareJokerChatMessage(actor, session.id, '   ')

    assert.deepEqual(result, { ok: false, code: 'EMPTY_MESSAGE' })
})

test('prepareJokerChatMessage: now는 성공 호출당 정확히 1회 호출된다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-8' })
    const [actor] = jokerUuids
    let calls = 0
    const now = () => { calls += 1; return 1000 }

    const result = prepareJokerChatMessage(actor, session.id, 'hello', { now })

    assert.equal(result.ok, true)
    assert.equal(calls, 1)
})

test('prepareJokerChatMessage: now가 이상값을 반환하면 전부 INVALID_CLOCK_VALUE이고 Map은 각 호출 전후로 불변이다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-9' })
    const [actor] = jokerUuids
    const badValues = [1.5, -1, NaN, Infinity, '123']

    for (const badValue of badValues) {
        const beforeSnapshot = [...session.jokerChatRateLimit.entries()]
        const result = prepareJokerChatMessage(actor, session.id, 'hello', { now: () => badValue })
        assert.deepEqual(result, { ok: false, code: 'INVALID_CLOCK_VALUE' }, `now=${String(badValue)}`)
        assert.deepEqual([...session.jokerChatRateLimit.entries()], beforeSnapshot, `now=${String(badValue)}`)
    }
})

test('prepareJokerChatMessage: now가 throw하면 예외가 전파되고 Map은 불변이다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-10' })
    const [actor] = jokerUuids
    const beforeSnapshot = [...session.jokerChatRateLimit.entries()]
    const now = () => { throw new Error('시계 오류(테스트 주입)') }

    assert.throws(() => prepareJokerChatMessage(actor, session.id, 'hello', { now }))
    assert.deepEqual([...session.jokerChatRateLimit.entries()], beforeSnapshot)
})

test('prepareJokerChatMessage: RATE_LIMITED — 간격 미만은 거부, 간격 이상은 통과, 판정에 쓰인 값과 반환된 sentAt이 동일한 now() 결과다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-11' })
    const [actor] = jokerUuids

    const first = prepareJokerChatMessage(actor, session.id, 'hello', { now: () => 1000 })
    assert.equal(first.ok, true)
    assert.equal(first.sentAt, 1000)
    commitJokerChatMessage(session, actor, first.sentAt)

    const tooSoon = prepareJokerChatMessage(actor, session.id, 'hello', { now: () => 1499 })
    assert.deepEqual(tooSoon, { ok: false, code: 'RATE_LIMITED' })

    const enoughGap = prepareJokerChatMessage(actor, session.id, 'hello', { now: () => 1500 })
    assert.equal(enoughGap.ok, true)
    assert.equal(enoughGap.sentAt, 1500)
})

test('prepareJokerChatMessage: registry 불일치(playerSession엔 있지만 gameSessions엔 없음)는 SESSION_NOT_FOUND다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-12' })
    const [actor] = jokerUuids
    __deleteGameSessionOnlyForTests(session.id)

    const result = prepareJokerChatMessage(actor, session.id, 'hello')

    assert.deepEqual(result, { ok: false, code: 'SESSION_NOT_FOUND' })
})

test('prepareJokerChatMessage: registry 불일치(세션은 있지만 players에 uuid가 없음)는 NOT_A_PARTICIPANT다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-13' })
    const [actor] = jokerUuids
    session.players.delete(actor)

    const result = prepareJokerChatMessage(actor, session.id, 'hello')

    assert.deepEqual(result, { ok: false, code: 'NOT_A_PARTICIPANT' })
})

test('prepareJokerChatMessage: 공백으로 감싼 유효 gameId로 호출해도 성공하고 session.id는 원본과 동일하다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-pjc-14' })
    const [actor] = jokerUuids

    const result = prepareJokerChatMessage(actor, `  ${session.id}  `, 'hello')

    assert.equal(result.ok, true)
    assert.equal(result.session.id, session.id)
})

test('commitJokerChatMessage: 호출하면 jokerChatRateLimit.get(uuid)가 sentAt으로 갱신된다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-cjc-1' })
    const [actor] = jokerUuids

    commitJokerChatMessage(session, actor, 12345)

    assert.equal(session.jokerChatRateLimit.get(actor), 12345)
})

test('assertValidSessionForCommit: jokerChatRateLimit이 비어있지 않은 session으로 commit 시도 시 throw한다', () => {
    const room = makeRoom({ id: 'room-avfc-jcrl', players: [makePlayer('avfc-jcrl-a'), makePlayer('avfc-jcrl-b')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    candidate.session.jokerChatRateLimit.set('avfc-jcrl-a', 123)

    assert.throws(() => commitGameSession(candidate.session), /jokerChatRateLimit/)
})

test('assertValidSessionForCommit: dayVotes가 비어있지 않은 session으로 commit 시도 시 throw한다', () => {
    const room = makeRoom({ id: 'room-avfc-dv', players: [makePlayer('avfc-dv-a'), makePlayer('avfc-dv-b')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    candidate.session.dayVotes.set('avfc-dv-a', null)

    assert.throws(() => commitGameSession(candidate.session), /dayVotes/)
})

// ---------------------------------------------------------------------------
// getSessionSnapshotForPlayer / buildSessionSnapshot — get_session_snapshot 재접속 스냅샷
// ---------------------------------------------------------------------------

// 재투표가 열려 있는 DAY로 재접속한 클라이언트는 "지금이 몇 라운드이고 누가 후보에서
// 빠졌는지"를 스냅샷에서 알 수 있어야 한다 — 이게 없으면 재투표 중인 낮에 갇힌다.
test('getSessionSnapshotForPlayer: 재투표 진행 중 DAY 스냅샷은 dayVoteResolution에 round와 revoteExcludedUuids를 노출하고 비밀은 새지 않는다', () => {
    const { session, uuidA, uuidC } = advanceQuadToRevote('room-snap-revote')

    const result = getSessionSnapshotForPlayer(uuidA, session.id)

    assert.equal(result.ok, true)
    assert.equal(result.snapshot.phase, 'DAY')
    assert.equal(result.snapshot.dayIndex, 1)
    // round는 "이 판정이 몇 라운드의 결과인지"이므로 1이고, 지금 열려 있는 라운드는 그 다음이다.
    assert.deepEqual(result.snapshot.dayVoteResolution, {
        round: 1,
        outcome: 'REVOTE',
        tribunalTargetUuid: null,
        publicVoteCount: 4,
        publicAbstainCount: 0,
        revoteExcludedUuids: [uuidA, uuidC].sort(),
    })

    assertNoForbiddenPrivateData(result.snapshot, collectOtherPlayerRoleSecrets(session, uuidA))
})

test('getSessionSnapshotForPlayer: ROLE_REVEAL 단계 — top-level 키가 정확히 {gameId,phase,dayIndex,players,self}이고 hasActedThisPhase는 본인 확인 여부만 반영한다', () => {
    const uuids = ['snR1', 'snR2']
    const room = makeRoom({ id: 'room-snap-rr', players: uuids.map((uuid) => makePlayer(uuid)), jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session

    const before = getSessionSnapshotForPlayer('snR1', session.id)
    assert.equal(before.ok, true)
    assert.deepEqual(Object.keys(before.snapshot).sort(), ['dayIndex', 'gameId', 'phase', 'players', 'self'])
    assert.equal(before.snapshot.phase, 'ROLE_REVEAL')
    assert.equal(before.snapshot.dayIndex, 0)
    assert.equal(before.snapshot.self.hasActedThisPhase, false)

    acknowledgeRoleReveal('snR1', session.id)
    const after = getSessionSnapshotForPlayer('snR1', session.id)
    assert.equal(after.snapshot.self.hasActedThisPhase, true)
    // 아직 두 번째 참가자가 확인하지 않아 phase 전이는 일어나지 않는다.
    assert.equal(session.phase, 'ROLE_REVEAL')
})

test('getSessionSnapshotForPlayer: NIGHT(판정 전) — nightResult/dayVoteResolution/tribunal 키가 전부 없다', () => {
    const session = buildSnapQuadSession({ id: 'room-snap-night-pre', uuids: ['snN1', 'snN2', 'snN3', 'snN4'] })
    ackAll(session)
    assert.equal(session.phase, 'NIGHT')

    const result = getSessionSnapshotForPlayer('snN1', session.id)

    assert.equal(result.ok, true)
    assert.deepEqual(Object.keys(result.snapshot).sort(), ['dayIndex', 'gameId', 'phase', 'players', 'self'])
    assert.equal(Object.hasOwn(result.snapshot, 'nightResult'), false)
    assert.equal(Object.hasOwn(result.snapshot, 'dayVoteResolution'), false)
    assert.equal(Object.hasOwn(result.snapshot, 'tribunal'), false)
})

test('getSessionSnapshotForPlayer: JOKER 진영끼리만 allies가 채워지고, CITIZEN viewer에게는 allies 키 자체가 없다(assertNoForbiddenPrivateData 포함)', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight({ id: 'room-snap-allies' })
    const [viewerJoker, otherJoker] = jokerUuids

    const jokerResult = getSessionSnapshotForPlayer(viewerJoker, session.id)
    assert.equal(jokerResult.ok, true)
    assert.deepEqual(
        Object.keys(jokerResult.snapshot.self).sort(),
        ['allies', 'hasActedThisPhase', 'nickname', 'role', 'team', 'uuid'],
    )
    assert.deepEqual(jokerResult.snapshot.self.allies, [otherJoker])
    assertNoForbiddenPrivateData(jokerResult.snapshot, collectOtherPlayerRoleSecrets(session, viewerJoker))

    const citizenResult = getSessionSnapshotForPlayer(citizenUuid, session.id)
    assert.equal(citizenResult.ok, true)
    assert.deepEqual(
        Object.keys(citizenResult.snapshot.self).sort(),
        ['hasActedThisPhase', 'nickname', 'role', 'team', 'uuid'],
    )
    assert.equal(Object.hasOwn(citizenResult.snapshot.self, 'allies'), false)
    assertNoForbiddenPrivateData(citizenResult.snapshot, collectOtherPlayerRoleSecrets(session, citizenUuid))
})

test('getSessionSnapshotForPlayer: 5개 역할 전원(NIGHT) — 공개 roster/자기 self 어디에도 타인의 role/team/투표·행동 대상이 없다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid } = commitFullRoleSessionAtNight({ id: 'room-snap-fullrole' })

    for (const viewerUuid of [jokerUuid, doctorUuid, guardUuid]) {
        const result = getSessionSnapshotForPlayer(viewerUuid, session.id)
        assert.equal(result.ok, true)
        for (const player of result.snapshot.players) {
            assert.deepEqual(Object.keys(player).sort(), ['isAlive', 'nickname', 'themeIndex', 'uuid'])
            assert.equal(Number.isInteger(player.themeIndex), true)
        }
        assertNoForbiddenPrivateData(result.snapshot, collectOtherPlayerRoleSecrets(session, viewerUuid))
    }
})

test('getSessionSnapshotForPlayer: 존재하지 않거나 세션 밖 uuid는 내부 코드(NOT_A_PARTICIPANT/SESSION_NOT_FOUND)를 반환한다', () => {
    const session = buildSnapQuadSession({ id: 'room-snap-nonmember', uuids: ['snM1', 'snM2', 'snM3', 'snM4'] })
    ackAll(session)

    assert.deepEqual(getSessionSnapshotForPlayer('ghost-uuid', session.id), { ok: false, code: 'NOT_A_PARTICIPANT' })

    session.players.delete('snM1')
    assert.deepEqual(getSessionSnapshotForPlayer('snM1', session.id), { ok: false, code: 'NOT_A_PARTICIPANT' })

    __deleteGameSessionOnlyForTests(session.id)
    assert.deepEqual(getSessionSnapshotForPlayer('snM2', session.id), { ok: false, code: 'SESSION_NOT_FOUND' })
})

test('getSessionSnapshotForPlayer: expectedGameId — 생략 시 통과, 일치 시 통과, 불일치·공백·빈 문자열은 전부 GAME_ID_MISMATCH다', () => {
    const session = buildSnapQuadSession({ id: 'room-snap-gidmismatch', uuids: ['snG1', 'snG2', 'snG3', 'snG4'] })
    ackAll(session)

    assert.equal(getSessionSnapshotForPlayer('snG1', undefined).ok, true)
    assert.equal(getSessionSnapshotForPlayer('snG1', session.id).ok, true)
    assert.deepEqual(getSessionSnapshotForPlayer('snG1', 'not-the-real-id'), { ok: false, code: 'GAME_ID_MISMATCH' })
    assert.deepEqual(getSessionSnapshotForPlayer('snG1', ''), { ok: false, code: 'GAME_ID_MISMATCH' })
    assert.deepEqual(getSessionSnapshotForPlayer('snG1', '   '), { ok: false, code: 'GAME_ID_MISMATCH' })
    assert.equal(getSessionSnapshotForPlayer('snG1', `  ${session.id}  `).ok, true) // 앞뒤 공백은 trim 후 비교
})

test('getSessionSnapshotForPlayer: 반복 요청은 deep-equal하고 canonical registry 상태를 전혀 바꾸지 않는다(멱등·읽기 전용)', () => {
    const { session, uuidA } = commitTrioSessionAtDay({ id: 'room-snap-idempotent' })
    const beforeState = gameSession.__getStateSnapshotForTests()

    const first = getSessionSnapshotForPlayer(uuidA, session.id)
    const afterFirstState = gameSession.__getStateSnapshotForTests()
    const second = getSessionSnapshotForPlayer(uuidA, session.id)
    const afterSecondState = gameSession.__getStateSnapshotForTests()

    assert.deepEqual(first, second)
    assert.notEqual(first.snapshot, second.snapshot) // 서로 다른 객체 참조(매 호출 새 구조체)
    assert.deepEqual(beforeState, afterFirstState)
    assert.deepEqual(afterFirstState, afterSecondState)
})

test('getSessionSnapshotForPlayer: 첫 응답 객체(players/self/winResult/nightResult)를 변형해도 canonical session과 재요청 결과는 오염되지 않는다(defensive copy)', () => {
    // CITIZEN 승리로 ENDED까지 진행해 nightResult/winResult가 모두 존재하는 스냅샷에서 검증한다.
    const session = nightSessionOf3({ id: 'room-snap-defcopy' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const viewerUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: jokerUuid, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })

    const first = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.equal(first.ok, true)

    const targetPlayerEntry = first.snapshot.players.find((p) => p.uuid === jokerUuid)
    targetPlayerEntry.isAlive = true
    targetPlayerEntry.nickname = 'tampered-nickname'
    first.snapshot.self.role = 'TAMPERED_ROLE'
    first.snapshot.self.hasActedThisPhase = true
    first.snapshot.winResult.winner = 'TAMPERED_WINNER'
    first.snapshot.nightResult.victimUuid = 'tampered-victim'
    first.snapshot.players.push({ uuid: 'forged-uuid', nickname: 'forged', isAlive: true })

    // canonical session은 전혀 바뀌지 않았다.
    assert.equal(session.players.get(jokerUuid).alive, false)
    assert.equal(session.players.get(jokerUuid).nickname.startsWith('nick-'), true)
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.players.has('forged-uuid'), false)

    // 재요청은 오염되지 않은 fresh 데이터를 돌려준다.
    const second = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.equal(second.ok, true)
    assert.equal(second.snapshot.players.find((p) => p.uuid === jokerUuid).isAlive, false)
    assert.equal(second.snapshot.self.role, session.players.get(viewerUuid).role)
    assert.deepEqual(second.snapshot.winResult, { winner: 'CITIZEN' })
    assert.equal(second.snapshot.nightResult.victimUuid, jokerUuid)
    assert.equal(second.snapshot.players.length, session.players.size)
})

test('getSessionSnapshotForPlayer: TRIBUNAL 유죄 처형으로 CITIZEN 승리 — ENDED에서 nightResult/dayVoteResolution/tribunal/winResult가 전부 포함된다(다른 사이클의 밤 판정이라 nightResolution.dayIndex와 session.dayIndex가 어긋나므로)', () => {
    const uuids = ['snA1', 'snA2', 'snA3', 'snA4'] // JOKER=snA2(randomFn:()=>0 고정 셔플)
    const session = buildSnapQuadSession({ id: 'room-snap-tribunal-end', uuids })
    ackAll(session)

    const nightOutcome = resolveJokerOnlyNight(session, 'snA2', null) // 아무도 죽지 않음
    assert.deepEqual(nightOutcome, { ok: true, victimUuid: null, terminal: null })
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)

    const dayOutcome = resolveDayVotes(session, { snA1: 'snA2', snA2: 'snA1', snA3: 'snA2', snA4: 'snA2' })
    assert.deepEqual(dayOutcome, { ok: true })
    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(session.tribunal.defendantUuid, 'snA2')

    const tribunalOutcome = resolveTribunalVotes(session, { snA1: 'GUILTY', snA3: 'GUILTY', snA4: 'NOT_GUILTY' })
    assert.deepEqual(tribunalOutcome, { ok: true, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    // 회귀 근거: night 0의 nightResolution.dayIndex(0)는 DAY/TRIBUNAL 진행 동안 전혀 바뀌지
    // 않은 채 남아있고, session.dayIndex는 이미 1로 전진해 있다 — 서로 다르므로(이번 종결이
    // 밤의 킬이 아니라 그 뒤의 재판에서 나왔다는 신호) dayVoteResolution/tribunal이 포함돼야 한다.
    assert.equal(session.nightResolution.dayIndex, 0)
    assert.equal(session.dayIndex, 1)

    const result = getSessionSnapshotForPlayer('snA1', session.id)
    assert.equal(result.ok, true)
    const snapshot = result.snapshot
    assert.deepEqual(
        Object.keys(snapshot).sort(),
        ['dayIndex', 'dayVoteResolution', 'gameId', 'nightResult', 'phase', 'players', 'self', 'tribunal', 'winResult'],
    )
    assert.equal(snapshot.phase, 'ENDED')
    assert.equal(snapshot.dayIndex, 1)
    assert.deepEqual(snapshot.nightResult, { dayIndex: 1, victimUuid: null, deathReveals: [] })
    assert.deepEqual(snapshot.dayVoteResolution, {
        round: 1, outcome: 'TRIBUNAL', tribunalTargetUuid: 'snA2', publicVoteCount: 4, publicAbstainCount: 0,
        revoteExcludedUuids: [],
    })
    assert.deepEqual(snapshot.tribunal, {
        defendantUuid: 'snA2', resolved: true, outcome: 'GUILTY', counts: { guilty: 2, notGuilty: 1 }, executedUuid: 'snA2',
    })
    assert.deepEqual(snapshot.winResult, { winner: 'CITIZEN' })

    // snA4는 소수 의견(NOT_GUILTY)을 던졌다 — 최종 집계(tribunal.outcome='GUILTY')와 다른 값이므로,
    // 이 개인 표가 다른 어떤 위치에도 노출되지 않아야 한다(FORBIDDEN_PRIVATE_KEYS의 'votes' 키
    // 검사와 별개로, 값 자체가 새어나오지 않는지 확인하는 회귀 카나리아).
    assertNoForbiddenPrivateData(snapshot, [
        ...collectOtherPlayerRoleSecrets(session, 'snA1'),
        { value: 'NOT_GUILTY', label: 'snA4의 소수 의견 개별 표' },
    ])
})

test('getSessionSnapshotForPlayer: NIGHT→DAY→TRIBUNAL(무죄)→post-tribunal NIGHT→night-kill ENDED(JOKER 승리) 전체 진행에서 매 단계 top-level 키 집합이 정확하다', () => {
    const uuids = ['snB1', 'snB2', 'snB3', 'snB4'] // JOKER=snB2(randomFn:()=>0 고정 셔플)
    const session = buildSnapQuadSession({ id: 'room-snap-progress', uuids })
    ackAll(session)

    // --- 1) 활성 NIGHT(판정 전) ---
    const nightSnapshotJoker = getSessionSnapshotForPlayer('snB2', session.id)
    assert.equal(nightSnapshotJoker.ok, true)
    assert.deepEqual(Object.keys(nightSnapshotJoker.snapshot).sort(), ['dayIndex', 'gameId', 'phase', 'players', 'self'])
    assert.equal(nightSnapshotJoker.snapshot.phase, 'NIGHT')
    assert.equal(nightSnapshotJoker.snapshot.self.hasActedThisPhase, false)
    assert.deepEqual(nightSnapshotJoker.snapshot.self.allies, [])
    assertNoForbiddenPrivateData(nightSnapshotJoker.snapshot, collectOtherPlayerRoleSecrets(session, 'snB2'))

    const nightOutcome = resolveJokerOnlyNight(session, 'snB2', 'snB3') // snB3(CITIZEN) 사망
    assert.deepEqual(nightOutcome, { ok: true, victimUuid: 'snB3', terminal: null })
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)

    // --- 2) 활성 DAY — nightResult.dayIndex는 buildNightResultAppliedPayload의 post-transition
    // 값(1)이어야 한다. prepareNightResolution이 커밋 전에 캡처한 pre-transition 값(0)이 아니다.
    const daySnapshot = getSessionSnapshotForPlayer('snB1', session.id)
    assert.equal(daySnapshot.ok, true)
    assert.deepEqual(
        Object.keys(daySnapshot.snapshot).sort(),
        ['dayIndex', 'dayPhase', 'gameId', 'nightResult', 'phase', 'players', 'self'],
    )
    assert.equal(daySnapshot.snapshot.phase, 'DAY')
    // 밤을 넘겨 들어온 낮도 토론부터 시작한다.
    assert.equal(daySnapshot.snapshot.dayPhase, 'DAY_DISCUSSION')
    assert.deepEqual(daySnapshot.snapshot.nightResult, {
        dayIndex: 1,
        victimUuid: 'snB3',
        deathReveals: [{ victimUuid: 'snB3', source: 'JOKER' }],
    })
    assert.equal(
        daySnapshot.snapshot.nightResult.dayIndex,
        buildNightResultAppliedPayload(session, 'snB3', session.nightResolution.publicDeathReveals).dayIndex,
    )
    assert.notEqual(daySnapshot.snapshot.nightResult.dayIndex, session.nightResolution.dayIndex) // 0 !== 1
    assert.deepEqual(
        daySnapshot.snapshot.players.find((p) => p.uuid === 'snB3'),
        {
            uuid: 'snB3',
            nickname: session.players.get('snB3').nickname,
            isAlive: false,
            themeIndex: daySnapshot.snapshot.players.find((p) => p.uuid === 'snB3').themeIndex,
        },
    )
    assert.equal(Number.isInteger(daySnapshot.snapshot.players.find((p) => p.uuid === 'snB3').themeIndex), true)

    const dayOutcome = resolveDayVotes(session, { snB1: 'snB2', snB2: 'snB1', snB4: 'snB1' })
    assert.deepEqual(dayOutcome, { ok: true })
    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(session.tribunal.defendantUuid, 'snB1')

    // --- 3) 활성 TRIBUNAL(판정 전) — tribunal.resolved:false이고 outcome/counts/executedUuid는 없다.
    const tribunalSnapshot = getSessionSnapshotForPlayer('snB2', session.id)
    assert.equal(tribunalSnapshot.ok, true)
    assert.deepEqual(
        Object.keys(tribunalSnapshot.snapshot).sort(),
        ['dayIndex', 'dayVoteResolution', 'gameId', 'nightResult', 'phase', 'players', 'self', 'tribunal'],
    )
    assert.equal(tribunalSnapshot.snapshot.phase, 'TRIBUNAL')
    assert.deepEqual(tribunalSnapshot.snapshot.tribunal, { defendantUuid: 'snB1', resolved: false })
    assert.deepEqual(tribunalSnapshot.snapshot.dayVoteResolution, {
        round: 1, outcome: 'TRIBUNAL', tribunalTargetUuid: 'snB1', publicVoteCount: 3, publicAbstainCount: 0,
        revoteExcludedUuids: [],
    })

    const tribunalOutcome = resolveTribunalVotes(session, { snB2: 'NOT_GUILTY', snB4: 'NOT_GUILTY' })
    assert.deepEqual(tribunalOutcome, { ok: true, terminal: null })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.nightResolution, null)
    assert.equal(session.players.get('snB1').alive, true)

    // --- 4) post-tribunal NIGHT(필수 회귀) — session.dayVoteResolution.dayIndex(1)와
    // session.tribunal.dayIndex(1)가 여전히 session.dayIndex(1)와 수치상 일치하지만, phase가
    // NIGHT이므로 canIncludeDayTribunalFields가 이들을 제외해야 한다(dayIndex 일치만으로
    // 판단했다면 여전히 노출됐을 stale 데이터).
    assert.equal(session.dayVoteResolution.dayIndex, session.dayIndex)
    assert.equal(session.tribunal.dayIndex, session.dayIndex)
    const postTribunalNightSnapshot = getSessionSnapshotForPlayer('snB1', session.id)
    assert.equal(postTribunalNightSnapshot.ok, true)
    assert.deepEqual(Object.keys(postTribunalNightSnapshot.snapshot).sort(), ['dayIndex', 'gameId', 'phase', 'players', 'self'])
    assert.equal(postTribunalNightSnapshot.snapshot.phase, 'NIGHT')
    assert.equal(Object.hasOwn(postTribunalNightSnapshot.snapshot, 'nightResult'), false)
    assert.equal(Object.hasOwn(postTribunalNightSnapshot.snapshot, 'dayVoteResolution'), false)
    assert.equal(Object.hasOwn(postTribunalNightSnapshot.snapshot, 'tribunal'), false)

    // --- 5) night-kill ENDED(필수 회귀, JOKER 승리) — 이번엔 nightResolution.dayIndex(1)가
    // session.dayIndex(1)와 일치한다(같은 사이클의 밤 킬이 곧바로 종료시켰다는 신호) — 그런데도
    // 지난 TRIBUNAL 사이클의 dayVoteResolution/tribunal이 여전히 같은 dayIndex(1)로 남아있으므로,
    // dayIndex 일치만으로 판단했다면 잘못 노출됐을 것이다.
    const nightKillOutcome = resolveJokerOnlyNight(session, 'snB2', 'snB4') // snB4(CITIZEN) 사망 → 생존 JOKER 1 >= 생존 CITIZEN 1
    assert.deepEqual(nightKillOutcome, { ok: true, victimUuid: 'snB4', terminal: { winner: 'JOKER' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    assert.equal(session.nightResolution.dayIndex, session.dayIndex)

    const endedSnapshot = getSessionSnapshotForPlayer('snB1', session.id)
    assert.equal(endedSnapshot.ok, true)
    assert.deepEqual(
        Object.keys(endedSnapshot.snapshot).sort(),
        ['dayIndex', 'gameId', 'nightResult', 'phase', 'players', 'self', 'winResult'],
    )
    assert.deepEqual(endedSnapshot.snapshot.nightResult, {
        dayIndex: 1,
        victimUuid: 'snB4',
        deathReveals: [{ victimUuid: 'snB4', source: 'JOKER' }],
    })
    assert.deepEqual(endedSnapshot.snapshot.winResult, { winner: 'JOKER' })
    assert.equal(Object.hasOwn(endedSnapshot.snapshot, 'dayVoteResolution'), false)
    assert.equal(Object.hasOwn(endedSnapshot.snapshot, 'tribunal'), false)

    assertNoForbiddenPrivateData(endedSnapshot.snapshot, collectOtherPlayerRoleSecrets(session, 'snB1'))

    // buildSessionSnapshot을 직접 호출해도(getSessionSnapshotForPlayer를 거치지 않고) 동일한
    // 구조를 반환한다 — get_session_snapshot 계약이 이 순수 함수 하나로 완결됨을 확인한다.
    assert.deepEqual(buildSessionSnapshot(session, 'snB1'), endedSnapshot.snapshot)
})

// ---------------------------------------------------------------------------
// 공개 DAY 채팅 / 사망자 전용 채팅 — prepareGameChatMessage · commitGameChatMessage ·
// getChatRecipientUuids (실제 export를 직접 구동한다. mock·stub 없이 canonical registry를
// 그대로 쓰고, 검증도 canonical session 상태로만 한다.)
// ---------------------------------------------------------------------------

// --- 채널 라우팅: 생존자 ---

test('prepareGameChatMessage: 생존자 + DAY → DAY 채널로 라우팅되고 두 rate limit Map은 호출 전후 불변이다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-day', phase: 'DAY' })
    const [actor] = citizenUuids
    const before = chatRateLimitSnapshot(session)

    const result = prepareGameChatMessage(actor, session.id, '안녕하세요', { now: () => 1000 })

    assert.equal(result.ok, true)
    assert.equal(result.channel, CHAT_CHANNELS.DAY)
    assert.equal(result.session, session)
    assert.equal(result.actorUuid, actor)
    assert.deepEqual(chatRateLimitSnapshot(session), before)
})

test('prepareGameChatMessage: 생존자는 DAY 외 모든 phase에서 INVALID_PHASE이고 Map은 불변이다', () => {
    for (const phase of ['ROLE_REVEAL', 'NIGHT', 'TRIBUNAL']) {
        gameSession.__resetStateForTests()
        const { session, citizenUuids } = setupGameChatSession({ id: `room-gc-alive-${phase}`, phase })
        const [actor] = citizenUuids
        const before = chatRateLimitSnapshot(session)

        assert.deepEqual(prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 }), {
            ok: false,
            code: 'INVALID_PHASE',
        })
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }
})

test('prepareGameChatMessage: 생존자는 ENDED에서 INVALID_PHASE가 아니라 GAME_ALREADY_ENDED로 먼저 걸린다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-alive-ended', phase: 'ENDED' })
    const [actor] = citizenUuids

    const result = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })

    assert.equal(result.ok, false)
    assert.equal(result.code, 'GAME_ALREADY_ENDED')
})

// --- 채널 라우팅: 사망자 ---

test('prepareGameChatMessage: 사망자는 ROLE_REVEAL/NIGHT/DAY/TRIBUNAL 어디서도 발행할 수 없고(NOT_ELIGIBLE) Map은 불변이다', () => {
    // 사망자는 공개 채널의 관전자다 — 읽기(getChatRecipientUuids)는 열려 있지만 쓰기는 없다.
    for (const phase of ['ROLE_REVEAL', 'NIGHT', 'DAY', 'TRIBUNAL']) {
        gameSession.__resetStateForTests()
        const { session, citizenUuids } = setupGameChatSession({ id: `room-gc-dead-${phase}`, phase })
        const [actor] = citizenUuids
        session.players.get(actor).alive = false
        const before = chatRateLimitSnapshot(session)

        assert.deepEqual(prepareGameChatMessage(actor, session.id, '사망자 대화', { now: () => 1000 }), {
            ok: false,
            code: 'NOT_ELIGIBLE',
        })
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }
})

test('prepareGameChatMessage: 사망자의 ENDED는 NOT_ELIGIBLE이 아니라 GAME_ALREADY_ENDED로 먼저 걸린다', () => {
    gameSession.__resetStateForTests()
    const ended = setupGameChatSession({ id: 'room-gc-dead-ended', phase: 'ENDED' })
    const endedActor = ended.citizenUuids[0]
    ended.session.players.get(endedActor).alive = false
    const endedResult = prepareGameChatMessage(endedActor, ended.session.id, '안녕', { now: () => 1000 })
    assert.equal(endedResult.ok, false)
    assert.equal(endedResult.code, 'GAME_ALREADY_ENDED')
    assert.deepEqual(chatRateLimitSnapshot(ended.session).DEAD, [])
})

// --- registry 안전성: 오래된 게임 / 비참가자 / 사라진 세션 ---

test('prepareGameChatMessage: 오래된 gameId·비참가자·세션 소실은 전부 안전하게 거부되고 어떤 Map도 바뀌지 않는다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-registry', phase: 'DAY' })
    const [actor] = citizenUuids
    const before = chatRateLimitSnapshot(session)

    // (1) 활성 세션이 없는 uuid
    assert.deepEqual(prepareGameChatMessage('outsider-uuid', session.id, '안녕'), { ok: false, code: 'NOT_IN_SESSION' })
    // (2) 지금 세션과 다른(오래된) gameId
    assert.deepEqual(prepareGameChatMessage(actor, 'previous-game-id', '안녕'), {
        ok: false,
        code: 'STALE_SESSION_MISMATCH',
    })
    // (3) gameId 형태 자체가 비어있음
    assert.deepEqual(prepareGameChatMessage(actor, '   ', '안녕'), { ok: false, code: 'INVALID_GAME_ID' })
    assert.deepEqual(prepareGameChatMessage(actor, 123, '안녕'), { ok: false, code: 'INVALID_GAME_ID' })
    assert.deepEqual(chatRateLimitSnapshot(session), before)

    // (4) registry 불일치 — playerSession엔 있지만 gameSessions에서 사라짐
    __deleteGameSessionOnlyForTests(session.id)
    assert.deepEqual(prepareGameChatMessage(actor, session.id, '안녕'), { ok: false, code: 'SESSION_NOT_FOUND' })
})

test('prepareGameChatMessage: session.players에서 제거된 uuid는 NOT_A_PARTICIPANT이고 Map은 불변이다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-nonmember', phase: 'DAY' })
    const [actor] = citizenUuids
    session.players.delete(actor)
    const before = chatRateLimitSnapshot(session)

    assert.deepEqual(prepareGameChatMessage(actor, session.id, '안녕'), { ok: false, code: 'NOT_A_PARTICIPANT' })
    assert.deepEqual(chatRateLimitSnapshot(session), before)
})

// --- 위조 방어: 클라이언트가 채널·발신자를 고를 수 없다 ---

test('prepareGameChatMessage: 인자에 없는 채널·발신자·닉네임 필드를 아무리 실어도 라우팅은 canonical 상태만 따른다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-forge', phase: 'DAY' })
    const [actor, victim] = citizenUuids

    // text 자리에 채널/발신자를 위조한 객체를 넣어도 문자열이 아니므로 sanitize에서 걸린다.
    assert.deepEqual(prepareGameChatMessage(actor, session.id, { text: '안녕', channel: 'DEAD', senderUuid: victim }), {
        ok: false,
        code: 'INVALID_CHARACTERS',
    })

    // gameId 자리에 객체를 넣어도 정규화 단계에서 걸린다.
    assert.deepEqual(prepareGameChatMessage(actor, { id: session.id, channel: 'DEAD' }, '안녕'), {
        ok: false,
        code: 'INVALID_GAME_ID',
    })

    // 생존한 발신자가 얻는 채널은 언제나 DAY 하나뿐이다.
    const alive = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    assert.equal(alive.channel, CHAT_CHANNELS.DAY)

    // 사망한 발신자는 어떤 채널도 얻지 못한다 — DEAD는 되살릴 수 없는 퇴역 채널이다.
    session.players.get(victim).alive = false
    assert.deepEqual(prepareGameChatMessage(victim, session.id, '안녕', { now: () => 1000 }), {
        ok: false,
        code: 'NOT_ELIGIBLE',
    })
})

test('prepareGameChatMessage: 성공 반환값의 키는 정확한 화이트리스트뿐이고 role/team/alive/allies는 어디에도 없다', () => {
    const { session, jokerUuid } = setupGameChatSession({ id: 'room-gc-whitelist', phase: 'DAY' })

    const result = prepareGameChatMessage(jokerUuid, session.id, '안녕', { now: () => 1000 })

    assert.deepEqual(Object.keys(result).sort(), [
        'actorUuid',
        'channel',
        'dayIndex',
        'message',
        'nickname',
        'ok',
        'sanitizedText',
        'sentAt',
        'session',
    ])
    // 발신자 식별·시각·인덱스는 전부 canonical 서버 상태에서 온 값이다.
    assert.equal(result.actorUuid, jokerUuid)
    assert.equal(result.nickname, session.players.get(jokerUuid).nickname)
    assert.equal(result.dayIndex, session.dayIndex)
    // 밖으로 나갈 공개 메시지는 정확히 7개 키뿐이고 전부 canonical 값이다.
    assert.deepEqual(Object.keys(result.message).sort(), [
        'dayIndex',
        'gameId',
        'messageId',
        'nickname',
        'senderUuid',
        'sentAt',
        'text',
    ])
    assert.equal(result.message.gameId, session.id)
    assert.equal(result.message.senderUuid, jokerUuid)
    assert.equal(result.message.sentAt, result.sentAt)
    assert.equal(typeof result.message.messageId, 'string')
    assert.equal(result.message.messageId.length > 0, true)
    // 능력 자체는 어떤 필드로도 노출되지 않는다 — prepared 객체 참조 그 자체가 유일한 열쇠다.
    const { session: _session, ...publicish } = result
    const serialized = JSON.stringify(publicish)
    for (const secret of ['JOKER', 'role', 'team', 'alive', 'allies']) {
        assert.equal(serialized.includes(secret), false, `${secret}가 노출되면 안 된다`)
    }
})

test('prepareGameChatMessage: messageId는 canonical 값이고 idFn 실패는 원자적으로 거부된다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-message-id', phase: 'DAY' })
    const [actor] = citizenUuids
    const before = chatRateLimitSnapshot(session)

    // 앞뒤 공백이 있는 유효 문자열은 trim된 값이 canonical messageId가 된다.
    const trimmed = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000, idFn: () => '  msg-1  ' })
    assert.equal(trimmed.message.messageId, 'msg-1')

    for (const [idFn, code] of [
        [() => { throw new Error('id 실패(테스트 주입)') }, 'ID_GENERATION_ERROR'],
        [() => '   ', 'INVALID_MESSAGE_ID'],
        [() => '', 'INVALID_MESSAGE_ID'],
        [() => 42, 'INVALID_MESSAGE_ID'],
        [() => null, 'INVALID_MESSAGE_ID'],
    ]) {
        assert.deepEqual(prepareGameChatMessage(actor, session.id, '안녕', { now: () => 2000, idFn }), {
            ok: false,
            code,
        })
        assert.deepEqual(chatRateLimitSnapshot(session), before, 'ID 실패는 어떤 Map도 건드리지 않는다')
    }

    // 서로 다른 요청은 서로 다른 messageId를 받는다(기본 생성기).
    const first = prepareGameChatMessage(actor, session.id, '첫', { now: () => 3000 })
    assert.equal(commitPrepared(first).ok, true)
    const second = prepareGameChatMessage(actor, session.id, '둘', { now: () => 4000 })
    assert.notEqual(first.message.messageId, second.message.messageId)
})

// --- 텍스트 규칙(두 채널 공용) ---

test('prepareGameChatMessage: 한글·이모지·내부 LF는 통과하고 앞뒤 공백은 trim된다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-text-ok', phase: 'DAY' })
    const [actor] = citizenUuids

    for (const [input, expected] of [
        ['  안녕하세요  ', '안녕하세요'],
        ['🙂🎭', '🙂🎭'],
        ['첫 줄\n둘째 줄', '첫 줄\n둘째 줄'],
        ['CRLF\r\n정규화', 'CRLF\n정규화'],
    ]) {
        session.dayChatRateLimit.clear()
        const result = prepareGameChatMessage(actor, session.id, input, { now: () => 1000 })
        assert.equal(result.ok, true, `${JSON.stringify(input)}는 통과해야 한다`)
        assert.equal(result.sanitizedText, expected)
    }
})

test('prepareGameChatMessage: 빈 문자열·초과 길이·제어문자·bidi 문자는 거부되고 Map은 불변이다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-text-bad', phase: 'DAY' })
    const [actor] = citizenUuids
    const before = chatRateLimitSnapshot(session)

    const cases = [
        ['', 'EMPTY_MESSAGE'],
        ['   \n  ', 'EMPTY_MESSAGE'],
        ['x'.repeat(CHAT_MAX_LENGTH + 1), 'MESSAGE_TOO_LONG'],
        ['탭\t포함', 'INVALID_CHARACTERS'],
        [`NUL${String.fromCharCode(0x0000)}포함`, 'INVALID_CHARACTERS'],
        [`DEL${String.fromCharCode(0x007f)}포함`, 'INVALID_CHARACTERS'],
        [`NEL${String.fromCharCode(0x0085)}포함`, 'INVALID_CHARACTERS'],
        [`ALM${String.fromCharCode(0x061c)}포함`, 'INVALID_CHARACTERS'],
        [`LRM${String.fromCharCode(0x200e)}포함`, 'INVALID_CHARACTERS'],
        [`RLM${String.fromCharCode(0x200f)}포함`, 'INVALID_CHARACTERS'],
        [`RLO${String.fromCharCode(0x202e)}포함`, 'INVALID_CHARACTERS'],
        [`isolate${String.fromCharCode(0x2066)}포함`, 'INVALID_CHARACTERS'],
    ]
    for (const [input, code] of cases) {
        assert.deepEqual(prepareGameChatMessage(actor, session.id, input, { now: () => 1000 }), { ok: false, code })
    }
    // 정확히 상한 길이는 통과한다(경계값).
    assert.equal(prepareGameChatMessage(actor, session.id, 'x'.repeat(CHAT_MAX_LENGTH), { now: () => 1000 }).ok, true)
    assert.deepEqual(chatRateLimitSnapshot(session), before, '실패한 검증은 rate limit을 소비하지 않는다')
})

// --- rate limit 채널 격리 ---

test('DAY의 rate limit은 발신자별로 분리돼 한 사람의 전송이 다른 사람의 간격 판정에 영향을 주지 않는다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-rl', phase: 'DAY' })
    const [first, second] = citizenUuids

    assert.equal(commitPrepared(prepareGameChatMessage(first, session.id, '낮 1', { now: () => 1000 })).ok, true)
    // 다른 사람의 기록이 있어도 자기 첫 전송은 간격 제한에 걸리지 않는다.
    assert.equal(commitPrepared(prepareGameChatMessage(second, session.id, '낮 1', { now: () => 1000 })).ok, true)

    assert.deepEqual([...session.dayChatRateLimit.entries()], [[first, 1000], [second, 1000]])
    assert.equal(session.deadChatRateLimit.size, 0, '퇴역한 DEAD Map으로는 아무것도 흘러들지 않는다')
    assert.equal(session.jokerChatRateLimit.size, 0)

    // 자기 자신의 기록에만 간격 제한이 걸린다.
    assert.deepEqual(prepareGameChatMessage(first, session.id, '낮 2', { now: () => 1100 }), {
        ok: false,
        code: 'RATE_LIMITED',
    })
    // 간격을 넘기면 다시 통과한다.
    assert.equal(prepareGameChatMessage(first, session.id, '낮 3', { now: () => 1600 }).ok, true)
})

test('DAY에서 보낸 직후 사망하면 그 다음 발행은 채널을 갈아타지 않고 그대로 거부된다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-rl-cross', phase: 'DAY' })
    const [actor] = citizenUuids

    const dayPrepared = prepareGameChatMessage(actor, session.id, '낮', { now: () => 1000 })
    assert.equal(commitPrepared(dayPrepared).ok, true)

    session.players.get(actor).alive = false

    // 간격을 충분히 넘긴 시각이어도(RATE_LIMITED가 아니어야 한다) 사망 자체로 막힌다.
    assert.deepEqual(prepareGameChatMessage(actor, session.id, '사망 직후', { now: () => 2000 }), {
        ok: false,
        code: 'NOT_ELIGIBLE',
    })
    assert.equal(session.deadChatRateLimit.size, 0)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 1000]], '거부된 요청은 기준 시각도 밀지 못한다')
})

// --- 시계 이상값 원자성 ---

test('prepareGameChatMessage: now()가 이상값을 반환하면 INVALID_CLOCK_VALUE이고 두 Map 모두 불변이다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-clock', phase: 'DAY' })
    const [actor] = citizenUuids
    const before = chatRateLimitSnapshot(session)

    for (const bad of [NaN, Infinity, -Infinity, -1, 1.5, undefined, null, '1000']) {
        assert.deepEqual(prepareGameChatMessage(actor, session.id, '안녕', { now: () => bad }), {
            ok: false,
            code: 'INVALID_CLOCK_VALUE',
        })
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }
})

test('prepareGameChatMessage: now()가 throw하면 예외가 그대로 전파되고 두 Map 모두 불변이다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-clock-throw', phase: 'DAY' })
    const [actor] = citizenUuids
    const before = chatRateLimitSnapshot(session)

    assert.throws(() =>
        prepareGameChatMessage(actor, session.id, '안녕', {
            now: () => {
                throw new Error('시계 실패(테스트 주입)')
            },
        }),
    )
    assert.deepEqual(chatRateLimitSnapshot(session), before)
})

// --- commitGameChatMessage: commit 시점 재검증 ---

test('commitGameChatMessage: 정상 경로는 유도된 채널의 Map만 갱신하고 canonical gameId/channel/message를 돌려준다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-ok', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })

    const committed = commitPrepared(prepared)

    assert.equal(committed.ok, true)
    assert.equal(committed.gameId, session.id)
    assert.equal(committed.channel, CHAT_CHANNELS.DAY)
    // 반환된 메시지는 준비된 canonical 메시지와 정확히 같은 값이되, 사본이라 서로 영향이 없다.
    assert.deepEqual(committed.message, prepared.message)
    assert.notEqual(committed.message, prepared.message)
    // 준비된 그 sentAt이 그대로, 유도된 채널의 Map에만 기록된다.
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 1000]])
    assert.equal(session.deadChatRateLimit.size, 0)
    assert.equal(session.jokerChatRateLimit.size, 0)
})

test('commitGameChatMessage: 세션 밖 발신자(outsider)는 거부되고 두 Map 모두 바뀌지 않는다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-outsider', phase: 'DAY' })
    const [actor, other] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    const otherPrepared = prepareGameChatMessage(other, session.id, '안녕', { now: () => 1000 })
    const before = chatRateLimitSnapshot(session)

    // (1) 세션에는 속해 있지만 players에서 제거된 발신자
    session.players.delete(actor)
    assert.deepEqual(commitPrepared(prepared), { ok: false, code: 'NOT_A_PARTICIPANT' })

    // (2) 세션 자체에서 이탈해 playerSession 매핑이 사라진 발신자
    endGameSessionForPlayer(other, 'LEAVE')
    assert.deepEqual(commitPrepared(otherPrepared), { ok: false, code: 'NOT_IN_SESSION' })

    assert.deepEqual(chatRateLimitSnapshot(session), before)
})

test('commitGameChatMessage: prepare 이후 phase가 넘어가면(DAY→NIGHT) 거부되고 두 Map 모두 바뀌지 않는다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-phase', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    const before = chatRateLimitSnapshot(session)

    session.phase = 'NIGHT' // prepare~commit 사이의 밤 전이

    assert.deepEqual(commitPrepared(prepared), {
        ok: false,
        code: 'INVALID_PHASE',
    })
    assert.deepEqual(chatRateLimitSnapshot(session), before)
})

test('commitGameChatMessage: prepare 이후 사망이 확정되면 발행 권한을 잃어 커밋되지 않는다(NOT_ELIGIBLE)', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-alive', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    assert.equal(prepared.channel, CHAT_CHANNELS.DAY)
    const before = chatRateLimitSnapshot(session)

    session.players.get(actor).alive = false // prepare~commit 사이의 사망

    assert.deepEqual(commitPrepared(prepared), {
        ok: false,
        code: 'NOT_ELIGIBLE',
    })
    assert.deepEqual(chatRateLimitSnapshot(session), before, '어느 Map으로도 새어 들어가지 않는다')
})

test('commitGameChatMessage: prepare 이후 dayIndex가 바뀌면 거부된다(준비된 그 날의 메시지만 커밋된다)', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-day-index', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    const before = chatRateLimitSnapshot(session)

    session.dayIndex += 1

    assert.deepEqual(commitPrepared(prepared), { ok: false, code: 'STALE_CHAT_REQUEST' })
    assert.deepEqual(chatRateLimitSnapshot(session), before)
})

test('commitGameChatMessage: registry에서 세션이 사라지면 SESSION_NOT_FOUND이고 Map은 불변이다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-gone', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    const before = chatRateLimitSnapshot(session)

    __deleteGameSessionOnlyForTests(session.id)

    assert.deepEqual(commitPrepared(prepared), {
        ok: false,
        code: 'SESSION_NOT_FOUND',
    })
    assert.deepEqual(chatRateLimitSnapshot(session), before)
})

test('commitGameChatMessage: 세션이 ENDED로 전이하면 GAME_ALREADY_ENDED이고 Map은 불변이다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-ended', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    const before = chatRateLimitSnapshot(session)

    session.phase = 'ENDED'

    const result = commitPrepared(prepared)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'GAME_ALREADY_ENDED')
    assert.deepEqual(chatRateLimitSnapshot(session), before)
})

test('commitGameChatMessage: commit 자신의 시계가 이상값이면 INVALID_CLOCK_VALUE이고 Map은 불변이다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-own-clock', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    const before = chatRateLimitSnapshot(session)

    for (const bad of [NaN, Infinity, -Infinity, -1, 1.5, undefined, null, '1000']) {
        assert.deepEqual(commitPrepared(prepared, { now: bad }), {
            ok: false,
            code: 'INVALID_CLOCK_VALUE',
        })
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }

    // 능력은 소모되지 않았다 — 정상 시계로는 그대로 통과한다(양성 대조).
    assert.equal(commitPrepared(prepared).ok, true)
})

test('commitGameChatMessage: commit 시계보다 미래이거나 지나치게 오래된 sentAt은 거부된다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-window', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1_000_000 })
    const before = chatRateLimitSnapshot(session)

    // (a) commit 시계가 준비 시각보다 과거다 = 미래 시각을 심으려는 상황.
    for (const past of [999_999, 1_000_000 - CHAT_MIN_INTERVAL_MS, 0]) {
        assert.deepEqual(commitPrepared(prepared, { now: past }), { ok: false, code: 'STALE_CHAT_TIMESTAMP' })
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }

    // (b) 상한을 1ms 넘긴 지연 커밋은 재생 공격으로 보고 거부한다.
    assert.deepEqual(commitPrepared(prepared, { now: 1_000_000 + CHAT_COMMIT_MAX_AGE_MS + 1 }), {
        ok: false,
        code: 'STALE_CHAT_TIMESTAMP',
    })
    assert.deepEqual(chatRateLimitSnapshot(session), before)

    // 경계값(정확히 상한만큼 지연)은 통과한다.
    assert.equal(commitPrepared(prepared, { now: 1_000_000 + CHAT_COMMIT_MAX_AGE_MS }).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 1_000_000]])
})

// --- 요청 단위 바인딩: prepare가 발급한 단일 사용 능력(capability) ---

test('commitGameChatMessage: 손으로 조립한 prepared 번들은 모든 값이 canonical해도 거부된다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-handbuilt', phase: 'DAY' })
    const [actor] = citizenUuids
    const before = chatRateLimitSnapshot(session)

    // 세션 동일성·멤버십·채널 라우팅·시각 규칙(미래 아님·age 이내·간격 없음)을 전부 만족하도록
    // 손으로 맞춘 번들이다 — 그래도 production prepare가 만든 그 객체가 아니면 Map에 닿지 못한다.
    const forged = handBuiltPrepared({
        session,
        channel: CHAT_CHANNELS.DAY,
        actorUuid: actor,
        nickname: session.players.get(actor).nickname,
        text: '안녕',
        sentAt: 10_000,
        dayIndex: session.dayIndex,
    })
    assert.deepEqual(commitGameChatMessage(forged, { now: () => 10_000 }), { ok: false, code: 'STALE_CHAT_REQUEST' })

    // prepared가 아예 객체가 아닌 경우도 같은 코드로 fail-closed다.
    for (const bad of [null, undefined, 'prepared', 42, [], true]) {
        assert.deepEqual(commitGameChatMessage(bad, { now: () => 10_000 }), { ok: false, code: 'STALE_CHAT_REQUEST' })
    }
    assert.deepEqual(chatRateLimitSnapshot(session), before)

    // 같은 값이라도 prepare를 거친 능력이면 통과한다(양성 대조).
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 10_000 })
    assert.equal(commitPrepared(prepared).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 10_000]])
})

test('commitGameChatMessage: 노출된 sentAt만 바꿔치기하면 원자적으로 거부된다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-tamper-sent', phase: 'DAY' })
    const [actor] = citizenUuids
    const before = chatRateLimitSnapshot(session)

    // 전부 commit의 시각 규칙 안에 있는 값이다(미래 아님·5초 이내·간격 제한 대상 아님) —
    // 그럼에도 준비된 sentAt이 아니므로 rate limit 기준 시각을 흔들지 못한다.
    for (const forgedSentAt of [9_999, 10_001, 10_500, 12_000, NaN, -1, '10000']) {
        const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 10_000 })
        tamperPrepared(prepared, { sentAt: forgedSentAt })
        assert.deepEqual(commitPrepared(prepared, { now: 12_000 }), { ok: false, code: 'STALE_CHAT_REQUEST' })
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }

    // 공개 메시지 쪽 sentAt만 바꿔도 마찬가지다.
    const messageOnly = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 10_000 })
    tamperPrepared(messageOnly, { message: { sentAt: 12_000 } })
    assert.deepEqual(commitPrepared(messageOnly, { now: 12_000 }), { ok: false, code: 'STALE_CHAT_REQUEST' })
    assert.deepEqual(chatRateLimitSnapshot(session), before)

    // 손대지 않은 요청은 준비된 그 값으로 통과한다(양성 대조).
    const clean = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 10_000 })
    assert.equal(commitPrepared(clean, { now: 12_000 }).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 10_000]])
})

test('commitGameChatMessage: 노출된 sentAt과 message.sentAt을 함께 맞춰 바꿔도 사설 능력 기록이 거부한다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-tamper-both', phase: 'DAY' })
    const [actor] = citizenUuids
    const before = chatRateLimitSnapshot(session)

    // 두 노출 값이 서로 일치하도록 정교하게 맞춰도(=번들 안에서는 모순이 없어도) 통과하지 못한다.
    for (const forgedSentAt of [9_999, 10_001, 11_000]) {
        const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 10_000 })
        tamperPrepared(prepared, { sentAt: forgedSentAt, message: { sentAt: forgedSentAt } })
        assert.deepEqual(commitPrepared(prepared, { now: 12_000 }), { ok: false, code: 'STALE_CHAT_REQUEST' })
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }

    // 다른 노출 필드(세션·채널·발신자·닉네임·본문·dayIndex·messageId)도 똑같이 막힌다.
    const other = setupGameChatSession({
        id: 'room-gc-commit-tamper-both-other',
        phase: 'DAY',
        uuids: ['tb1', 'tb2', 'tb3', 'tb4'],
    })
    const tampers = [
        { session: other.session },
        { session: { ...session } },
        { channel: CHAT_CHANNELS.DEAD },
        { channel: 'JOKER' },
        { actorUuid: citizenUuids[1] },
        { nickname: 'forged-nickname' },
        { sanitizedText: '위조된 본문' },
        { dayIndex: 99 },
        { ok: false },
        { message: { messageId: 'forged-id' } },
        { message: { senderUuid: citizenUuids[1] } },
        { message: { text: '위조된 본문' } },
        { message: { gameId: other.session.id } },
        { message: { dayIndex: 99 } },
        { message: null },
    ]
    for (const patch of tampers) {
        const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 10_000 })
        tamperPrepared(prepared, patch)
        assert.deepEqual(
            commitGameChatMessage(prepared, { now: () => 10_000 }),
            { ok: false, code: 'STALE_CHAT_REQUEST' },
            `${JSON.stringify(patch)} 변조는 거부돼야 한다`,
        )
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }
    assert.equal(other.session.dayChatRateLimit.size, 0, '다른 세션의 Map도 건드리지 않는다')
})

test('commitGameChatMessage: 능력은 단일 사용이다 — 커밋에 성공한 prepared의 재생은 거부된다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-single-use', phase: 'DAY' })
    const [actor] = citizenUuids

    const first = prepareGameChatMessage(actor, session.id, '첫 번째', { now: () => 10_000 })
    assert.equal(commitPrepared(first).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 10_000]])

    // (1) 같은 시각의 즉시 재생.
    assert.deepEqual(commitPrepared(first), { ok: false, code: 'STALE_CHAT_REQUEST' })
    // (2) 간격을 훌쩍 넘긴 뒤의 재생(간격 검사는 통과할 시각이지만 능력이 이미 소모됐다).
    assert.deepEqual(commitPrepared(first, { now: 10_000 + CHAT_COMMIT_MAX_AGE_MS }), {
        ok: false,
        code: 'STALE_CHAT_REQUEST',
    })
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 10_000]], '재생은 기준 시각을 밀지 못한다')

    // 새로 준비한 요청만 통과한다(양성 대조).
    const second = prepareGameChatMessage(actor, session.id, '두 번째', { now: () => 10_600 })
    assert.equal(commitPrepared(second).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 10_600]])
})

test('commitGameChatMessage: 동시에 준비된 두 요청 중 나중 것을 먼저 커밋하면 남은 오래된 요청은 거부된다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-concurrent', phase: 'DAY' })
    const [actor] = citizenUuids

    // 간격을 정확히 만족하는 두 요청을 나란히 준비해 둔다(둘 다 이 시점엔 유효하다).
    const older = prepareGameChatMessage(actor, session.id, '먼저 준비', { now: () => 10_000 })
    const newer = prepareGameChatMessage(actor, session.id, '나중 준비', { now: () => 10_000 + CHAT_MIN_INTERVAL_MS })
    assert.equal(older.ok, true)
    assert.equal(newer.ok, true)

    // 나중 요청이 먼저 커밋된다.
    assert.equal(commitPrepared(newer).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 10_500]])

    // 이제 오래된 요청은 더 이상 현재 기준 시각과의 간격을 만족하지 못한다 — 기준 시각을 과거로
    // 되돌리지 못하고 거부된다.
    assert.deepEqual(commitPrepared(older, { now: 10_500 }), { ok: false, code: 'STALE_CHAT_TIMESTAMP' })
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 10_500]])
})

test('commitGameChatMessage: 각 능력은 유도된 채널의 Map에만 자기 발신자를 기록한다(채널 격리)', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-channel-cross', phase: 'DAY' })
    const [first, second] = citizenUuids

    const firstPrepared = prepareGameChatMessage(first, session.id, '낮 1', { now: () => 1000 })
    const secondPrepared = prepareGameChatMessage(second, session.id, '낮 2', { now: () => 1000 })
    assert.equal(firstPrepared.channel, CHAT_CHANNELS.DAY)
    assert.equal(secondPrepared.channel, CHAT_CHANNELS.DAY)

    assert.equal(commitPrepared(firstPrepared).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[first, 1000]])
    assert.equal(session.deadChatRateLimit.size, 0)
    assert.equal(session.jokerChatRateLimit.size, 0)

    assert.equal(commitPrepared(secondPrepared).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[first, 1000], [second, 1000]])
    // 퇴역한 DEAD와 JOKER 채널의 Map은 공개 채팅으로는 절대 갱신되지 않는다.
    assert.equal(session.deadChatRateLimit.size, 0)
    assert.equal(session.jokerChatRateLimit.size, 0)
})

test('commitGameChatMessage: 실패한 커밋을 여러 번 시도해도 두 Map 모두 끝까지 완전히 불변이다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-atomic', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    const before = chatRateLimitSnapshot(session)

    const attempts = [
        () => commitPrepared(prepared, { now: 999 }), // 미래 sentAt
        () => commitPrepared(prepared, { now: NaN }),
        () => commitPrepared(prepared, { now: 1000 + CHAT_COMMIT_MAX_AGE_MS + 1 }),
        () => commitGameChatMessage({ ...prepared }, { now: () => 1000 }), // 얕은 복사본은 능력이 없다
        () => commitGameChatMessage(null, { now: () => 1000 }),
        () => commitGameChatMessage(prepared.message, { now: () => 1000 }),
    ]
    for (const attempt of attempts) {
        assert.equal(attempt().ok, false)
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }

    // 실패가 아무리 반복돼도 준비된 요청 자체는 살아있다 — 소모되지 않은 능력은 그대로다.
    assert.equal(commitPrepared(prepared).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[actor, 1000]])
})

// --- getChatRecipientUuids ---

test('getChatRecipientUuids: DAY는 관전 중인 사망자까지 참가자 전원이고, 퇴역한 DEAD는 언제나 빈 배열이다', () => {
    const { session, citizenUuids, jokerUuid } = setupGameChatSession({ id: 'room-gc-recip', phase: 'DAY' })
    const [deadOne, deadTwo] = citizenUuids
    session.players.get(deadOne).alive = false
    session.players.get(deadTwo).alive = false

    const dayRecipients = getChatRecipientUuids(session, CHAT_CHANNELS.DAY)

    assert.deepEqual(dayRecipients.sort(), [...citizenUuids, jokerUuid].sort())
    assert.equal(dayRecipients.length, session.players.size)
    // 수신은 열려 있지만 발행은 아니다 — 사망자는 관전자일 뿐이다.
    for (const uuid of [deadOne, deadTwo]) {
        assert.deepEqual(prepareGameChatMessage(uuid, session.id, '안녕', { now: () => 1000 }), {
            ok: false,
            code: 'NOT_ELIGIBLE',
        })
    }
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [])
})

test('getChatRecipientUuids: 알 수 없는 채널과 퇴역한 DEAD는 빈 배열이다(fail-closed)', () => {
    const { session } = setupGameChatSession({ id: 'room-gc-recip-unknown', phase: 'DAY' })

    for (const channel of [CHAT_CHANNELS.DEAD, null, undefined, '', 'day', 'UNKNOWN', 42]) {
        assert.deepEqual(getChatRecipientUuids(session, channel), [])
    }
})

test('getChatRecipientUuids: 읽기 전용이다 — 호출해도 session.players와 어떤 Map도 바뀌지 않는다', () => {
    const { session } = setupGameChatSession({ id: 'room-gc-recip-pure', phase: 'DAY' })
    const before = chatRateLimitSnapshot(session)
    const playersBefore = [...session.players.entries()].map(([uuid, p]) => [uuid, { ...p }])

    for (const channel of [CHAT_CHANNELS.DAY, CHAT_CHANNELS.DEAD, CHAT_CHANNELS.JOKER]) {
        getChatRecipientUuids(session, channel)
    }

    assert.deepEqual(chatRateLimitSnapshot(session), before)
    assert.deepEqual([...session.players.entries()].map(([uuid, p]) => [uuid, { ...p }]), playersBefore)
})

// --- 사망한 JOKER: 밤의 팀 채널에는 그대로 남는다 ---

test('사망한 JOKER는 JOKER 채팅을 계속 쓸 수 있고 JOKER 수신자에도 남지만, 공개 채팅은 막힌다', () => {
    const { session, jokerUuid } = setupGameChatSession({ id: 'room-gc-dead-joker', phase: 'NIGHT' })

    // 살아있는 동안에는 JOKER 채널의 수신자이자 발신자다.
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.JOKER), [jokerUuid])
    assert.equal(prepareJokerChatMessage(jokerUuid, session.id, '살아있는 JOKER', { now: () => 1000 }).ok, true)

    session.players.get(jokerUuid).alive = false

    // 사망해도 팀 채널의 자격은 그대로다(생존은 이 판정의 입력이 아니다).
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.JOKER), [jokerUuid])
    const deadJokerChat = prepareJokerChatMessage(jokerUuid, session.id, '죽은 JOKER', { now: () => 2000 })
    assert.equal(deadJokerChat.ok, true)
    assert.equal(session.jokerChatRateLimit.size, 0, '준비만으로는 rate limit을 소비하지 않는다')
    assert.deepEqual(commitJokerChatMessage(session, jokerUuid, deadJokerChat.sentAt), { ok: true })
    assert.deepEqual([...session.jokerChatRateLimit.entries()], [[jokerUuid, 2000]])

    // 반면 공개 채팅은 사망으로 막히고, 퇴역한 DEAD 채널도 열리지 않는다.
    assert.deepEqual(prepareGameChatMessage(jokerUuid, session.id, '사망자 대화', { now: () => 2000 }), {
        ok: false,
        code: 'NOT_ELIGIBLE',
    })
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [])
})
