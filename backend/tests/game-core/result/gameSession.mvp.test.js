// MVP 간단 점수 시험 (사용자 결정 2026-11-09)
// 직업별 점수·동점·이긴 팀만·0점 판·취소 판·스냅샷 같은 값
const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../../../game-core/gameSession')
const { pickMvp, recordNightMvpPoints, recordTribunalMvpPoints } = require('../../../game-core/result/mvp')
const { buildPublicWinResult } = require('../../../game-core/result/winReveal')
const {
    submitNightAction,
    prepareNightResolution,
    commitNightResolution,
    commitGameSession,
    getSessionSnapshotForPlayer,
} = gameSession
const { buildSessionCandidate } = gameSession.__testables
const {
    makePlayer,
    makeRoom,
    castAllVotes,
    commitAssassinationNight,
    nightSessionWithDoctor,
    commitFullRoleSessionAtNight,
} = require('../../helpers/gameSession.testUtils')

test.beforeEach(() => gameSession.__resetStateForTests())
test.afterEach(() => gameSession.__resetStateForTests())

// 손으로 만든 끝난 판 (자리 순서 = 넣은 순서)
function endedSession(winner, specs, scores = {}) {
    return {
        id: 'mvp-game',
        phase: 'ENDED',
        winResult: { winner },
        players: new Map(specs.map((p) => [p.uuid, { nickname: `n-${p.uuid}`, alive: true, ...p }])),
        mvpScores: new Map(Object.entries(scores)),
    }
}

test('pickMvp: 이긴 팀 사람만 후보, 진 팀 점수가 더 높아도 안 뽑힘', () => {
    const session = endedSession('CITIZEN', [
        { uuid: 'j1', role: 'JOKER', alive: false, deathReason: 'EXECUTION' },
        { uuid: 'c1', role: 'CITIZEN' },
        { uuid: 'd1', role: 'DOCTOR' },
    ], { j1: 5, d1: 1 })
    assert.deepEqual(pickMvp(session), { uuid: 'd1' })
})

test('pickMvp: 점수 같으면 끝까지 산 사람, 그래도 같으면 앞자리', () => {
    const session = endedSession('CITIZEN', [
        { uuid: 'j1', role: 'JOKER', alive: false },
        { uuid: 'c1', role: 'CITIZEN', alive: false, deathReason: 'ASSASSINATION' },
        { uuid: 'c2', role: 'CITIZEN' },
        { uuid: 'c3', role: 'CITIZEN' },
    ], { c1: 2, c2: 2, c3: 2 })
    assert.deepEqual(pickMvp(session), { uuid: 'c2' })
    // 여러 번 불러도 같은 값 (무작위 없음)
    assert.deepEqual(pickMvp(session), pickMvp(session))
})

test('pickMvp: 이긴 팀 전원 0점이어도 산 사람 → 앞자리 순으로 한 명 뽑음', () => {
    const session = endedSession('JOKER', [
        { uuid: 'c1', role: 'CITIZEN', alive: false },
        { uuid: 'j1', role: 'JOKER', alive: false, deathReason: 'EXECUTION' },
        { uuid: 'j2', role: 'JOKER' },
        { uuid: 'c2', role: 'CITIZEN' },
    ])
    assert.deepEqual(pickMvp(session), { uuid: 'j2' })
    // 점수 장부가 아예 없는 판도 똑같이
    delete session.mvpScores
    assert.deepEqual(pickMvp(session), { uuid: 'j2' })
})

test('pickMvp: 산 채로 판 떠난 사람(끊김)은 점수 높아도 빠짐', () => {
    const session = endedSession('CITIZEN', [
        { uuid: 'j1', role: 'JOKER', alive: false, deathReason: 'EXECUTION' },
        { uuid: 'c1', role: 'CITIZEN', alive: false, deathReason: 'DISCONNECT' },
        { uuid: 'c2', role: 'CITIZEN' },
    ], { c1: 3 })
    assert.deepEqual(pickMvp(session), { uuid: 'c2' })
})

