// 2026-11-09 게임 진행 버그 수정 시험: known 1-12·2장 game-core 항목·BE-007
const test = require('node:test')
const assert = require('node:assert/strict')
const gameSession = require('../../game-core/gameSession')
const { makePlayer, makeRoom } = require('../helpers/gameSession.testUtils')
const { buildSessionCandidate } = gameSession.__testables

test.beforeEach(() => gameSession.__resetStateForTests())
test.afterEach(() => gameSession.__resetStateForTests())

function commitRoom(id, uuids, settings = { jokerCount: 1 }) {
    const room = { ...makeRoom({ id, players: uuids.map((u) => makePlayer(u)) }), settings }
    const candidate = buildSessionCandidate(room, { randomFn: () => 0.5 })
    assert.equal(candidate.ok, true, JSON.stringify(candidate))
    gameSession.commitGameSession(candidate.session)
    return candidate.session
}

function playerGameId(uuid) {
    return new Map(gameSession.__getStateSnapshotForTests().playerSession).get(uuid) ?? null
}

test('known 1-12: 판 등록 중 뒤 참가자에서 throw가 나면 앞 참가자도 끝난 옛 판에 그대로 남는다', () => {
    const ended = commitRoom('old-ended', ['a1', 'x1', 'x2'])
    ended.phase = 'ENDED'
    commitRoom('busy-active', ['b1', 'y1', 'y2'])

    // 새 판: a1(끝난 판 소속) 다음에 b1(진행 중 판 소속) → throw
    const room = makeRoom({ id: 'new-room', players: [makePlayer('a1'), makePlayer('b1'), makePlayer('z1')] })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0.5 })
    assert.throws(() => gameSession.commitGameSession(candidate.session), /이미 다른 GameSession/)
    assert.equal(playerGameId('a1'), ended.id, '옛 판 정리가 반쪽으로 일어나지 않음')
})

test('known 2장 write.js: 판 장부에 없는 판을 가리키는 사람 빼기는 TypeError 없이 거절하고 남은 기록을 지운다', () => {
    const session = commitRoom('dangling', ['d1', 'd2', 'd3'])
    gameSession.__testables.__deleteGameSessionOnlyForTests(session.id)
    const result = gameSession.endGameSessionForPlayer('d1', 'PLAYER_LEFT', session.id)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'SESSION_NOT_FOUND')
    assert.equal(playerGameId('d1'), null)
})

test('known 2장 snapshot: 첫 밤 전(1일째 재판)에 끝난 판도 스냅샷에 그날 낮 투표·재판 칸이 실린다', () => {
    const session = commitRoom('ended-day1', ['e1', 'e2', 'e3'])
    for (const uuid of session.players.keys()) gameSession.acknowledgeRoleReveal(uuid, session.id)
    session.dayVoteResolution = {
        gameId: session.id, dayIndex: session.dayIndex, outcome: 'TRIBUNAL', tribunalTargetUuid: 'e1',
        publicVoteCount: 3, publicAbstainCount: 0, revoteExcludedUuids: [],
    }
    session.tribunal = {
        candidateId: 'e1', dayIndex: session.dayIndex, defendantUuid: 'e1', votes: new Map(), resolved: true,
        outcome: 'GUILTY', counts: { guilty: 2, notGuilty: 0 }, executedUuid: 'e1',
    }
    session.phase = 'ENDED'
    assert.equal(session.nightResolution, null)
    const snapshot = gameSession.buildSessionSnapshot(session, 'e2')
    assert.equal(snapshot.dayVoteResolution?.outcome, 'TRIBUNAL')
    assert.equal(snapshot.tribunal?.resolved, true)
})

test('known 2장 progress: 역할 확인 진행 숫자는 기권자(끊김 탈락)를 빼고 센다', () => {
    const session = commitRoom('reveal-progress', ['r1', 'r2', 'r3'])
    gameSession.acknowledgeRoleReveal('r1', session.id)
    // r3 기권 명단에만 있음 (isParticipating 값은 그대로)
    session.forfeitedUuids = new Set(['r3'])
    const progress = gameSession.buildPublicProgress(session)
    assert.deepEqual({ done: progress.doneCount, required: progress.requiredCount }, { done: 1, required: 2 })
})

test('known 2장 constants: 끝난 역할 없음 표는 add로 오염될 수 없다', () => {
    const { EMPTY_COMPLETED_ROLES } = require('../../game-core/phase/night/constants')
    assert.equal(EMPTY_COMPLETED_ROLES.has('JOKER'), false)
    assert.equal(typeof EMPTY_COMPLETED_ROLES.add, 'undefined')
    assert.throws(() => { 'use strict'; EMPTY_COMPLETED_ROLES.extra = 1 })
})

