const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../socket/gameSession')
const gameSessionCore = require('../game-core/gameSession')
const matchmaking = require('../socket/matchmaking')
const { createFakeSocket, createFakeIo, countingCallback } = require('../socket/__tests__/testHelpers/matchmakingFixtures')
const { assertNoForbiddenPrivateData, collectOtherPlayerRoleSecrets } = require('../game-core/__tests__/gameSession.testUtils')

const {
    startNightTurnSequence,
    stopNightTurnSequence,
    startDayPhaseTimer,
    beginDisconnectGrace,
    cancelDisconnectGrace,
    expireDisconnectGrace,
    getDisconnectGraceRun,
    handleGetSessionSnapshot,
} = gameSessionSocketLayer.__testables

/**
 * 재접속 유예(disconnect grace) 전용 테스트 파일. 이 파일의 모든 시나리오는 "끊긴 참가자가
 * 돌아오지 않은 채 시간이 흘렀다"를 결정적으로 재현해야 하므로, 실시간 타이머 대신 수동
 * 시계(createManualClock — gameSession.nightTurns.test.js와 같은 계약)만 쓴다.
 */

/** gameSession.test.js/nightTurns.test.js의 동명 헬퍼와 계약이 같다(socket.id === `sock-${uuid}` 규약). */
function createConventionFollowingRegistry() {
    const overrides = new Map()
    return new Proxy(overrides, {
        get(target, prop, receiver) {
            if (prop === 'get') {
                return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
            }
            return Reflect.get(target, prop, receiver)
        },
    })
}

test.beforeEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
})
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    // 유예 타이머까지 함께 해제한다 — 수동 시계라 실제로 새어나가지는 않지만, 다음 테스트가
    // 이전 테스트의 run을 상속하지 않게 하려는 것이 목적이다.
    gameSessionSocketLayer.__resetStateForTests()
})

/** nightTurns.test.js의 동명 헬퍼와 계약이 같다(만료 시각이 이른 타이머부터, 동시각이면 등록 순서대로). */
function createManualClock(startMs = 1_000_000) {
    let now = startMs
    let nextId = 1
    const timers = new Map()
    return {
        now: () => now,
        nowFn: () => now,
        setTimeoutFn(fn, delayMs) {
            const id = nextId++
            timers.set(id, { at: now + Math.max(0, delayMs), fn })
            return id
        },
        clearTimeoutFn(id) {
            timers.delete(id)
        },
        advance(ms) {
            const target = now + ms
            for (;;) {
                let dueId = null
                let due = null
                for (const [id, timer] of timers) {
                    if (timer.at <= target && (due === null || timer.at < due.at)) {
                        dueId = id
                        due = timer
                    }
                }
                if (due === null) break
                timers.delete(dueId)
                now = due.at
                due.fn()
            }
            now = target
        },
        pendingCount: () => timers.size,
    }
}

function makePlayer(uuid, nickname = `nick-${uuid}`) {
    return { uuid, nickname, isReady: true }
}

function makeRoom({ id, players, jokerCount = 1 }) {
    return { id, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount } }
}

/** 전원 역할 확인 후 지정한 밤으로 되돌린다(nightTurns.test.js의 동명 헬퍼와 같은 계약). */
function ackAllAndRewindToNight(session, dayIndex) {
    for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'NIGHT'
    session.dayIndex = dayIndex
    session.nightActions = new Map()
    session.nightResolution = null
    session.dayVotes = new Map()
    session.dayVoteResolution = null
    session.tribunal = null
}

/**
 * playerCount=10·jokerCount=1 세션을 밤(dayIndex 2 — WITCH_HUNTER까지 활동 가능)으로 만든다.
 * 인원이 넉넉해 한 명이 끊김으로 죽어도 어느 진영도 승리하지 않는다 — "다른 참가자의 게임이
 * 그대로 이어진다"를 검증하려면 사망이 곧 종료가 되지 않는 구성이어야 한다.
 */
function commitFullRoleSessionAtNight({ id = 'room-grace', dayIndex = 2 } = {}) {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`gp-${id}-${i}`))
    const candidate = gameSessionCore.__testables.buildSessionCandidate(makeRoom({ id, players }), {
        randomFn: () => 0.999,
    })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToNight(session, dayIndex)
    const byRole = (role) => [...session.players.values()].find((p) => p.role === role).uuid
    return { session, jokerUuid: byRole('JOKER'), doctorUuid: byRole('DOCTOR') }
}

