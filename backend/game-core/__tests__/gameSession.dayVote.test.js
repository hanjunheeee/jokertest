// 낮/재판 계약: submitDayVote와 낮 투표 판정 · 동점 재투표 · 낮 하위 페이즈 · submitTribunalVote와 재판 판정.

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const {
    buildSessionCandidate,
    getDayPhase,
    getEligibleNightActorUuids,
    __deleteGameSessionOnlyForTests,
} = gameSession.__testables
const {
    commitGameSession,
    acknowledgeDayVoteReady,
    buildDayPhaseChangedPayload,
    DAY_PHASES,
    submitNightAction,
    prepareNightResolution,
    commitNightResolution,
    submitDayVote,
    prepareDayVoteResolution,
    commitDayVoteResolution,
    buildDayVoteResolvedPayload,
    submitTribunalVote,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
    buildTribunalVoteResolvedPayload,
    getSessionSnapshotForPlayer,
} = gameSession
const {
    makePlayer,
    makeRoom,
    setupTribunalReadySession,
    castAllVotes,
    commitFullRoleSessionAtNight,
    advanceDayToVotePhase,
    commitTrioSessionAtDay,
    commitQuadSessionAtDay,
    advanceQuadToRevote,
    resolveTribunalVotes,
    assertNoForbiddenPrivateData,
    collectOtherPlayerRoleSecrets,
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
// submitTribunalVote
// ---------------------------------------------------------------------------

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
// submitDayVote — DAY 투표/기권 제출
// ---------------------------------------------------------------------------

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

// 1라운드 동점은 더 이상 즉시 TIE가 아니라 REVOTE다(판정 6.4) — phase는 DAY에 머무르고
// 라운드만 올라간다. 재요청 멱등성은 라운드가 넘어가기 전까지만 유효하므로 여기서는
// commit 이전(같은 라운드) 시점에 확인한다.
test('commitDayVoteResolution: 1라운드 동점은 REVOTE이고 phase를 DAY에 남긴 채 라운드와 제외 집합만 바꾼다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-tie-1' })
    // 3자 순환 투표(A→B, B→C, C→A)는 각 대상이 1표씩 얻어 동점이 된다.
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidC)
    submitDayVote(uuidC, session.id, uuidA)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    assert.equal(prepared.ok, true)
    assert.equal(prepared.resolution.outcome, 'REVOTE')
    assert.equal(prepared.resolution.tribunalTargetUuid, null)
    assert.equal(prepared.resolution.round, 1)
    assert.deepEqual(prepared.resolution.revoteExcludedUuids, [uuidA, uuidB, uuidC].sort())

    commitDayVoteResolution(prepared.session, prepared.resolution)

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.tribunal, null)
    assert.equal(session.dayVoteResolution, prepared.resolution)
    assert.equal(session.dayVoteRound, 2)
    assert.deepEqual([...session.dayVoteExcludedUuids].sort(), [uuidA, uuidB, uuidC].sort())
    assert.equal(session.dayVotes.size, 0)

    // REVOTE는 판정 멱등성의 창을 라운드 단위로 좁힌다 — 1라운드 판정 직후 도착한 중복 요청은
    // alreadyResolved 성공이 아니라 "2라운드 표가 아직 없다"는 ACTIONS_PENDING을 받는다.
    // 라운드가 다르면 다른 판정이므로 의도된 동작이다.
    const stale = prepareDayVoteResolution(uuidB, session.id, session.dayIndex)
    assert.deepEqual(stale, { ok: false, code: 'ACTIONS_PENDING' })
})

// 같은 resolution을 두 번 commit해도 라운드가 두 번 오르거나 2라운드 표가 지워지지 않는다.
test('commitDayVoteResolution: 이미 소비된 resolution의 재-commit은 DAY_VOTE_RESOLUTION_MISMATCH이고 라운드·표가 불변이다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-revote-recommit' })
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidC)
    submitDayVote(uuidC, session.id, uuidA)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    commitDayVoteResolution(prepared.session, prepared.resolution)

    // 2라운드가 열린 뒤 한 표를 넣어 "재-commit이 표를 지우는지"까지 관찰 가능하게 만든다.
    submitDayVote(uuidA, session.id, null)
    assert.equal(session.dayVotes.size, 1)

    const second = commitDayVoteResolution(session, prepared.resolution)

    assert.deepEqual(second, { ok: false, code: 'DAY_VOTE_RESOLUTION_MISMATCH' })
    assert.equal(session.dayVoteRound, 2)
    assert.equal(session.dayVotes.size, 1)
    assert.equal(session.phase, 'DAY')
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
    // 생존 2인이 서로를 지목해 동점이고, 1라운드 동점이므로 outcome은 REVOTE다(집계 수치 계약은 불변).
    assert.equal(prepared.resolution.outcome, 'REVOTE')
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

