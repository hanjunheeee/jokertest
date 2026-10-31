const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const { evaluateWinCondition } = gameSession.__testables
const {
    prepareNightResolution,
    commitNightResolution,
    prepareDayVoteResolution,
    commitDayVoteResolution,
    prepareTribunalVoteResolution,
    commitTribunalVoteResolution,
    prepareJokerChatMessage,
    commitJokerChatMessage,
} = gameSession
const { makeWinConditionSession, nightSessionOf3, sourcedNightResolution } = require('./gameSession.testUtils')

test.beforeEach(() => {
    gameSession.__resetStateForTests()
})
test.afterEach(() => {
    gameSession.__resetStateForTests()
})

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

test('canonical 종료 상태: 승리 확정 시 phase는 ENDED, winResult는 {winner} 단일 키이며, 재평가·중복 판정 요청이 canonical winResult를 교체·변형하지 않는다', () => {
    const session = nightSessionOf3({ id: 'room-canonical-terminal' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: jokerUuid })

    const first = commitNightResolution(session, resolution)

    assert.deepEqual(first, { ok: true, victimUuid: jokerUuid, terminal: { winner: 'CITIZEN' } })
    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.deepEqual(Object.keys(session.winResult), ['winner'])
    const canonicalWinResult = session.winResult

    const reevaluated = evaluateWinCondition(session)
    assert.deepEqual(reevaluated, { winner: 'CITIZEN' })
    assert.equal(session.winResult, canonicalWinResult)

    const duplicatePrepare = prepareNightResolution(jokerUuid, session.id)
    assert.deepEqual(duplicatePrepare, { ok: false, code: 'GAME_ALREADY_ENDED' })

    const forgedResolution = { gameId: session.id, dayIndex: session.dayIndex, pendingEliminationTargetId: null, privateResults: new Map(), resolved: true }
    const duplicateCommit = commitNightResolution(session, forgedResolution)
    assert.deepEqual(duplicateCommit, { ok: false, code: 'GAME_ALREADY_ENDED' })

    assert.equal(session.winResult, canonicalWinResult)
    assert.deepEqual(session.winResult, { winner: 'CITIZEN' })
    assert.equal(session.phase, 'ENDED')
})

test('종료 후 mutation 차단: 8개 prepare/commit 진입점 전부가 GAME_ALREADY_ENDED로 거부되고 세션·registry 상태가 매 호출마다 불변이다', () => {
    const session = nightSessionOf3({ id: 'room-post-end-lock' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const aliveUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    const resolution = sourcedNightResolution(session, { pendingEliminationTargetId: jokerUuid })
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

test('공개 winResult: ENDED이면 buildTerminalFields·스냅샷의 winResult에 전원 reveals(uuid·nickname·role·team·alive·deathReason)가 실리고, canonical session.winResult는 { winner } 한 키다', () => {
    const session = nightSessionOf3({ id: 'room-public-win-result' })
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    assert.equal(commitNightResolution(session, sourcedNightResolution(session, { pendingEliminationTargetId: jokerUuid })).ok, true)
    assert.equal(session.phase, 'ENDED')
    const fields = gameSession.buildTerminalFields(session)
    assert.deepEqual(Object.keys(session.winResult), ['winner'])
    assert.equal(fields.winResult.winner, session.winResult.winner)
    assert.equal(fields.winResult.reveals.length, session.players.size)
    for (const reveal of fields.winResult.reveals) {
        assert.deepEqual(Object.keys(reveal).sort(), ['alive', 'deathReason', 'nickname', 'role', 'team', 'uuid'])
        const player = session.players.get(reveal.uuid)
        assert.equal(reveal.role, player.role)
        assert.equal(reveal.nickname, player.nickname)
        assert.equal(reveal.alive, player.alive)
        assert.equal(reveal.team, player.role === 'JOKER' ? 'JOKER' : 'CITIZEN')
        if (player.alive) assert.equal(reveal.deathReason, null)
    }
    const anyUuid = [...session.players.keys()][0]
    const snapshot = gameSession.getSessionSnapshotForPlayer(anyUuid, session.id)
    assert.ok(snapshot.ok)
    assert.equal(snapshot.snapshot.winResult.reveals.length, session.players.size)
    fields.winResult.reveals[0].role = 'TAMPERED'
    assert.notEqual(session.players.get(fields.winResult.reveals[0].uuid).role, 'TAMPERED')
})