/** playerCount=3·jokerCount=1 세션을 첫 밤으로 만든다 — 비-JOKER 한 명이 죽으면 곧바로 JOKER 승리가 성립하는 구성. */
function commitTrioSessionAtNight({ id = 'room-grace-win' } = {}) {
    const players = ['a', 'b', 'c'].map((suffix) => makePlayer(`gw-${id}-${suffix}`))
    const candidate = gameSessionCore.__testables.buildSessionCandidate(makeRoom({ id, players }), { randomFn: () => 0 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToNight(session, 0)
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const nonJokerUuids = [...session.players.values()].filter((p) => p.role !== 'JOKER').map((p) => p.uuid)
    return { session, jokerUuid, nonJokerUuids }
}

/** 참가자 전원의 fake socket을 채널에 넣고 배선까지 마친 io를 돌려준다. */
function wireSession(session) {
    const sockets = new Map()
    const io = createFakeIo([])
    for (const uuid of session.players.keys()) {
        const socket = createFakeSocket(uuid)
        socket.rooms.add(session.channelId)
        socket.data.activeGameId = session.id
        io.sockets.sockets.set(socket.id, socket)
        gameSessionSocketLayer.registerGameHandlers(io, socket, uuid)
        sockets.set(uuid, socket)
    }
    const submit = (uuid, targetId) => {
        const { callback, getResponse } = countingCallback()
        sockets.get(uuid).trigger('submit_night_action', { gameId: session.id, targetId }, callback)
        return getResponse()
    }
    return { io, sockets, submit }
}

/** 그 uuid의 소켓을 "끊긴" 상태로 만든다 — isUuidConnected가 보는 유일한 신호다. */
function disconnectSocket(sockets, uuid) {
    sockets.get(uuid).connected = false
}

function eliminationBroadcasts(io) {
    return io.broadcasts.filter((b) => b.event === 'player_eliminated')
}

function turnEventLog(io) {
    return io.broadcasts
        .filter((b) => b.event === 'night_turn_started' || b.event === 'night_turn_ended')
        .map((b) => [b.event, b.payload.role])
}

// ---------------------------------------------------------------------------
// AC-03 — 끊김 사망 공개 메시지에 role이 없다
// ---------------------------------------------------------------------------

test('AC-03: 유예 만료 사망 방송은 끊김 전용 공개 계약이고 어디에도 role·밤 사망 원인이 없다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac03' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null) // JOKER 턴을 닫아 DOCTOR 턴으로 넘긴다
    assert.equal(session.nightTurnRole, 'DOCTOR')

    disconnectSocket(sockets, doctorUuid)
    beginDisconnectGrace(io, session, doctorUuid, clock)
    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS)

    const eliminated = eliminationBroadcasts(io)
    assert.equal(eliminated.length, 1)
    assert.equal(eliminated[0].roomId, session.channelId)

    const payload = eliminated[0].payload
    assert.deepEqual(Object.keys(payload).sort(), ['dayIndex', 'gameId', 'phase', 'players', 'victimUuid'])
    assert.equal(payload.victimUuid, doctorUuid)
    assert.equal(Object.hasOwn(payload, 'deathReveals'), false)
    assert.equal(Object.hasOwn(session, 'nightResult'), false)
    for (const player of payload.players) assert.deepEqual(Object.keys(player).sort(), ['alive', 'uuid'])

    // role/team/executedRole 같은 비밀 키도, 다른 참가자의 role 값도 payload 어디에도 없다.
    assert.equal(JSON.stringify(payload).includes('role'), false)
    assertNoForbiddenPrivateData(payload, collectOtherPlayerRoleSecrets(session, doctorUuid))
})

test('AC-02: 자기 NIGHT 턴 도중 끊기면 새 제한시간이 아니라 이미 방송된 deadline의 남은 시간만 받는다', () => {
    const { session, jokerUuid } = commitFullRoleSessionAtNight({ id: 'ac02-deadline' })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, turnDurationMs: 1_000, randomFn: () => 0.5 })
    assert.equal(session.nightTurnRole, 'JOKER')
    clock.advance(400)

    disconnectSocket(sockets, jokerUuid)
    const grace = beginDisconnectGrace(io, session, jokerUuid, clock)
    assert.equal(grace.deadline, clock.now() + 600)

    clock.advance(599)
    assert.equal(session.players.get(jokerUuid).alive, true)
    clock.advance(1)
    assert.equal(session.players.get(jokerUuid).alive, false)
    assert.equal(eliminationBroadcasts(io).length, 1)
})

