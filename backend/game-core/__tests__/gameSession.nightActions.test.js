// 밤 행동 제출 계약: isEligibleForNightAction 자격표 · submitNightAction 전 경로 · 사망 행위자/대상 규칙.

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const {
    buildSessionCandidate,
    isEligibleForNightAction,
    getEligibleNightActorUuids,
    __deleteGameSessionOnlyForTests,
} = gameSession.__testables
const {
    commitGameSession,
    acknowledgeRoleReveal,
    acknowledgeDayVoteReady,
    submitNightAction,
    submitDayVote,
    prepareDayVoteResolution,
    commitDayVoteResolution,
    prepareNightResolution,
    commitNightResolution,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
} = gameSession
const {
    makePlayer,
    makeRoom,
    setupTribunalReadySession,
    commitFullRoleSessionAtNight,
    commitJokerTrioSessionAtNight,
    castAllVotes,
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
// submitNightAction — NIGHT 행동 제출
// ---------------------------------------------------------------------------

// --- isEligibleForNightAction: 5개 역할 × dayIndex 0/1/2 표 ---
// WITCH_HUNTER는 production 첫 밤(dayIndex 1)까지 비활성이고 둘째 밤(dayIndex 2)부터 활성이다.

const eligibilityTable = [
    ['JOKER', 0, true],
    ['JOKER', 1, true],
    ['JOKER', 2, true],
    ['DOCTOR', 0, true],
    ['DOCTOR', 1, true],
    ['DOCTOR', 2, true],
    ['GUARD', 0, true],
    ['GUARD', 1, true],
    ['GUARD', 2, true],
    ['WITCH_HUNTER', 0, false],
    ['WITCH_HUNTER', 1, false],
    ['WITCH_HUNTER', 2, true],
    ['CITIZEN', 0, false],
    ['CITIZEN', 1, false],
    ['CITIZEN', 2, false],
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

test('submitNightAction: GUARD는 자기 자신을 대상으로 지정하면 INVALID_TARGET이고 Map은 불변이다', () => {
    const fixture = commitFullRoleSessionAtNight()
    const before = new Map(fixture.session.nightActions)

    const result = submitNightAction(fixture.guardUuid, fixture.session.id, fixture.guardUuid)

    assert.deepEqual(result, { ok: false, code: 'INVALID_TARGET' })
    assert.deepEqual(fixture.session.nightActions, before)
})

test('submitNightAction: WITCH_HUNTER의 자기 자신 지목은 (본인이 생존이므로) TARGET_NOT_DEAD이고 Map은 불변이다', () => {
    const fixture = commitFullRoleSessionAtNight()
    fixture.session.dayIndex = 2 // WITCH_HUNTER는 둘째 밤부터 eligibility를 통과한다
    const before = new Map(fixture.session.nightActions)

    const result = submitNightAction(fixture.witchHunterUuid, fixture.session.id, fixture.witchHunterUuid)

    assert.deepEqual(result, { ok: false, code: 'TARGET_NOT_DEAD' })
    assert.deepEqual(fixture.session.nightActions, before)
})

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

test('submitNightAction: WITCH_HUNTER는 dayIndex 1까지 NOT_ELIGIBLE이고 dayIndex 2부터 제출 가능하다', () => {
    const { session, witchHunterUuid, citizenUuid } = commitFullRoleSessionAtNight()
    session.players.get(citizenUuid).alive = false // WITCH_HUNTER의 대상은 사망자여야 한다

    const day0 = submitNightAction(witchHunterUuid, session.id, citizenUuid)
    assert.deepEqual(day0, { ok: false, code: 'NOT_ELIGIBLE' })
    assert.equal(session.nightActions.has(witchHunterUuid), false)

    session.dayIndex = 1 // production의 첫 밤 — 여전히 불가
    const day1 = submitNightAction(witchHunterUuid, session.id, citizenUuid)
    assert.deepEqual(day1, { ok: false, code: 'NOT_ELIGIBLE' })
    assert.equal(session.nightActions.has(witchHunterUuid), false)

    session.dayIndex = 2 // 두 번째 밤부터 가능
    const day2 = submitNightAction(witchHunterUuid, session.id, citizenUuid)
    assert.deepEqual(day2, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(witchHunterUuid), citizenUuid)
})

// 위 테스트는 dayIndex를 손으로 세팅하지만, 판정 4.2.1이 물어보는 것은 "production이 실제로
// 걷는 경로에서 첫 밤에 WH가 막히는가"다. ackAllAndRewindToFirstNight이 첫 밤을 인위적으로
// dayIndex 0으로 되돌려 이 버그를 오래 가려왔으므로, 여기서는 어떤 상태도 손으로 만들지 않고
// ROLE_REVEAL → DAY(1) → NIGHT(1) → DAY(2) → NIGHT(2)를 전부 core API로만 통과한다.
test('submitNightAction: production 경로(ROLE_REVEAL→DAY→NIGHT)의 첫 밤에 WITCH_HUNTER는 NOT_ELIGIBLE이고 둘째 밤에는 허용된다', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`prod-wh-${i}`))
    const room = makeRoom({ id: 'room-prod-first-night', players, jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0.999 })
    commitGameSession(candidate.session)
    const session = candidate.session
    const byRole = (role) => [...session.players.values()].find((p) => p.role === role).uuid
    const jokerUuid = byRole('JOKER')
    const doctorUuid = byRole('DOCTOR')
    const guardUuid = byRole('GUARD')
    const witchHunterUuid = byRole('WITCH_HUNTER')

    // ROLE_REVEAL(dayIndex 0) → 전원 확인 → 첫 낮(dayIndex 1)
    for (const uuid of session.players.keys()) acknowledgeRoleReveal(uuid, session.id)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)

    // 전원 기권으로 처형 없이 첫 밤(dayIndex 1)에 진입한다(그 전에 토론→투표 전환이 필요하다).
    const abstainAll = () => {
        for (const [uuid, player] of session.players) {
            if (player.alive) acknowledgeDayVoteReady(uuid, session.id)
        }
        for (const [uuid, player] of session.players) {
            if (player.alive) submitDayVote(uuid, session.id, null)
        }
        const prepared = prepareDayVoteResolution(jokerUuid, session.id, session.dayIndex)
        assert.equal(prepared.resolution.outcome, 'ABSTAINED')
        commitDayVoteResolution(prepared.session, prepared.resolution)
    }
    abstainAll()
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 1)

    // 첫 밤: WH는 행동할 수 없다(판정 4.2.1).
    const victimUuid = [...session.players.values()].find(
        (p) => p.role === 'CITIZEN' && p.alive,
    ).uuid
    assert.deepEqual(submitNightAction(witchHunterUuid, session.id, victimUuid), { ok: false, code: 'NOT_ELIGIBLE' })
    assert.equal(session.nightActions.has(witchHunterUuid), false)

    // 첫 밤 판정으로 사망자가 생기고 둘째 낮(dayIndex 2)으로 넘어간다 — WH가 제출하지 않아도
    // 밤이 막히지 않는다는 것까지 여기서 함께 확인된다.
    submitNightAction(jokerUuid, session.id, victimUuid)
    submitNightAction(doctorUuid, session.id, null)
    submitNightAction(guardUuid, session.id, null)
    const nightPrepared = prepareNightResolution(jokerUuid, session.id)
    assert.equal(nightPrepared.ok, true)
    commitNightResolution(nightPrepared.session, nightPrepared.resolution)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 2)
    assert.equal(session.players.get(victimUuid).alive, false)

    // 둘째 밤(dayIndex 2): 이제 WH는 사망자를 지목할 수 있다.
    abstainAll()
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, 2)
    assert.deepEqual(submitNightAction(witchHunterUuid, session.id, victimUuid), { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(witchHunterUuid), victimUuid)
})