// REVOTE는 phase를 DAY에 남기고, 그 뒤 밤으로 보내는 결과(ABSTAINED·TIE)만 NIGHT를 노출한다.
// 3인 순환 동점은 생존자 전원이 동점자이므로 2라운드에 후보가 남지 않아 전원 기권 → ABSTAINED로
// 종결된다(판정 6.5의 "재동점이어도 3라운드로 가지 않는다"를 인원 하한에서 확인).
test('buildDayVoteResolvedPayload: REVOTE 이후에는 phase가 DAY, 재투표 종결(ABSTAINED) 이후에는 NIGHT를 노출한다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-payload-phase-1' })
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidC)
    submitDayVote(uuidC, session.id, uuidA)

    const first = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    commitDayVoteResolution(first.session, first.resolution)
    const revotePayload = buildDayVoteResolvedPayload(first.session, first.resolution)

    assert.equal(revotePayload.phase, 'DAY')
    assert.equal(revotePayload.outcome, 'REVOTE')
    assert.equal(revotePayload.round, 1)
    assert.deepEqual(revotePayload.revoteExcludedUuids.sort(), [uuidA, uuidB, uuidC].sort())

    // 2라운드: 생존자 전원이 후보에서 빠졌으므로 남은 선택지는 기권뿐이다.
    submitDayVote(uuidA, session.id, null)
    submitDayVote(uuidB, session.id, null)
    submitDayVote(uuidC, session.id, null)

    const second = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    assert.equal(second.resolution.outcome, 'ABSTAINED')
    assert.equal(second.resolution.round, 2)
    commitDayVoteResolution(second.session, second.resolution)
    const finalPayload = buildDayVoteResolvedPayload(second.session, second.resolution)

    assert.equal(finalPayload.phase, 'NIGHT')
    assert.equal(finalPayload.outcome, 'ABSTAINED')
    assert.equal(finalPayload.round, 2)
    assert.deepEqual(finalPayload.revoteExcludedUuids, [])
})

// ---------------------------------------------------------------------------
// 동점 재투표(판정 6.4 / 6.5) — 4인 픽스처
//
// 3인 픽스처는 순환 투표에서 생존자 전원이 동점자가 되어 2라운드에 후보가 남지 않는다.
// "동점자만 제외하고 나머지 후보로 다시 투표한다"는 규칙 자체를 보려면 동점자보다 생존자가
// 많아야 하므로, 여기서는 4인 세션을 쓴다.
// ---------------------------------------------------------------------------

test('submitDayVote: 재투표 라운드에서 동점자였던 플레이어에게 투표하면 TARGET_EXCLUDED_FROM_REVOTE이고 dayVotes는 불변이다', () => {
    const { session, uuidA, uuidB, uuidC, uuidD } = advanceQuadToRevote('room-revote-excluded')
    const before = new Map(session.dayVotes)

    // 동점자 A·C는 여전히 생존·참가자지만 이번 라운드의 후보가 아니다.
    assert.deepEqual(submitDayVote(uuidB, session.id, uuidA), { ok: false, code: 'TARGET_EXCLUDED_FROM_REVOTE' })
    assert.deepEqual(submitDayVote(uuidD, session.id, uuidC), { ok: false, code: 'TARGET_EXCLUDED_FROM_REVOTE' })
    assert.deepEqual(session.dayVotes, before)

    // 제외된 A·C 본인은 투표권을 잃지 않는다 — 후보 자격만 잃는다.
    assert.deepEqual(submitDayVote(uuidA, session.id, uuidB), { ok: true })
    assert.equal(session.dayVotes.get(uuidA), uuidB)
    // 기권도 그대로 가능하다.
    assert.deepEqual(submitDayVote(uuidC, session.id, null), { ok: true })
    assert.equal(session.dayVotes.get(uuidC), null)
})

