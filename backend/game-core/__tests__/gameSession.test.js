const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const {
    assignRoles,
    assignPlayerColors,
    PLAYER_COLOR_COUNT,
    enterDayPhase,
    validateSessionInput,
    buildSessionCandidate,
    checkGameSessionPreconditions,
    assertValidSessionForCommit,
    getSpecialRoleBudget,
    computeRoleComposition,
    isEligibleForNightAction,
    sanitizeJokerChatText,
    evaluateWinCondition,
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
    submitTribunalVote,
    prepareJokerChatMessage,
    commitJokerChatMessage,
    prepareGameChatMessage,
    commitGameChatMessage,
    getChatRecipientUuids,
    getActiveSessionRoutingInfo,
    CHAT_CHANNELS,
    CHAT_MAX_LENGTH,
    CHAT_MIN_INTERVAL_MS,
    CHAT_COMMIT_MAX_AGE_MS,
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
// assignRoles — 테스트 전용 고정 배정(DEBUG_FIXED_ROLES)
// ---------------------------------------------------------------------------

/** DEBUG_FIXED_ROLES를 일시적으로 설정하고(null이면 삭제) fn 실행 후 반드시 원값으로 되돌린다. */
function withFixedRoles(value, fn) {
    const original = process.env.DEBUG_FIXED_ROLES
    if (value === null) delete process.env.DEBUG_FIXED_ROLES
    else process.env.DEBUG_FIXED_ROLES = value
    try {
        return fn()
    } finally {
        if (original === undefined) delete process.env.DEBUG_FIXED_ROLES
        else process.env.DEBUG_FIXED_ROLES = original
    }
}

/** fn 실행 중 발생한 console.warn 메시지를 모아 반환한다(console.warn은 반드시 원복된다). */
function captureWarnings(fn) {
    const messages = []
    const originalWarn = console.warn
    console.warn = (...args) => messages.push(args.join(' '))
    try {
        fn()
    } finally {
        console.warn = originalWarn
    }
    return messages
}

const FIVE_ROLE_COMPOSITION = { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 1 }

test('assignRoles: DEBUG_FIXED_ROLES가 설정되면 참가자 입장 순서대로 목록의 역할을 그대로 배정한다', () => {
    const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))
    const list = 'JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN'

    let assigned
    const warnings = captureWarnings(() => {
        assigned = withFixedRoles(list, () => assignRoles(players, FIVE_ROLE_COMPOSITION, () => 0.5))
    })

    assert.deepEqual(assigned.map((p) => [p.uuid, p.role]), [
        ['p0', 'JOKER'], ['p1', 'DOCTOR'], ['p2', 'GUARD'], ['p3', 'WITCH_HUNTER'], ['p4', 'CITIZEN'],
    ])
    assert.equal(assigned.every((p) => p.alive === true), true)
    assert.deepEqual(warnings, [])
})

test('assignRoles: 고정 배정은 셔플하지 않으므로 randomFn이 무엇이든 결과가 같다', () => {
    const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))
    const list = 'CITIZEN,JOKER,WITCH_HUNTER,DOCTOR,GUARD'

    const [first, second] = withFixedRoles(list, () => [
        assignRoles(players, FIVE_ROLE_COMPOSITION, () => 0),
        assignRoles(players, FIVE_ROLE_COMPOSITION, () => 0.999),
    ])

    assert.deepEqual(first.map((p) => p.role), ['CITIZEN', 'JOKER', 'WITCH_HUNTER', 'DOCTOR', 'GUARD'])
    assert.deepEqual(first, second)
})

test('assignRoles: 고정 배정 경로에서도 원본 players 배열/원소를 변형하지 않는다', () => {
    const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))
    const before = JSON.parse(JSON.stringify(players))

    withFixedRoles('JOKER,DOCTOR,GUARD,WITCH_HUNTER,CITIZEN', () =>
        assignRoles(players, FIVE_ROLE_COMPOSITION, () => 0.5))

    assert.deepEqual(players, before)
})

test('assignRoles: 목록 길이가 참가자 수와 다르면 경고 한 줄을 남기고 랜덤 배정으로 fallback한다', () => {
    const players = Array.from({ length: 4 }, (_, i) => makePlayer(`p${i}`))

    let assigned
    const warnings = captureWarnings(() => {
        assigned = withFixedRoles('JOKER,CITIZEN,CITIZEN', () => assignRoles(players, 1, () => 0))
    })

    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /DEBUG_FIXED_ROLES/)
    assert.deepEqual(countByRole(assigned), computeRoleComposition(4, 1))
})

test('assignRoles: 알 수 없는 역할명이 있으면 경고 한 줄을 남기고 랜덤 배정으로 fallback한다', () => {
    const players = Array.from({ length: 3 }, (_, i) => makePlayer(`p${i}`))

    let assigned
    const warnings = captureWarnings(() => {
        assigned = withFixedRoles('JOKER,MAYOR,CITIZEN', () => assignRoles(players, 1, () => 0))
    })

    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /UNKNOWN_ROLE:MAYOR/)
    assert.deepEqual(countByRole(assigned), computeRoleComposition(3, 1))
})

test('assignRoles: 역할 구성과 개수가 어긋나면 경고 한 줄을 남기고 랜덤 배정으로 fallback한다', () => {
    const players = Array.from({ length: 4 }, (_, i) => makePlayer(`p${i}`))

    let assigned
    // 구성은 JOKER 1 / CITIZEN 3인데 목록은 JOKER 2 / CITIZEN 2다.
    const warnings = captureWarnings(() => {
        assigned = withFixedRoles('JOKER,JOKER,CITIZEN,CITIZEN', () =>
            assignRoles(players, computeRoleComposition(4, 1), () => 0))
    })

    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /COMPOSITION_MISMATCH/)
    assert.deepEqual(countByRole(assigned), computeRoleComposition(4, 1))
})

test('assignRoles: DEBUG_FIXED_ROLES가 빈 문자열/공백이면 미설정과 동일하게 경고 없이 랜덤 경로를 탄다', () => {
    const players = Array.from({ length: 4 }, (_, i) => makePlayer(`p${i}`))

    for (const value of ['', '   ']) {
        let assigned
        const warnings = captureWarnings(() => {
            assigned = withFixedRoles(value, () => assignRoles(players, 1, () => 0))
        })
        assert.deepEqual(warnings, [], `value=${JSON.stringify(value)}에서 경고가 발생함`)
        assert.deepEqual(countByRole(assigned), computeRoleComposition(4, 1))
    }
})

test('prepareGameSession/commitGameSession: 유효한 고정 목록이면 입장 순서대로 배정된 채 commit까지 통과한다', () => {
    // makeRoom의 기본 참가자 순서는 u1 → u2 → u3이고 jokerCount 1이므로 구성은 JOKER 1/CITIZEN 2다.
    const room = makeRoom({ id: 'room-fixed-ok' })

    const prepared = withFixedRoles('CITIZEN,JOKER,CITIZEN', () =>
        prepareGameSession(room, { randomFn: () => 0 }))

    assert.equal(prepared.ok, true)
    assert.equal(prepared.session.players.get('u1').role, GAME_ROLES.CITIZEN)
    assert.equal(prepared.session.players.get('u2').role, GAME_ROLES.JOKER)
    assert.equal(prepared.session.players.get('u3').role, GAME_ROLES.CITIZEN)
    assert.doesNotThrow(() => commitGameSession(prepared.session))
})

test('prepareGameSession/commitGameSession: 잘못된 고정 목록이어도 게임 시작이 실패하지 않는다', () => {
    const room = makeRoom({ id: 'room-fixed-bad' })

    let prepared
    const warnings = captureWarnings(() => {
        prepared = withFixedRoles('JOKER,CITIZEN', () => prepareGameSession(room, { randomFn: () => 0 }))
    })

    assert.equal(warnings.length, 1)
    assert.equal(prepared.ok, true)
    assert.doesNotThrow(() => commitGameSession(prepared.session))
})

test('export 호환성: 고정 배정 helper가 __testables로 노출된다', () => {
    assert.equal(typeof gameSession.__testables.parseDebugFixedRoleList, 'function')
    assert.equal(typeof gameSession.__testables.resolveDebugFixedRoleAssignment, 'function')
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
// submitTribunalVote
// ---------------------------------------------------------------------------

/** DAY→TRIBUNAL 전이가 이미 끝난 3인 세션을 직접 구성한다(dayVoteResolution·session.tribunal을
 * commitDayVoteResolution과 동일한 shape로 채운다). */
function setupTribunalReadySession({
    uuids = ['t1', 't2', 't3'],
    defendantUuid = 't3',
    roomId = `tribunal-${uuids.join('-')}`,
    randomFn = Math.random,
} = {}) {
    const room = makeRoom({
        id: roomId,
        players: uuids.map((uuid) => makePlayer(uuid)),
    })
    const prepared = gameSession.prepareGameSession(room, { randomFn })
    gameSession.commitGameSession(prepared.session)
    const session = prepared.session
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
    return { session, defendantUuid }
}

test('submitTribunalVote: 생존한 비-피고인 참가자의 GUILTY 제출은 성공하고 votes에 기록된다', () => {
    const { session } = setupTribunalReadySession()
    const result = submitTribunalVote('t1', session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: true, gameId: session.id, dayIndex: session.dayIndex, vote: 'GUILTY' })
    assert.equal(session.tribunal.votes.get('t1'), 'GUILTY')
})

test('submitTribunalVote: gameId가 문자열이 아니거나 빈 문자열이면 INVALID_GAME_ID이고 상태가 바뀌지 않는다', () => {
    const { session } = setupTribunalReadySession()
    assert.deepEqual(submitTribunalVote('t1', '', session.dayIndex, 'GUILTY'), { ok: false, code: 'INVALID_GAME_ID' })
    assert.deepEqual(submitTribunalVote('t1', 123, session.dayIndex, 'GUILTY'), { ok: false, code: 'INVALID_GAME_ID' })
    assert.equal(session.tribunal.votes.size, 0)
})

test('submitTribunalVote: 활성 세션이 없는 uuid는 NOT_IN_SESSION이다', () => {
    setupTribunalReadySession()
    assert.deepEqual(submitTribunalVote('ghost', 'whatever', 0, 'GUILTY'), { ok: false, code: 'NOT_IN_SESSION' })
})

test('submitTribunalVote: 현재 활성 세션과 다른 gameId를 보내면 STALE_SESSION_MISMATCH이고 상태가 바뀌지 않는다', () => {
    const { session } = setupTribunalReadySession()
    const result = submitTribunalVote('t1', 'other-game-id', session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'STALE_SESSION_MISMATCH' })
    assert.equal(session.tribunal.votes.size, 0)
})

test('submitTribunalVote: registry에서 session이 사라지면(SESSION_NOT_FOUND) internal 코드를 반환한다', () => {
    const { session } = setupTribunalReadySession()
    gameSession.__testables.__deleteGameSessionOnlyForTests(session.id)
    const result = submitTribunalVote('t1', session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'SESSION_NOT_FOUND' })
})

test('submitTribunalVote: session.players에서 제거된 uuid는 NOT_A_PARTICIPANT이고 상태가 바뀌지 않는다', () => {
    const { session } = setupTribunalReadySession()
    session.players.delete('t1')
    const result = submitTribunalVote('t1', session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'NOT_A_PARTICIPANT' })
    assert.equal(session.tribunal.votes.size, 0)
})

test('submitTribunalVote: dayIndex가 정수가 아니면 INVALID_DAY_INDEX, session.dayIndex와 다르면 STALE_DAY_INDEX이다', () => {
    const { session } = setupTribunalReadySession()
    assert.deepEqual(submitTribunalVote('t1', session.id, '0', 'GUILTY'), { ok: false, code: 'INVALID_DAY_INDEX' })
    assert.deepEqual(submitTribunalVote('t1', session.id, session.dayIndex + 1, 'GUILTY'), {
        ok: false,
        code: 'STALE_DAY_INDEX',
    })
    assert.equal(session.tribunal.votes.size, 0)
})

test('submitTribunalVote: phase가 TRIBUNAL이 아니면 INVALID_PHASE이고 상태가 바뀌지 않는다', () => {
    const { session } = setupTribunalReadySession()
    session.phase = 'DAY'
    const result = submitTribunalVote('t1', session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'INVALID_PHASE' })
    assert.equal(session.tribunal.votes.size, 0)
})

test('submitTribunalVote: session.tribunal이 없으면 TRIBUNAL_STATE_NOT_FOUND이다(internal-only)', () => {
    const { session } = setupTribunalReadySession()
    session.tribunal = null
    const result = submitTribunalVote('t1', session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' })
})

test('submitTribunalVote: session.tribunal.dayIndex가 session.dayIndex와 다르면 TRIBUNAL_CONTEXT_MISMATCH이다', () => {
    const { session } = setupTribunalReadySession()
    session.tribunal.dayIndex = session.dayIndex + 1
    const result = submitTribunalVote('t1', session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'TRIBUNAL_CONTEXT_MISMATCH' })
    assert.equal(session.tribunal.votes.size, 0)
})

test('submitTribunalVote: canonical dayVoteResolution 부재/outcome 불일치/dayIndex 불일치/대상 불일치 4종 모두 TRIBUNAL_RESOLUTION_MISMATCH이고 상태가 바뀌지 않는다', () => {
    const noResolution = setupTribunalReadySession({ uuids: ['a1', 'a2', 'a3'], defendantUuid: 'a3' })
    noResolution.session.dayVoteResolution = null
    assert.deepEqual(submitTribunalVote('a1', noResolution.session.id, noResolution.session.dayIndex, 'GUILTY'), {
        ok: false,
        code: 'TRIBUNAL_RESOLUTION_MISMATCH',
    })

    const wrongOutcome = setupTribunalReadySession({ uuids: ['b1', 'b2', 'b3'], defendantUuid: 'b3' })
    wrongOutcome.session.dayVoteResolution.outcome = 'TIE'
    assert.deepEqual(submitTribunalVote('b1', wrongOutcome.session.id, wrongOutcome.session.dayIndex, 'GUILTY'), {
        ok: false,
        code: 'TRIBUNAL_RESOLUTION_MISMATCH',
    })

    const wrongDayIndex = setupTribunalReadySession({ uuids: ['c1', 'c2', 'c3'], defendantUuid: 'c3' })
    wrongDayIndex.session.dayVoteResolution.dayIndex = wrongDayIndex.session.dayIndex + 1
    assert.deepEqual(submitTribunalVote('c1', wrongDayIndex.session.id, wrongDayIndex.session.dayIndex, 'GUILTY'), {
        ok: false,
        code: 'TRIBUNAL_RESOLUTION_MISMATCH',
    })

    const wrongTarget = setupTribunalReadySession({ uuids: ['d1', 'd2', 'd3'], defendantUuid: 'd3' })
    wrongTarget.session.dayVoteResolution.tribunalTargetUuid = 'd2'
    const result = submitTribunalVote('d1', wrongTarget.session.id, wrongTarget.session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' })
    assert.equal(wrongTarget.session.tribunal.votes.size, 0)
})

test('submitTribunalVote: 피고인이 이미 사망 상태면 TRIBUNAL_STATE_NOT_FOUND이다(internal-only)', () => {
    const { session, defendantUuid } = setupTribunalReadySession()
    session.players.get(defendantUuid).alive = false
    const result = submitTribunalVote('t1', session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'TRIBUNAL_STATE_NOT_FOUND' })
})

test('submitTribunalVote: 요청자가 이미 사망 상태면 PLAYER_NOT_ALIVE이다', () => {
    const { session } = setupTribunalReadySession()
    session.players.get('t1').alive = false
    const result = submitTribunalVote('t1', session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'PLAYER_NOT_ALIVE' })
})