test('known 2장 messages: 밤 역할 채팅 prepare도 속도 제한 칸이 Map이 아니면 거절한다', () => {
    const session = commitRoom('joker-chat', ['j1', 'j2', 'j3'])
    for (const uuid of session.players.keys()) gameSession.acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'NIGHT'
    const joker = [...session.players.values()].find((p) => p.role === 'JOKER')
    session.jokerChatRateLimit = null
    const result = gameSession.prepareJokerChatMessage(joker.uuid, session.id, '안녕')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_CHAT_CHANNEL')
})

test('known 2장 prepare: 광대한테 찍혀 막힌 경비원은 같은 역할 동료의 조사 결과를 받지 않는다', () => {
    const settings = {
        jokerCount: 1, roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 2, WITCH_HUNTER: 0 },
    }
    const session = commitRoom('blocked-guard', ['g1', 'g2', 'g3', 'g4', 'g5'], settings)
    for (const uuid of session.players.keys()) gameSession.acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    const byRole = (role) => [...session.players.values()].filter((p) => p.role === role).map((p) => p.uuid)
    const [joker] = byRole('JOKER')
    const [blockedGuard, freeGuard] = byRole('GUARD')
    const [citizen] = byRole('CITIZEN')

    assert.equal(gameSession.submitNightAction(joker, session.id, blockedGuard).ok, true)
    assert.equal(gameSession.submitNightAction(blockedGuard, session.id, citizen).ok, true)
    assert.equal(gameSession.submitNightAction(freeGuard, session.id, citizen).ok, true)
    const prepared = gameSession.prepareNightResolution(joker, session.id)
    assert.equal(prepared.ok, true, JSON.stringify(prepared))
    assert.equal(prepared.resolution.privateResults.get(freeGuard)?.actionType, 'INVESTIGATE')
    assert.equal(prepared.resolution.privateResults.has(blockedGuard), false)
})

test('BE-007: 산 채로 나간 사람은 같은 편이 이겨도 전적 승리가 아니고, 죽은 뒤 나간 사람은 편 결과 그대로다', () => {
    const session = commitRoom('won-leaver', ['w1', 'w2', 'w3', 'w4', 'w5'])
    const citizens = [...session.players.values()].filter((p) => p.role !== 'JOKER')
    const [leftAlive, diedThenLeft] = citizens
    leftAlive.alive = false
    leftAlive.deathReason = 'DISCONNECT'
    diedThenLeft.alive = false
    diedThenLeft.deathReason = 'EXECUTION'
    session.forfeitedUuids = new Set([leftAlive.uuid, diedThenLeft.uuid])
    session.phase = 'ENDED'
    session.winResult = { winner: 'CITIZEN' }

    const record = gameSession.buildGameResultRecord(session, { completed: true })
    const won = new Map(record.players.map((row) => [row.user_id, row.won]))
    assert.equal(won.get(leftAlive.uuid), false)
    assert.equal(won.get(diedThenLeft.uuid), true)
    const stayed = citizens.slice(2)
    for (const p of stayed) assert.equal(won.get(p.uuid), true)
})

test('BE-036: 지난밤 내 개인 결과(경비원 조사)가 내 스냅샷 self 칸에만 실린다', () => {
    const settings = {
        jokerCount: 1, roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 1, WITCH_HUNTER: 0 },
    }
    const session = commitRoom('guard-snapshot', ['s1', 's2', 's3', 's4', 's5'], settings)
    for (const uuid of session.players.keys()) gameSession.acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    const byRole = (role) => [...session.players.values()].filter((p) => p.role === role).map((p) => p.uuid)
    const [joker] = byRole('JOKER')
    const [guard] = byRole('GUARD')
    const [c1, c2] = byRole('CITIZEN')
    gameSession.submitNightAction(joker, session.id, c1)
    gameSession.submitNightAction(guard, session.id, c2)
    const prepared = gameSession.prepareNightResolution(joker, session.id)
    assert.equal(gameSession.commitNightResolution(prepared.session, prepared.resolution).ok, true)

    const guardSnap = gameSession.buildSessionSnapshot(session, guard)
    assert.equal(guardSnap.self.nightActionResult?.actionType, 'INVESTIGATE')
    assert.equal(guardSnap.self.nightActionResult?.targetId, c2)
    const otherSnap = gameSession.buildSessionSnapshot(session, c2)
    assert.equal(otherSnap.self.nightActionResult, undefined)
    assert.equal(JSON.stringify(otherSnap).includes('INVESTIGATE'), false)
})