test('재투표에서 단독 최다 득표가 나오면 기존 계약대로 TRIBUNAL로 전이한다', () => {
    const { session, uuidA, uuidB, uuidC, uuidD } = advanceQuadToRevote('room-revote-tribunal')
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidD)
    submitDayVote(uuidC, session.id, uuidB)
    submitDayVote(uuidD, session.id, uuidB)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)

    assert.equal(prepared.resolution.outcome, 'TRIBUNAL')
    assert.equal(prepared.resolution.tribunalTargetUuid, uuidB)
    assert.equal(prepared.resolution.round, 2)
    assert.deepEqual(prepared.resolution.excludedUuids, [uuidA, uuidC].sort())
    assert.deepEqual(prepared.resolution.revoteExcludedUuids, [])

    commitDayVoteResolution(prepared.session, prepared.resolution)

    assert.equal(session.phase, 'TRIBUNAL')
    assert.equal(session.tribunal.defendantUuid, uuidB)
})

test('재투표도 동점이면 outcome은 TIE이고 처형 없이 NIGHT로 진행한다(3라운드는 없다)', () => {
    const { session, uuidA, uuidB, uuidC, uuidD } = advanceQuadToRevote('room-revote-tie')
    const aliveBefore = new Map([...session.players].map(([uuid, p]) => [uuid, p.alive]))

    // B와 D가 2표씩 — 2라운드 동점이다.
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidD)
    submitDayVote(uuidC, session.id, uuidD)
    submitDayVote(uuidD, session.id, uuidB)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)

    // 2라운드 이후의 동률은 REVOTE가 아니라 기존 TIE 계약이다.
    assert.equal(prepared.resolution.outcome, 'TIE')
    assert.equal(prepared.resolution.round, 2)
    assert.equal(prepared.resolution.tribunalTargetUuid, null)
    assert.deepEqual(prepared.resolution.revoteExcludedUuids, [])

    commitDayVoteResolution(prepared.session, prepared.resolution)

    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.tribunal, null)
    for (const [uuid, p] of session.players) assert.equal(p.alive, aliveBefore.get(uuid), `${uuid} 생존 상태 불변`)
})

test('enterDayPhase: 재투표로 올라간 라운드와 제외 집합은 다음 낮에 최초 투표 상태로 되돌아간다', () => {
    const { session, uuidA, uuidB, uuidC, uuidD } = advanceQuadToRevote('room-revote-reset')
    submitDayVote(uuidA, session.id, uuidB)
    submitDayVote(uuidB, session.id, uuidD)
    submitDayVote(uuidC, session.id, uuidD)
    submitDayVote(uuidD, session.id, uuidB)
    const tiePrepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    commitDayVoteResolution(tiePrepared.session, tiePrepared.resolution)
    assert.equal(session.phase, 'NIGHT')

    // 밤을 판정해 다음 낮으로 넘어간다(아무도 지목하지 않아 사망자는 없다).
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    for (const uuid of getEligibleNightActorUuids(session)) submitNightAction(uuid, session.id, null)
    const nightPrepared = prepareNightResolution(jokerUuid, session.id)
    commitNightResolution(nightPrepared.session, nightPrepared.resolution)

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayVoteRound, 1)
    assert.equal(session.dayVoteExcludedUuids.size, 0)
    // 새 낮은 토론부터 시작하므로 지난 낮의 준비도 이월되지 않는다.
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')
    assert.equal(session.dayVoteReadyUuids.size, 0)
    advanceDayToVotePhase(session)
    // 지난 낮에 제외됐던 A도 다시 후보가 된다.
    assert.deepEqual(submitDayVote(uuidB, session.id, uuidA), { ok: true })
})

// ---------------------------------------------------------------------------
// 낮 하위 페이즈(DAY_DISCUSSION → DAY_VOTE) — acknowledgeDayVoteReady / getDayPhase
// ---------------------------------------------------------------------------

test('DAY_PHASES: 두 하위 구간 값이 요구서의 이름과 정확히 일치하고 동결돼 있다', () => {
    assert.deepEqual(DAY_PHASES, { DISCUSSION: 'DAY_DISCUSSION', VOTE: 'DAY_VOTE' })
    assert.equal(Object.isFrozen(DAY_PHASES), true)
})

