const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const {
    assignRoles,
    validateSessionInput,
    buildSessionCandidate,
    checkGameSessionPreconditions,
    assertValidSessionForCommit,
    getSpecialRoleBudget,
    computeRoleComposition,
    isEligibleForNightAction,
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
    submitNightAction,
    submitDayVote,
    prepareDayVoteResolution,
    commitDayVoteResolution,
    buildDayVoteResolvedPayload,
    prepareJokerChatMessage,
    commitJokerChatMessage,
    JOKER_CHAT_MAX_LENGTH,
    GAME_ROLES,
    ROLE_DEFINITIONS,
    ROLE_TEAMS,
} = gameSession

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

function makePlayer(uuid, nickname = `nick-${uuid}`) {
    return { uuid, nickname, isReady: true }
}

/** buildSessionCandidate/prepareGameSession이 받는 room 형태를 흉내낸다. */
function makeRoom({ id = 'room-1', players, jokerCount = 1 } = {}) {
    const playerList = players ?? [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')]
    return {
        id,
        players: new Map(playerList.map((p) => [p.uuid, p])),
        settings: { jokerCount },
    }
}

function sequenceRandom(sequence) {
    let i = 0
    return () => sequence[Math.min(i++, sequence.length - 1)]
}

// ---------------------------------------------------------------------------
// assignRoles
// ---------------------------------------------------------------------------

test('assignRoles: 고정 randomFn을 주입하면 예측 가능한 순서로 섞이고 jokerCount만큼 JOKER가 배정된다', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c'), makePlayer('d')]
    // randomFn이 항상 0을 반환하면 Fisher–Yates가 매 단계 첫 번째 원소와 자기 자신을 그대로 둔다
    // (j = Math.floor(0 * (i+1)) = 0이므로 result[i]와 result[0]을 swap) — 결정적 순서를 만든다.
    const assigned = assignRoles(players, 2, () => 0)

    assert.equal(assigned.length, 4)
    const jokerCount = assigned.filter((p) => p.role === GAME_ROLES.JOKER).length
    const citizenCount = assigned.filter((p) => p.role === GAME_ROLES.CITIZEN).length
    assert.equal(jokerCount, 2)
    assert.equal(citizenCount, 2)
})

test('assignRoles: 중복 배정이 없고 원본 players 배열/원소를 변형하지 않는다', () => {
    const players = [makePlayer('a'), makePlayer('b'), makePlayer('c')]
    const before = JSON.parse(JSON.stringify(players))

    const assigned = assignRoles(players, 1, Math.random)

    const uuids = assigned.map((p) => p.uuid)
    assert.equal(new Set(uuids).size, uuids.length)
    assert.deepEqual(players, before)
})

function countByRole(assigned) {
    const counts = { JOKER: 0, CITIZEN: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
    for (const player of assigned) counts[player.role] += 1
    return counts
}

test('assignRoles: 6명·jokerCount 1이면 DOCTOR 1명이 배정된다(개수는 computeRoleComposition과 동일한 결정적 randomFn으로 확인)', () => {
    const players = Array.from({ length: 6 }, (_, i) => makePlayer(`p${i}`))
    const assigned = assignRoles(players, 1, () => 0.999)

    assert.equal(assigned.length, 6)
    assert.deepEqual(countByRole(assigned), computeRoleComposition(6, 1))
})

test('assignRoles: 8명·jokerCount 1이면 DOCTOR 1명·GUARD 1명이 배정된다', () => {
    const players = Array.from({ length: 8 }, (_, i) => makePlayer(`p${i}`))
    const assigned = assignRoles(players, 1, () => 0.999)

    assert.equal(assigned.length, 8)
    assert.deepEqual(countByRole(assigned), computeRoleComposition(8, 1))
})

test('assignRoles: 10명·jokerCount 1이면 DOCTOR/GUARD/WITCH_HUNTER가 각 1명씩 배정된다', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`p${i}`))
    const assigned = assignRoles(players, 1, () => 0.999)

    assert.equal(assigned.length, 10)
    assert.deepEqual(countByRole(assigned), computeRoleComposition(10, 1))
})

// ---------------------------------------------------------------------------
// computeRoleComposition / getSpecialRoleBudget — 슬롯 절삭 알고리즘
// ---------------------------------------------------------------------------