// ---------------------------------------------------------------------------
// AC-05 — 재접속과 만료의 경합
// ---------------------------------------------------------------------------

test('AC-05: 만료 전에 재접속(스냅샷 요청)하면 유예가 취소되고 사망도 중복 진행도 일어나지 않는다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac05-cancel' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)

    disconnectSocket(sockets, doctorUuid)
    beginDisconnectGrace(io, session, doctorUuid, clock)
    assert.notEqual(getDisconnectGraceRun(session.id, doctorUuid), undefined)

    // 같은 tick에 돌아온다 — 새 소켓이 붙고(연결 복구) 곧바로 스냅샷을 요청한다.
    sockets.get(doctorUuid).connected = true
    const { callback, getResponse } = countingCallback()
    handleGetSessionSnapshot(io, sockets.get(doctorUuid), doctorUuid, { gameId: session.id }, callback)
    assert.equal(getResponse().ok, true)
    // 취소는 "연결돼 있어서 죽지 않았다"가 아니라 유예 자체가 사라졌다는 뜻이다.
    assert.equal(getDisconnectGraceRun(session.id, doctorUuid), undefined)

    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS * 2)

    assert.equal(session.players.get(doctorUuid).alive, true)
    assert.equal(eliminationBroadcasts(io).length, 0)
    assert.equal(gameSessionCore.isForfeitedFromSession(session.id, doctorUuid), false)
    // DOCTOR 턴은 정확히 한 번만 닫힌다(기권으로 끝난 뒤 다음 턴으로 넘어간다).
    assert.equal(turnEventLog(io).filter(([event, role]) => event === 'night_turn_ended' && role === 'DOCTOR').length, 1)
})

test('AC-05: 만료가 먼저 도착하면 사망은 정확히 한 번이고, 뒤늦은 취소·재만료·재커밋은 전부 no-op이다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac05-expire' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)

    disconnectSocket(sockets, doctorUuid)
    const run = beginDisconnectGrace(io, session, doctorUuid, clock)
    // 같은 (세션, 참가자)에 유예를 다시 걸어도 run은 하나뿐이다(낡은 소켓의 지연 disconnect).
    assert.equal(beginDisconnectGrace(io, session, doctorUuid, clock), run)

    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS)

    assert.equal(session.players.get(doctorUuid).alive, false)
    assert.equal(gameSessionCore.isForfeitedFromSession(session.id, doctorUuid), true)
    assert.equal(eliminationBroadcasts(io).length, 1)
    const endedDoctorTurns = turnEventLog(io).filter(([event, role]) => event === 'night_turn_ended' && role === 'DOCTOR')
    assert.equal(endedDoctorTurns.length, 1)
    const turnsAfterExpiry = turnEventLog(io)

    // 뒤늦게 도착한 재접속 취소와, 이미 떨어져 나간 run의 만료 콜백은 둘 다 아무 것도 하지 않는다.
    assert.equal(cancelDisconnectGrace(session.id, doctorUuid), false)
    expireDisconnectGrace(run)
    // core 계약도 같은 결과를 구조적으로 보장한다 — 이미 죽은 참가자는 다시 죽지 않는다.
    assert.deepEqual(gameSessionCore.commitDisconnectElimination(session, doctorUuid), {
        ok: false,
        code: 'ALREADY_ELIMINATED',
    })

    assert.equal(eliminationBroadcasts(io).length, 1)
    assert.deepEqual(turnEventLog(io), turnsAfterExpiry)
    assert.equal(session.phase, 'NIGHT') // 남은 참가자의 밤은 그대로 이어진다
})

// ---------------------------------------------------------------------------
// AC-01/AC-04/AC-08 — 세션 유지 · 승리 종료 · 배제된 uuid 거부
// ---------------------------------------------------------------------------

