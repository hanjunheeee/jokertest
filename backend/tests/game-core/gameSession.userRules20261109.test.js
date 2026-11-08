// 2026-11-09 사용자 결정 게임 규칙 시험: 광대 동료 지목 거절·마녀사냥꾼 확인만·동점 뒤 밤·역할 공개 확인 안 기다림·마녀사냥꾼 첫날 밤 쉼
const test = require('node:test')
const assert = require('node:assert/strict')
const gameSession = require('../../game-core/gameSession')
const {
    makePlayer,
    makeRoom,
    commitFullRoleSessionAtNight,
    commitJokerTrioSessionAtNight,
    commitTrioSessionAtDay,
} = require('../helpers/gameSession.testUtils')
const { buildSessionCandidate } = gameSession.__testables

test.beforeEach(() => gameSession.__resetStateForTests())
test.afterEach(() => gameSession.__resetStateForTests())

test('규칙 1: 광대가 동료 광대·자기 자신을 고르면 TARGET_IS_ALLY로 거절되고 기록이 안 남는다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight({ id: 'rule1-ally' })
    const [actor, teammate] = jokerUuids

    assert.deepEqual(gameSession.submitNightAction(actor, session.id, teammate), { ok: false, code: 'TARGET_IS_ALLY' })
    assert.deepEqual(gameSession.submitNightAction(actor, session.id, actor), { ok: false, code: 'TARGET_IS_ALLY' })
    assert.equal(session.nightActions.has(actor), false)

    assert.deepEqual(gameSession.submitNightAction(actor, session.id, citizenUuid), { ok: true, gameId: session.id })
    assert.equal(session.nightActions.get(actor), citizenUuid)
})

test('규칙 2: 마녀사냥꾼은 죽은 사람 역할 확인만 하고 아무도 죽이지 않으며, 공개 사망 원인에 WITCH_HUNTER가 없다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight({ id: 'rule2-wh' })
    session.dayIndex = 2
    const citizens = [...session.players.values()].filter((p) => p.role === 'CITIZEN').map((p) => p.uuid)
    const [deadCitizen] = citizens
    session.players.get(deadCitizen).alive = false
    const aliveBefore = [...session.players.values()].filter((p) => p.alive).map((p) => p.uuid)

    gameSession.submitNightAction(jokerUuid, session.id, null)
    gameSession.submitNightAction(doctorUuid, session.id, null)
    gameSession.submitNightAction(guardUuid, session.id, null)
    assert.deepEqual(gameSession.submitNightAction(witchHunterUuid, session.id, deadCitizen), { ok: true, gameId: session.id })

    const prepared = gameSession.prepareNightResolution(jokerUuid, session.id)
    assert.equal(prepared.ok, true)
    assert.deepEqual(prepared.resolution.privateResults.get(witchHunterUuid), {
        actionType: 'CONFIRM',
        targetId: deadCitizen,
        role: 'CITIZEN',
    })
    const applied = gameSession.commitNightResolution(prepared.session, prepared.resolution)
    assert.equal(applied.victimUuid, null, '마녀사냥꾼 확인으로는 아무도 안 죽음')
    for (const uuid of aliveBefore) assert.equal(session.players.get(uuid).alive, true)
    assert.equal(Object.hasOwn(gameSession.PUBLIC_NIGHT_DEATH_SOURCES, 'WITCH_HUNTER'), false)
})

test('규칙 3: 낮 투표 동점이면 재투표 없이 바로 밤(TIE), 전원 기권도 밤(ABSTAINED)', () => {
    const tie = commitTrioSessionAtDay({ id: 'rule3-tie' })
    gameSession.submitDayVote(tie.uuidA, tie.session.id, tie.uuidB)
    gameSession.submitDayVote(tie.uuidB, tie.session.id, tie.uuidC)
    gameSession.submitDayVote(tie.uuidC, tie.session.id, tie.uuidA)
    const tiePrepared = gameSession.prepareDayVoteResolution(tie.uuidA, tie.session.id, tie.session.dayIndex)
    assert.equal(tiePrepared.resolution.outcome, 'TIE')
    gameSession.commitDayVoteResolution(tiePrepared.session, tiePrepared.resolution)
    assert.equal(tie.session.phase, 'NIGHT')
    const tiePayload = gameSession.buildDayVoteResolvedPayload(tie.session, tiePrepared.resolution)
    assert.equal(tiePayload.round, 1)
    assert.deepEqual(tiePayload.revoteExcludedUuids, [])

    const abstain = commitTrioSessionAtDay({ id: 'rule3-abstain' })
    for (const uuid of [abstain.uuidA, abstain.uuidB, abstain.uuidC]) gameSession.submitDayVote(uuid, abstain.session.id, null)
    const abstainPrepared = gameSession.prepareDayVoteResolution(abstain.uuidA, abstain.session.id, abstain.session.dayIndex)
    assert.equal(abstainPrepared.resolution.outcome, 'ABSTAINED')
    gameSession.commitDayVoteResolution(abstainPrepared.session, abstainPrepared.resolution)
    assert.equal(abstain.session.phase, 'NIGHT')
})

test('규칙 4: 역할 공개 중 나간 사람이 있어도 남은 확인 기록으로 첫 낮으로 넘기지 않는다(마감 타이머만 넘김)', () => {
    const room = makeRoom({ id: 'rule4-leave', players: ['r4a', 'r4b', 'r4c', 'r4d'].map((u) => makePlayer(u)), jokerCount: 1 })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    gameSession.commitGameSession(candidate.session)
    const session = candidate.session
    // 옛 확인 기록이 남아 있어도
    for (const uuid of ['r4b', 'r4c', 'r4d']) session.roleRevealAcks.add(uuid)

    const departed = gameSession.commitParticipantDeparture(session, 'r4a')
    assert.equal(departed.ok, true)
    assert.deepEqual(gameSession.advanceStalledPhase(session), { transitioned: null })
    assert.equal(session.phase, 'ROLE_REVEAL')

    const forced = gameSession.forceCompleteRoleReveal(session)
    assert.equal(forced.transitioned, true)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 1)
})

test('추가 결정: 마녀사냥꾼은 첫날 밤(dayIndex 1) 차례가 빠지고 둘째 밤(dayIndex 2)부터 들어간다', () => {
    const { session, witchHunterUuid } = commitFullRoleSessionAtNight({ id: 'rule-wh-night' })
    // 첫 낮이 dayIndex 1이라 그 뒤 첫 밤도 dayIndex 1
    session.dayIndex = 1
    assert.deepEqual([...gameSession.getNightTurnOrder(session)], ['JOKER', 'DOCTOR', 'GUARD'])
    assert.equal(gameSession.getAliveActorUuidsForRole(session, 'WITCH_HUNTER').includes(witchHunterUuid), false)

    session.dayIndex = 2
    assert.deepEqual([...gameSession.getNightTurnOrder(session)], ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    assert.equal(gameSession.getAliveActorUuidsForRole(session, 'WITCH_HUNTER').includes(witchHunterUuid), true)
})