test('enterDayPhase: 첫 낮도 밤을 넘긴 낮도 항상 DAY_DISCUSSION에서 시작하고 준비 집합은 비어 있다', () => {
    const { session } = commitTrioSessionAtDay({ id: 'room-dp-enter', advanceToVote: false })
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')
    assert.equal(session.dayVoteReadyUuids.size, 0)

    // 밤→낮 경로도 동일한 canonical 헬퍼 하나만 쓰므로 같은 초기 상태가 된다.
    advanceDayToVotePhase(session)
    session.phase = 'NIGHT'
    const readyMapRef = session.dayVoteReadyUuids
    commitNightResolution(session, {
        gameId: session.id, dayIndex: 1, pendingEliminationTargetId: null, privateResults: new Map(), resolved: true,
    })

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')
    assert.notEqual(session.dayVoteReadyUuids, readyMapRef)
    assert.equal(session.dayVoteReadyUuids.size, 0)
})

test('getDayPhase: 알 수 없는 값이면 fail-closed로 DAY_DISCUSSION이다(모르면 투표를 열지 않는다)', () => {
    assert.equal(getDayPhase({}), 'DAY_DISCUSSION')
    assert.equal(getDayPhase({ dayPhase: null }), 'DAY_DISCUSSION')
    assert.equal(getDayPhase({ dayPhase: 'DAY_TIMER' }), 'DAY_DISCUSSION')
    assert.equal(getDayPhase({ dayPhase: 'DAY_VOTE' }), 'DAY_VOTE')
    assert.equal(getDayPhase({ dayPhase: 'DAY_DISCUSSION' }), 'DAY_DISCUSSION')
})

test('submitDayVote: 토론 중 제출은 INVALID_DAY_PHASE로 거부되고 dayVotes는 비어 있다(성공 조건 6.3)', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dp-vote-guard', advanceToVote: false })

    assert.deepEqual(submitDayVote(uuidA, session.id, uuidB), { ok: false, code: 'INVALID_DAY_PHASE' })
    assert.deepEqual(submitDayVote(uuidA, session.id, null), { ok: false, code: 'INVALID_DAY_PHASE' })
    assert.equal(session.dayVotes.size, 0)

    // 투표 구간이 열리면 같은 제출이 그대로 통과한다(positive control).
    advanceDayToVotePhase(session)
    assert.deepEqual(submitDayVote(uuidA, session.id, uuidB), { ok: true })
    assert.equal(session.dayVotes.get(uuidA), uuidB)
})

test('prepareDayVoteResolution: 토론 중 집계 요청도 INVALID_DAY_PHASE로 거부된다', () => {
    const { session, uuidA } = commitTrioSessionAtDay({ id: 'room-dp-resolve-guard', advanceToVote: false })

    assert.deepEqual(prepareDayVoteResolution(uuidA, session.id, session.dayIndex), {
        ok: false,
        code: 'INVALID_DAY_PHASE',
    })
    assert.equal(session.dayVoteResolution, null)
    assert.equal(session.phase, 'DAY')
})

test('acknowledgeDayVoteReady: 생존자 전원이 모여야 전이하고, 마지막 한 명만 transitioned:true를 받는다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-dp-ready', advanceToVote: false })

    const first = acknowledgeDayVoteReady(uuidA, session.id)
    assert.equal(first.ok, true)
    assert.equal(first.transitioned, false)
    assert.deepEqual([first.readyCount, first.requiredCount], [1, 3])
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')

    const second = acknowledgeDayVoteReady(uuidB, session.id)
    assert.equal(second.transitioned, false)
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')

    const third = acknowledgeDayVoteReady(uuidC, session.id)
    assert.equal(third.transitioned, true)
    assert.deepEqual([third.readyCount, third.requiredCount], [3, 3])
    assert.equal(session.dayPhase, 'DAY_VOTE')
    // 전이 이후 준비 기록은 의미가 없으므로 비워진다.
    assert.equal(session.dayVoteReadyUuids.size, 0)
    // 투표 상태(라운드·제외 목록·표)는 전이가 건드리지 않는다.
    assert.equal(session.dayVoteRound, 1)
    assert.equal(session.dayVoteExcludedUuids.size, 0)
    assert.equal(session.dayVotes.size, 0)
})