test('getSpecialRoleBudget: 인원 구간별 특수 시민 역할 상한이 확정된 구성표와 일치한다', () => {
    for (const playerCount of [2, 3, 4, 5]) {
        assert.deepEqual(getSpecialRoleBudget(playerCount), { DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 })
    }
    for (const playerCount of [6, 7]) {
        assert.deepEqual(getSpecialRoleBudget(playerCount), { DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
    }
    for (const playerCount of [8, 9]) {
        assert.deepEqual(getSpecialRoleBudget(playerCount), { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 })
    }
    assert.deepEqual(getSpecialRoleBudget(10), { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
})

// computeRoleComposition이 기대하는 값을 테스트 코드가 독립적으로(순차 Math.min으로) 다시
// 계산해 구현과 비교한다 — 슬롯 절삭 우선순위(DOCTOR → GUARD → WITCH_HUNTER)까지 통째로
// deepEqual로 고정하므로 "GUARD > 0이면 DOCTOR도 budget만큼 배정돼 있어야 한다" 같은 개별
// 관계를 따로 검사할 필요가 없다.
function expectedComposition(playerCount, jokerCount) {
    const budget = getSpecialRoleBudget(playerCount)
    let remaining = playerCount - jokerCount
    const doctor = Math.min(budget.DOCTOR, remaining)
    remaining -= doctor
    const guard = Math.min(budget.GUARD, remaining)
    remaining -= guard
    const witchHunter = Math.min(budget.WITCH_HUNTER, remaining)
    remaining -= witchHunter
    return { JOKER: jokerCount, DOCTOR: doctor, GUARD: guard, WITCH_HUNTER: witchHunter, CITIZEN: remaining }
}

test('computeRoleComposition: 2~10명 × 모든 유효 jokerCount(0..playerCount-1) 전 조합(54개)에서 불변조건을 만족한다', () => {
    let combinationsChecked = 0
    for (let playerCount = 2; playerCount <= 10; playerCount += 1) {
        for (let jokerCount = 0; jokerCount < playerCount; jokerCount += 1) {
            const result = computeRoleComposition(playerCount, jokerCount)
            const expected = expectedComposition(playerCount, jokerCount)

            // 독립적으로 재계산한 기대 composition과 완전히 일치(절삭 우선순위 포함).
            assert.deepEqual(result, expected, `playerCount=${playerCount}, jokerCount=${jokerCount}`)

            const sum = result.JOKER + result.DOCTOR + result.GUARD + result.WITCH_HUNTER + result.CITIZEN
            assert.equal(sum, playerCount, `합계 불일치: playerCount=${playerCount}, jokerCount=${jokerCount}`)
            assert.equal(result.JOKER, jokerCount)
            for (const role of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN']) {
                assert.ok(result[role] >= 0, `${role} 수가 음수: playerCount=${playerCount}, jokerCount=${jokerCount}`)
            }
            const budget = getSpecialRoleBudget(playerCount)
            assert.ok(result.DOCTOR <= budget.DOCTOR)
            assert.ok(result.GUARD <= budget.GUARD)
            assert.ok(result.WITCH_HUNTER <= budget.WITCH_HUNTER)

            // non-JOKER 인원이 1명 이상이면 시민 진영(CITIZEN 또는 특수 역할)도 최소 1명이다.
            const nonJokerCount = playerCount - jokerCount
            const citizenTeamCount = result.CITIZEN + result.DOCTOR + result.GUARD + result.WITCH_HUNTER
            if (nonJokerCount >= 1) assert.ok(citizenTeamCount >= 1)

            combinationsChecked += 1
        }
    }
    assert.equal(combinationsChecked, 54)
})

test('computeRoleComposition: 8명·jokerCount 7(socket 계층 상한 밖) — DOCTOR만 1명 배정되고 GUARD/WITCH_HUNTER는 0, 세션은 거부되지 않는다', () => {
    const result = computeRoleComposition(8, 7)
    assert.deepEqual(result, { JOKER: 7, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 0 })
})

// ---------------------------------------------------------------------------
// ROLE_DEFINITIONS / GAME_ROLES / ROLE_TEAMS — canonical 역할 모델
// ---------------------------------------------------------------------------

test('GAME_ROLES: 정확히 5개 역할이 자기 자신 값으로 매핑되고, 기존 JOKER/CITIZEN 값은 유지된다', () => {
    assert.deepEqual(Object.keys(GAME_ROLES).sort(), ['CITIZEN', 'DOCTOR', 'GUARD', 'JOKER', 'WITCH_HUNTER'])
    assert.equal(GAME_ROLES.JOKER, 'JOKER')
    assert.equal(GAME_ROLES.CITIZEN, 'CITIZEN')
    assert.equal(GAME_ROLES.DOCTOR, 'DOCTOR')
    assert.equal(GAME_ROLES.GUARD, 'GUARD')
    assert.equal(GAME_ROLES.WITCH_HUNTER, 'WITCH_HUNTER')
})

test('ROLE_TEAMS: JOKER만 JOKER팀이고 나머지 4개 역할은 모두 CITIZEN팀이다', () => {
    assert.deepEqual(ROLE_TEAMS, {
        JOKER: 'JOKER',
        CITIZEN: 'CITIZEN',
        DOCTOR: 'CITIZEN',
        GUARD: 'CITIZEN',
        WITCH_HUNTER: 'CITIZEN',
    })
})

test('ROLE_DEFINITIONS: nightActionMinDayIndex가 WITCH_HUNTER 첫날밤 비활성 정책과 정확히 일치한다', () => {
    assert.equal(ROLE_DEFINITIONS.JOKER.nightActionMinDayIndex, 0)
    assert.equal(ROLE_DEFINITIONS.CITIZEN.nightActionMinDayIndex, null)
    assert.equal(ROLE_DEFINITIONS.DOCTOR.nightActionMinDayIndex, 0)
    assert.equal(ROLE_DEFINITIONS.GUARD.nightActionMinDayIndex, 0)
    assert.equal(ROLE_DEFINITIONS.WITCH_HUNTER.nightActionMinDayIndex, 1)
})

test('ROLE_DEFINITIONS: 바깥 객체와 각 역할 정의 모두 개별적으로 동결되어 외부에서 변형할 수 없다', () => {
    assert.equal(Object.isFrozen(ROLE_DEFINITIONS), true)
    for (const role of Object.keys(GAME_ROLES)) {
        assert.equal(Object.isFrozen(ROLE_DEFINITIONS[role]), true, `${role} 정의가 동결되지 않음`)
    }

    const before = { ...ROLE_DEFINITIONS.WITCH_HUNTER }
    // non-strict 모드에서는 조용히 무시되므로 throw 여부가 아니라 값 불변을 확인한다.
    ROLE_DEFINITIONS.WITCH_HUNTER.nightActionMinDayIndex = 0
    ROLE_DEFINITIONS.JOKER.team = 'CITIZEN'
    assert.deepEqual(ROLE_DEFINITIONS.WITCH_HUNTER, before)
    assert.equal(ROLE_DEFINITIONS.JOKER.team, 'JOKER')
})

test('export 호환성: __testables.assignRoles가 여전히 존재하고, ROLE_DEFINITIONS/ROLE_TEAMS/composition helper가 새로 노출된다', () => {
    assert.equal(typeof gameSession.__testables.assignRoles, 'function')
    assert.equal(typeof gameSession.ROLE_DEFINITIONS, 'object')
    assert.equal(typeof gameSession.ROLE_TEAMS, 'object')
    assert.equal(typeof gameSession.__testables.computeRoleComposition, 'function')
    assert.equal(typeof gameSession.__testables.getSpecialRoleBudget, 'function')
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
// acknowledgeRoleReveal / buildPhaseChangedPayload — ROLE_REVEAL → NIGHT 전이
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

test('acknowledgeRoleReveal: 전원(2인)이 확인하면 마지막 호출에서만 NIGHT로 전이하고 dayIndex는 0 그대로다', () => {
    const room = makeRoom({ id: 'room-ack-2', players: [makePlayer('b1'), makePlayer('b2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const first = acknowledgeRoleReveal('b1', candidate.session.id)
    assert.equal(first.transitioned, false)
    assert.equal(candidate.session.phase, 'ROLE_REVEAL')

    const second = acknowledgeRoleReveal('b2', candidate.session.id)
    assert.equal(second.transitioned, true)
    assert.equal(candidate.session.phase, 'NIGHT')
    assert.equal(candidate.session.dayIndex, 0)
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

test('acknowledgeRoleReveal: 이미 NIGHT인 세션에 확인하면 INVALID_PHASE이고 재전이하지 않는다', () => {
    const room = makeRoom({ id: 'room-ack-8', players: [makePlayer('h1'), makePlayer('h2')], jokerCount: 0 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    acknowledgeRoleReveal('h1', candidate.session.id)
    acknowledgeRoleReveal('h2', candidate.session.id) // 여기서 이미 NIGHT로 전이됨

    const result = acknowledgeRoleReveal('h1', candidate.session.id)

    assert.deepEqual(result, { ok: false, code: 'INVALID_PHASE' })
    assert.equal(candidate.session.phase, 'NIGHT')
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
    assert.deepEqual(payload, { gameId: candidate.session.id, phase: 'NIGHT', dayIndex: 0 })
})

// ---------------------------------------------------------------------------
// assertValidSessionForCommit — 수동 조립된 malformed session 방어
// ---------------------------------------------------------------------------

function validSession(overrides = {}) {
    return {
        id: 'game-1',
        roomId: 'room-1',
        channelId: 'room-1',
        phase: 'ROLE_REVEAL',
        dayIndex: 0,
        jokerCount: 1,
        players: new Map([
            ['u1', { uuid: 'u1', nickname: 'A', role: GAME_ROLES.JOKER, alive: true }],
            ['u2', { uuid: 'u2', nickname: 'B', role: GAME_ROLES.CITIZEN, alive: true }],
            ['u3', { uuid: 'u3', nickname: 'C', role: GAME_ROLES.CITIZEN, alive: true }],
        ]),
        roleRevealAcks: new Set(),
        nightActions: new Map(),
        jokerChatRateLimit: new Map(),
        nightResolution: null,
        dayVotes: new Map(),
        ...overrides,
    }
}

const malformedSessionCases = [
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

test('buildGameStartedPayload: allies는 다른 JOKER uuid의 정확한 전체 집합이다(부분 누락·CITIZEN 혼입·자기 포함·중복 없음)', () => {
    const room = makeRoom({
        players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3'), makePlayer('u4'), makePlayer('u5')],
        jokerCount: 3,
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })

    const jokerUuids = [...candidate.session.players.values()]
        .filter((p) => p.role === 'JOKER')
        .map((p) => p.uuid)
    assert.equal(jokerUuids.length, 3)

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
// submitNightAction — NIGHT 행동 제출
// ---------------------------------------------------------------------------

/** playerCount=10·jokerCount=1 세션을 커밋하고 전원 ROLE_REVEAL 확인시켜 NIGHT로 전이한다. 5개 역할 전부가 정확히 1명씩(CITIZEN은 6명) 배정된다. */
function commitFullRoleSessionAtNight({ id = 'room-full', gameIdFn } = {}) {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`fp-${id}-${i}`))
    const room = makeRoom({ id, players, jokerCount: 1 })
    const opts = { randomFn: () => 0.999, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) {
        acknowledgeRoleReveal(uuid, session.id)
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

/** playerCount=3·jokerCount=2 세션을 커밋하고 NIGHT로 전이한다 — JOKER 2명 + CITIZEN 1명. */
function commitJokerTrioSessionAtNight({ id = 'room-joker', gameIdFn } = {}) {
    const players = [makePlayer(`ja-${id}`), makePlayer(`jb-${id}`), makePlayer(`jc-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 2 })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) {
        acknowledgeRoleReveal(uuid, session.id)
    }
    const jokerUuids = [...session.players.values()].filter((p) => p.role === 'JOKER').map((p) => p.uuid)
    const citizenUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    return { session, jokerUuids, citizenUuid }
}

// --- isEligibleForNightAction: 5개 역할 × dayIndex 0/1 표 ---

const eligibilityTable = [
    ['JOKER', 0, true],
    ['JOKER', 1, true],
    ['DOCTOR', 0, true],
    ['DOCTOR', 1, true],
    ['GUARD', 0, true],
    ['GUARD', 1, true],
    ['WITCH_HUNTER', 0, false],
    ['WITCH_HUNTER', 1, true],
    ['CITIZEN', 0, false],
    ['CITIZEN', 1, false],
]

for (const [role, dayIndex, expected] of eligibilityTable) {
    test(`isEligibleForNightAction: ${role} × dayIndex ${dayIndex} → ${expected}`, () => {
        assert.equal(isEligibleForNightAction(role, dayIndex), expected)
    })
}

// --- 기본 계약 ---

test('submitNightAction: 정상 targetId 제출은 nightActions에 저장되고 core는 {ok:true, gameId:session.id}를 반환한다', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight()
    const result = submitNightAction(doctorUuid, session.id, citizenUuid)

    assert.deepEqual(result, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(doctorUuid), citizenUuid)
})

test('submitNightAction: SKIP(targetId=null) 제출도 동일하게 저장된다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    const result = submitNightAction(doctorUuid, session.id, null)

    assert.deepEqual(result, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(doctorUuid), null)
    assert.equal(session.nightActions.has(doctorUuid), true)
})

test('submitNightAction: DOCTOR는 자기 자신을 대상으로 지정할 수 있다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    const result = submitNightAction(doctorUuid, session.id, doctorUuid)

    assert.deepEqual(result, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(doctorUuid), doctorUuid)
})

for (const roleKey of ['guardUuid', 'witchHunterUuid']) {
    test(`submitNightAction: ${roleKey}는 자기 자신을 대상으로 지정하면 INVALID_TARGET이고 Map은 불변이다`, () => {
        const fixture = commitFullRoleSessionAtNight()
        if (roleKey === 'witchHunterUuid') fixture.session.dayIndex = 1 // WITCH_HUNTER는 day1 이상이어야 eligibility를 통과한다
        const actorUuid = fixture[roleKey]
        const before = new Map(fixture.session.nightActions)

        const result = submitNightAction(actorUuid, fixture.session.id, actorUuid)

        assert.deepEqual(result, { ok: false, code: 'INVALID_TARGET' })
        assert.deepEqual(fixture.session.nightActions, before)
    })
}

test('submitNightAction: 세션에 없는 uuid를 대상으로 지정하면(모든 역할 공통) INVALID_TARGET이고 Map은 불변이다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    const before = new Map(session.nightActions)

    const result = submitNightAction(doctorUuid, session.id, 'no-such-uuid')

    assert.deepEqual(result, { ok: false, code: 'INVALID_TARGET' })
    assert.deepEqual(session.nightActions, before)
})

test('submitNightAction: CITIZEN은 항상 NOT_ELIGIBLE이고 Map은 불변이다', () => {
    const { session, citizenUuid, doctorUuid } = commitFullRoleSessionAtNight()
    const before = new Map(session.nightActions)

    const result = submitNightAction(citizenUuid, session.id, doctorUuid)

    assert.deepEqual(result, { ok: false, code: 'NOT_ELIGIBLE' })
    assert.deepEqual(session.nightActions, before)
})

test('submitNightAction: WITCH_HUNTER는 dayIndex 0에는 NOT_ELIGIBLE이지만 dayIndex 1부터는 제출 가능하다', () => {
    const { session, witchHunterUuid, citizenUuid } = commitFullRoleSessionAtNight()

    const day0 = submitNightAction(witchHunterUuid, session.id, citizenUuid)
    assert.deepEqual(day0, { ok: false, code: 'NOT_ELIGIBLE' })
    assert.equal(session.nightActions.has(witchHunterUuid), false)

    session.dayIndex = 1
    const day1 = submitNightAction(witchHunterUuid, session.id, citizenUuid)
    assert.deepEqual(day1, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(witchHunterUuid), citizenUuid)
})

test('submitNightAction: session.phase가 NIGHT가 아니면(ROLE_REVEAL) INVALID_PHASE이고 Map은 불변이다', () => {
    const players = [makePlayer('rr-a'), makePlayer('rr-b'), makePlayer('rr-c')]
    const room = makeRoom({ id: 'room-rr', players, jokerCount: 1 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    // ROLE_REVEAL 확인을 하지 않아 phase가 그대로 ROLE_REVEAL이다.
    const session = candidate.session
    const [uuid, player] = [...session.players.entries()].find(([, p]) => p.role !== 'JOKER')

    const result = submitNightAction(uuid, session.id, null)

    assert.deepEqual(result, { ok: false, code: 'INVALID_PHASE' })
    assert.equal(session.nightActions.size, 0)
})

test('submitNightAction: 요청 gameId가 uuid의 실제 세션과 다르면 STALE_SESSION_MISMATCH이고 Map은 불변이다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()

    const result = submitNightAction(doctorUuid, 'not-the-real-game-id', null)

    assert.deepEqual(result, { ok: false, code: 'STALE_SESSION_MISMATCH' })
    assert.equal(session.nightActions.size, 0)
})

test('submitNightAction: playerSession에 없는 uuid는 NOT_IN_SESSION이다', () => {
    const { session } = commitFullRoleSessionAtNight()
    const result = submitNightAction('no-such-uuid', session.id, null)
    assert.deepEqual(result, { ok: false, code: 'NOT_IN_SESSION' })
})

test('submitNightAction: gameId가 빈 문자열/공백만이면 INVALID_GAME_ID다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    assert.deepEqual(submitNightAction(doctorUuid, '', null), { ok: false, code: 'INVALID_GAME_ID' })
    assert.deepEqual(submitNightAction(doctorUuid, '   ', null), { ok: false, code: 'INVALID_GAME_ID' })
})

test('submitNightAction: 재제출은 항상 최신 유효한 값으로 Map을 덮어쓴다(양방향)', () => {
    const { session, doctorUuid, citizenUuid, guardUuid } = commitFullRoleSessionAtNight()

    submitNightAction(doctorUuid, session.id, citizenUuid)
    assert.equal(session.nightActions.get(doctorUuid), citizenUuid)
    assert.equal(session.nightActions.size, 1)

    submitNightAction(doctorUuid, session.id, null)
    assert.equal(session.nightActions.get(doctorUuid), null)
    assert.equal(session.nightActions.size, 1)

    submitNightAction(doctorUuid, session.id, guardUuid)
    assert.equal(session.nightActions.get(doctorUuid), guardUuid)
    assert.equal(session.nightActions.size, 1)
})

test('submitNightAction: 커밋 직후 nightActions는 항상 빈 Map이다', () => {
    const room = makeRoom({ id: 'room-fresh' })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    assert.equal(candidate.session.nightActions instanceof Map, true)
    assert.equal(candidate.session.nightActions.size, 0)
})

// --- JOKER no-op 계약: core 직접 호출 테스트 ---
// 반환값과 nightActions Map을 함께 검증한다. 소켓 계층의 외부 ack만 보는 테스트는
// backend/socket/__tests__/gameSession.test.js에 있다(core 반환값과 client ack는 다른 계층).

test('submitNightAction(JOKER no-op): 자기 자신을 대상으로 제출(사전 제출 없음) → {ok:true, gameId} + Map 완전 no-op', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const [self] = jokerUuids

    const result = submitNightAction(self, session.id, self)

    assert.deepEqual(result, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.has(self), false)
})

test('submitNightAction(JOKER no-op): 다른 JOKER를 대상으로 제출(사전 제출 없음) → {ok:true, gameId} + Map 완전 no-op', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const [actor, teammate] = jokerUuids

    const result = submitNightAction(actor, session.id, teammate)

    assert.deepEqual(result, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.has(actor), false)
})

test('submitNightAction(JOKER): CITIZEN 진영 대상 제출 → {ok:true, gameId} + 실제 targetId로 Map 갱신(위 두 경우와 대조)', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight()
    const [actor] = jokerUuids

    const result = submitNightAction(actor, session.id, citizenUuid)

    assert.deepEqual(result, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(actor), citizenUuid)
})

test('submitNightAction(JOKER no-op 회귀): 기존 유효한 시민 표는 이후 다른 JOKER 대상 제출로 파괴되지 않는다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight()
    const [actor, teammate] = jokerUuids

    submitNightAction(actor, session.id, citizenUuid)
    assert.equal(session.nightActions.get(actor), citizenUuid)

    const result = submitNightAction(actor, session.id, teammate)

    assert.deepEqual(result, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(actor), citizenUuid) // 그대로 유지, teammate로 안 바뀜
})

test('submitNightAction(JOKER no-op 회귀): 기존 유효한 시민 표는 이후 자기 자신 대상 제출로도 파괴되지 않는다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight()
    const [actor] = jokerUuids

    submitNightAction(actor, session.id, citizenUuid)
    const result = submitNightAction(actor, session.id, actor)

    assert.deepEqual(result, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(actor), citizenUuid)
})

test('submitNightAction(JOKER no-op 회귀): 기존 명시적 SKIP도 이후 다른 JOKER 대상 제출로 파괴되지 않는다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const [actor, teammate] = jokerUuids

    submitNightAction(actor, session.id, null)
    assert.equal(session.nightActions.get(actor), null)

    const result = submitNightAction(actor, session.id, teammate)

    assert.deepEqual(result, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(actor), null)
})

test('submitNightAction(JOKER): 존재하지 않는 uuid를 대상으로 제출하면 no-op으로 삼켜지지 않고 INVALID_TARGET으로 거부된다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const [actor] = jokerUuids

    const result = submitNightAction(actor, session.id, 'no-such-uuid')

    assert.deepEqual(result, { ok: false, code: 'INVALID_TARGET' })
    assert.equal(session.nightActions.has(actor), false)
})

// --- 검증 순서 precedence ---

test('precedence: registry 불일치(SESSION_NOT_FOUND)는 phase보다 먼저 걸린다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight()
    __deleteGameSessionOnlyForTests(session.id)

    const result = submitNightAction(doctorUuid, session.id, null)

    assert.deepEqual(result, { ok: false, code: 'SESSION_NOT_FOUND' })
})

test('precedence: phase 오류는 eligibility보다 먼저 걸린다(CITIZEN이라도 INVALID_PHASE로 끝남)', () => {
    const players = [makePlayer('pe-a'), makePlayer('pe-b'), makePlayer('pe-c')]
    const room = makeRoom({ id: 'room-pe', players, jokerCount: 1 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    const session = candidate.session
    const citizenUuid = [...session.players.entries()].find(([, p]) => p.role === 'CITIZEN')[0]
    // ROLE_REVEAL 확인을 하지 않아 phase는 여전히 ROLE_REVEAL이다.

    const result = submitNightAction(citizenUuid, session.id, null)

    assert.deepEqual(result, { ok: false, code: 'INVALID_PHASE' })
})

test('precedence: eligibility는 target 검증보다 먼저 걸린다(CITIZEN + 세션 밖 uuid 동시 → NOT_ELIGIBLE)', () => {
    const { session, citizenUuid } = commitFullRoleSessionAtNight()

    const result = submitNightAction(citizenUuid, session.id, 'no-such-uuid')

    assert.deepEqual(result, { ok: false, code: 'NOT_ELIGIBLE' })
})

test('precedence: gameId(공백만 있어 trim 후 빈 문자열)는 session 존재 여부보다 먼저 걸린다', () => {
    const result = submitNightAction('no-such-uuid-at-all', '   ', null)
    assert.deepEqual(result, { ok: false, code: 'INVALID_GAME_ID' })
})

// --- 9라운드 회귀: 검증을 통과한 client 원본 gameId(공백·개행 포함)라도 core가 반환하는
// gameId는 client 원본이 아니라 registry의 canonical session.id다 ---

test('9라운드 회귀: gameId 앞뒤에 개행·공백이 있어도 trim 후 세션과 일치하면 제출은 성공하고, core가 반환하는 gameId는 원본이 아닌 canonical session.id다', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'room-abc', gameIdFn: () => 'abc' })
    assert.equal(session.id, 'abc')

    const result = submitNightAction(doctorUuid, '\n  abc  \n', citizenUuid)

    assert.deepEqual(result, { ok: true, gameId: 'abc' })
    assert.notEqual(result.gameId, '\n  abc  \n')
    assert.equal(session.nightActions.get(doctorUuid), citizenUuid)
})

test('9라운드 회귀: JOKER no-op 성공에서도 core가 반환하는 gameId는 client 원본이 아닌 canonical session.id다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-abc-joker', gameIdFn: () => 'abc' })
    const [actor, teammate] = jokerUuids

    const result = submitNightAction(actor, '\n  abc  \n', teammate)

    assert.deepEqual(result, { ok: true, gameId: 'abc' })
    assert.equal(session.nightActions.has(actor), false)
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

test('prepareJokerChatMessage: CITIZEN 발신자는 NOT_ELIGIBLE이다(payload 위조 방어)', () => {
    const { session, citizenUuid } = commitFullRoleSessionAtNight({ id: 'room-pjc-6' })

    const result = prepareJokerChatMessage(citizenUuid, session.id, 'hello')

    assert.deepEqual(result, { ok: false, code: 'NOT_ELIGIBLE' })
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
// commitNightResolution / buildNightResultAppliedPayload — NIGHT 결과 적용 + DAY 전이
// ---------------------------------------------------------------------------

const { commitNightResolution, buildNightResultAppliedPayload } = gameSession

function nightSessionOf3({ id = 'room-cnr' } = {}) {
    const room = makeRoom({ id, players: [makePlayer('cnr-a'), makePlayer('cnr-b'), makePlayer('cnr-c')], jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    for (const uuid of candidate.session.players.keys()) acknowledgeRoleReveal(uuid, candidate.session.id)
    return candidate.session
}

test('commitNightResolution: 유효한 victim이 있으면 그 player만 alive:false, phase→DAY, dayIndex+1, nightResolution 설정, 반환값 {victimUuid}', () => {
    const session = nightSessionOf3()
    const [victimUuid, otherUuid] = [...session.players.keys()]
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: victimUuid, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { victimUuid })
    assert.equal(session.players.get(victimUuid).alive, false)
    assert.equal(session.players.get(otherUuid).alive, true)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.nightResolution, resolution)
})

test('commitNightResolution: pendingEliminationTargetId가 null이면 전원 alive 유지, phase/dayIndex는 그대로 전이한다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-null' })
    const uuids = [...session.players.keys()]
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: null, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { victimUuid: null })
    for (const uuid of uuids) assert.equal(session.players.get(uuid).alive, true)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.nightResolution, resolution)
})

test('commitNightResolution: victim이 세션 밖 uuid를 가리키면 throw하고 nightResolution/phase/dayIndex/alive가 전부 호출 전과 동일하다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-oob' })
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: 'not-a-participant', privateResults: new Map(), resolved: true }

    assert.throws(() => commitNightResolution(session, resolution))

    assert.equal(session.nightResolution, null)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 0)
    for (const player of session.players.values()) assert.equal(player.alive, true)
})

test('commitNightResolution: victim이 이미 alive:false면 throw하고 상태가 전부 호출 전과 동일하다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-dead' })
    const [victimUuid] = [...session.players.keys()]
    session.players.get(victimUuid).alive = false
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: victimUuid, privateResults: new Map(), resolved: true }

    assert.throws(() => commitNightResolution(session, resolution))

    assert.equal(session.nightResolution, null)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 0)
})

test('buildNightResultAppliedPayload: top-level 키가 정확히 [dayIndex, gameId, phase, players, victimUuid], players 원소 키는 정확히 [alive, uuid]뿐이다', () => {
    const session = nightSessionOf3({ id: 'room-bnrap' })
    const [victimUuid] = [...session.players.keys()]
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: victimUuid, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)

    const payload = buildNightResultAppliedPayload(session, victimUuid)

    assert.deepEqual(Object.keys(payload).sort(), ['dayIndex', 'gameId', 'phase', 'players', 'victimUuid'])
    assert.equal(payload.gameId, session.id)
    assert.equal(payload.phase, 'DAY')
    assert.equal(payload.dayIndex, 1)
    assert.equal(payload.victimUuid, victimUuid)
    for (const player of payload.players) {
        assert.deepEqual(Object.keys(player).sort(), ['alive', 'uuid'])
    }
    assert.deepEqual(
        payload.players.find((p) => p.uuid === victimUuid),
        { uuid: victimUuid, alive: false },
    )
})

// ---------------------------------------------------------------------------
// submitDayVote — DAY 투표/기권 제출
// ---------------------------------------------------------------------------

/** playerCount=3 세션을 무득표 NIGHT 판정으로 DAY(dayIndex 1, 전원 alive)까지 전이한다. */
function commitTrioSessionAtDay({ id = 'room-day' } = {}) {
    const players = [makePlayer(`da-${id}`), makePlayer(`db-${id}`), makePlayer(`dc-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) acknowledgeRoleReveal(uuid, session.id)
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: null, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)
    const [uuidA, uuidB, uuidC] = [...session.players.keys()]
    return { session, uuidA, uuidB, uuidC }
}

test('submitDayVote: 세션 생성 직후 dayVotes는 빈 Map이다', () => {
    const room = makeRoom({ id: 'room-dv-fresh' })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    assert.equal(candidate.session.dayVotes instanceof Map, true)
    assert.equal(candidate.session.dayVotes.size, 0)
})

test('submitDayVote: NIGHT→DAY 전환마다 dayVotes가 새 빈 Map으로 교체된다(오염된 이전 DAY 재현)', () => {
    const { session } = commitTrioSessionAtDay({ id: 'room-dv-reset' })
    session.dayVotes.set('stale-uuid', 'stale-target')
    const staleMapRef = session.dayVotes
    session.phase = 'NIGHT'
    const resolution2 = { gameId: session.id, dayIndex: 1, pendingEliminationTargetId: null, privateResults: new Map(), resolved: true }

    commitNightResolution(session, resolution2)

    assert.notEqual(session.dayVotes, staleMapRef)
    assert.equal(session.dayVotes.size, 0)
})

test('submitDayVote: 정상 대상 투표는 {ok:true}이고 dayVotes에 저장된다', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dv-1' })

    const result = submitDayVote(uuidA, session.id, uuidB)

    assert.deepEqual(result, { ok: true })
    assert.equal(session.dayVotes.get(uuidA), uuidB)
})

test('submitDayVote: 기권(targetId=null)은 {ok:true}이고 dayVotes에 null로 저장된다', () => {
    const { session, uuidA } = commitTrioSessionAtDay({ id: 'room-dv-2' })

    const result = submitDayVote(uuidA, session.id, null)

    assert.deepEqual(result, { ok: true })
    assert.equal(session.dayVotes.get(uuidA), null)
    assert.equal(session.dayVotes.has(uuidA), true)
})

test('submitDayVote: 재제출은 대상→기권→다른 대상 순으로 항상 최신 값으로 덮어쓴다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-dv-3' })

    submitDayVote(uuidA, session.id, uuidB)
    assert.equal(session.dayVotes.get(uuidA), uuidB)
    assert.equal(session.dayVotes.size, 1)

    submitDayVote(uuidA, session.id, null)
    assert.equal(session.dayVotes.get(uuidA), null)
    assert.equal(session.dayVotes.size, 1)

    submitDayVote(uuidA, session.id, uuidC)
    assert.equal(session.dayVotes.get(uuidA), uuidC)
    assert.equal(session.dayVotes.size, 1)
})

test('submitDayVote: gameId가 빈 문자열/undefined/숫자면 INVALID_GAME_ID이고 dayVotes는 불변이다', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dv-4' })

    for (const badGameId of ['', undefined, 42]) {
        assert.deepEqual(submitDayVote(uuidA, badGameId, uuidB), { ok: false, code: 'INVALID_GAME_ID' })
    }
    assert.equal(session.dayVotes.size, 0)
})

test('submitDayVote: playerSession에 없는 uuid는 NOT_IN_SESSION이다', () => {
    const { session, uuidB } = commitTrioSessionAtDay({ id: 'room-dv-5' })

    const result = submitDayVote('no-such-uuid', session.id, uuidB)

    assert.deepEqual(result, { ok: false, code: 'NOT_IN_SESSION' })
})

test('submitDayVote: 요청 gameId가 실제 세션과 다르면 STALE_SESSION_MISMATCH이고 dayVotes는 불변이다', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dv-6' })

    const result = submitDayVote(uuidA, 'not-the-real-game-id', uuidB)

    assert.deepEqual(result, { ok: false, code: 'STALE_SESSION_MISMATCH' })
    assert.equal(session.dayVotes.size, 0)
})

test('submitDayVote: gameId 앞뒤에 공백이 있으면 STALE_SESSION_MISMATCH이고 dayVotes는 불변이다', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dv-6b' })

    const result = submitDayVote(uuidA, ` ${session.id} `, uuidB)

    assert.deepEqual(result, { ok: false, code: 'STALE_SESSION_MISMATCH' })
    assert.equal(session.dayVotes.size, 0)
})

test('submitDayVote: registry 불일치(SESSION_NOT_FOUND)에서 dayVotes는 불변이다', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dv-7' })
    __deleteGameSessionOnlyForTests(session.id)

    const result = submitDayVote(uuidA, session.id, uuidB)

    assert.deepEqual(result, { ok: false, code: 'SESSION_NOT_FOUND' })
})

test('submitDayVote: registry 불일치(NOT_A_PARTICIPANT)에서 dayVotes는 불변이다', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dv-8' })
    session.players.delete(uuidA)

    const result = submitDayVote(uuidA, session.id, uuidB)

    assert.deepEqual(result, { ok: false, code: 'NOT_A_PARTICIPANT' })
})

test('submitDayVote: NIGHT 단계에서는 INVALID_PHASE이고 dayVotes는 불변이다', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'room-dv-9' })

    const result = submitDayVote(doctorUuid, session.id, citizenUuid)

    assert.deepEqual(result, { ok: false, code: 'INVALID_PHASE' })
    assert.equal(session.dayVotes.size, 0)
})

test('submitDayVote: ROLE_REVEAL 단계에서는 INVALID_PHASE다', () => {
    const players = [makePlayer('dv-rr-a'), makePlayer('dv-rr-b'), makePlayer('dv-rr-c')]
    const room = makeRoom({ id: 'room-dv-10', players, jokerCount: 1 })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)
    const session = candidate.session
    const [uuidA, uuidB] = [...session.players.keys()]

    const result = submitDayVote(uuidA, session.id, uuidB)

    assert.deepEqual(result, { ok: false, code: 'INVALID_PHASE' })
})

test('submitDayVote: 사망한 투표자는 ACTOR_NOT_ALIVE이고 dayVotes는 불변이다', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dv-11' })
    session.players.get(uuidA).alive = false

    const result = submitDayVote(uuidA, session.id, uuidB)

    assert.deepEqual(result, { ok: false, code: 'ACTOR_NOT_ALIVE' })
    assert.equal(session.dayVotes.size, 0)
})

test('submitDayVote: 존재하지 않는 대상은 INVALID_TARGET이고 dayVotes는 불변이다', () => {
    const { session, uuidA } = commitTrioSessionAtDay({ id: 'room-dv-12' })

    const result = submitDayVote(uuidA, session.id, 'no-such-uuid')

    assert.deepEqual(result, { ok: false, code: 'INVALID_TARGET' })
    assert.equal(session.dayVotes.size, 0)
})

test('submitDayVote: 사망한 대상은 TARGET_NOT_ALIVE이고 dayVotes는 불변이다', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dv-13' })
    session.players.get(uuidB).alive = false

    const result = submitDayVote(uuidA, session.id, uuidB)

    assert.deepEqual(result, { ok: false, code: 'TARGET_NOT_ALIVE' })
    assert.equal(session.dayVotes.size, 0)
})

test('submitDayVote: 자기 자신을 대상으로 지정하면 SELF_TARGET_NOT_ALLOWED이고 dayVotes는 불변이다', () => {
    const { session, uuidA } = commitTrioSessionAtDay({ id: 'room-dv-14' })

    const result = submitDayVote(uuidA, session.id, uuidA)

    assert.deepEqual(result, { ok: false, code: 'SELF_TARGET_NOT_ALLOWED' })
    assert.equal(session.dayVotes.size, 0)
})

test('submitDayVote: 모든 실패 경로에서 dayVotes/phase/dayIndex/생존 상태가 호출 전후 완전히 동일하다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-dv-15' })
    session.dayVotes.set(uuidC, uuidB) // 기존 유효 제출이 실패 경로에서 파괴되지 않는지도 함께 확인
    const beforeDayVotes = new Map(session.dayVotes)
    const beforePhase = session.phase
    const beforeDayIndex = session.dayIndex
    const beforeAlive = new Map([...session.players].map(([uuid, p]) => [uuid, p.alive]))

    const failingCalls = [
        () => submitDayVote(uuidA, '', uuidB),
        () => submitDayVote('no-such-uuid', session.id, uuidB),
        () => submitDayVote(uuidA, 'not-the-real-game-id', uuidB),
        () => submitDayVote(uuidA, session.id, 'no-such-uuid'),
        () => submitDayVote(uuidA, session.id, uuidA),
    ]
    for (const call of failingCalls) {
        assert.equal(call().ok, false)
    }

    assert.deepEqual(session.dayVotes, beforeDayVotes)
    assert.equal(session.phase, beforePhase)
    assert.equal(session.dayIndex, beforeDayIndex)
    for (const [uuid, p] of session.players) assert.equal(p.alive, beforeAlive.get(uuid))
})

