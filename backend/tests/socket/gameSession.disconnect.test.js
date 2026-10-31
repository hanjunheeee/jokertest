process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../../socket/gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../../socket/matchmaking')
const {
    createFakeSocket,
    createFakeIo,
    countingCallback,
    validSettingsPayload,
} = require('../helpers/matchmakingFixtures')
const { assertNoForbiddenPrivateData, collectOtherPlayerRoleSecrets } = require('../helpers/gameSession.testUtils')

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
    gameSessionSocketLayer.__resetStateForTests()
})

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

test('AC-03: 유예 만료 사망 방송은 끊김 전용 공개 계약이고 어디에도 role·밤 사망 원인이 없다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac03' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    assert.equal(session.nightTurnRole, 'DOCTOR')

    disconnectSocket(sockets, doctorUuid)
    beginDisconnectGrace(io, session, doctorUuid, clock)
    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS)

    const eliminated = eliminationBroadcasts(io)
    assert.equal(eliminated.length, 1)
    assert.equal(eliminated[0].roomId, session.channelId)

    const payload = eliminated[0].payload
    assert.deepEqual(Object.keys(payload).sort(), ['dayIndex', 'gameId', 'phase', 'players', 'sfxEvent', 'victimUuid'])
    assert.deepEqual(payload.sfxEvent, {
        eventId: `game:${session.id}:day:${session.dayIndex}:victim:${doctorUuid}:eliminated`,
        gameId: session.id,
        origin: 'live',
    })
    assert.equal(payload.victimUuid, doctorUuid)
    assert.equal(Object.hasOwn(payload, 'deathReveals'), false)
    assert.equal(Object.hasOwn(session, 'nightResult'), false)
    for (const player of payload.players) assert.deepEqual(Object.keys(player).sort(), ['alive', 'uuid'])

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

test('AC-05: 만료 전에 재접속(스냅샷 요청)하면 유예가 취소되고 사망도 중복 진행도 일어나지 않는다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac05-cancel' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)

    disconnectSocket(sockets, doctorUuid)
    beginDisconnectGrace(io, session, doctorUuid, clock)
    assert.notEqual(getDisconnectGraceRun(session.id, doctorUuid), undefined)

    sockets.get(doctorUuid).connected = true
    const { callback, getResponse } = countingCallback()
    handleGetSessionSnapshot(io, sockets.get(doctorUuid), doctorUuid, { gameId: session.id }, callback)
    assert.equal(getResponse().ok, true)
    assert.equal(getDisconnectGraceRun(session.id, doctorUuid), undefined)

    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS * 2)

    assert.equal(session.players.get(doctorUuid).alive, true)
    assert.equal(eliminationBroadcasts(io).length, 0)
    assert.equal(gameSessionCore.isForfeitedFromSession(session.id, doctorUuid), false)
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
    assert.equal(beginDisconnectGrace(io, session, doctorUuid, clock), run)

    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS)

    assert.equal(session.players.get(doctorUuid).alive, false)
    assert.equal(session.players.get(doctorUuid).deathReason, 'DISCONNECT')
    assert.equal(gameSessionCore.isForfeitedFromSession(session.id, doctorUuid), true)
    assert.equal(eliminationBroadcasts(io).length, 1)
    const endedDoctorTurns = turnEventLog(io).filter(([event, role]) => event === 'night_turn_ended' && role === 'DOCTOR')
    assert.equal(endedDoctorTurns.length, 1)
    const turnsAfterExpiry = turnEventLog(io)

    assert.equal(cancelDisconnectGrace(session.id, doctorUuid), false)
    expireDisconnectGrace(run)
    assert.deepEqual(gameSessionCore.commitDisconnectElimination(session, doctorUuid), {
        ok: false,
        code: 'ALREADY_ELIMINATED',
    })

    assert.equal(eliminationBroadcasts(io).length, 1)
    assert.deepEqual(turnEventLog(io), turnsAfterExpiry)
    assert.equal(session.phase, 'NIGHT')
})

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

    session.players.get(survivorUuid).alive = false

    disconnectSocket(sockets, victimUuid)
    const run = beginDisconnectGrace(io, session, victimUuid, clock)
    expireDisconnectGrace(run)

    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })

    const [eliminated] = eliminationBroadcasts(io)
    assert.equal(eliminated.payload.phase, 'ENDED')
    const expectedReveals = [...session.players.values()].map((player) => ({
        uuid: player.uuid,
        nickname: player.nickname,
        role: player.role,
        team: player.role === 'JOKER' ? 'JOKER' : 'CITIZEN',
        alive: player.alive,
        deathReason: player.deathReason ?? null,
    }))
    assert.deepEqual(
        [...eliminated.payload.winResult.reveals].sort((a, b) => a.uuid.localeCompare(b.uuid)),
        [...expectedReveals].sort((a, b) => a.uuid.localeCompare(b.uuid)),
    )
    assert.deepEqual(eliminated.payload.winResult, { winner: 'JOKER', reveals: eliminated.payload.winResult.reveals })
    const victimReveal = eliminated.payload.winResult.reveals.find((reveal) => reveal.uuid === victimUuid)
    assert.equal(victimReveal.alive, false)
    assert.equal(victimReveal.deathReason, 'DISCONNECT')
    const serialized = JSON.stringify(eliminated.payload, (key, value) => (key === 'reveals' ? undefined : value))
    assert.equal(serialized.includes('role'), false)
})