test('pickMvp·공개 결과: 승패 없는(취소·무효) 판은 mvp 없음', () => {
    const live = endedSession('CITIZEN', [{ uuid: 'c1', role: 'CITIZEN' }])
    live.winResult = null
    live.phase = 'DAY'
    assert.equal(pickMvp(live), null)
    assert.equal('winResult' in gameSession.buildTerminalFields(live), false)

    const aborted = endedSession('NONE', [{ uuid: 'c1', role: 'CITIZEN' }], { c1: 1 })
    assert.equal(pickMvp(aborted), null)
    assert.equal('mvp' in buildPublicWinResult(aborted), false)
})

test('recordTribunalMvpPoints: 광대 피고한테 유죄 낸 시민만 1점 (무죄·다른 직업·광대 아닌 피고는 0점)', () => {
    const session = endedSession('CITIZEN', [
        { uuid: 'j1', role: 'JOKER' },
        { uuid: 'c1', role: 'CITIZEN' },
        { uuid: 'c2', role: 'CITIZEN' },
        { uuid: 'd1', role: 'DOCTOR' },
    ])
    session.mvpScores = undefined
    recordTribunalMvpPoints(session, {
        defendantUuid: 'j1',
        ballotSnapshot: [
            { voterUuid: 'c1', choice: 'GUILTY' },
            { voterUuid: 'c2', choice: 'NOT_GUILTY' },
            { voterUuid: 'd1', choice: 'GUILTY' },
        ],
    })
    // 시민 피고 재판의 유죄 표는 안 셈
    recordTribunalMvpPoints(session, {
        defendantUuid: 'c2',
        ballotSnapshot: [{ voterUuid: 'c1', choice: 'GUILTY' }],
    })
    assert.deepEqual([...session.mvpScores], [['c1', 1]])
})

test('recordNightMvpPoints: 막힌 경비원·마녀사냥꾼 확인·광대끼리 죽임은 0점', () => {
    const session = endedSession('CITIZEN', [
        { uuid: 'j1', role: 'JOKER' },
        { uuid: 'j2', role: 'JOKER', alive: false },
        { uuid: 'g1', role: 'GUARD' },
        { uuid: 'w1', role: 'WITCH_HUNTER' },
    ])
    session.mvpScores = undefined
    session.nightActions = new Map([['j1', 'j2'], ['g1', 'j1'], ['w1', 'j2']])
    recordNightMvpPoints(session, {
        recoveryStates: new Map([['g1', 'DEATH_CANDIDATE']]),
        events: [],
        roleSteps: [
            { role: 'GUARD', targetId: 'j1', status: 'RESOLVED' },
            { role: 'WITCH_HUNTER', targetId: 'j2', status: 'RESOLVED' },
        ],
    }, 'j2')
    assert.equal(session.mvpScores, undefined)
})

test('밤 확정: 광대가 죽이면 그 광대 1점', () => {
    const { session, jokerUuid, applied } = commitAssassinationNight({ id: 'mvp-kill' })
    assert.equal(applied.ok, true)
    assert.deepEqual([...session.mvpScores], [[jokerUuid, 1]])
})

test('밤 확정: 의사가 광대 노린 사람을 살리면 의사 1점, 광대는 0점', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({ id: 'mvp-heal', playerCount: 6 })
    const target = citizenUuids[0]
    submitNightAction(jokerUuid, session.id, target)
    submitNightAction(doctorUuid, session.id, target)
    const prepared = prepareNightResolution(jokerUuid, session.id)
    assert.equal(prepared.ok, true, prepared.code)
    const applied = commitNightResolution(session, prepared.resolution)
    assert.equal(applied.ok, true)
    assert.equal(applied.victimUuid, null)
    assert.deepEqual([...session.mvpScores], [[doctorUuid, 1]])
})

test('밤 확정: 의사가 엉뚱한 사람 지키면 0점 (실제로 막아낸 경우만)', () => {
    const { session, doctorUuid, jokerUuid, citizenUuids } = nightSessionWithDoctor({ id: 'mvp-miss', playerCount: 6 })
    submitNightAction(jokerUuid, session.id, citizenUuids[0])
    submitNightAction(doctorUuid, session.id, citizenUuids[1])
    const prepared = prepareNightResolution(jokerUuid, session.id)
    commitNightResolution(session, prepared.resolution)
    assert.equal(session.mvpScores.get(doctorUuid), undefined)
    assert.equal(session.mvpScores.get(jokerUuid), 1)
})