test('submitDayVote: 서로 다른 GameSession은 독립된 dayVotes Map을 가지며 한 세션의 투표가 다른 세션에 영향을 주지 않는다', () => {
    const dayA = commitTrioSessionAtDay({ id: 'room-dv-cross-a' })
    const dayB = commitTrioSessionAtDay({ id: 'room-dv-cross-b' })

    submitDayVote(dayA.uuidA, dayA.session.id, dayA.uuidB)

    assert.equal(dayA.session.dayVotes.get(dayA.uuidA), dayA.uuidB)
    assert.equal(dayB.session.dayVotes.size, 0)
    assert.notEqual(dayA.session.dayVotes, dayB.session.dayVotes)
})

// ---------------------------------------------------------------------------
// prepareDayVoteResolution / commitDayVoteResolution / buildDayVoteResolvedPayload — DAY 투표 판정
// ---------------------------------------------------------------------------

test('commitDayVoteResolution: TIE 결과는 phase를 DAY로 유지하고, 재요청은 멱등하게 alreadyResolved:true를 반환한다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-tie-1' })
    // 3자 순환 투표(A→B, B→C, C→A)는 각 대상이 1표씩 얻어 TIE가 된다.
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidC)
    submitDayVote(uuidC, session.id, uuidA)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.outcome, 'TIE')
    assert.equal(prepared.resolution.tribunalTargetUuid, null)

    commitDayVoteResolution(prepared.session, prepared.resolution)

    assert.equal(session.phase, 'DAY')
    assert.equal(session.tribunal, null)
    assert.equal(session.dayVoteResolution, prepared.resolution)

    const again = prepareDayVoteResolution(uuidB, session.id, session.dayIndex)
    assert.equal(again.ok, true)
    assert.equal(again.alreadyResolved, true)
    assert.equal(again.resolution, prepared.resolution)
    assert.equal(session.phase, 'DAY')
})