test('acknowledgeDayVoteReady: 같은 uuid의 중복 준비는 멱등이고 그것만으로는 전이하지 않는다', () => {
    const { session, uuidA, uuidB } = commitTrioSessionAtDay({ id: 'room-dp-ready-dup', advanceToVote: false })

    acknowledgeDayVoteReady(uuidA, session.id)
    const repeat = acknowledgeDayVoteReady(uuidA, session.id)
    assert.equal(repeat.ok, true)
    assert.equal(repeat.transitioned, false)
    assert.deepEqual([repeat.readyCount, repeat.requiredCount], [1, 3])

    const secondRepeat = acknowledgeDayVoteReady(uuidB, session.id)
    assert.equal(secondRepeat.transitioned, false)
    assert.equal(acknowledgeDayVoteReady(uuidB, session.id).transitioned, false)
    assert.equal(session.dayPhase, 'DAY_DISCUSSION')
})

test('acknowledgeDayVoteReady: 사망자의 준비는 ACTOR_NOT_ALIVE이고 정족수에서도 빠진다(교착 방지)', () => {
    const { session, uuidA, uuidB, uuidC, uuidD } = commitQuadSessionAtDay({ id: 'room-dp-ready-dead', advanceToVote: false })
    session.players.get(uuidD).alive = false

    assert.deepEqual(acknowledgeDayVoteReady(uuidD, session.id), { ok: false, code: 'ACTOR_NOT_ALIVE' })
    assert.equal(session.dayVoteReadyUuids.has(uuidD), false)

    acknowledgeDayVoteReady(uuidA, session.id)
    acknowledgeDayVoteReady(uuidB, session.id)
    const last = acknowledgeDayVoteReady(uuidC, session.id)
    assert.equal(last.transitioned, true)
    assert.deepEqual([last.readyCount, last.requiredCount], [3, 3])
    assert.equal(session.dayPhase, 'DAY_VOTE')
})

test('acknowledgeDayVoteReady: 이미 DAY_VOTE인 낮에는 INVALID_DAY_PHASE, DAY가 아니면 INVALID_PHASE다', () => {
    const { session, uuidA } = commitTrioSessionAtDay({ id: 'room-dp-ready-phase' })
    assert.equal(session.dayPhase, 'DAY_VOTE')

    assert.deepEqual(acknowledgeDayVoteReady(uuidA, session.id), { ok: false, code: 'INVALID_DAY_PHASE' })
    assert.equal(session.dayVoteReadyUuids.size, 0)

    session.phase = 'NIGHT'
    assert.deepEqual(acknowledgeDayVoteReady(uuidA, session.id), { ok: false, code: 'INVALID_PHASE' })
})

test('acknowledgeDayVoteReady: gameId/세션 검증은 acknowledgeRoleReveal과 동일한 순서로 거부한다', () => {
    const { session, uuidA } = commitTrioSessionAtDay({ id: 'room-dp-ready-guards', advanceToVote: false })

    assert.deepEqual(acknowledgeDayVoteReady(uuidA, '  '), { ok: false, code: 'INVALID_GAME_ID' })
    assert.deepEqual(acknowledgeDayVoteReady('not-a-member', session.id), { ok: false, code: 'NOT_IN_SESSION' })
    assert.deepEqual(acknowledgeDayVoteReady(uuidA, 'other-game'), { ok: false, code: 'STALE_SESSION_MISMATCH' })
    assert.equal(session.dayVoteReadyUuids.size, 0)
})

test('재투표(요구 3): REVOTE는 DAY_VOTE 안의 반복이라 준비를 다시 요구하지 않는다', () => {
    const { session, uuidA, uuidB, uuidC, uuidD } = advanceQuadToRevote('room-dp-revote')

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayPhase, 'DAY_VOTE')
    assert.equal(session.dayVoteRound, 2)
    // 준비 없이 곧바로 2라운드 제출이 통과한다.
    assert.deepEqual(submitDayVote(uuidB, session.id, uuidD), { ok: true })
    assert.deepEqual(submitDayVote(uuidD, session.id, uuidB), { ok: true })
    // 제외 규칙(joker-A 5번)도 그대로다.
    assert.deepEqual(submitDayVote(uuidA, session.id, uuidC), { ok: false, code: 'TARGET_EXCLUDED_FROM_REVOTE' })
})

test('전원 기권(요구 4): 유효 투표 0이면 처형 없이 밤으로 넘어간다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-dp-abstain' })
    for (const uuid of [uuidA, uuidB, uuidC]) submitDayVote(uuid, session.id, null)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    assert.equal(prepared.resolution.outcome, 'ABSTAINED')
    assert.deepEqual(commitDayVoteResolution(prepared.session, prepared.resolution), { ok: true })

    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.tribunal, null)
    for (const player of session.players.values()) assert.equal(player.alive, true)
})