test('AC-01: 진행 중(NIGHT) 세션에서 한 명이 끊겨도 세션은 종료되지 않고 유예만 걸린다', async () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac01' })
    const { io, sockets } = wireSession(session)

    disconnectSocket(sockets, doctorUuid)
    await gameSessionSocketLayer.onDisconnect(io, sockets.get(doctorUuid), doctorUuid)

    assert.equal(io.broadcasts.filter((b) => b.event === 'game_ended').length, 0)
    assert.notEqual(getDisconnectGraceRun(session.id, doctorUuid), undefined)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.players.get(doctorUuid).alive, true)

    const snapshot = gameSessionCore.__getStateSnapshotForTests()
    assert.equal(snapshot.gameSessions.some(([gameId]) => gameId === session.id), true)
    // 남은 참가자는 그대로 세션에 묶여 있고 채널에서 쫓겨나지도 않는다.
    for (const [uuid, socket] of sockets) {
        assert.equal(socket.rooms.has(session.channelId), true, `${uuid}가 채널에서 제거됐다`)
        assert.equal(snapshot.playerSession.some(([playerUuid]) => playerUuid === uuid), true)
    }
})

test('AC-04: 마지막 비-JOKER가 유예 만료로 사망하면 그 자리에서 JOKER 승리로 게임이 끝난다', () => {
    const { session, nonJokerUuids } = commitTrioSessionAtNight({ id: 'ac04' })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()
    const [victimUuid, survivorUuid] = nonJokerUuids

    // 한 명은 이미 밤 이전에 죽어 있는 상태로 둔다 — 남은 비-JOKER가 끊기면 곧바로 동수가 된다.
    session.players.get(survivorUuid).alive = false

    disconnectSocket(sockets, victimUuid)
    const run = beginDisconnectGrace(io, session, victimUuid, clock)
    expireDisconnectGrace(run)

    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })

    const [eliminated] = eliminationBroadcasts(io)
    assert.equal(eliminated.payload.phase, 'ENDED')
    assert.deepEqual(eliminated.payload.winResult, { winner: 'JOKER' })
    assert.equal(JSON.stringify(eliminated.payload).includes('role'), false)
})

test('AC-08: 유예 만료로 배제된 uuid는 같은 uuid로 돌아와도 스냅샷과 channel 복귀가 모두 거부된다', async () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac08' })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()

    disconnectSocket(sockets, doctorUuid)
    const run = beginDisconnectGrace(io, session, doctorUuid, clock)
    expireDisconnectGrace(run)
    assert.equal(gameSessionCore.isForfeitedFromSession(session.id, doctorUuid), true)

    // 같은 uuid로 다시 접속한다(새 소켓, 같은 socket.id 규약).
    const rejoinSocket = createFakeSocket(doctorUuid)
    io.sockets.sockets.set(rejoinSocket.id, rejoinSocket)

    await gameSessionSocketLayer.resyncSessionRouting(rejoinSocket, doctorUuid)
    assert.equal(rejoinSocket.rooms.has(session.channelId), false)
    assert.equal(rejoinSocket.data.activeGameId, undefined)

    const { callback, getResponse } = countingCallback()
    handleGetSessionSnapshot(io, rejoinSocket, doctorUuid, { gameId: session.id }, callback)
    const response = getResponse()
    assert.equal(response.ok, false)
    assert.equal(response.code, 'FORFEITED_FROM_SESSION')
    assert.equal(Object.hasOwn(response, 'self'), false)
    assert.equal(Object.hasOwn(response, 'players'), false)
})

// ---------------------------------------------------------------------------
// AC-06 — 새로고침 복원(기존 스냅샷 계약으로 phase/self 복원, 채널은 S4 selector가 유도)
// ---------------------------------------------------------------------------

test('AC-06: 재접속 스냅샷은 phase·자기 역할·생존 상태를 복원하고 중복 chatChannels 계약을 만들지 않는다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac06' })
    const { io, sockets } = wireSession(session)

    const nightResponse = (() => {
        const { callback, getResponse } = countingCallback()
        handleGetSessionSnapshot(io, sockets.get(doctorUuid), doctorUuid, { gameId: session.id }, callback)
        return getResponse()
    })()

    assert.equal(nightResponse.ok, true)
    assert.equal(nightResponse.phase, 'NIGHT')
    assert.equal(nightResponse.self.role, 'DOCTOR')
    assert.equal(nightResponse.players.find(({ uuid }) => uuid === doctorUuid).isAlive, true)
    assert.equal(Object.hasOwn(nightResponse.self, 'chatChannels'), false)

    gameSessionCore.__testables.enterDayPhase(session)
    const dayResponse = (() => {
        const { callback, getResponse } = countingCallback()
        handleGetSessionSnapshot(io, sockets.get(doctorUuid), doctorUuid, { gameId: session.id }, callback)
        return getResponse()
    })()

    assert.equal(dayResponse.phase, 'DAY')
    assert.equal(dayResponse.self.role, 'DOCTOR')
    assert.equal(Object.hasOwn(dayResponse.self, 'chatChannels'), false)
})