test('submitTribunalVote: 요청자가 피고인 본인이면 DEFENDANT_CANNOT_VOTE이다', () => {
    const { session, defendantUuid } = setupTribunalReadySession()
    const result = submitTribunalVote(defendantUuid, session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(result, { ok: false, code: 'DEFENDANT_CANNOT_VOTE' })
})

test('submitTribunalVote: vote가 GUILTY/NOT_GUILTY가 아니면 INVALID_TRIBUNAL_VOTE이고 상태가 바뀌지 않는다', () => {
    const { session } = setupTribunalReadySession()
    for (const badVote of ['APPROVE', 'guilty', '', null, undefined, 1]) {
        const result = submitTribunalVote('t1', session.id, session.dayIndex, badVote)
        assert.deepEqual(result, { ok: false, code: 'INVALID_TRIBUNAL_VOTE' })
    }
    assert.equal(session.tribunal.votes.size, 0)
})

test('submitTribunalVote: 중복 제출은 TRIBUNAL_VOTE_ALREADY_SUBMITTED이고, 빠른 연속 제출에서도 첫 표만 유지된다', () => {
    const { session } = setupTribunalReadySession()
    const first = submitTribunalVote('t1', session.id, session.dayIndex, 'GUILTY')
    assert.deepEqual(first, {
        ok: true,
        gameId: session.id,
        dayIndex: session.dayIndex,
        vote: 'GUILTY',
    })

    const second = submitTribunalVote('t1', session.id, session.dayIndex, 'NOT_GUILTY')
    assert.deepEqual(second, { ok: false, code: 'TRIBUNAL_VOTE_ALREADY_SUBMITTED' })
    assert.equal(session.tribunal.votes.get('t1'), 'GUILTY')
    assert.equal(session.tribunal.votes.size, 1)
})

// ---------------------------------------------------------------------------
// assignPlayerColors — 참가자 색상 인덱스 배정(순수 함수)
// ---------------------------------------------------------------------------

/** 참가자 배열에서 colorIndex만 뽑아낸다(배정 결과 비교·중복 검사에 쓴다). */
function colorIndicesOf(players) {
    return players.map((p) => p.colorIndex)
}

test('assignPlayerColors: 5명 전원이 0..9 범위의 정수 colorIndex를 겹치지 않게 받는다', () => {
    const players = Array.from({ length: 5 }, (_, i) => makePlayer(`c${i}`))

    const colored = assignPlayerColors(players, Math.random)

    assert.equal(colored.length, 5)
    for (const player of colored) {
        assert.equal(Number.isInteger(player.colorIndex), true)
        assert.equal(player.colorIndex >= 0 && player.colorIndex < PLAYER_COLOR_COUNT, true)
    }
    assert.equal(new Set(colorIndicesOf(colored)).size, 5)
})

test('assignPlayerColors: 10명(팔레트 크기와 동일)이면 0~9를 정확히 한 번씩 나눠 갖는다', () => {
    const players = Array.from({ length: PLAYER_COLOR_COUNT }, (_, i) => makePlayer(`c${i}`))

    const colored = assignPlayerColors(players, Math.random)

    assert.equal(new Set(colorIndicesOf(colored)).size, PLAYER_COLOR_COUNT)
    assert.deepEqual(
        colorIndicesOf(colored).slice().sort((a, b) => a - b),
        Array.from({ length: PLAYER_COLOR_COUNT }, (_, i) => i),
    )
})

test('assignPlayerColors: randomFn을 주입하면 결정적이다 — 같은 시퀀스는 같은 배정, 다른 시퀀스는 다른 팔레트 순열', () => {
    const players = Array.from({ length: 5 }, (_, i) => makePlayer(`c${i}`))
    const sequence = [0.1, 0.9, 0.4, 0.7, 0.2, 0.6, 0.3, 0.8, 0.5]

    const first = assignPlayerColors(players, sequenceRandom(sequence))
    const second = assignPlayerColors(players, sequenceRandom(sequence))
    assert.deepEqual(colorIndicesOf(first), colorIndicesOf(second))

    // 서로 다른 난수는 서로 다른 팔레트 순열을 만든다(색이 입장 순서에 고정돼 있지 않다).
    assert.notDeepEqual(
        colorIndicesOf(assignPlayerColors(players, () => 0)),
        colorIndicesOf(assignPlayerColors(players, () => 0.999)),
    )
})

test('assignPlayerColors: 참가자 수가 팔레트 크기를 넘어도 throw하지 않고 팔레트를 순환 배정한다', () => {
    // 정상 경로는 validateSessionInput의 2~10명 제한 때문에 여기 도달하지 않지만, 이 순수
    // 함수는 호출자를 신뢰하지 않고 스스로 정의된 동작을 갖는다.
    const players = Array.from({ length: 12 }, (_, i) => makePlayer(`c${i}`))

    const colored = assignPlayerColors(players, () => 0.5)

    assert.equal(colored.length, 12)
    for (const [index, player] of colored.entries()) {
        assert.equal(player.colorIndex >= 0 && player.colorIndex < PLAYER_COLOR_COUNT, true)
        assert.equal(player.colorIndex, colored[index % PLAYER_COLOR_COUNT].colorIndex)
    }
})

test('assignPlayerColors: 원본 배열/원소를 변형하지 않고 새 원소를 반환한다', () => {
    const players = Array.from({ length: 5 }, (_, i) => makePlayer(`c${i}`))
    const before = JSON.parse(JSON.stringify(players))

    const colored = assignPlayerColors(players, Math.random)

    assert.deepEqual(players, before)
    for (const [index, player] of players.entries()) {
        assert.equal(Object.hasOwn(player, 'colorIndex'), false)
        assert.notEqual(colored[index], player)
        assert.equal(colored[index].uuid, player.uuid)
    }
})

test('buildSessionCandidate: 10인 세션의 참가자 전원이 겹치지 않는 colorIndex를 갖는다', () => {
    const room = makeRoom({
        id: 'room-colors-10',
        players: Array.from({ length: 10 }, (_, i) => makePlayer(`cc${i}`)),
        jokerCount: 1,
    })

    const { session } = buildSessionCandidate(room)

    const indices = colorIndicesOf([...session.players.values()])
    assert.equal(indices.length, 10)
    assert.equal(new Set(indices).size, 10)
    for (const colorIndex of indices) {
        assert.equal(Number.isInteger(colorIndex), true)
        assert.equal(colorIndex >= 0 && colorIndex < PLAYER_COLOR_COUNT, true)
    }
})

test('buildSessionCandidate: DEBUG_FIXED_ROLES로 역할이 고정돼도 색은 언제나 셔플 배정된다', () => {
    // 5인·jokerCount 1의 canonical 구성(JOKER 1 + CITIZEN 4)과 개수가 일치해야 고정 배정이
    // 성립한다 — 어긋나면 경고 한 줄과 함께 랜덤 경로로 되돌아가 이 테스트의 전제가 깨진다.
    const list = 'JOKER,CITIZEN,CITIZEN,CITIZEN,CITIZEN'
    const makeFiveRoom = (id) =>
        makeRoom({ id, players: Array.from({ length: 5 }, (_, i) => makePlayer(`fx${i}`)), jokerCount: 1 })

    withFixedRoles(list, () => {
        const zero = buildSessionCandidate(makeFiveRoom('room-colors-fixed-a'), { randomFn: () => 0 }).session
        const high = buildSessionCandidate(makeFiveRoom('room-colors-fixed-b'), { randomFn: () => 0.999 }).session

        // (a) 역할은 여전히 입장 순서 그대로의 고정 배정이다.
        for (const session of [zero, high]) {
            assert.deepEqual(
                [...session.players.values()].map((p) => p.role),
                list.split(','),
            )
        }

        // (b) 색은 전원에게 겹치지 않게 배정된다.
        for (const session of [zero, high]) {
            const indices = colorIndicesOf([...session.players.values()])
            assert.equal(new Set(indices).size, 5)
        }

        // (c) randomFn을 바꾸면 색 배정이 실제로 달라진다 — 고정 역할 경로에서도 색은 셔플된다.
        assert.notDeepEqual(colorIndicesOf([...zero.players.values()]), colorIndicesOf([...high.players.values()]))
    })
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

/** N인 세션을 커밋하고 uuid 목록과 함께 돌려준다(역할 배정은 결정적 randomFn으로 고정). */
function commitRoleRevealSession({ id, uuids, jokerCount = 1 }) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    return candidate.session
}

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
    // 초기 DAY의 스냅샷에는 낮/재판/밤 결과 필드가 하나도 실리지 않는다.
    const snapshot = getSessionSnapshotForPlayer('s3a', session.id).snapshot
    assert.deepEqual(Object.keys(snapshot).sort(), ['dayIndex', 'gameId', 'phase', 'players', 'self'])
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

    // DAY 투표: 생존자 → 생존 대상
    assert.deepEqual(submitDayVote('s6a', session.id, 's6b'), { ok: true })
    assert.equal(session.dayVotes.get('s6a'), 's6b')

    // 생존자의 공개 DAY 채팅: canonical 채널 라우팅이 DAY로 해석된다.
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
        assert.deepEqual(Object.keys(player).sort(), ['colorIndex', 'isAlive', 'nickname', 'uuid'])
    }
    assertNoForbiddenPrivateData(result.snapshot, collectOtherPlayerRoleSecrets(session, 's7a'))
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
        dayChatRateLimit: new Map(),
        deadChatRateLimit: new Map(),
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
// getActiveSessionRoutingInfo — 재접속 라우팅 조회
// ---------------------------------------------------------------------------

test('getActiveSessionRoutingInfo: 진행 중 세션의 참가자에게 gameId·channelId·phase만 반환한다', () => {
    const room = makeRoom({ id: 'room-routing', players: [makePlayer('rt-a'), makePlayer('rt-b')] })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    const routing = getActiveSessionRoutingInfo('rt-a')

    // 키 집합을 고정해 role/team/ballot 등 비밀 정보가 새로 실리지 않았음을 못박는다.
    assert.deepEqual(Object.keys(routing).sort(), ['channelId', 'gameId', 'phase'])
    assert.equal(routing.gameId, candidate.session.id)
    assert.equal(routing.channelId, candidate.session.channelId)
    assert.equal(routing.phase, 'ROLE_REVEAL')
})

test('getActiveSessionRoutingInfo: 세션이 ENDED면 phase가 ENDED이고 라우팅 값은 그대로다', () => {
    const room = makeRoom({ id: 'room-routing-ended', players: [makePlayer('rte-a'), makePlayer('rte-b')] })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    candidate.session.phase = 'ENDED'
    const routing = getActiveSessionRoutingInfo('rte-a')

    assert.deepEqual(routing, {
        gameId: candidate.session.id,
        channelId: candidate.session.channelId,
        phase: 'ENDED',
    })
})

test('getActiveSessionRoutingInfo: 활성 세션이 없는 uuid는 null이다', () => {
    assert.equal(getActiveSessionRoutingInfo('no-such-uuid'), null)
})

test('getActiveSessionRoutingInfo: registry 불일치(세션만 사라짐)에서도 throw하지 않고 null이다', () => {
    const room = makeRoom({ id: 'room-routing-gone', players: [makePlayer('rtg-a'), makePlayer('rtg-b')] })
    const candidate = buildSessionCandidate(room)
    commitGameSession(candidate.session)

    __deleteGameSessionOnlyForTests(candidate.session.id)

    // phase를 함께 반환하게 된 뒤에도 세션 객체가 없는 경우는 여전히 null이다(session.phase
    // 접근으로 throw하지 않는다).
    assert.equal(getActiveSessionRoutingInfo('rtg-a'), null)
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

/**
 * 테스트 전용 NIGHT 픽스처: 참가자 전원의 canonical 역할 확인으로 초기 DAY(dayIndex 1)까지
 * 전이시킨 뒤, NIGHT 규칙을 격리해 검증하기 위해 세션을 "그 밤"(기본값은 첫 밤 — NIGHT,
 * dayIndex 0) 상태로 직접 되돌린다.
 *
 * 초기 DAY 전이 자체는 위 슬라이스1 테스트들이 별도로 검증한다 — 이 헬퍼는 밤 행동·밤 판정·
 * JOKER 비밀 채팅처럼 NIGHT 위에서만 성립하는 규칙들을 dayIndex 경계(0 = 마녀사냥꾼 비활성)까지
 * 포함해 그대로 재현하기 위한 픽스처 조립이며, production 진입 순서를 흉내내지 않는다.
 *
 * 되돌릴 때는 phase/dayIndex만이 아니라 밤 제출·판정 상태(nightActions/nightResolution)와 지난
 * 낮/재판 기록(dayVotes/dayVoteResolution/tribunal)까지 전부 신선한 값으로 함께 맞춘다 —
 * production이 매 NIGHT 진입에서 보장하는 상태와 같은 모양이어야, 이 픽스처 위의 테스트가 초기
 * DAY가 남긴 잔여 상태에 의존하거나 그것 때문에 조용히 어긋나지 않는다.
 */
function ackAllAndRewindToFirstNight(session, { dayIndex = 0 } = {}) {
    for (const uuid of session.players.keys()) acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'NIGHT'
    session.dayIndex = dayIndex
    session.nightActions = new Map()
    session.nightResolution = null
    session.dayVotes = new Map()
    session.dayVoteResolution = null
    session.tribunal = null
}

/** playerCount=10·jokerCount=1 세션을 커밋하고 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다. 5개 역할 전부가 정확히 1명씩(CITIZEN은 6명) 배정된다. */
function commitFullRoleSessionAtNight({ id = 'room-full', gameIdFn } = {}) {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`fp-${id}-${i}`))
    const room = makeRoom({ id, players, jokerCount: 1 })
    const opts = { randomFn: () => 0.999, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
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
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToFirstNight(session)
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

const { prepareNightResolution, commitNightResolution, buildNightResultAppliedPayload } = gameSession

// 3인·jokerCount 1 세션을 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다 — commitNightResolution은
// NIGHT 위에서만 의미가 있는 mutation이므로, 전원 확인이 도달시키는 초기 DAY가 아니라
// ackAllAndRewindToFirstNight이 세우는 canonical NIGHT 상태에서 검증한다.
function nightSessionOf3({ id = 'room-cnr' } = {}) {
    const room = makeRoom({ id, players: [makePlayer('cnr-a'), makePlayer('cnr-b'), makePlayer('cnr-c')], jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    ackAllAndRewindToFirstNight(candidate.session)
    return candidate.session
}

// playerCount=4·jokerCount=1 세션을 첫 밤(NIGHT, dayIndex 0) 픽스처로 만든다(randomFn:()=>0
// 고정 셔플에서 JOKER는 두 번째 참가자로 배정된다). commitNightResolution이 승리 판정을 추가한
// 뒤에도 CITIZEN 희생자 한 명을 죽이는 것만으로는 어느 진영도 승리하지 않도록(생존 JOKER 1명 <
// 생존 CITIZEN 2명) 골라, 여전히 비종결(NIGHT→DAY) 케이스를 검증하기 위한 fixture다 —
// nightSessionOf3(3인·1조커)은 어떤 희생자를 죽여도 항상 한쪽이 승리해버려 이 목적에 쓸 수 없다.
function nightSessionOf4NoWin({ id = 'room-cnr4' } = {}) {
    const room = makeRoom({
        id,
        players: [makePlayer('cnr4-a'), makePlayer('cnr4-b'), makePlayer('cnr4-c'), makePlayer('cnr4-d')],
        jokerCount: 1,
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    ackAllAndRewindToFirstNight(candidate.session)
    return candidate.session
}

test('commitNightResolution: 유효한 victim이 있으면 그 player만 alive:false, phase→DAY, dayIndex+1, nightResolution 설정, 반환값 {ok:true, victimUuid, terminal:null}', () => {
    const session = nightSessionOf4NoWin()
    const players = [...session.players.values()]
    const victim = players.find((p) => p.role !== 'JOKER')
    const other = players.find((p) => p.uuid !== victim.uuid)
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: victim.uuid, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: victim.uuid, terminal: null })
    assert.equal(session.players.get(victim.uuid).alive, false)
    assert.equal(session.players.get(other.uuid).alive, true)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.nightResolution, resolution)
})

test('commitNightResolution: pendingEliminationTargetId가 null이면 전원 alive 유지, phase/dayIndex는 그대로 전이한다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-null' })
    const uuids = [...session.players.keys()]
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: null, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: null, terminal: null })
    for (const uuid of uuids) assert.equal(session.players.get(uuid).alive, true)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.nightResolution, resolution)
})