// --- WITCH_HUNTER 대상 규칙(판정 4.2.2): 사망자만 지목할 수 있다 ---

test('submitNightAction: WITCH_HUNTER가 사망자를 지목하면 저장되고, 생존자를 지목하면 TARGET_NOT_DEAD로 거부된다', () => {
    const { session, witchHunterUuid, citizenUuid, doctorUuid } = commitFullRoleSessionAtNight()
    session.dayIndex = 2
    session.players.get(citizenUuid).alive = false

    const dead = submitNightAction(witchHunterUuid, session.id, citizenUuid)
    assert.deepEqual(dead, { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(witchHunterUuid), citizenUuid)

    const before = new Map(session.nightActions)
    const alive = submitNightAction(witchHunterUuid, session.id, doctorUuid)
    assert.deepEqual(alive, { ok: false, code: 'TARGET_NOT_DEAD' })
    assert.deepEqual(session.nightActions, before) // 기존 유효 제출이 파괴되지 않는다
})

test('submitNightAction: 생존 대상을 요구하는 역할(DOCTOR/GUARD/JOKER)은 사망자를 지목하면 TARGET_NOT_ALIVE다', () => {
    const { session, doctorUuid, guardUuid, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight()
    session.players.get(citizenUuid).alive = false

    for (const actorUuid of [doctorUuid, guardUuid, jokerUuid]) {
        const before = new Map(session.nightActions)
        assert.deepEqual(submitNightAction(actorUuid, session.id, citizenUuid), {
            ok: false,
            code: 'TARGET_NOT_ALIVE',
        })
        assert.deepEqual(session.nightActions, before)
    }
})

test('submitNightAction: WITCH_HUNTER의 SKIP(null)은 대상 생존 규칙과 무관하게 그대로 저장된다', () => {
    const { session, witchHunterUuid } = commitFullRoleSessionAtNight()
    session.dayIndex = 2

    assert.deepEqual(submitNightAction(witchHunterUuid, session.id, null), { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(witchHunterUuid), null)
})

test('prepareNightResolution: WITCH_HUNTER의 사망자 지목은 밤 판정을 막지 않고 privateResults에 role을 담는다', () => {
    const { session, witchHunterUuid, jokerUuid, doctorUuid, guardUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'room-wh-resolve' })
    session.dayIndex = 2
    session.players.get(citizenUuid).alive = false

    submitNightAction(witchHunterUuid, session.id, citizenUuid)
    submitNightAction(jokerUuid, session.id, null)
    submitNightAction(doctorUuid, session.id, null)
    submitNightAction(guardUuid, session.id, null)

    const prepared = prepareNightResolution(witchHunterUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.deepEqual(prepared.resolution.privateResults.get(witchHunterUuid), {
        actionType: 'CONFIRM',
        targetId: citizenUuid,
        role: session.players.get(citizenUuid).role,
    })
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
// 밤 페이즈 사망자 — 교착 방지(생존 행동 보유자 기준 판정) + 사망자 제출/지목 거부
// ---------------------------------------------------------------------------

test('getEligibleNightActorUuids: 사망한 DOCTOR는 목록에서 빠지고 생존한 JOKER/GUARD만 남는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid } = commitFullRoleSessionAtNight({ id: 'room-dead-eligible' })
    assert.deepEqual(getEligibleNightActorUuids(session).sort(), [jokerUuid, doctorUuid, guardUuid].sort())

    session.players.get(doctorUuid).alive = false

    assert.deepEqual(getEligibleNightActorUuids(session).sort(), [jokerUuid, guardUuid].sort())
})

test('교착 회귀: 사망한 DOCTOR가 제출하지 않아도 생존 행동 보유자만 제출하면 밤이 판정된다(ACTIONS_PENDING 아님)', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-deadlock',
    })
    session.players.get(doctorUuid).alive = false

    assert.deepEqual(submitNightAction(jokerUuid, session.id, citizenUuid), { ok: true, gameId: session.id })
    assert.deepEqual(submitNightAction(guardUuid, session.id, citizenUuid), { ok: true, gameId: session.id })
    assert.equal(session.nightActions.has(doctorUuid), false, '사망자는 끝내 제출하지 않는다')

    const prepared = prepareNightResolution(citizenUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.assassinationTargetId, citizenUuid)
})

for (const roleKey of ['jokerUuid', 'doctorUuid', 'guardUuid']) {
    test(`submitNightAction: 사망한 ${roleKey}는 ACTOR_NOT_ALIVE이고 Map은 불변이다`, () => {
        const fixture = commitFullRoleSessionAtNight({ id: `room-dead-actor-${roleKey}` })
        const actorUuid = fixture[roleKey]
        fixture.session.players.get(actorUuid).alive = false
        const before = new Map(fixture.session.nightActions)

        const result = submitNightAction(actorUuid, fixture.session.id, fixture.citizenUuid)

        assert.deepEqual(result, { ok: false, code: 'ACTOR_NOT_ALIVE' })
        assert.deepEqual(fixture.session.nightActions, before)
    })
}

test('submitNightAction: 사망한 CITIZEN은 NOT_ELIGIBLE이 아니라 ACTOR_NOT_ALIVE다(생존 검사가 eligibility보다 먼저)', () => {
    const { session, citizenUuid, doctorUuid } = commitFullRoleSessionAtNight({ id: 'room-dead-citizen' })
    session.players.get(citizenUuid).alive = false

    const result = submitNightAction(citizenUuid, session.id, doctorUuid)

    assert.deepEqual(result, { ok: false, code: 'ACTOR_NOT_ALIVE' })
})

test('submitNightAction: 사망한 대상을 지목하면 역할과 무관하게 TARGET_NOT_ALIVE이고 Map은 불변이다', () => {
    const { session, jokerUuid, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'room-dead-target' })
    session.players.get(citizenUuid).alive = false
    const before = new Map(session.nightActions)

    assert.deepEqual(submitNightAction(doctorUuid, session.id, citizenUuid), { ok: false, code: 'TARGET_NOT_ALIVE' })
    assert.deepEqual(submitNightAction(jokerUuid, session.id, citizenUuid), { ok: false, code: 'TARGET_NOT_ALIVE' })
    assert.deepEqual(session.nightActions, before)
})