test('AC-08: 유예 만료로 배제된 uuid는 같은 uuid로 돌아와도 스냅샷과 channel 복귀가 모두 거부된다', async () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight({ id: 'ac08' })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()

    disconnectSocket(sockets, doctorUuid)
    const run = beginDisconnectGrace(io, session, doctorUuid, clock)
    expireDisconnectGrace(run)
    assert.equal(gameSessionCore.isForfeitedFromSession(session.id, doctorUuid), true)

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

test('MM1 AC-05: 인게임 차단 게이트는 기존 게임으로의 재접속(resyncSessionRouting)을 막지 않는다', async () => {
    const { session, doctorUuid } = commitFullRoleSessionAtNight({ id: 'mm1-resync' })
    const { io, sockets } = wireSession(session)

    disconnectSocket(sockets, doctorUuid)
    const rejoinSocket = createFakeSocket(doctorUuid)
    io.sockets.sockets.set(rejoinSocket.id, rejoinSocket)

    await gameSessionSocketLayer.resyncSessionRouting(rejoinSocket, doctorUuid)

    assert.equal(rejoinSocket.data.activeGameId, session.id)
    assert.equal(rejoinSocket.rooms.has(session.channelId), true)
    assert.deepEqual(rejoinSocket.emitted, [])

    const { callback, getResponse } = countingCallback()
    matchmaking.__testables.handleCreateRoom(io, rejoinSocket, doctorUuid, validSettingsPayload(), callback)
    assert.equal(getResponse().code, 'ALREADY_IN_GAME')

    assert.equal(rejoinSocket.data.activeGameId, session.id)
    assert.equal(rejoinSocket.rooms.has(session.channelId), true)
    assert.deepEqual(matchmaking.__getStateSnapshotForTests().gameRooms, [])
})

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

test('F-27a(AC-04): 대기 중 수신자가 끊기면 남은 기다림에서 빠지고, 남은 수신자의 완료 ACK만으로 해제된다', async () => {
    const { session, jokerUuid } = commitFullRoleSessionAtNight({ id: 'f27a-ac04-reconnect' })
    const targetUuid = [...session.players.values()].find((p) => p.role === 'CITIZEN').uuid
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, targetUuid), { ok: true })

    const run = gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id)
    assert.ok(run?.wait, '전제: JOKER의 KILL 사건이 실제 연출 대기를 연다')
    assert.equal(run.wait.active, true)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '대기 중에는 다음 역할이 시작되지 않는다')
    const killEventId = [...run.wait.waiting.keys()][0]
    assert.deepEqual([...run.wait.waiting.get(killEventId).keys()].sort(), [jokerUuid, targetUuid].sort())

    disconnectSocket(sockets, targetUuid)
    await gameSessionSocketLayer.onDisconnect(io, sockets.get(targetUuid), targetUuid)

    assert.equal(run.wait, gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id).wait,
        '재평가가 대기 토큰을 새로 만들지 않는다')
    assert.deepEqual([...run.wait.waiting.get(killEventId).keys()], [jokerUuid], '끊긴 대상자가 대기에서 제외됐다')
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '남은 수신자가 아직 완료하지 않아 대기는 계속된다')

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const { callback, getResponse } = countingCallback()
    sockets.get(jokerUuid).trigger('acknowledge_night_action_success', {
        gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId,
    }, callback)
    assert.deepEqual(getResponse(), { ok: true, duplicate: false })

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', '해제 뒤 다음 역할이 정상 시작됐다')
    assert.notEqual(getDisconnectGraceRun(session.id, targetUuid), undefined)
})

test('F-27a(AC-04): 대기의 남은 유일한 수신자까지 끊기면 재접속 없이도 그 자리에서 즉시 해제된다', async () => {
    const { session, jokerUuid } = commitFullRoleSessionAtNight({ id: 'f27a-ac04-all-disconnect' })
    const targetUuid = [...session.players.values()].find((p) => p.role === 'CITIZEN').uuid
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, targetUuid), { ok: true })
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '전제: 실제 연출 대기 중이다')

    disconnectSocket(sockets, targetUuid)
    await gameSessionSocketLayer.onDisconnect(io, sockets.get(targetUuid), targetUuid)
    disconnectSocket(sockets, jokerUuid)
    await gameSessionSocketLayer.onDisconnect(io, sockets.get(jokerUuid), jokerUuid)

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR',
        '남은 수신자가 없으면 완료 ACK 없이도 즉시 해제되고 다음 역할이 시작된다')
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