test('commitDayVoteResolution: ABSTAINED 결과도 phase를 DAY로 유지한다(NIGHT로 전이하지 않음)', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-abstain-1' })
    submitDayVote(uuidA, session.id, null)
    submitDayVote(uuidB, session.id, null)
    submitDayVote(uuidC, session.id, null)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    assert.equal(prepared.resolution.outcome, 'ABSTAINED')

    commitDayVoteResolution(prepared.session, prepared.resolution)

    assert.equal(session.phase, 'DAY')
    assert.equal(session.tribunal, null)
})

test('commitDayVoteResolution: TRIBUNAL 결과는 기존대로 phase를 TRIBUNAL로 전이하고 candidateId를 채운다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-tribunal-1' })
    submitDayVote(uuidA, session.id, uuidC)
    submitDayVote(uuidB, session.id, uuidC)
    submitDayVote(uuidC, session.id, null)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    assert.equal(prepared.resolution.outcome, 'TRIBUNAL')
    assert.equal(prepared.resolution.tribunalTargetUuid, uuidC)

    commitDayVoteResolution(prepared.session, prepared.resolution)

    assert.equal(session.phase, 'TRIBUNAL')
    assert.deepEqual(session.tribunal, { candidateId: uuidC })
})

test('prepareDayVoteResolution: publicVoteCount는 eligible voter 총수(기권 포함)이고 publicAbstainCount는 그중 null 제출 수다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-count-1' })
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, null)
    submitDayVote(uuidC, session.id, null)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.publicVoteCount, 3)
    assert.equal(prepared.resolution.publicAbstainCount, 2)
})