test('submitNightAction: JOKER가 사망한 동료 JOKER를 지목하면 조용한 no-op이 아니라 TARGET_NOT_ALIVE다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight({ id: 'room-dead-teammate' })
    const [actor, teammate] = jokerUuids
    session.players.get(teammate).alive = false

    const result = submitNightAction(actor, session.id, teammate)

    assert.deepEqual(result, { ok: false, code: 'TARGET_NOT_ALIVE' })
    assert.equal(session.nightActions.has(actor), false)
})

test('제출 후 사망한 JOKER의 잔여 엔트리는 암살 집계에 반영되지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = commitFullRoleSessionAtNight({
        id: 'room-stale-joker-vote',
    })
    submitNightAction(jokerUuid, session.id, citizenUuid)
    submitNightAction(doctorUuid, session.id, null)
    submitNightAction(guardUuid, session.id, null)
    // 제출은 그대로 남아 있지만, 판정 시점의 canonical 생존 상태가 집계의 유일한 기준이다.
    session.players.get(jokerUuid).alive = false
    assert.equal(session.nightActions.get(jokerUuid), citizenUuid, '잔여 엔트리 자체는 지워지지 않는다')

    const prepared = prepareNightResolution(citizenUuid, session.id)

    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.assassinationTargetId, null)
    assert.equal(prepared.resolution.pendingEliminationTargetId, null)
})