test('AC-02: NIGHT의 다른 역할 중 끊긴 참가자는 역할 턴 변화가 아니라 NIGHT→DAY 경계에서 만료한다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac02-night-boundary' })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, turnDurationMs: 1_000, randomFn: () => 0.5 })
    assert.equal(session.nightTurnRole, 'JOKER')
    disconnectSocket(sockets, doctorUuid)
    const run = beginDisconnectGrace(io, session, doctorUuid, clock)
    assert.equal(run.timerId, null)

    clock.advance(1_000)
    assert.equal(session.players.get(doctorUuid).alive, true)
    stopNightTurnSequence(session.id)
    gameSessionCore.__testables.enterDayPhase(session)
    startDayPhaseTimer(io, session, { ...clock, discussionDurationMs: 1_000, voteDurationMs: 1_000 })
    assert.equal(session.players.get(doctorUuid).alive, false)
})

test('AC-02: DAY 하위 구간에서는 살아 있고 DAY→TRIBUNAL top-level 경계에서만 만료한다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac02-day-boundary' })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()
    gameSessionCore.__testables.enterDayPhase(session)

    disconnectSocket(sockets, doctorUuid)
    const run = beginDisconnectGrace(io, session, doctorUuid, clock)
    assert.equal(run.timerId, null)
    gameSessionCore.enterDayVotePhase(session)
    startDayPhaseTimer(io, session, { ...clock, discussionDurationMs: 1_000, voteDurationMs: 1_000 })
    assert.equal(session.players.get(doctorUuid).alive, true)

    session.phase = 'TRIBUNAL'
    startDayPhaseTimer(io, session, clock)
    assert.equal(session.players.get(doctorUuid).alive, false)
})

test('AC-02: ROLE_REVEAL과 TRIBUNAL도 각각 다음 top-level phase 진입 경계까지 유예한다', () => {
    const clock = createManualClock()

    const reveal = commitFullRoleSessionAtNight({ id: 'ac02-reveal-boundary' })
    const revealWiring = wireSession(reveal.session)
    reveal.session.phase = 'ROLE_REVEAL'
    disconnectSocket(revealWiring.sockets, reveal.doctorUuid)
    assert.equal(beginDisconnectGrace(revealWiring.io, reveal.session, reveal.doctorUuid, clock).timerId, null)
    gameSessionCore.__testables.enterDayPhase(reveal.session)
    startDayPhaseTimer(revealWiring.io, reveal.session, { ...clock, discussionDurationMs: 1_000, voteDurationMs: 1_000 })
    assert.equal(reveal.session.players.get(reveal.doctorUuid).alive, false)

    const tribunal = commitFullRoleSessionAtNight({ id: 'ac02-tribunal-boundary' })
    const tribunalWiring = wireSession(tribunal.session)
    tribunal.session.phase = 'TRIBUNAL'
    disconnectSocket(tribunalWiring.sockets, tribunal.doctorUuid)
    assert.equal(beginDisconnectGrace(tribunalWiring.io, tribunal.session, tribunal.doctorUuid, clock).timerId, null)
    tribunal.session.phase = 'NIGHT'
    startNightTurnSequence(tribunalWiring.io, tribunal.session, { ...clock, turnDurationMs: 1_000, randomFn: () => 0.5 })
    assert.equal(tribunal.session.players.get(tribunal.doctorUuid).alive, false)
})

test('AC-07: 같은 역할 생존자가 2→1이 되면 남은 한 명의 기존 제출만으로 역할 턴 완료가 재평가된다', () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac07-resolver' })
    const secondDoctor = [...session.players.values()].find((player) => player.role === 'CITIZEN').uuid
    session.players.get(secondDoctor).role = 'DOCTOR'

    assert.equal(gameSessionCore.submitNightAction(doctorUuid, session.id, null).ok, true)
    assert.equal(gameSessionCore.isRoleTurnComplete(session, 'DOCTOR'), false)
    const applied = gameSessionCore.commitDisconnectElimination(session, secondDoctor)
    assert.equal(applied.ok, true)
    assert.equal(gameSessionCore.isRoleTurnComplete(session, 'DOCTOR'), true)
})