test('commitNightResolution: 마지막 생존 JOKER를 제거하면 DAY로 전이하지 않고 CITIZEN 승리로 종료된다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-win-citizen' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: jokerUuid, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: jokerUuid, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.dayIndex, 0) // 승리 시 DAY 전이(dayIndex+1)를 실행하지 않는다
    assert.equal(session.players.get(jokerUuid).alive, false)
    for (const player of session.players.values()) {
        if (player.uuid !== jokerUuid) assert.equal(player.alive, true)
    }
})

test('commitNightResolution: 희생자 반영 후 생존 JOKER가 생존 비-JOKER와 동수가 되면 JOKER 승리로 종료된다', () => {
    const session = nightSessionOf3({ id: 'room-cnr-win-joker' })
    const citizenUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: citizenUuid, privateResults: new Map(), resolved: true }

    const result = commitNightResolution(session, resolution)

    assert.deepEqual(result, { ok: true, victimUuid: citizenUuid, terminal: { winner: 'JOKER' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    assert.equal(session.dayIndex, 0)
    assert.equal(session.players.get(citizenUuid).alive, false)
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

test('buildNightResultAppliedPayload: top-level 키가 정확히 [dayIndex, deathReveals, gameId, phase, players, victimUuid], players 원소 키는 정확히 [alive, uuid]뿐이다', () => {
    // nightSessionOf4NoWin(비종결 fixture)을 써야 phase가 'DAY'로 남는다 — nightSessionOf3은
    // 어떤 희생자를 죽여도 승리 조건이 성립해 phase가 'ENDED'로 바뀌어 이 payload 화이트리스트
    // 자체가 달라진다(winResult 등 terminal 전용 필드 포함).
    const session = nightSessionOf4NoWin({ id: 'room-bnrap' })
    const victimUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: victimUuid, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)

    const payload = buildNightResultAppliedPayload(session, victimUuid, session.nightResolution.publicDeathReveals)

    assert.deepEqual(Object.keys(payload).sort(), ['dayIndex', 'deathReveals', 'gameId', 'phase', 'players', 'victimUuid'])
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
// 공개 사망 reveal — resolveNightDeathSource / buildNightDeathReveals /
// commitNightResolution의 publicDeathReveals
// ---------------------------------------------------------------------------

const { resolveNightDeathSource, buildNightDeathReveals } = gameSession.__testables
const { PUBLIC_NIGHT_DEATH_SOURCES } = gameSession

/**
 * 이번 밤에 실제로 죽는 JOKER 암살(보호 없음) 판정을 만들어 커밋한다(4인·비종결 NIGHT fixture).
 *
 * prepare가 실패하면 prepared.session은 undefined라 commitNightResolution이 "의도한 세션"이
 * 아니라 undefined를 받고 엉뚱한 TypeError로 터진다 — 그러면 이 헬퍼를 쓰는 reveal 테스트들이
 * 실제 검증 대상 대신 픽스처 조립 실패를 보고하게 된다. 그래서 (a) prepare 성공을 픽스처 자체의
 * 불변조건으로 명시하고, (b) commit에는 언제나 이 픽스처가 만든 canonical session을 그대로
 * 넘긴다(성공 시 prepared.session과 동일한 참조다).
 */
function commitAssassinationNight({ id = 'room-reveal' } = {}) {
    const session = nightSessionOf4NoWin({ id })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const victimUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    submitNightAction(jokerUuid, session.id, victimUuid)
    const prepared = prepareNightResolution(jokerUuid, session.id)
    assert.equal(prepared.ok, true, `commitAssassinationNight: 밤 판정 준비 실패(${prepared.code})`)
    assert.equal(prepared.session, session)
    const applied = commitNightResolution(session, prepared.resolution)
    return { session, jokerUuid, victimUuid, prepared, applied }
}

test('공개 사망 reveal: 사망자가 없는 밤(전원 SKIP)은 재생할 reveal을 만들지 않는다', () => {
    const session = nightSessionOf4NoWin({ id: 'room-reveal-none' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    submitNightAction(jokerUuid, session.id, null)
    const prepared = prepareNightResolution(jokerUuid, session.id)

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.equal(applied.victimUuid, null)
    assert.deepEqual(session.nightResolution.publicDeathReveals, [])
    for (const player of session.players.values()) assert.equal(player.alive, true)
})

test('공개 사망 reveal: DOCTOR가 막아낸 JOKER 암살은 reveal을 만들지 않는다(선택된 대상이 죽지 않음)', () => {
    // JOKER 1 + DOCTOR 1 + CITIZEN 3이 함께 존재하도록 CUSTOM 구성으로 5인 세션을 만든다.
    const room = makeCustomRoom({
        id: 'room-reveal-blocked',
        players: ['rb-a', 'rb-b', 'rb-c', 'rb-d', 'rb-e'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    // 보호 판정은 NIGHT 위에서만 성립한다 — 전원 확인이 도달시키는 초기 DAY가 아니라 첫 밤
    // 픽스처에서 검증한다(다른 밤 판정 테스트들과 같은 헬퍼를 쓴다).
    ackAllAndRewindToFirstNight(session)

    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const doctorUuid = [...session.players.values()].find((p) => p.role === 'DOCTOR').uuid
    const targetUuid = [...session.players.values()].find((p) => p.role === 'CITIZEN').uuid

    submitNightAction(jokerUuid, session.id, targetUuid)
    submitNightAction(doctorUuid, session.id, targetUuid) // 같은 대상을 보호 → 암살 무효
    const prepared = prepareNightResolution(jokerUuid, session.id)

    const applied = commitNightResolution(prepared.session, prepared.resolution)

    assert.equal(prepared.resolution.assassinationTargetId, targetUuid, '암살 시도 자체는 집계됐다')
    assert.equal(applied.victimUuid, null, '보호된 대상은 죽지 않는다')
    assert.deepEqual(session.nightResolution.publicDeathReveals, [], '죽지 않은 대상에는 reveal이 없다')
    assert.equal(session.players.get(targetUuid).alive, true)
})

test('공개 사망 reveal: 실제 JOKER 암살 사망은 source JOKER인 공개 reveal 정확히 1건을 만든다', () => {
    const { session, victimUuid } = commitAssassinationNight({ id: 'room-reveal-joker' })

    assert.deepEqual(session.nightResolution.publicDeathReveals, [
        { victimUuid, source: 'JOKER' },
    ])
    assert.equal(session.players.get(victimUuid).alive, false)
})

test('공개 사망 reveal: 판정이 처형을 비모호적으로 귀속시킨 경우에만 source가 WITCH_HUNTER다', () => {
    const resolution = { assassinationTargetId: null, witchHunterExecutionTargetId: 'v1' }

    assert.equal(resolveNightDeathSource(resolution, 'v1'), 'WITCH_HUNTER')
    assert.deepEqual(buildNightDeathReveals(resolution, ['v1']), [{ victimUuid: 'v1', source: 'WITCH_HUNTER' }])
})

test('공개 사망 reveal: 귀속이 없거나(모르는 밤 사망) 둘 이상으로 모호하면 UNKNOWN_NIGHT이고 행위자 정보를 지어내지 않는다', () => {
    // 귀속 없음 — 어떤 효과도 이 희생자를 가리키지 않는다.
    assert.equal(resolveNightDeathSource({ assassinationTargetId: 'other' }, 'v1'), 'UNKNOWN_NIGHT')
    // 모호 — 두 효과가 동시에 같은 희생자를 가리킨다.
    assert.equal(
        resolveNightDeathSource({ assassinationTargetId: 'v1', witchHunterExecutionTargetId: 'v1' }, 'v1'),
        'UNKNOWN_NIGHT',
    )
    // resolution이 비어 있어도(필드 자체가 없음) 안전하게 UNKNOWN_NIGHT다.
    assert.equal(resolveNightDeathSource({}, 'v1'), 'UNKNOWN_NIGHT')

    const reveals = buildNightDeathReveals({}, ['v1'])
    assert.deepEqual(reveals, [{ victimUuid: 'v1', source: 'UNKNOWN_NIGHT' }])
    assert.deepEqual(Object.keys(reveals[0]).sort(), ['source', 'victimUuid'])
})

test('공개 사망 reveal: 서로 다른 다수 사망은 canonical 적용 순서를 유지한 결정적 목록이고 victim 기준으로 중복 제거된다', () => {
    const resolution = { assassinationTargetId: 'v2', witchHunterExecutionTargetId: 'v1' }

    const reveals = buildNightDeathReveals(resolution, ['v1', 'v2', 'v1', 'v3', 'v2'])

    assert.deepEqual(reveals, [
        { victimUuid: 'v1', source: 'WITCH_HUNTER' },
        { victimUuid: 'v2', source: 'JOKER' },
        { victimUuid: 'v3', source: 'UNKNOWN_NIGHT' },
    ])
    // 같은 입력은 항상 같은 출력이다(결정적).
    assert.deepEqual(buildNightDeathReveals(resolution, ['v1', 'v2', 'v1', 'v3', 'v2']), reveals)
})

test('공개 사망 reveal: 이미 죽어 있던 대상은 새 reveal을 만들지 않는다(커밋 자체가 거부되고 상태가 불변)', () => {
    const session = nightSessionOf4NoWin({ id: 'room-reveal-already-dead' })
    const [victimUuid] = [...session.players.keys()]
    session.players.get(victimUuid).alive = false
    const resolution = {
        gameId: session.id,
        dayIndex: 0,
        assassinationTargetId: victimUuid,
        pendingEliminationTargetId: victimUuid,
        privateResults: new Map(),
        resolved: true,
    }

    assert.throws(() => commitNightResolution(session, resolution))

    assert.equal(session.nightResolution, null)
    assert.equal(Object.hasOwn(resolution, 'publicDeathReveals'), false, '거부된 판정은 reveal조차 만들지 않는다')
})

test('공개 사망 reveal: 같은 밤을 다시 판정하려 해도 reveal 목록은 늘어나지 않는다(중복 판정 차단)', () => {
    const { session, jokerUuid, victimUuid } = commitAssassinationNight({ id: 'room-reveal-dup' })
    const firstReveals = session.nightResolution.publicDeathReveals

    const duplicate = prepareNightResolution(jokerUuid, session.id)

    assert.deepEqual(duplicate, { ok: false, code: 'NIGHT_ALREADY_RESOLVED' })
    assert.equal(session.nightResolution.publicDeathReveals, firstReveals, 'reveal 배열 참조가 교체되지 않는다')
    assert.deepEqual(session.nightResolution.publicDeathReveals, [{ victimUuid, source: 'JOKER' }])
})

test('공개 사망 reveal: 공개 화이트리스트가 정확히 [source, victimUuid]뿐이고 killer/actor/역할/대상 Map 등 비밀 필드가 없다', () => {
    const { session, jokerUuid, victimUuid } = commitAssassinationNight({ id: 'room-reveal-whitelist' })

    const payload = buildNightResultAppliedPayload(session, victimUuid, session.nightResolution.publicDeathReveals)
    assert.equal(payload.deathReveals.length, 1)
    for (const reveal of payload.deathReveals) {
        assert.deepEqual(Object.keys(reveal).sort(), ['source', 'victimUuid'])
    }

    // reveal 목록 자체에는 killer uuid도, 내부 판정 필드도 절대 등장하지 않는다(roster는
    // 원래 공개 정보라 payload.players에 모든 참가자 uuid가 있는 것과 구분해서 본다).
    const serializedReveals = JSON.stringify(payload.deathReveals)
    assert.equal(serializedReveals.includes(jokerUuid), false, 'killer uuid가 reveal에 노출됨')
    assert.equal(serializedReveals.includes('privateResults'), false)
    assert.equal(serializedReveals.includes('protectedTargetIds'), false)
    assert.equal(serializedReveals.includes('assassinationTargetId'), false)
    assert.equal(serializedReveals.includes('nightActions'), false)
    assert.equal(serializedReveals.includes('role'), false)

    // payload 최상위에도 내부 판정 구조가 새어나오지 않는다.
    const serializedPayload = JSON.stringify(payload)
    assert.equal(serializedPayload.includes('privateResults'), false)
    assert.equal(serializedPayload.includes('protectedTargetIds'), false)
    assert.equal(serializedPayload.includes('assassinationTargetId'), false)
    assert.equal(serializedPayload.includes('nightActions'), false)
    // source는 세 공개 열거값 중 하나뿐이다.
    assert.deepEqual(Object.keys(PUBLIC_NIGHT_DEATH_SOURCES).sort(), ['JOKER', 'UNKNOWN_NIGHT', 'WITCH_HUNTER'])
    assert.ok(Object.hasOwn(PUBLIC_NIGHT_DEATH_SOURCES, payload.deathReveals[0].source))
})

test('공개 사망 reveal: 스냅샷 nightResult는 가장 최근 판정의 목록만 담고, 응답을 변형해도 canonical session이 오염되지 않는다', () => {
    const { session, victimUuid } = commitAssassinationNight({ id: 'room-reveal-snapshot' })
    const viewerUuid = [...session.players.keys()].find((uuid) => uuid !== victimUuid)

    const first = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.deepEqual(first.snapshot.nightResult, {
        dayIndex: 1,
        victimUuid,
        deathReveals: [{ victimUuid, source: 'JOKER' }],
    })

    first.snapshot.nightResult.deathReveals.push({ victimUuid: 'forged', source: 'JOKER' })
    first.snapshot.nightResult.deathReveals[0].source = 'UNKNOWN_NIGHT'

    const second = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.deepEqual(second.snapshot.nightResult.deathReveals, [{ victimUuid, source: 'JOKER' }])
    assert.deepEqual(session.nightResolution.publicDeathReveals, [{ victimUuid, source: 'JOKER' }])
})

// ---------------------------------------------------------------------------
// submitDayVote — DAY 투표/기권 제출
// ---------------------------------------------------------------------------

/**
 * playerCount=3 세션을 참가자 전원의 역할 확인만으로 초기 DAY(dayIndex 1, 전원 alive)까지
 * 전이한다 — 게임의 첫 진행 단계는 밤이 아니라 낮이므로, DAY 규칙을 검증하는 이 픽스처는
 * production과 동일하게 acknowledgeRoleReveal 하나로 그 낮에 도달한다(별도의 밤 판정을
 * 끼워넣지 않는다). NIGHT→DAY 전이 자체는 그 전이를 검증 대상으로 삼는 테스트가 직접 만든다.
 */
function commitTrioSessionAtDay({ id = 'room-day' } = {}) {
    const players = [makePlayer(`da-${id}`), makePlayer(`db-${id}`), makePlayer(`dc-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) acknowledgeRoleReveal(uuid, session.id)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
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

test('commitDayVoteResolution: TIE 결과는 phase를 NIGHT로 전이하고, 재요청은 멱등하게 alreadyResolved:true를 반환한다', () => {
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

    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.tribunal, null)
    assert.equal(session.dayVoteResolution, prepared.resolution)

    const again = prepareDayVoteResolution(uuidB, session.id, session.dayIndex)
    assert.equal(again.ok, true)
    assert.equal(again.alreadyResolved, true)
    assert.equal(again.resolution, prepared.resolution)
    assert.equal(session.phase, 'NIGHT')
})

test('commitDayVoteResolution: ABSTAINED 결과도 phase를 NIGHT로 전이한다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-abstain-1' })
    submitDayVote(uuidA, session.id, null)
    submitDayVote(uuidB, session.id, null)
    submitDayVote(uuidC, session.id, null)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    assert.equal(prepared.resolution.outcome, 'ABSTAINED')

    commitDayVoteResolution(prepared.session, prepared.resolution)

    assert.equal(session.phase, 'NIGHT')
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
    assert.equal(
        session.tribunal.candidateId,
        session.dayVoteResolution.tribunalTargetUuid,
    )
    assert.equal(
        session.tribunal.defendantUuid,
        session.dayVoteResolution.tribunalTargetUuid,
    )
    assert.equal(session.tribunal.dayIndex, session.dayIndex)
    assert.ok(session.tribunal.votes instanceof Map)
    assert.equal(session.tribunal.votes.size, 0)
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

test('buildDayVoteResolvedPayload: TIE/ABSTAINED 이후에는 payload.phase가 NIGHT를 노출한다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-payload-phase-1' })
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidC)
    submitDayVote(uuidC, session.id, uuidA)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    commitDayVoteResolution(prepared.session, prepared.resolution)
    const payload = buildDayVoteResolvedPayload(prepared.session, prepared.resolution)

    assert.equal(payload.phase, 'NIGHT')
    assert.equal(payload.outcome, 'TIE')
})

// ---------------------------------------------------------------------------
// prepareTribunalVoteResolution / commitTribunalVoteResolution / buildTribunalVoteResolvedPayload
// ---------------------------------------------------------------------------

const { prepareTribunalVoteResolution, commitTribunalVoteResolution, buildTribunalVoteResolvedPayload } = gameSession

function castAllVotes(session, votesByUuid) {
    for (const [voterUuid, vote] of Object.entries(votesByUuid)) {
        submitTribunalVote(voterUuid, session.id, session.dayIndex, vote)
    }
}

test('resolveTribunalVote: 미제출 유효 투표자가 있으면 거부', () => {
    const { session } = setupTribunalReadySession({ uuids: ['ta1', 'ta2', 'ta3'], defendantUuid: 'ta3' })
    submitTribunalVote('ta1', session.id, session.dayIndex, 'GUILTY')

    const result = prepareTribunalVoteResolution('ta1', session.id, session.dayIndex)

    assert.deepEqual(result, { ok: false, code: 'TRIBUNAL_VOTES_INCOMPLETE' })
})

test('resolveTribunalVote: 모든 유효 표 제출 후 유죄 판결', () => {
    // playerCount=4·jokerCount=1·randomFn:()=>0 고정 셔플(JOKER는 두 번째 참가자로 배정) —
    // 피고인(tb4)을 CITIZEN으로 골라 처형 이후에도 승리 조건이 성립하지 않게(생존 JOKER 1명 <
    // 생존 CITIZEN 2명) 한다. 기본 3인 fixture는 어떤 피고인이 유죄여도 항상 한쪽이 승리해버려
    // 이 테스트의 원래 목적(유죄 판결 집계 자체)을 검증할 수 없다.
    const { session } = setupTribunalReadySession({
        uuids: ['tb1', 'tb2', 'tb3', 'tb4'],
        defendantUuid: 'tb4',
        randomFn: () => 0,
    })
    castAllVotes(session, { tb1: 'GUILTY', tb2: 'GUILTY', tb3: 'GUILTY' })

    const prepared = prepareTribunalVoteResolution('tb1', session.id, session.dayIndex)
    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.outcome, 'GUILTY')
    assert.equal(prepared.resolution.executedUuid, 'tb4')
    assert.deepEqual(prepared.resolution.counts, { guilty: 3, notGuilty: 0 })

    const committed = commitTribunalVoteResolution(prepared.session, prepared.resolution)
    assert.deepEqual(committed, { ok: true, terminal: null })
})

test('resolveTribunalVote: 유죄 피고인은 정확히 한 번 사망', () => {
    const { session } = setupTribunalReadySession({ uuids: ['tc1', 'tc2', 'tc3'], defendantUuid: 'tc3' })
    castAllVotes(session, { tc1: 'GUILTY', tc2: 'GUILTY' })
    const prepared = prepareTribunalVoteResolution('tc1', session.id, session.dayIndex)

    commitTribunalVoteResolution(prepared.session, prepared.resolution)

    assert.equal(session.players.get('tc3').alive, false)
    assert.equal(session.players.get('tc1').alive, true)
    assert.equal(session.players.get('tc2').alive, true)
})

test('resolveTribunalVote: 동률은 무죄', () => {
    const { session } = setupTribunalReadySession({ uuids: ['td1', 'td2', 'td3', 'td4'], defendantUuid: 'td4' })
    castAllVotes(session, { td1: 'GUILTY', td2: 'NOT_GUILTY', td3: 'NOT_GUILTY' })
    // eligible voters(td1,td2,td3) 중 GUILTY 1 vs NOT_GUILTY 2 — 무죄 사례도 겸해 확인 후,
    // 동률 자체는 counts 비교로 별도 확인한다.
    const prepared = prepareTribunalVoteResolution('td1', session.id, session.dayIndex)
    assert.equal(prepared.resolution.outcome, 'NOT_GUILTY')

    const tieSession = setupTribunalReadySession({ uuids: ['te1', 'te2', 'te3'], defendantUuid: 'te3' }).session
    castAllVotes(tieSession, { te1: 'GUILTY', te2: 'NOT_GUILTY' })
    const tiePrepared = prepareTribunalVoteResolution('te1', tieSession.id, tieSession.dayIndex)
    assert.equal(tiePrepared.resolution.outcome, 'NOT_GUILTY')
    assert.equal(tiePrepared.resolution.executedUuid, null)

    commitTribunalVoteResolution(tiePrepared.session, tiePrepared.resolution)
    assert.equal(tieSession.players.get('te3').alive, true)
})

test('commitTribunalVoteResolution: 마지막 생존 JOKER를 처형하면 CITIZEN 승리로 종료된다', () => {
    // uuids=['cj1','cj2','cj3']·jokerCount 1(makeRoom 기본값)·randomFn:()=>0 고정 셔플에서
    // JOKER는 항상 두 번째 참가자(cj2)로 배정된다(commitNightResolution 승리 테스트의
    // nightSessionOf3와 동일한 셔플 규칙).
    const { session, defendantUuid } = setupTribunalReadySession({
        uuids: ['cj1', 'cj2', 'cj3'],
        defendantUuid: 'cj2',
        randomFn: () => 0,
    })
    assert.equal(session.players.get(defendantUuid).role, 'JOKER')
    castAllVotes(session, { cj1: 'GUILTY', cj3: 'GUILTY' })
    const prepared = prepareTribunalVoteResolution('cj1', session.id, session.dayIndex)

    const result = commitTribunalVoteResolution(prepared.session, prepared.resolution)

    assert.deepEqual(result, { ok: true, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.players.get('cj2').alive, false)
})

test('commitTribunalVoteResolution: 비-JOKER를 처형해 생존 JOKER와 생존 비-JOKER가 동수가 되면 JOKER 승리로 종료된다', () => {
    // 같은 고정 셔플에서 cj3(세 번째 참가자)은 항상 CITIZEN이다 — 처형 후 생존 JOKER 1명 ===
    // 생존 비-JOKER 1명(cp2 본인) → parity로 JOKER 승리.
    const { session, defendantUuid } = setupTribunalReadySession({
        uuids: ['cp1', 'cp2', 'cp3'],
        defendantUuid: 'cp3',
        randomFn: () => 0,
    })
    assert.notEqual(session.players.get(defendantUuid).role, 'JOKER')
    castAllVotes(session, { cp1: 'GUILTY', cp2: 'GUILTY' })
    const prepared = prepareTribunalVoteResolution('cp1', session.id, session.dayIndex)

    const result = commitTribunalVoteResolution(prepared.session, prepared.resolution)

    assert.deepEqual(result, { ok: true, terminal: { winner: 'JOKER' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    assert.equal(session.players.get('cp3').alive, false)
})

test('commitTribunalVoteResolution: 승리 조건 미충족이면 phase가 NIGHT로 전이하고 dayIndex는 그대로 유지되며 TRIBUNAL 판정 기록은 남는다', () => {
    // 4인·jokerCount 1 고정 셔플: JOKER는 cn2, 나머지는 CITIZEN이다. cn4(CITIZEN) 처형 후에도
    // 생존 JOKER 1명 < 생존 비-JOKER 2명(cn1, cn3)이라 승리 조건이 성립하지 않는다.
    const { session } = setupTribunalReadySession({
        uuids: ['cn1', 'cn2', 'cn3', 'cn4'],
        defendantUuid: 'cn4',
        randomFn: () => 0,
    })
    const dayIndexBefore = session.dayIndex
    castAllVotes(session, { cn1: 'GUILTY', cn2: 'GUILTY', cn3: 'GUILTY' })
    const prepared = prepareTribunalVoteResolution('cn1', session.id, session.dayIndex)

    const result = commitTribunalVoteResolution(prepared.session, prepared.resolution)

    assert.deepEqual(result, { ok: true, terminal: null })
    assert.equal(session.phase, 'NIGHT')
    // TRIBUNAL→NIGHT 전이는 dayIndex를 바꾸지 않는다(dayIndex 증가는 오직
    // commitNightResolution의 NIGHT→DAY 전이에서만 일어난다).
    assert.equal(session.dayIndex, dayIndexBefore)
    assert.equal(session.tribunal.resolved, true)
    assert.equal(session.tribunal.outcome, 'GUILTY')
    assert.equal(session.players.get('cn4').alive, false)
    assert.equal(Object.hasOwn(session, 'winResult'), false)
})

test('commitTribunalVoteResolution: NOT_GUILTY로 승리 조건 미충족이면 아무도 죽지 않은 채 phase가 NIGHT로 전이한다', () => {
    // 4인 고정 셔플에서 무죄(NOT_GUILTY)면 아무도 죽지 않아 생존 JOKER 1명 < 생존 비-JOKER
    // 3명이라 승리 조건이 성립하지 않는다.
    const { session } = setupTribunalReadySession({
        uuids: ['ng1', 'ng2', 'ng3', 'ng4'],
        defendantUuid: 'ng4',
        randomFn: () => 0,
    })
    castAllVotes(session, { ng1: 'NOT_GUILTY', ng2: 'NOT_GUILTY', ng3: 'NOT_GUILTY' })
    const prepared = prepareTribunalVoteResolution('ng1', session.id, session.dayIndex)

    const result = commitTribunalVoteResolution(prepared.session, prepared.resolution)

    assert.deepEqual(result, { ok: true, terminal: null })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.tribunal.outcome, 'NOT_GUILTY')
    assert.equal(session.players.get('ng4').alive, true)
})

test('commitTribunalVoteResolution: 승리 조건 미충족 전이는 지난 밤의 잔여 nightActions/nightResolution을 모두 새로 되돌린다(freshen NIGHT submission state)', () => {
    const { session } = setupTribunalReadySession({
        uuids: ['rs1', 'rs2', 'rs3', 'rs4'],
        defendantUuid: 'rs4',
        randomFn: () => 0,
    })
    // 지난(첫) 밤에서 남은 것처럼 nightActions/nightResolution을 오염시켜 둔다 —
    // setupTribunalReadySession은 ROLE_REVEAL→NIGHT→DAY→TRIBUNAL 전체 흐름을 실제로 거치지
    // 않고 phase를 직접 TRIBUNAL로 꽂아 넣으므로, "두 번째 밤" 시나리오를 재현하려면 첫 밤의
    // 잔여물을 여기서 직접 흉내내야 한다.
    session.nightActions.set('rs2', 'rs1') // rs2(JOKER)가 과거에 rs1을 지목했던 잔여 기록
    session.nightResolution = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        pendingEliminationTargetId: null,
        privateResults: new Map(),
        resolved: true,
    }

    castAllVotes(session, { rs1: 'GUILTY', rs2: 'GUILTY', rs3: 'GUILTY' })
    const prepared = prepareTribunalVoteResolution('rs1', session.id, session.dayIndex)

    const result = commitTribunalVoteResolution(prepared.session, prepared.resolution)

    assert.deepEqual(result, { ok: true, terminal: null })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.nightActions.size, 0)
    assert.equal(session.nightResolution, null)
})

test('commitTribunalVoteResolution: 승리 조건 미충족 전이 이후 새 밤 행동 제출이 실제로 성공한다(fresh night actions)', () => {
    const { session } = setupTribunalReadySession({
        uuids: ['fn1', 'fn2', 'fn3', 'fn4'],
        defendantUuid: 'fn4',
        randomFn: () => 0, // fn2 == JOKER(이 4인 고정 셔플에서 유일한 밤 행동 eligible actor)
    })
    castAllVotes(session, { fn1: 'GUILTY', fn2: 'GUILTY', fn3: 'GUILTY' })
    const prepared = prepareTribunalVoteResolution('fn1', session.id, session.dayIndex)
    commitTribunalVoteResolution(prepared.session, prepared.resolution)
    assert.equal(session.phase, 'NIGHT')

    // nightResolution이 되돌려지지 않았다면 NIGHT_ALREADY_RESOLVED로 즉시 막혔을 제출이다.
    const submitResult = submitNightAction('fn2', session.id, 'fn1')
    assert.deepEqual(submitResult, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get('fn2'), 'fn1')

    // fn2(JOKER)만 이 밤의 유일한 eligible actor다(CITIZEN 3명은 애초에 밤 행동이 없음) — 전원
    // 제출을 마쳤으므로 prepareNightResolution은 ACTIONS_PENDING이 아니라 성공해야 한다.
    const prepareResult = prepareNightResolution('fn1', session.id)
    assert.equal(prepareResult.ok, true)
})

test('resolveTribunalVote: 판정 후 submit/resolve mutation 잠금', () => {
    const { session } = setupTribunalReadySession({ uuids: ['tf1', 'tf2', 'tf3'], defendantUuid: 'tf3' })
    castAllVotes(session, { tf1: 'GUILTY', tf2: 'NOT_GUILTY' })
    const prepared = prepareTribunalVoteResolution('tf1', session.id, session.dayIndex)
    commitTribunalVoteResolution(prepared.session, prepared.resolution)

    // 무죄 판정(NOT_GUILTY, 3인 기본 fixture 1:1 표결)은 아무도 죽지 않아 승리 조건이
    // 성립하지 않으므로 phase가 TRIBUNAL을 벗어나 NIGHT로 전이한다 — 세 진입점 모두 "phase가
    // 더 이상 TRIBUNAL이 아니다"라는 동일한 근거로 막히지만, 각자의 검증 순서에 따라 서로
    // 다른 코드를 반환한다(TRIBUNAL_ALREADY_RESOLVED는 phase가 TRIBUNAL로 남아있을 때만
    // 도달하는 코드라 더 이상 나오지 않는다).
    assert.equal(session.phase, 'NIGHT')
    assert.deepEqual(prepareTribunalVoteResolution('tf1', session.id, session.dayIndex), {
        ok: false,
        code: 'INVALID_PHASE',
    })
    assert.deepEqual(commitTribunalVoteResolution(session, prepared.resolution), {
        ok: false,
        code: 'TRIBUNAL_RESOLUTION_MISMATCH',
    })
    assert.deepEqual(submitTribunalVote('tf3', session.id, session.dayIndex, 'GUILTY'), {
        ok: false,
        code: 'INVALID_PHASE',
    })
})

test('resolveTribunalVote: 변조된 executedUuid는 commit이 거부하고 아무도 죽지 않는다', () => {
    const { session } = setupTribunalReadySession({ uuids: ['tg1', 'tg2', 'tg3'], defendantUuid: 'tg3' })
    castAllVotes(session, { tg1: 'NOT_GUILTY', tg2: 'NOT_GUILTY' })
    const prepared = prepareTribunalVoteResolution('tg1', session.id, session.dayIndex)
    const forged = { ...prepared.resolution, outcome: 'GUILTY', executedUuid: 'tg3' }

    const result = commitTribunalVoteResolution(prepared.session, forged)

    assert.deepEqual(result, { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' })
    assert.equal(session.players.get('tg3').alive, true)
})

test('resolveTribunalVote: 승리 없는 TRIBUNAL 판정이 NIGHT로 전이한 이후 재-commit(지연된 중복 요청)은 거부되고 상태가 바뀌지 않는다', () => {
    // 4인 비종결 fixture: 처형 이후에도 게임이 NIGHT로 이어진다. 첫 commit이 이미 phase를
    // TRIBUNAL 밖(NIGHT)으로 옮겨놨으므로, 동일 resolution으로 재commit을 시도하면 phase 검사가
    // tribunal.resolved 검사보다 먼저 실행되어 TRIBUNAL_ALREADY_RESOLVED가 아니라
    // TRIBUNAL_RESOLUTION_MISMATCH로 거부된다 — 코드가 무엇이든 "재-commit이 거부되고
    // 아무 상태도 바뀌지 않는다"는 사실 자체가 이 테스트의 핵심이다.
    const { session } = setupTribunalReadySession({
        uuids: ['th1', 'th2', 'th3', 'th4'],
        defendantUuid: 'th4',
        randomFn: () => 0,
    })
    castAllVotes(session, { th1: 'GUILTY', th2: 'GUILTY', th3: 'GUILTY' })
    const prepared = prepareTribunalVoteResolution('th1', session.id, session.dayIndex)
    const first = commitTribunalVoteResolution(prepared.session, prepared.resolution)
    assert.deepEqual(first, { ok: true, terminal: null })
    assert.equal(session.phase, 'NIGHT')
    const aliveSnapshotBefore = [...session.players.values()].map((p) => [p.uuid, p.alive])

    const second = commitTribunalVoteResolution(session, prepared.resolution)

    assert.deepEqual(second, { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' })
    assert.equal(session.phase, 'NIGHT')
    assert.deepEqual(
        [...session.players.values()].map((p) => [p.uuid, p.alive]),
        aliveSnapshotBefore,
    )
})

test('resolveTribunalVote: 변조된 resolution은 미해결 상태에서도 commit이 거부', () => {
    const { session } = setupTribunalReadySession({ uuids: ['ti1', 'ti2', 'ti3'], defendantUuid: 'ti3' })
    castAllVotes(session, { ti1: 'GUILTY', ti2: 'NOT_GUILTY' })
    const forged = {
        gameId: session.id,
        dayIndex: session.dayIndex,
        defendantUuid: 'ti3',
        outcome: 'GUILTY',
        counts: { guilty: 99, notGuilty: 0 },
        executedUuid: 'ti3',
        ballotSnapshot: [],
    }

    const result = commitTribunalVoteResolution(session, forged)

    assert.deepEqual(result, { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' })
    assert.equal(session.players.get('ti3').alive, true)
})

test('resolveTribunalVote: prepare 후 canonical 변경 시 원본 resolution commit 거부(재-prepare 우회 포함)', () => {
    const { session } = setupTribunalReadySession({ uuids: ['tj1', 'tj2', 'tj3'], defendantUuid: 'tj3' })
    castAllVotes(session, { tj1: 'GUILTY', tj2: 'NOT_GUILTY' })
    const first = prepareTribunalVoteResolution('tj1', session.id, session.dayIndex)

    // 표를 뒤바꾼 뒤 재-prepare하면 pending 레코드가 갱신되어 이전 resolution 참조는 우회 불가.
    session.tribunal.votes.set('tj1', 'NOT_GUILTY')
    session.tribunal.votes.set('tj2', 'GUILTY')
    prepareTribunalVoteResolution('tj2', session.id, session.dayIndex)

    const bypass = commitTribunalVoteResolution(session, first.resolution)
    assert.deepEqual(bypass, { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' })
    assert.equal(session.players.get('tj3').alive, true)
})

test('resolveTribunalVote: 집계 동일 투표 교환 시 stale commit 거부', () => {
    const { session } = setupTribunalReadySession({ uuids: ['tk1', 'tk2', 'tk3'], defendantUuid: 'tk3' })
    castAllVotes(session, { tk1: 'GUILTY', tk2: 'NOT_GUILTY' })
    const prepared = prepareTribunalVoteResolution('tk1', session.id, session.dayIndex)

    // 총 개수는 동일(GUILTY 1, NOT_GUILTY 1)하지만 투표자별 표를 서로 교환한다.
    session.tribunal.votes.set('tk1', 'NOT_GUILTY')
    session.tribunal.votes.set('tk2', 'GUILTY')

    const result = commitTribunalVoteResolution(session, prepared.resolution)

    assert.deepEqual(result, { ok: false, code: 'TRIBUNAL_RESOLUTION_MISMATCH' })
    assert.equal(session.players.get('tk3').alive, true)
})

test('ballotSnapshot 교체·위조 거부: 양성 대조(변조 없는 정상 commit은 성공)', () => {
    const { session } = setupTribunalReadySession({ uuids: ['tl1', 'tl2', 'tl3'], defendantUuid: 'tl3', randomFn: () => 0 })
    castAllVotes(session, { tl1: 'GUILTY', tl2: 'GUILTY' })
    const prepared = prepareTribunalVoteResolution('tl1', session.id, session.dayIndex)

    const result = commitTribunalVoteResolution(prepared.session, prepared.resolution)

    assert.deepEqual(result, { ok: true, terminal: { winner: 'JOKER' } })
    assert.equal(session.players.get('tl3').alive, false)
})

test('buildTribunalVoteResolvedPayload: 공개 payload 화이트리스트 (GUILTY/NOT_GUILTY)', () => {
    const guiltySetup = setupTribunalReadySession({ uuids: ['tm1', 'tm2', 'tm3'], defendantUuid: 'tm3' })
    castAllVotes(guiltySetup.session, { tm1: 'GUILTY', tm2: 'GUILTY' })
    const guiltyPrepared = prepareTribunalVoteResolution('tm1', guiltySetup.session.id, guiltySetup.session.dayIndex)
    commitTribunalVoteResolution(guiltyPrepared.session, guiltyPrepared.resolution)
    const guiltyPayload = buildTribunalVoteResolvedPayload(guiltySetup.session)

    assert.deepEqual(Object.keys(guiltyPayload).sort(), ['counts', 'dayIndex', 'defendantUuid', 'executedUuid', 'gameId', 'outcome', 'phase'])
    assert.deepEqual(Object.keys(guiltyPayload.counts).sort(), ['guilty', 'notGuilty'])
    assert.equal(guiltyPayload.outcome, 'GUILTY')
    assert.equal(guiltyPayload.executedUuid, 'tm3')
    assert.equal(JSON.stringify(guiltyPayload).includes('ballotSnapshot'), false)
    assert.equal(JSON.stringify(guiltyPayload).includes('voterUuid'), false)
    assert.equal(JSON.stringify(guiltyPayload).includes('role'), false)

    const notGuiltySetup = setupTribunalReadySession({ uuids: ['tn1', 'tn2', 'tn3'], defendantUuid: 'tn3' })
    castAllVotes(notGuiltySetup.session, { tn1: 'NOT_GUILTY', tn2: 'NOT_GUILTY' })
    const notGuiltyPrepared = prepareTribunalVoteResolution('tn1', notGuiltySetup.session.id, notGuiltySetup.session.dayIndex)
    commitTribunalVoteResolution(notGuiltyPrepared.session, notGuiltyPrepared.resolution)
    const notGuiltyPayload = buildTribunalVoteResolvedPayload(notGuiltySetup.session)

    assert.equal(notGuiltyPayload.outcome, 'NOT_GUILTY')
    assert.equal(notGuiltyPayload.executedUuid, null)
})

test('공개 payload 화이트리스트: game-started 타인 player 키 무변경', () => {
    const room = makeRoom()
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    const payload = buildGameStartedPayload(candidate.session, 'u1')
    for (const player of payload.state.players) {
        assert.deepEqual(Object.keys(player).sort(), ['colorIndex', 'nickname', 'uuid'])
    }
})

// ---------------------------------------------------------------------------
// victory-resolution: evaluateWinCondition — 승리 조건 판정(순수 함수)
// ---------------------------------------------------------------------------

/** evaluateWinCondition은 session.players Map의 role/alive만 읽는다 — 전체 session 조립 없이
 * 최소 입력만으로 직접 검증한다. */
function makeWinConditionSession(playerSpecs) {
    return { players: new Map(playerSpecs.map((p) => [p.uuid, p])) }
}

test('evaluateWinCondition: 생존 JOKER가 0명이면 CITIZEN 승리를 반환한다', () => {
    const session = makeWinConditionSession([
        { uuid: 'j1', role: 'JOKER', alive: false },
        { uuid: 'c1', role: 'CITIZEN', alive: true },
        { uuid: 'c2', role: 'CITIZEN', alive: true },
    ])

    assert.deepEqual(evaluateWinCondition(session), { winner: 'CITIZEN' })
})

test('evaluateWinCondition: 생존 JOKER 수가 생존 비-JOKER 수 이상이면(동수·초과 둘 다) JOKER 승리를 반환한다', () => {
    const parity = makeWinConditionSession([
        { uuid: 'j1', role: 'JOKER', alive: true },
        { uuid: 'c1', role: 'CITIZEN', alive: true },
        { uuid: 'c2', role: 'CITIZEN', alive: false },
    ])
    assert.deepEqual(evaluateWinCondition(parity), { winner: 'JOKER' })

    const majority = makeWinConditionSession([
        { uuid: 'j1', role: 'JOKER', alive: true },
        { uuid: 'j2', role: 'JOKER', alive: true },
        { uuid: 'c1', role: 'CITIZEN', alive: true },
    ])
    assert.deepEqual(evaluateWinCondition(majority), { winner: 'JOKER' })
})

test('evaluateWinCondition: 생존 JOKER가 1명 이상이지만 생존 비-JOKER 수보다 적으면 승자가 없다', () => {
    const session = makeWinConditionSession([
        { uuid: 'j1', role: 'JOKER', alive: true },
        { uuid: 'c1', role: 'CITIZEN', alive: true },
        { uuid: 'c2', role: 'CITIZEN', alive: true },
    ])

    assert.equal(evaluateWinCondition(session), null)
})

// ---------------------------------------------------------------------------
// victory-resolution: canonical 종료 상태 — winResult 확정과 불변성
// ---------------------------------------------------------------------------

test('canonical 종료 상태: 승리 확정 시 phase는 ENDED, winResult는 {winner} 단일 키이며, 재평가·중복 판정 요청이 canonical winResult를 교체·변형하지 않는다', () => {
    const session = nightSessionOf3({ id: 'room-canonical-terminal' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: jokerUuid, privateResults: new Map(), resolved: true }

    const first = commitNightResolution(session, resolution)

    assert.deepEqual(first, { ok: true, victimUuid: jokerUuid, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.deepEqual(Object.keys(session.winResult), ['winner'])
    const canonicalWinResult = session.winResult

    // 재평가는 session.players를 읽기만 하는 순수 계산이라 canonical winResult를 건드리지 않는다.
    const reevaluated = evaluateWinCondition(session)
    assert.deepEqual(reevaluated, { winner: 'CITIZEN' })
    assert.equal(session.winResult, canonicalWinResult)

    // 중복 prepare/commit 요청은 예외 없이 GAME_ALREADY_ENDED로 거부되고, canonical winResult는
    // 다른 값으로도, 심지어 같은 값의 새 객체로도 교체되지 않는다(참조 동일성까지 확인).
    const duplicatePrepare = prepareNightResolution(jokerUuid, session.id)
    assert.deepEqual(duplicatePrepare, { ok: false, code: 'GAME_ALREADY_ENDED' })

    const forgedResolution = { gameId: session.id, dayIndex: session.dayIndex, pendingEliminationTargetId: null, privateResults: new Map(), resolved: true }
    const duplicateCommit = commitNightResolution(session, forgedResolution)
    assert.deepEqual(duplicateCommit, { ok: false, code: 'GAME_ALREADY_ENDED' })

    assert.equal(session.winResult, canonicalWinResult)
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.phase, 'ENDED')
})

// ---------------------------------------------------------------------------
// victory-resolution: ENDED 전원 역할 공개(winResult.reveals / mvp)
// ---------------------------------------------------------------------------

const { buildTerminalFields } = gameSession

/** canonical session.players에서 기대 reveals 배열을 그대로 계산한다(삽입 순서 포함). */
function expectedRevealsOf(session) {
    return [...session.players.values()].map((p) => ({
        uuid: p.uuid,
        nickname: p.nickname,
        colorIndex: p.colorIndex,
        role: p.role,
        team: ROLE_TEAMS[p.role],
        alive: p.alive,
    }))
}

test('buildTerminalFields: ENDED 세션의 winResult.reveals가 전원의 {uuid,nickname,colorIndex,role,team,alive}를 삽입 순서 그대로 담고 mvp는 null이다', () => {
    const session = nightSessionOf3({ id: 'room-terminal-reveals' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: jokerUuid, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)
    assert.equal(session.phase, 'ENDED')

    const fields = buildTerminalFields(session)

    // 기존 계약은 그대로다 — top-level 키 집합도, players 원소의 모양({uuid,isAlive})도 불변.
    assert.deepEqual(Object.keys(fields).sort(), ['phase', 'players', 'winResult'])
    for (const entry of fields.players) {
        assert.deepEqual(Object.keys(entry).sort(), ['isAlive', 'uuid'])
    }
    assert.equal(fields.winResult.winner, 'CITIZEN')
    assert.equal(fields.winResult.mvp, null)
    assert.deepEqual(Object.keys(fields.winResult).sort(), ['mvp', 'reveals', 'winner'])

    // 순서까지 포함해 canonical session.players와 정확히 일치한다.
    assert.deepEqual(fields.winResult.reveals, expectedRevealsOf(session))
    assert.equal(fields.winResult.reveals.length, session.players.size)
    for (const reveal of fields.winResult.reveals) {
        assert.deepEqual(Object.keys(reveal).sort(), ['alive', 'colorIndex', 'nickname', 'role', 'team', 'uuid'])
        assert.equal(reveal.team, ROLE_TEAMS[reveal.role])
    }
    // 처형된 JOKER의 역할·사망 상태가 실제로 공개된다(공개의 요점).
    const jokerReveal = fields.winResult.reveals.find((r) => r.uuid === jokerUuid)
    assert.deepEqual(jokerReveal, {
        uuid: jokerUuid,
        nickname: session.players.get(jokerUuid).nickname,
        colorIndex: session.players.get(jokerUuid).colorIndex,
        role: 'JOKER',
        team: 'JOKER',
        alive: false,
    })
})

test('buildTerminalFields: ENDED가 아닌 세션에는 reveals/mvp가 없다(phase 방어 게이트)', () => {
    const session = nightSessionOf4NoWin({ id: 'room-terminal-not-ended' })
    assert.equal(session.phase, 'NIGHT')

    // winResult 자체가 없으면 winResult 키도 없다.
    assert.equal(Object.hasOwn(buildTerminalFields(session), 'winResult'), false)

    // 판정 로직을 거치지 않고 테스트에서만 "ENDED가 아닌데 winResult가 있는" 비정상 상태를
    // 손으로 만든다(정상 경로에서는 finalizeGameSession이 phase와 winResult를 항상 함께 세팅해
    // 이 상태가 생기지 않는다) — 빌더가 phase를 독립적으로 재확인하는지 검증하기 위함이다.
    session.winResult = { winner: 'CITIZEN' }
    const fields = buildTerminalFields(session)

    assert.deepEqual(fields.winResult, { winner: 'CITIZEN' })
    assert.equal(Object.hasOwn(fields.winResult, 'reveals'), false)
    assert.equal(Object.hasOwn(fields.winResult, 'mvp'), false)
})

test('buildTerminalFields: 반환된 reveals를 변형해도 canonical session(players·winResult)은 오염되지 않는다', () => {
    const session = nightSessionOf3({ id: 'room-terminal-reveals-immut' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: jokerUuid, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)
    const canonicalWinResult = session.winResult

    const first = buildTerminalFields(session)
    first.winResult.reveals[0].role = 'TAMPERED_ROLE'
    first.winResult.reveals[0].alive = 'TAMPERED_ALIVE'
    first.winResult.reveals.push({ uuid: 'forged-uuid', nickname: 'forged', role: 'JOKER', team: 'JOKER', alive: true })
    first.winResult.mvp = 'TAMPERED_MVP'

    // canonical은 그대로다 — winResult는 여전히 {winner} 단일 키이고 참조도 교체되지 않았다.
    assert.equal(session.winResult, canonicalWinResult)
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.deepEqual(Object.keys(session.winResult), ['winner'])
    assert.equal(session.players.has('forged-uuid'), false)
    const firstPlayer = [...session.players.values()][0]
    assert.notEqual(firstPlayer.role, 'TAMPERED_ROLE')
    assert.equal(typeof firstPlayer.alive, 'boolean')

    // 재호출은 fresh 데이터를 돌려준다(매 호출 새 배열·새 원소).
    const second = buildTerminalFields(session)
    assert.deepEqual(second.winResult.reveals, expectedRevealsOf(session))
    assert.equal(second.winResult.mvp, null)
    assert.notEqual(first.winResult.reveals, second.winResult.reveals)
})

// ---------------------------------------------------------------------------
// victory-resolution: 종료 후 mutation 차단 — 8개 prepare/commit 진입점
// ---------------------------------------------------------------------------

test('종료 후 mutation 차단: 8개 prepare/commit 진입점 전부가 GAME_ALREADY_ENDED로 거부되고 세션·registry 상태가 매 호출마다 불변이다', () => {
    const session = nightSessionOf3({ id: 'room-post-end-lock' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const aliveUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: jokerUuid, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)
    assert.equal(session.phase, 'ENDED')
    const canonicalWinResult = session.winResult
    const aliveSnapshotBefore = [...session.players.values()].map((p) => [p.uuid, p.alive])

    const entryPoints = [
        ['prepareNightResolution', () => prepareNightResolution(aliveUuid, session.id)],
        ['commitNightResolution', () => commitNightResolution(session, {})],
        ['prepareDayVoteResolution', () => prepareDayVoteResolution(aliveUuid, session.id, session.dayIndex)],
        ['commitDayVoteResolution', () => commitDayVoteResolution(session, {})],
        ['prepareTribunalVoteResolution', () => prepareTribunalVoteResolution(aliveUuid, session.id, session.dayIndex)],
        ['commitTribunalVoteResolution', () => commitTribunalVoteResolution(session, {})],
        ['prepareJokerChatMessage', () => prepareJokerChatMessage(aliveUuid, session.id, 'hello')],
        ['commitJokerChatMessage', () => commitJokerChatMessage(session, aliveUuid, 12345)],
    ]

    for (const [name, call] of entryPoints) {
        const beforeSnapshot = gameSession.__getStateSnapshotForTests()

        const result = call()

        assert.deepEqual(result, { ok: false, code: 'GAME_ALREADY_ENDED' }, name)
        assert.deepEqual(gameSession.__getStateSnapshotForTests(), beforeSnapshot, `${name}: registry 상태가 변경됨`)
        assert.equal(session.phase, 'ENDED', `${name}: phase가 변경됨`)
        assert.equal(session.winResult, canonicalWinResult, `${name}: winResult 참조가 교체됨`)
        assert.deepEqual(
            [...session.players.values()].map((p) => [p.uuid, p.alive]),
            aliveSnapshotBefore,
            `${name}: 생존 상태가 변경됨`,
        )
    }
})

// ---------------------------------------------------------------------------
// getSessionSnapshotForPlayer / buildSessionSnapshot — get_session_snapshot 재접속 스냅샷
// ---------------------------------------------------------------------------

const { getSessionSnapshotForPlayer, buildSessionSnapshot } = gameSession

/** JOKER 1명 + CITIZEN 3명(jokerCount=1) 4인 세션을 커밋한다(NIGHT/DAY/TRIBUNAL 진행은 호출자
 * 책임). randomFn:()=>0 고정 셔플에서 JOKER는 uuids[1]로 배정된다(nightSessionOf4NoWin과
 * 동일한 관례 — 어떤 첫 밤 희생자를 죽여도 승리 조건이 성립하지 않도록(생존 JOKER 1명 < 생존
 * CITIZEN 2명) 4인·jokerCount=1을 쓴다). */
function buildSnapQuadSession({ id, uuids }) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    return candidate.session
}

/** ackAllAndRewindToFirstNight(위)의 스냅샷 섹션 전용 별칭 — 전원 확인 후 첫 밤 픽스처로 되돌린다. */
function ackAll(session) {
    ackAllAndRewindToFirstNight(session)
}

/** JOKER 전용 밤 행동(target 없으면 SKIP)을 제출하고 판정을 커밋한다 — jokerCount=1 세션
 * 전용(다른 역할은 이 스냅샷 시나리오들에 없다). */
function resolveJokerOnlyNight(session, jokerUuid, targetUuid) {
    submitNightAction(jokerUuid, session.id, targetUuid)
    const prepared = prepareNightResolution(jokerUuid, session.id)
    return commitNightResolution(prepared.session, prepared.resolution)
}

/** votesByUuid(uuid→targetUuid|null) 전원 제출 후 DAY 투표 판정을 커밋한다. */
function resolveDayVotes(session, votesByUuid) {
    for (const [voterUuid, targetUuid] of Object.entries(votesByUuid)) {
        submitDayVote(voterUuid, session.id, targetUuid)
    }
    const [anyVoter] = Object.keys(votesByUuid)
    const prepared = prepareDayVoteResolution(anyVoter, session.id, session.dayIndex)
    return commitDayVoteResolution(prepared.session, prepared.resolution)
}

/** votesByUuid(uuid→'GUILTY'|'NOT_GUILTY') 전원 제출 후 TRIBUNAL 판정을 커밋한다. */
function resolveTribunalVotes(session, votesByUuid) {
    for (const [voterUuid, vote] of Object.entries(votesByUuid)) {
        submitTribunalVote(voterUuid, session.id, session.dayIndex, vote)
    }
    const [anyVoter] = Object.keys(votesByUuid)
    const prepared = prepareTribunalVoteResolution(anyVoter, session.id, session.dayIndex)
    return commitTribunalVoteResolution(prepared.session, prepared.resolution)
}

// -- 경로 인식(path-aware) 재귀 비밀 데이터 검사기 ---------------------------
// 키 이름만으로 전역 예외 처리하지 않는다(Codex P1 지적) — otherPlayerResult:{uuid:secretTarget}
// 같은 변칙적 위치의 leak도 잡아내야 하므로, "이 정확한 경로는 공개 집계값과 겹쳐도 안전하다"고
// 명시적으로 승인된 스키마 경로에서만 값 비교를 건너뛴다. self 서브트리는 위치 자체로 예외다
// (본인의 role/team/uuid는 다른 참가자의 role/team/target과 우연히 같을 수 있다).

const FORBIDDEN_PRIVATE_KEYS = new Set([
    'role', 'team', 'allies',
    'votes', 'nightActions', 'dayVotes', 'roleRevealAcks',
    'nightTargetUuid', 'dayVoteTargetUuid', 'tribunalVoteUuid', 'tribunalVote',
])

// winResult.winner는 buildSessionSnapshot/buildTerminalFields가 항상 의도적으로 공개하는
// 승패 결과다 — role/team 값('JOKER'/'CITIZEN')과 문자열이 겹칠 수 있으므로 명시적으로
// 승인한다.
// nightResult.deathReveals.*.source도 같은 이유로 명시 승인한다 — 공개 사망 출처 열거값
// ('JOKER'/'WITCH_HUNTER'/'UNKNOWN_NIGHT')은 "어느 진영/사건이 이 죽음을 만들었는가"만 뜻하고
// 특정 참가자의 role 배정을 뜻하지 않는데, 문자열로는 다른 참가자의 role 값과 겹칠 수 있다.
// victimUuid는 이미 공개된 사망자 식별자다(players.*.uuid / nightResult.victimUuid와 동일).
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
// 같은 이유로 키 이름이 아니라 위치 자체를 예외로 둔다. 키 이름 전역 예외(FORBIDDEN_PRIVATE_KEYS
// 에서 role/team을 빼는 것)와 다르다: 이 경로 밖의 role/team은 여전히 즉시 실패한다.
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

/** viewer를 제외한 나머지 참가자의 role을 secret으로 모은다. */
function collectOtherPlayerRoleSecrets(session, viewerUuid) {
    const secrets = []
    for (const player of session.players.values()) {
        if (player.uuid === viewerUuid) continue
        secrets.push({ value: player.role, label: `role(${player.uuid})=${player.role}` })
    }
    return secrets
}

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
    assert.deepEqual(Object.keys(jokerResult.snapshot.self).sort(), ['allies', 'hasActedThisPhase', 'nickname', 'role', 'team', 'uuid'])
    assert.deepEqual(jokerResult.snapshot.self.allies, [otherJoker])
    assertNoForbiddenPrivateData(jokerResult.snapshot, collectOtherPlayerRoleSecrets(session, viewerJoker))

    const citizenResult = getSessionSnapshotForPlayer(citizenUuid, session.id)
    assert.equal(citizenResult.ok, true)
    assert.deepEqual(Object.keys(citizenResult.snapshot.self).sort(), ['hasActedThisPhase', 'nickname', 'role', 'team', 'uuid'])
    assert.equal(Object.hasOwn(citizenResult.snapshot.self, 'allies'), false)
    assertNoForbiddenPrivateData(citizenResult.snapshot, collectOtherPlayerRoleSecrets(session, citizenUuid))
})

test('getSessionSnapshotForPlayer: 5개 역할 전원(NIGHT) — 공개 roster/자기 self 어디에도 타인의 role/team/투표·행동 대상이 없다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid } = commitFullRoleSessionAtNight({ id: 'room-snap-fullrole' })

    for (const viewerUuid of [jokerUuid, doctorUuid, guardUuid]) {
        const result = getSessionSnapshotForPlayer(viewerUuid, session.id)
        assert.equal(result.ok, true)
        for (const player of result.snapshot.players) {
            assert.deepEqual(Object.keys(player).sort(), ['colorIndex', 'isAlive', 'nickname', 'uuid'])
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
    first.snapshot.winResult.reveals[0].role = 'TAMPERED_ROLE'
    first.snapshot.winResult.reveals.push({ uuid: 'forged-uuid', nickname: 'forged', role: 'JOKER', team: 'JOKER', alive: true })
    first.snapshot.nightResult.victimUuid = 'tampered-victim'
    first.snapshot.players.push({ uuid: 'forged-uuid', nickname: 'forged', isAlive: true })

    // canonical session은 전혀 바뀌지 않았다.
    assert.equal(session.players.get(jokerUuid).alive, false)
    assert.equal(session.players.get(jokerUuid).nickname.startsWith('nick-'), true)
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.deepEqual(Object.keys(session.winResult), ['winner']) // reveals/mvp는 복사본에만 붙는다
    assert.equal(session.players.has('forged-uuid'), false)
    assert.notEqual([...session.players.values()][0].role, 'TAMPERED_ROLE')

    // 재요청은 오염되지 않은 fresh 데이터를 돌려준다.
    const second = getSessionSnapshotForPlayer(viewerUuid, session.id)
    assert.equal(second.ok, true)
    assert.equal(second.snapshot.players.find((p) => p.uuid === jokerUuid).isAlive, false)
    assert.equal(second.snapshot.self.role, session.players.get(viewerUuid).role)
    assert.equal(second.snapshot.winResult.winner, 'CITIZEN')
    assert.equal(second.snapshot.winResult.mvp, null)
    assert.deepEqual(second.snapshot.winResult.reveals, expectedRevealsOf(session))
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
        outcome: 'TRIBUNAL', tribunalTargetUuid: 'snA2', publicVoteCount: 4, publicAbstainCount: 0,
    })
    assert.deepEqual(snapshot.tribunal, {
        defendantUuid: 'snA2', resolved: true, outcome: 'GUILTY', counts: { guilty: 2, notGuilty: 1 }, executedUuid: 'snA2',
    })
    // ENDED이므로 winResult에는 winner 외에 전원 공개 목록(reveals)과 예약된 mvp 슬롯이 함께 온다.
    assert.equal(snapshot.winResult.winner, 'CITIZEN')
    assert.equal(snapshot.winResult.mvp, null)
    assert.deepEqual(Object.keys(snapshot.winResult).sort(), ['mvp', 'reveals', 'winner'])
    assert.deepEqual(snapshot.winResult.reveals, expectedRevealsOf(session))
    assert.equal(snapshot.winResult.reveals.find((r) => r.uuid === 'snA2').role, 'JOKER')

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
    assert.deepEqual(Object.keys(daySnapshot.snapshot).sort(), ['dayIndex', 'gameId', 'nightResult', 'phase', 'players', 'self'])
    assert.equal(daySnapshot.snapshot.phase, 'DAY')
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
            colorIndex: session.players.get('snB3').colorIndex,
            isAlive: false,
        },
    )

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
        outcome: 'TRIBUNAL', tribunalTargetUuid: 'snB1', publicVoteCount: 3, publicAbstainCount: 0,
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
    assert.equal(endedSnapshot.snapshot.winResult.winner, 'JOKER')
    assert.equal(endedSnapshot.snapshot.winResult.mvp, null)
    assert.deepEqual(endedSnapshot.snapshot.winResult.reveals, expectedRevealsOf(session))
    assert.equal(Object.hasOwn(endedSnapshot.snapshot, 'dayVoteResolution'), false)
    assert.equal(Object.hasOwn(endedSnapshot.snapshot, 'tribunal'), false)

    assertNoForbiddenPrivateData(endedSnapshot.snapshot, collectOtherPlayerRoleSecrets(session, 'snB1'))

    // buildSessionSnapshot을 직접 호출해도(getSessionSnapshotForPlayer를 거치지 않고) 동일한
    // 구조를 반환한다 — get_session_snapshot 계약이 이 순수 함수 하나로 완결됨을 확인한다.
    assert.deepEqual(buildSessionSnapshot(session, 'snB1'), endedSnapshot.snapshot)
})

test('buildSessionSnapshot: 진행 중 세션에는 winResult가 아예 없고, ENDED 하이드레이션에는 viewer와 무관하게 동일한 전원 reveals가 실린다', () => {
    const session = nightSessionOf3({ id: 'room-snap-reveals' })
    const uuids = [...session.players.keys()]

    // 진행 중(NIGHT)에는 winResult 키 자체가 없으므로 reveals가 생길 자리도 없다.
    for (const uuid of uuids) {
        assert.equal(Object.hasOwn(buildSessionSnapshot(session, uuid), 'winResult'), false)
    }

    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: jokerUuid, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)
    assert.equal(session.phase, 'ENDED')

    const expectedReveals = expectedRevealsOf(session)
    for (const uuid of uuids) {
        const snapshot = buildSessionSnapshot(session, uuid)
        assert.equal(snapshot.winResult.winner, 'CITIZEN')
        assert.equal(snapshot.winResult.mvp, null)
        // 공개 목록은 보는 사람에 따라 달라지지 않는다 — 전원이 같은 결과 화면을 본다.
        assert.deepEqual(snapshot.winResult.reveals, expectedReveals)
        // reveals 밖의 어떤 위치에서도 다른 참가자의 role이 새지 않는다(경로 예외는 이 서브트리뿐).
        assertNoForbiddenPrivateData(snapshot, collectOtherPlayerRoleSecrets(session, uuid))
    }

    // 종료 방송(buildTerminalFields)과 재접속 하이드레이션이 같은 공개 목록을 싣는다.
    assert.deepEqual(buildSessionSnapshot(session, uuids[0]).winResult.reveals, buildTerminalFields(session).winResult.reveals)
})

// ---------------------------------------------------------------------------
// colorIndex — 공개 payload 3종(game_started · 재접속 스냅샷 · ENDED reveals)
// ---------------------------------------------------------------------------

/** uuid→colorIndex canonical 맵(payload가 session의 값을 그대로 실었는지 대조하는 기준). */
function canonicalColorsOf(session) {
    return new Map([...session.players.values()].map((p) => [p.uuid, p.colorIndex]))
}

test('buildGameStartedPayload: players 전원에 canonical colorIndex가 실리고 viewer가 누구든 같은 목록이다', () => {
    const room = makeRoom({
        id: 'room-color-started',
        players: Array.from({ length: 5 }, (_, i) => makePlayer(`gs${i}`)),
        jokerCount: 1,
    })
    const { session } = buildSessionCandidate(room)
    const canonical = canonicalColorsOf(session)

    const first = buildGameStartedPayload(session, 'gs0')
    for (const player of first.state.players) {
        assert.equal(Object.hasOwn(player, 'colorIndex'), true)
        assert.equal(player.colorIndex, canonical.get(player.uuid))
        // 색은 공개 정보지만 타인의 role/team은 여전히 없다.
        assert.equal(Object.hasOwn(player, 'role'), false)
        assert.equal(Object.hasOwn(player, 'team'), false)
    }

    // 창마다 같은 참가자가 다른 색으로 보이던 문제의 회귀 가드 — viewer와 무관하게 동일하다.
    for (const uuid of [...session.players.keys()]) {
        assert.deepEqual(buildGameStartedPayload(session, uuid).state.players, first.state.players)
    }
})

test('getSessionSnapshotForPlayer: 재접속 스냅샷의 players 전원에 canonical colorIndex가 실리고 비밀 검사기를 통과한다', () => {
    const uuids = ['cs1', 'cs2', 'cs3', 'cs4']
    const session = buildSnapQuadSession({ id: 'room-color-snapshot', uuids })
    ackAll(session)
    const canonical = canonicalColorsOf(session)

    for (const viewerUuid of uuids) {
        const result = getSessionSnapshotForPlayer(viewerUuid, session.id)
        assert.equal(result.ok, true)
        for (const player of result.snapshot.players) {
            assert.equal(player.colorIndex, canonical.get(player.uuid))
        }
        // colorIndex는 전원 공개 정보라 기존 비밀 검사기의 판정 대상이 아니다.
        assertNoForbiddenPrivateData(result.snapshot, collectOtherPlayerRoleSecrets(session, viewerUuid))
    }
})

test('ENDED: 방송(buildTerminalFields)과 재접속(buildSessionSnapshot)의 winResult.reveals가 둘 다 전원 colorIndex를 담고 서로 일치한다', () => {
    const session = nightSessionOf3({ id: 'room-color-reveals' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const resolution = { gameId: session.id, dayIndex: 0, pendingEliminationTargetId: jokerUuid, privateResults: new Map(), resolved: true }
    commitNightResolution(session, resolution)
    assert.equal(session.phase, 'ENDED')

    const canonical = canonicalColorsOf(session)
    const broadcastReveals = buildTerminalFields(session).winResult.reveals
    const hydrationReveals = buildSessionSnapshot(session, [...session.players.keys()][0]).winResult.reveals

    for (const reveals of [broadcastReveals, hydrationReveals]) {
        assert.equal(reveals.length, session.players.size)
        for (const reveal of reveals) {
            assert.equal(reveal.colorIndex, canonical.get(reveal.uuid))
        }
    }
    assert.deepEqual(broadcastReveals, hydrationReveals)
})

// ---------------------------------------------------------------------------
// 다중 사이클 회귀: NIGHT→DAY→TRIBUNAL→NIGHT이 반복돼도 dayIndex가 정확히 한 번씩만
// 증가하고, 매 NIGHT이 신선한 nightActions/nightResolution으로 fresh submission을 받는다.
// ---------------------------------------------------------------------------

test('다중 사이클 회귀: 승리 없는 NIGHT→DAY→TRIBUNAL(무죄) 사이클이 3번 반복돼도 dayIndex가 매번 정확히 1씩만 증가하고 각 NIGHT은 신선한 행동을 받는다', () => {
    const uuids = ['lc1', 'lc2', 'lc3', 'lc4']
    const session = buildSnapQuadSession({ id: 'lifecycle-room', uuids })
    // buildSnapQuadSession의 randomFn:()=>0 고정 셔플 관례상 JOKER는 uuids[1](lc2)로 배정된다.
    const jokerUuid = 'lc2'
    const defendantUuid = 'lc3'
    ackAll(session)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 0)

    for (let cycle = 1; cycle <= 3; cycle += 1) {
        const dayIndexBeforeNight = session.dayIndex
        assert.equal(session.nightActions.size, 0, `cycle ${cycle}: NIGHT 진입 시 nightActions는 비어있어야 함`)
        assert.equal(session.nightResolution, null, `cycle ${cycle}: NIGHT 진입 시 nightResolution은 null이어야 함`)

        // JOKER는 매번 SKIP만 제출한다 — 아무도 죽지 않아(생존 JOKER 1명 < 생존 비-JOKER 3명)
        // 승리 조건이 절대 성립하지 않고, 3번째 사이클까지 단조 증가만 검증할 수 있다.
        const nightOutcome = resolveJokerOnlyNight(session, jokerUuid, null)
        assert.deepEqual(nightOutcome, { ok: true, victimUuid: null, terminal: null })
        assert.equal(session.phase, 'DAY')
        assert.equal(
            session.dayIndex,
            dayIndexBeforeNight + 1,
            `cycle ${cycle}: NIGHT→DAY 전이는 dayIndex를 정확히 1만 증가시켜야 함(중복/누락 증가 없음)`,
        )

        const dayIndex = session.dayIndex
        const dayOutcome = resolveDayVotes(session, {
            lc1: defendantUuid,
            lc2: defendantUuid,
            [defendantUuid]: null,
            lc4: defendantUuid,
        })
        assert.deepEqual(dayOutcome, { ok: true })
        assert.equal(session.phase, 'TRIBUNAL')
        assert.equal(session.dayIndex, dayIndex, `cycle ${cycle}: DAY→TRIBUNAL 전이는 dayIndex를 바꾸지 않아야 함`)
        assert.equal(session.tribunal.defendantUuid, defendantUuid)

        const tribunalOutcome = resolveTribunalVotes(session, { lc1: 'NOT_GUILTY', lc2: 'NOT_GUILTY', lc4: 'NOT_GUILTY' })
        assert.deepEqual(tribunalOutcome, { ok: true, terminal: null })
        assert.equal(session.phase, 'NIGHT')
        assert.equal(session.dayIndex, dayIndex, `cycle ${cycle}: TRIBUNAL→NIGHT 전이는 dayIndex를 바꾸지 않아야 함`)
        assert.equal(session.nightActions.size, 0, `cycle ${cycle}: TRIBUNAL→NIGHT 전이가 nightActions를 새로 되돌려야 함(fresh submission 계약)`)
        assert.equal(session.nightResolution, null, `cycle ${cycle}: TRIBUNAL→NIGHT 전이가 nightResolution을 null로 되돌려야 함`)
        assert.equal(session.players.get(defendantUuid).alive, true)
    }

    // 3사이클 후: NIGHT1→DAY1, NIGHT2→DAY2, NIGHT3→DAY3 — dayIndex는 0에서 시작해 정확히 3이다.
    assert.equal(session.dayIndex, 3)
    assert.equal(session.phase, 'NIGHT')
    for (const uuid of uuids) assert.equal(session.players.get(uuid).alive, true)

    // 세 번째 사이클 이후에도 새 밤 행동이 실제로 받아들여진다 — 과거 사이클의 exact-once
    // 잠금(NIGHT_ALREADY_RESOLVED 등)이 이후 사이클까지 계속 막지 않는다는 회귀 확인이다.
    const freshSubmit = submitNightAction(jokerUuid, session.id, defendantUuid)
    assert.deepEqual(freshSubmit, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(jokerUuid), defendantUuid)
})

// ---------------------------------------------------------------------------
// CUSTOM 역할 구성(roleCompositionMode: 'custom')
// ---------------------------------------------------------------------------

/** roleCompositionMode: 'custom' settings를 가진 room을 만든다(makeRoom의 CUSTOM 버전). */
function makeCustomRoom({ id = 'custom-room', players, roleCounts, maxPlayers = 10 } = {}) {
    const playerList = players ?? ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid))
    const counts = { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, ...roleCounts }
    return {
        id,
        players: new Map(playerList.map((p) => [p.uuid, p])),
        settings: {
            maxPlayers,
            // CUSTOM에서도 기존 소비자를 위해 jokerCount를 유지하되 roleCounts.JOKER와 항상 같다.
            jokerCount: counts.JOKER,
            roleCompositionMode: 'custom',
            roleCounts: counts,
        },
    }
}

function countRoles(session) {
    const counts = { JOKER: 0, CITIZEN: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
    for (const player of session.players.values()) counts[player.role] += 1
    return counts
}

test('CUSTOM: 지정한 고정 역할 수가 정확히 그대로 배정되고 나머지 인원이 CITIZEN이 된다', () => {
    // 7명 · JOKER 2 · DOCTOR 1 · GUARD 1 · WITCH_HUNTER 1 → CITIZEN 2명
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = buildSessionCandidate(room)

    assert.equal(prepared.ok, true)
    assert.deepEqual(countRoles(prepared.session), { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 2 })
    // AUTO(computeRoleComposition)였다면 7명·JOKER 2에서 WITCH_HUNTER는 0명이었을 것이다 —
    // 즉 이 구성은 자동 계산으로는 나올 수 없는 CUSTOM 전용 결과다.
    assert.equal(computeRoleComposition(7, 2).WITCH_HUNTER, 0)
    assert.equal(prepared.session.players.size, 7)
})

test('CUSTOM: 고정 역할 합이 정확히 인원과 같으면 CITIZEN은 0명이 된다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = buildSessionCandidate(room)

    assert.equal(prepared.ok, true)
    assert.deepEqual(countRoles(prepared.session), { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 0 })
})

test('CUSTOM: session.jokerCount와 resolvedComposition.JOKER는 같은 값에서 파생된다', () => {
    const room = makeCustomRoom({ roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 } })
    const prepared = buildSessionCandidate(room)

    assert.equal(prepared.session.jokerCount, 2)
    assert.equal(prepared.session.roleComposition.JOKER, prepared.session.jokerCount)
    assert.deepEqual(prepared.session.roleComposition, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 2 })
    // 세션이 들고 있는 구성은 방어적 복사본이다 — settings.roleCounts를 나중에 바꿔도 안 바뀐다.
    room.settings.roleCounts.JOKER = 9
    assert.equal(prepared.session.roleComposition.JOKER, 2)
})

test('CUSTOM: 고정 역할 합이 실제 참가 인원을 넘으면 준비 단계에서 거부되고 registry는 그대로다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, // 합계 4 > 3명
    })
    const prepared = prepareGameSession(room)

    assert.equal(prepared.ok, false)
    assert.equal(prepared.code, 'INVALID_SESSION_INPUT')
    assert.match(prepared.reason, /INVALID_ROLE_COMPOSITION/)
    const snapshot = gameSession.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.length, 0)
    assert.equal(snapshot.playerSession.length, 0)
    assert.equal(snapshot.roomGameSession.length, 0)
})

test('CUSTOM: JOKER 수가 실제 참가 인원 이상이면 준비 단계에서 거부된다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 3, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 },
    })
    const prepared = prepareGameSession(room)

    assert.equal(prepared.ok, false)
    // jokerCount >= players.length는 validateSessionInput이 먼저 잡는다(둘 다 거부이며,
    // 어느 쪽이든 registry를 건드리지 않는다는 계약은 동일하다).
    assert.equal(prepared.code, 'INVALID_SESSION_INPUT')
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
})

test('CUSTOM: 저장된 jokerCount와 roleCounts.JOKER가 어긋난 방은 시작할 수 없다', () => {
    const room = makeCustomRoom({ roleCounts: { JOKER: 2, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } })
    room.settings.jokerCount = 1 // 두 값이 갈린 상태(정상 경로로는 만들어질 수 없다)

    const prepared = prepareGameSession(room)
    assert.equal(prepared.ok, false)
    assert.match(prepared.reason, /JOKER_COUNT_MISMATCH/)
})

test('CUSTOM: 결정적 randomFn을 주면 배정 결과가 완전히 재현된다', () => {
    const players = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((uuid) => makePlayer(uuid))
    const roleCounts = { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 }
    const build = () =>
        buildSessionCandidate(makeCustomRoom({ players, roleCounts }), {
            randomFn: sequenceRandom([0.1, 0.9, 0.3, 0.7, 0.5]),
            gameIdFn: () => 'fixed-game-id',
        })

    const first = build()
    const second = build()

    const roleOf = (candidate) => [...candidate.session.players.values()].map((p) => `${p.uuid}:${p.role}`)
    assert.deepEqual(roleOf(first), roleOf(second))
    assert.deepEqual(countRoles(first.session), { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, CITIZEN: 2 })
})

test('CUSTOM: 원본 players/settings 객체를 변형하지 않는다', () => {
    const players = ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid))
    const room = makeCustomRoom({ players, roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } })
    const settingsBefore = JSON.parse(JSON.stringify(room.settings))

    const prepared = buildSessionCandidate(room)

    assert.equal(prepared.ok, true)
    assert.deepEqual(room.settings, settingsBefore)
    for (const player of players) {
        assert.equal(Object.hasOwn(player, 'role'), false)
        assert.equal(Object.hasOwn(player, 'alive'), false)
    }
    // room.players의 원소도 그대로다(세션은 복사본을 들고 있다).
    for (const player of room.players.values()) {
        assert.equal(Object.hasOwn(player, 'role'), false)
    }
})

test('CUSTOM: commit 검증은 조작된 역할 분포를 거부한다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = buildSessionCandidate(room)
    // 실제 배정을 몰래 바꾼다 — DOCTOR였던 참가자를 CITIZEN으로.
    const doctor = [...prepared.session.players.values()].find((p) => p.role === 'DOCTOR')
    doctor.role = 'CITIZEN'

    assert.throws(() => commitGameSession(prepared.session), /실제 DOCTOR 수/)
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
})

test('CUSTOM: commit 검증은 역할 교체로 어긋난 두 역할을 모두 메시지에 적는다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = buildSessionCandidate(room)
    const doctor = [...prepared.session.players.values()].find((p) => p.role === 'DOCTOR')
    doctor.role = 'CITIZEN'

    // 어긋난 역할을 하나만 보고하면 GAME_ROLES 키 순서상 앞선 CITIZEN만 나오고 조작된
    // DOCTOR는 메시지에서 사라진다 — 진단이 키 순서에 좌우되지 않아야 한다.
    assert.throws(() => commitGameSession(prepared.session), (error) => {
        assert.match(error.message, /실제 DOCTOR 수\(0\)가 기대값\(1\)과 불일치/)
        assert.match(error.message, /실제 CITIZEN 수\(2\)가 기대값\(1\)과 불일치/)
        return true
    })
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
})

test('CUSTOM: commit 검증은 조작된 session.roleComposition을 거부한다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })

    // 1) 합계가 인원과 맞지 않는 구성
    const totalMismatch = buildSessionCandidate(room)
    totalMismatch.session.roleComposition = { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 5 }
    assert.throws(() => commitGameSession(totalMismatch.session), /session\.roleComposition\(TOTAL_MISMATCH\)/)

    // 2) session.jokerCount와 구성의 JOKER가 갈린 경우
    const jokerMismatch = buildSessionCandidate(room)
    jokerMismatch.session.roleComposition = { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 0 }
    assert.throws(() => commitGameSession(jokerMismatch.session), /session\.roleComposition\(JOKER_COUNT_MISMATCH\)/)

    // 3) CITIZEN 키가 빠진 불완전한 구성
    const missingKey = buildSessionCandidate(room)
    missingKey.session.roleComposition = { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }
    assert.throws(() => commitGameSession(missingKey.session), /session\.roleComposition\(UNEXPECTED_KEYS\)/)

    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 0)
})

test('CUSTOM: 커밋된 세션의 공개 payload에는 역할 구성이 노출되지 않는다', () => {
    const room = makeCustomRoom({
        players: ['c1', 'c2', 'c3', 'c4', 'c5'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const prepared = prepareGameSession(room)
    commitGameSession(prepared.session)

    const payload = buildGameStartedPayload(prepared.session, 'c1')
    const serialized = JSON.stringify(payload)
    assert.equal(serialized.includes('roleComposition'), false)
    assert.equal(serialized.includes('roleCounts'), false)
    assert.equal(Object.hasOwn(payload.state, 'roleComposition'), false)
    // 다른 참가자 목록에는 여전히 role/team이 없다(colorIndex는 전원 공개 정보라 예외다).
    for (const player of payload.state.players) {
        assert.deepEqual(Object.keys(player).sort(), ['colorIndex', 'nickname', 'uuid'])
    }
})

test('AUTO: roleComposition이 없는(수동 조립) 세션은 기존 computeRoleComposition 계약으로 검증된다', () => {
    const room = makeRoom({ players: ['a1', 'a2', 'a3', 'a4'].map((uuid) => makePlayer(uuid)), jokerCount: 1 })
    const prepared = buildSessionCandidate(room)
    delete prepared.session.roleComposition // 구버전 세션 재현

    commitGameSession(prepared.session) // 기존 AUTO 계약 그대로 통과한다
    assert.equal(gameSession.__getStateSnapshotForTests().gameSessions.length, 1)
})

// ---------------------------------------------------------------------------
// 공개 DAY 채팅 / 사망자 전용 채팅 — prepareGameChatMessage · commitGameChatMessage ·
// getChatRecipientUuids (실제 export를 직접 구동한다. mock·stub 없이 canonical registry를
// 그대로 쓰고, 검증도 canonical session 상태로만 한다.)
// ---------------------------------------------------------------------------

/**
 * 4인 세션(JOKER 1)을 커밋하고 원하는 phase로 맞춘다. jokerCount 1 + randomFn ()=>0이면
 * 배정이 결정적이라 JOKER/비-JOKER를 안정적으로 골라낼 수 있다.
 */
function setupGameChatSession({ id = 'room-gc', phase = 'DAY', uuids = ['gc1', 'gc2', 'gc3', 'gc4'], gameIdFn } = {}) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount: 1 })
    const opts = { randomFn: () => 0, ...(gameIdFn ? { gameIdFn } : {}) }
    const candidate = buildSessionCandidate(room, opts)
    commitGameSession(candidate.session)
    const session = candidate.session
    session.phase = phase
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const citizenUuids = [...session.players.values()].filter((p) => p.role !== 'JOKER').map((p) => p.uuid)
    return { session, jokerUuid, citizenUuids }
}

/** 두 채널 rate limit Map의 현재 내용을 비교 가능한 평범한 값으로 떠낸다(원자성 검증용). */
function chatRateLimitSnapshot(session) {
    return {
        DAY: [...session.dayChatRateLimit.entries()],
        DEAD: [...session.deadChatRateLimit.entries()],
        JOKER: [...session.jokerChatRateLimit.entries()],
    }
}

/**
 * prepare가 돌려준 능력(capability)을 그대로 commit한다 — "prepare 직후 곧바로 commit한" 정상
 * 경로다. commit은 자신의 canonical 시계로 sentAt을 검증하므로(미래 금지·최대 age·간격 재검사),
 * 고정 시계로 prepare한 테스트는 같은 시계를 넘겨야 production과 동일한 조건이 된다.
 */
function commitPrepared(prepared, options = {}) {
    // now를 명시적으로 넘긴 경우 그 값이 undefined여도 그대로 시계가 돌려주는 값이어야 한다 —
    // 기본값 문법으로 받으면 { now: undefined }가 조용히 정상 시계로 바뀌어, "시계가 undefined를
    // 돌려주는" 이상값 경로를 검증하지 못한다.
    const now = Object.hasOwn(options, 'now') ? options.now : prepared.sentAt
    return commitGameChatMessage(prepared, { now: () => now })
}

/**
 * 발급된 이후의 prepared 번들을 호출자가 손댄 상황을 그대로 재현한다 — 노출된 최상위 필드와
 * 공개 메시지 필드를 각각 바꿔치기한다. commit이 실제로 쓰는 값은 모듈 사설 능력 기록이므로,
 * 여기서 무엇을 어떻게 바꾸든 반영돼서는 안 된다.
 */
function tamperPrepared(prepared, patch = {}) {
    const { message, ...top } = patch
    Object.assign(prepared, top)
    if (Object.hasOwn(patch, 'message')) {
        // message 자리에 객체가 아닌 값을 심는 변조(null 등)도 그대로 재현한다.
        if (message === null || typeof message !== 'object') prepared.message = message
        else Object.assign(prepared.message, message)
    }
    return prepared
}

/** prepare를 거치지 않고 손으로 조립한, 모양만 같은 가짜 prepared 번들. */
function handBuiltPrepared({ session, channel, actorUuid, nickname, text, sentAt, dayIndex, messageId = 'forged-id' }) {
    return {
        ok: true,
        session,
        channel,
        actorUuid,
        nickname,
        sanitizedText: text,
        sentAt,
        dayIndex,
        message: { gameId: session.id, messageId, senderUuid: actorUuid, nickname, text, sentAt, dayIndex },
    }
}

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

test('prepareGameChatMessage: 사망자 + NIGHT/DAY/TRIBUNAL → 전부 DEAD 채널이고 Map은 불변이다', () => {
    for (const phase of ['NIGHT', 'DAY', 'TRIBUNAL']) {
        gameSession.__resetStateForTests()
        const { session, citizenUuids } = setupGameChatSession({ id: `room-gc-dead-${phase}`, phase })
        const [actor] = citizenUuids
        session.players.get(actor).alive = false
        const before = chatRateLimitSnapshot(session)

        const result = prepareGameChatMessage(actor, session.id, '사망자 대화', { now: () => 1000 })

        assert.equal(result.ok, true)
        assert.equal(result.channel, CHAT_CHANNELS.DEAD)
        assert.deepEqual(chatRateLimitSnapshot(session), before)
    }
})

test('prepareGameChatMessage: 사망자의 ROLE_REVEAL은 INVALID_PHASE, ENDED는 GAME_ALREADY_ENDED다', () => {
    gameSession.__resetStateForTests()
    const reveal = setupGameChatSession({ id: 'room-gc-dead-reveal', phase: 'ROLE_REVEAL' })
    const revealActor = reveal.citizenUuids[0]
    reveal.session.players.get(revealActor).alive = false
    assert.deepEqual(prepareGameChatMessage(revealActor, reveal.session.id, '안녕', { now: () => 1000 }), {
        ok: false,
        code: 'INVALID_PHASE',
    })
    assert.deepEqual(chatRateLimitSnapshot(reveal.session).DEAD, [])

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

    // 생존한 발신자는 어떤 시도로도 DEAD 채널을 얻지 못한다 — 죽은 사람만 DEAD다.
    const alive = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    assert.equal(alive.channel, CHAT_CHANNELS.DAY)

    session.players.get(victim).alive = false
    const dead = prepareGameChatMessage(victim, session.id, '안녕', { now: () => 1000 })
    assert.equal(dead.channel, CHAT_CHANNELS.DEAD)
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

test('DAY와 DEAD의 rate limit은 완전히 분리돼 한쪽 전송이 다른 쪽 간격 판정에 영향을 주지 않는다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-rl', phase: 'DAY' })
    const [alive, dead] = citizenUuids
    session.players.get(dead).alive = false

    const aliveFirst = prepareGameChatMessage(alive, session.id, '낮 1', { now: () => 1000 })
    assert.equal(commitPrepared(aliveFirst).ok, true)
    const deadFirst = prepareGameChatMessage(dead, session.id, '사망 1', { now: () => 1000 })
    assert.equal(commitPrepared(deadFirst).ok, true)

    // 각 채널의 Map에만 자기 발신자가 기록된다.
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[alive, 1000]])
    assert.deepEqual([...session.deadChatRateLimit.entries()], [[dead, 1000]])
    assert.equal(session.jokerChatRateLimit.size, 0)

    // 같은 채널 안에서만 간격 제한이 걸린다.
    assert.deepEqual(prepareGameChatMessage(alive, session.id, '낮 2', { now: () => 1100 }), {
        ok: false,
        code: 'RATE_LIMITED',
    })
    assert.deepEqual(prepareGameChatMessage(dead, session.id, '사망 2', { now: () => 1100 }), {
        ok: false,
        code: 'RATE_LIMITED',
    })
    // 간격을 넘기면 다시 통과한다.
    assert.equal(prepareGameChatMessage(alive, session.id, '낮 3', { now: () => 1600 }).ok, true)
})

test('같은 사람이 DAY에서 보낸 직후 사망해도 DEAD 채널의 첫 전송은 간격 제한에 걸리지 않는다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-rl-cross', phase: 'DAY' })
    const [actor] = citizenUuids

    const dayPrepared = prepareGameChatMessage(actor, session.id, '낮', { now: () => 1000 })
    assert.equal(commitPrepared(dayPrepared).ok, true)

    session.players.get(actor).alive = false
    const deadPrepared = prepareGameChatMessage(actor, session.id, '사망 직후', { now: () => 1100 })

    assert.equal(deadPrepared.ok, true, 'DAY의 기록이 DEAD 간격 판정에 영향을 주면 안 된다')
    assert.equal(deadPrepared.channel, CHAT_CHANNELS.DEAD)
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

test('commitGameChatMessage: prepare 이후 사망이 확정되면 DAY로는 커밋되지 않는다(STALE_CHAT_CHANNEL)', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-alive', phase: 'DAY' })
    const [actor] = citizenUuids
    const prepared = prepareGameChatMessage(actor, session.id, '안녕', { now: () => 1000 })
    assert.equal(prepared.channel, CHAT_CHANNELS.DAY)
    const before = chatRateLimitSnapshot(session)

    session.players.get(actor).alive = false // prepare~commit 사이의 사망

    assert.deepEqual(commitPrepared(prepared), {
        ok: false,
        code: 'STALE_CHAT_CHANNEL',
    })
    assert.deepEqual(chatRateLimitSnapshot(session), before, 'DEAD Map으로 새어 들어가지도 않는다')
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

test('commitGameChatMessage: 두 채널의 능력은 서로 통용되지 않고 각자의 Map만 갱신한다', () => {
    const { session, citizenUuids } = setupGameChatSession({ id: 'room-gc-commit-channel-cross', phase: 'DAY' })
    const [alive, dead] = citizenUuids
    session.players.get(dead).alive = false

    const alivePrepared = prepareGameChatMessage(alive, session.id, '낮', { now: () => 1000 })
    const deadPrepared = prepareGameChatMessage(dead, session.id, '사망자', { now: () => 1000 })
    assert.equal(alivePrepared.channel, CHAT_CHANNELS.DAY)
    assert.equal(deadPrepared.channel, CHAT_CHANNELS.DEAD)

    // 각 능력은 자기 채널의 Map에만 자기 발신자를 기록한다(채널 격리).
    assert.equal(commitPrepared(alivePrepared).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[alive, 1000]])
    assert.equal(session.deadChatRateLimit.size, 0)

    assert.equal(commitPrepared(deadPrepared).ok, true)
    assert.deepEqual([...session.dayChatRateLimit.entries()], [[alive, 1000]])
    assert.deepEqual([...session.deadChatRateLimit.entries()], [[dead, 1000]])
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

test('getChatRecipientUuids: DAY는 생존자 전원(발신자 포함), DEAD는 사망자 전원(발신자 포함)이다', () => {
    const { session, citizenUuids, jokerUuid } = setupGameChatSession({ id: 'room-gc-recip', phase: 'DAY' })
    const [deadOne, deadTwo] = citizenUuids
    session.players.get(deadOne).alive = false
    session.players.get(deadTwo).alive = false

    const dayRecipients = getChatRecipientUuids(session, CHAT_CHANNELS.DAY)
    const deadRecipients = getChatRecipientUuids(session, CHAT_CHANNELS.DEAD)

    assert.deepEqual(dayRecipients.sort(), [citizenUuids[2], jokerUuid].sort())
    assert.deepEqual(deadRecipients.sort(), [deadOne, deadTwo].sort())
    // 두 집합은 서로 겹치지 않고, 합치면 참가자 전원이다.
    assert.equal(dayRecipients.some((uuid) => deadRecipients.includes(uuid)), false)
    assert.equal(dayRecipients.length + deadRecipients.length, session.players.size)
})

test('getChatRecipientUuids: 알 수 없는 채널은 빈 배열이다(fail-closed)', () => {
    const { session } = setupGameChatSession({ id: 'room-gc-recip-unknown', phase: 'DAY' })

    for (const channel of [null, undefined, '', 'day', 'UNKNOWN', 42]) {
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

// --- 사망한 JOKER: JOKER 채팅에서 완전히 제외된다 ---

test('사망한 JOKER는 JOKER 채팅을 준비할 수 없고(NOT_ELIGIBLE) JOKER 수신자에서도 제외된다', () => {
    const { session, jokerUuid } = setupGameChatSession({ id: 'room-gc-dead-joker', phase: 'NIGHT' })

    // 살아있는 동안에는 JOKER 채널의 수신자이자 발신자다.
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.JOKER), [jokerUuid])
    assert.equal(prepareJokerChatMessage(jokerUuid, session.id, '살아있는 JOKER', { now: () => 1000 }).ok, true)

    session.players.get(jokerUuid).alive = false

    // 사망 즉시 JOKER 채널에서 사라진다(수신자 0명).
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.JOKER), [])
    assert.deepEqual(prepareJokerChatMessage(jokerUuid, session.id, '죽은 JOKER', { now: () => 2000 }), {
        ok: false,
        code: 'NOT_ELIGIBLE',
    })
    assert.equal(session.jokerChatRateLimit.size, 0, '거부된 준비는 rate limit을 소비하지 않는다')

    // 대신 사망자 전용 채팅은 쓸 수 있고, DEAD 수신자에 포함된다.
    const dead = prepareGameChatMessage(jokerUuid, session.id, '사망자 대화', { now: () => 2000 })
    assert.equal(dead.ok, true)
    assert.equal(dead.channel, CHAT_CHANNELS.DEAD)
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [jokerUuid])
})