test('전원 기권(요구 4): 재투표 2라운드에서 전원 기권해도 처형 없이 밤으로 넘어간다', () => {
    const { session, uuidA, uuidB, uuidC, uuidD } = advanceQuadToRevote('room-dp-abstain-revote')
    for (const uuid of [uuidA, uuidB, uuidC, uuidD]) submitDayVote(uuid, session.id, null)

    const prepared = prepareDayVoteResolution(uuidA, session.id, session.dayIndex)
    assert.equal(prepared.resolution.outcome, 'ABSTAINED')
    assert.equal(prepared.resolution.round, 2)
    commitDayVoteResolution(prepared.session, prepared.resolution)

    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.tribunal, null)
    for (const player of session.players.values()) assert.equal(player.alive, true)
})

test('처형 직후 승리 재평가(요구 5): 광대 처형은 밤에 들어가기 전에 시민 승리로 종결된다', () => {
    const { session, uuidA, uuidB, uuidC, uuidD } = commitQuadSessionAtDay({ id: 'room-dp-joker-exec' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const citizenUuids = [uuidA, uuidB, uuidC, uuidD].filter((uuid) => uuid !== jokerUuid)

    for (const uuid of citizenUuids) submitDayVote(uuid, session.id, jokerUuid)
    submitDayVote(jokerUuid, session.id, citizenUuids[0])
    const prepared = prepareDayVoteResolution(jokerUuid, session.id, session.dayIndex)
    assert.equal(prepared.resolution.outcome, 'TRIBUNAL')
    assert.equal(prepared.resolution.tribunalTargetUuid, jokerUuid)
    commitDayVoteResolution(prepared.session, prepared.resolution)
    assert.equal(session.phase, 'TRIBUNAL')

    const nightActionsBefore = session.nightActions
    const outcome = resolveTribunalVotes(session, Object.fromEntries(citizenUuids.map((uuid) => [uuid, 'GUILTY'])))

    assert.deepEqual(outcome, { ok: true, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.players.get(jokerUuid).alive, false)
    // 밤을 거치지 않았다 — TRIBUNAL→NIGHT 전이가 하는 nightActions 교체가 일어나지 않았다.
    assert.equal(session.nightActions, nightActionsBefore)
})

test('buildDayPhaseChangedPayload: 공개 키가 정확히 4개뿐이고 참가자 식별·비밀 정보가 없다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-dp-payload', advanceToVote: false })
    for (const uuid of [uuidA, uuidB, uuidC]) acknowledgeDayVoteReady(uuid, session.id)

    const payload = buildDayPhaseChangedPayload(session)

    assert.deepEqual(Object.keys(payload).sort(), ['dayIndex', 'dayPhase', 'gameId', 'round'])
    assert.deepEqual(payload, { gameId: session.id, dayIndex: 1, dayPhase: 'DAY_VOTE', round: 1 })
    assertNoForbiddenPrivateData(payload, collectOtherPlayerRoleSecrets(session, uuidA))
})

test('buildDayPhaseChangedPayload: 재투표가 열린 낮에는 현재 라운드를 그대로 싣는다', () => {
    const { session } = advanceQuadToRevote('room-dp-payload-revote')
    assert.deepEqual(buildDayPhaseChangedPayload(session), {
        gameId: session.id,
        dayIndex: 1,
        dayPhase: 'DAY_VOTE',
        round: 2,
    })
})