test('prepareDayVoteResolution: 전원 기권이면 publicVoteCount는 0이 아니라 eligible voter 총수다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-count-2' })
    submitDayVote(uuidA, session.id, null)
    submitDayVote(uuidB, session.id, null)
    submitDayVote(uuidC, session.id, null)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)

    assert.equal(prepared.resolution.outcome, 'ABSTAINED')
    assert.equal(prepared.resolution.publicVoteCount, 3)
    assert.equal(prepared.resolution.publicAbstainCount, 3)
})

test('prepareDayVoteResolution: 사망한 참가자는 eligible voter에서 제외되어 ACTIONS_PENDING을 막지 않고 집계에도 포함되지 않는다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-dead-voter-1' })
    session.players.get(uuidC).alive = false

    // uuidC는 사망했으므로 투표하지 않아도(ACTIONS_PENDING 아님) 판정이 진행된다.
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidA)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.publicVoteCount, 2)
    assert.equal(prepared.resolution.outcome, 'TIE')
})

test('prepareDayVoteResolution: eligible voter의 표가 사망한 대상을 가리키면 TARGET_NOT_A_PARTICIPANT다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-dead-target-1' })
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidC)
    submitDayVote(uuidC, session.id, uuidA)
    // 제출 이후 대상이 사망 상태로 바뀐 경계 상황을 재현한다.
    session.players.get(uuidB).alive = false

    const result = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)

    assert.deepEqual(result, { ok: false, code: 'TARGET_NOT_A_PARTICIPANT' })
})

test('buildDayVoteResolvedPayload: TIE/ABSTAINED 이후에도 payload.phase는 DAY를 그대로 노출한다(NIGHT 아님)', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-payload-phase-1' })
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidC)
    submitDayVote(uuidC, session.id, uuidA)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    commitDayVoteResolution(prepared.session, prepared.resolution)
    const payload = buildDayVoteResolvedPayload(prepared.session, prepared.resolution)

    assert.equal(payload.phase, 'DAY')
    assert.equal(payload.outcome, 'TIE')
})