test('밤 시작 전 사망 end-to-end: 재판에서 처형된 DOCTOR가 제출하지 않아도 그 밤은 정상 판정되어 DAY로 넘어간다', () => {
    const uuids = Array.from({ length: 8 }, (_, i) => `e2e-${i}`)
    const { session } = setupTribunalReadySession({ uuids, defendantUuid: uuids[0], randomFn: () => 0 })
    const byRole = (role) => [...session.players.values()].find((p) => p.role === role).uuid
    const doctorUuid = byRole('DOCTOR')
    const jokerUuid = byRole('JOKER')
    const guardUuid = byRole('GUARD')
    // 피고인을 실제 밤 행동 보유 역할(DOCTOR)로 고정한다 — 역할 배정이 바뀌어 이 테스트가
    // 조용히 무의미해지지 않도록 uuid가 아니라 역할로 지목한다.
    session.dayVoteResolution.tribunalTargetUuid = doctorUuid
    session.tribunal = { candidateId: doctorUuid, dayIndex: session.dayIndex, defendantUuid: doctorUuid, votes: new Map() }
    castAllVotes(
        session,
        Object.fromEntries(uuids.filter((uuid) => uuid !== doctorUuid).map((uuid) => [uuid, 'GUILTY'])),
    )

    const tribunalPrepared = prepareTribunalVoteResolution(jokerUuid, session.id, session.dayIndex)
    assert.equal(tribunalPrepared.resolution.outcome, 'GUILTY')
    assert.deepEqual(commitTribunalVoteResolution(tribunalPrepared.session, tribunalPrepared.resolution), {
        ok: true,
        terminal: null,
    })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.players.get(doctorUuid).alive, false)

    // 사망한 DOCTOR는 제출할 수 없고, 제출하지 않아도 밤이 막히지 않는다.
    const victimUuid = uuids.find(
        (uuid) => ![doctorUuid, jokerUuid, guardUuid].includes(uuid) && session.players.get(uuid).alive,
    )
    assert.deepEqual(submitNightAction(doctorUuid, session.id, victimUuid), { ok: false, code: 'ACTOR_NOT_ALIVE' })
    submitNightAction(jokerUuid, session.id, victimUuid)
    submitNightAction(guardUuid, session.id, null)

    const prepared = prepareNightResolution(jokerUuid, session.id)
    assert.equal(prepared.ok, true)

    const committed = commitNightResolution(prepared.session, prepared.resolution)
    assert.deepEqual(committed, { ok: true, victimUuid, terminal: null })
    assert.equal(session.phase, 'DAY')
    assert.equal(session.players.get(victimUuid).alive, false)
})