test('buildSessionSnapshot: dayPhase는 DAY에서만 실리고 hasActedThisPhase는 하위 구간별 제출을 따른다', () => {
    const { session, uuidA, uuidB, uuidC } = commitTrioSessionAtDay({ id: 'room-dp-snapshot', advanceToVote: false })

    // 토론: hasActedThisPhase는 "준비를 눌렀는가"다.
    const discussion = getSessionSnapshotForPlayer(uuidA, session.id).snapshot
    assert.equal(discussion.dayPhase, 'DAY_DISCUSSION')
    assert.equal(discussion.self.hasActedThisPhase, false)
    acknowledgeDayVoteReady(uuidA, session.id)
    assert.equal(getSessionSnapshotForPlayer(uuidA, session.id).snapshot.self.hasActedThisPhase, true)
    assert.equal(getSessionSnapshotForPlayer(uuidB, session.id).snapshot.self.hasActedThisPhase, false)

    // 투표: hasActedThisPhase는 다시 "표를 냈는가"로 돌아간다(준비 기록은 비워졌다).
    acknowledgeDayVoteReady(uuidB, session.id)
    acknowledgeDayVoteReady(uuidC, session.id)
    const vote = getSessionSnapshotForPlayer(uuidA, session.id).snapshot
    assert.equal(vote.dayPhase, 'DAY_VOTE')
    assert.equal(vote.self.hasActedThisPhase, false)
    submitDayVote(uuidA, session.id, uuidB)
    assert.equal(getSessionSnapshotForPlayer(uuidA, session.id).snapshot.self.hasActedThisPhase, true)
    assertNoForbiddenPrivateData(vote, collectOtherPlayerRoleSecrets(session, uuidA))

    // 낮을 벗어나면 키 자체가 없다.
    session.phase = 'NIGHT'
    assert.equal(Object.hasOwn(getSessionSnapshotForPlayer(uuidA, session.id).snapshot, 'dayPhase'), false)
    session.phase = 'TRIBUNAL'
    assert.equal(Object.hasOwn(getSessionSnapshotForPlayer(uuidA, session.id).snapshot, 'dayPhase'), false)
})

test('buildSessionSnapshot: ROLE_REVEAL/ENDED 스냅샷에도 dayPhase 키가 없다', () => {
    const uuids = ['dps1', 'dps2']
    const room = makeRoom({ id: 'room-dp-snapshot-off', players: uuids.map((uuid) => makePlayer(uuid)), jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session

    assert.equal(Object.hasOwn(getSessionSnapshotForPlayer('dps1', session.id).snapshot, 'dayPhase'), false)

    gameSession.__testables.finalizeGameSession(session, { winner: 'CITIZEN' })
    assert.equal(Object.hasOwn(getSessionSnapshotForPlayer('dps1', session.id).snapshot, 'dayPhase'), false)
})

// ---------------------------------------------------------------------------
// prepareTribunalVoteResolution / commitTribunalVoteResolution / buildTribunalVoteResolvedPayload
// ---------------------------------------------------------------------------

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

    assert.deepEqual(
        Object.keys(guiltyPayload).sort(),
        ['counts', 'dayIndex', 'defendantUuid', 'executedRole', 'executedUuid', 'gameId', 'outcome', 'phase'],
    )
    assert.deepEqual(Object.keys(guiltyPayload.counts).sort(), ['guilty', 'notGuilty'])
    assert.equal(guiltyPayload.outcome, 'GUILTY')
    assert.equal(guiltyPayload.executedUuid, 'tm3')
    // 처형된 참가자의 role은 스펙상 공개 정보다(판정 6.6/8.2).
    assert.equal(guiltyPayload.executedRole, guiltySetup.session.players.get('tm3').role)
    assert.equal(JSON.stringify(guiltyPayload).includes('ballotSnapshot'), false)
    assert.equal(JSON.stringify(guiltyPayload).includes('voterUuid'), false)
    // role이 새는 유일한 경로는 executedRole(처형자 본인) 하나뿐이다 — 다른 참가자의 role은
    // payload 어디에도 담기지 않는다. executedRole을 지운 사본에 'role' 문자열이 남는지로 확인한다.
    const { executedRole: _executedRole, ...guiltyWithoutExecutedRole } = guiltyPayload
    assert.equal(JSON.stringify(guiltyWithoutExecutedRole).includes('role'), false)

    const notGuiltySetup = setupTribunalReadySession({ uuids: ['tn1', 'tn2', 'tn3'], defendantUuid: 'tn3' })
    castAllVotes(notGuiltySetup.session, { tn1: 'NOT_GUILTY', tn2: 'NOT_GUILTY' })
    const notGuiltyPrepared = prepareTribunalVoteResolution('tn1', notGuiltySetup.session.id, notGuiltySetup.session.dayIndex)
    commitTribunalVoteResolution(notGuiltyPrepared.session, notGuiltyPrepared.resolution)
    const notGuiltyPayload = buildTribunalVoteResolvedPayload(notGuiltySetup.session)

    assert.equal(notGuiltyPayload.outcome, 'NOT_GUILTY')
    // 처형이 없으면 executedUuid와 executedRole이 함께 null이다.
    assert.equal(notGuiltyPayload.executedUuid, null)
    assert.equal(notGuiltyPayload.executedRole, null)
})