test('밤 확정: 경비원이 광대를 조사하면 1점, 광대 아닌 사람 조사는 0점', () => {
    const found = commitFullRoleSessionAtNight({ id: 'mvp-guard' })
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } = found
    submitNightAction(jokerUuid, session.id, null)
    submitNightAction(doctorUuid, session.id, null)
    submitNightAction(guardUuid, session.id, jokerUuid)
    const prepared = prepareNightResolution(jokerUuid, session.id)
    assert.equal(prepared.ok, true, prepared.code)
    commitNightResolution(session, prepared.resolution)
    assert.deepEqual([...session.mvpScores], [[guardUuid, 1]])

    // 다른 판: 시민 조사
    gameSession.__resetStateForTests()
    const other = commitFullRoleSessionAtNight({ id: 'mvp-guard2' })
    submitNightAction(other.jokerUuid, other.session.id, null)
    submitNightAction(other.doctorUuid, other.session.id, null)
    submitNightAction(other.guardUuid, other.session.id, other.citizenUuid)
    commitNightResolution(other.session, prepareNightResolution(other.jokerUuid, other.session.id).resolution)
    assert.equal(other.session.mvpScores, undefined)
    assert.ok(citizenUuid)
})

// 5명(광대 1·시민 4) 재판 판, 피고 = 광대
function tribunalOnJoker(id) {
    const room = makeRoom({ id, players: Array.from({ length: 5 }, (_, i) => makePlayer(`${id}-${i}`)) })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    commitGameSession(candidate.session)
    const session = candidate.session
    const seats = [...session.players.values()]
    const joker = seats.find((p) => p.role === 'JOKER')
    const citizens = seats.filter((p) => p.role !== 'JOKER').map((p) => p.uuid)
    session.phase = 'TRIBUNAL'
    session.dayIndex = 1
    session.dayVoteResolution = {
        gameId: session.id, dayIndex: 1, outcome: 'TRIBUNAL', tribunalTargetUuid: joker.uuid,
        publicVoteCount: 5, publicAbstainCount: 0,
    }
    session.tribunal = { candidateId: joker.uuid, dayIndex: 1, defendantUuid: joker.uuid, votes: new Map() }
    return { session, jokerUuid: joker.uuid, citizens }
}

test('재판으로 끝난 판: 유죄 낸 시민 중 앞자리가 MVP, 종료 방송·재접속 스냅샷이 같은 mvp', () => {
    const { session, jokerUuid, citizens } = tribunalOnJoker('mvp-trib')
    // 맨 앞자리 시민은 무죄 → 0점, 나머지 셋 1점씩 → 동점·전원 생존 → 둘째 시민
    castAllVotes(session, {
        [citizens[0]]: 'NOT_GUILTY',
        [citizens[1]]: 'GUILTY',
        [citizens[2]]: 'GUILTY',
        [citizens[3]]: 'GUILTY',
    })
    const prepared = gameSession.prepareTribunalVoteResolution(citizens[0], session.id, session.dayIndex)
    assert.equal(prepared.ok, true, prepared.code)
    const applied = gameSession.commitTribunalVoteResolution(session, prepared.resolution)
    assert.deepEqual(applied.terminal, { winner: 'CITIZEN' })

    // 판 원본은 { winner } 그대로
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    const broadcast = gameSession.buildTerminalFields(session).winResult
    assert.deepEqual(broadcast.mvp, { uuid: citizens[1] })

    // 재접속 스냅샷: 누가 봐도 같은 값 (진 광대가 봐도)
    for (const viewer of [citizens[0], jokerUuid]) {
        const snap = getSessionSnapshotForPlayer(viewer, session.id)
        assert.equal(snap.ok, true, snap.code)
        assert.deepEqual(snap.snapshot.winResult.mvp, broadcast.mvp)
    }
})
