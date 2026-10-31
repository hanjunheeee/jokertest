process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../../socket/gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../../socket/matchmaking')
const { createFakeSocket, createFakeIo, countingCallback } = require('../helpers/matchmakingFixtures')

const { startDayPhaseTimer, stopDayPhaseTimer } = gameSessionSocketLayer.__testables
const { DAY_PHASES, DAY_DISCUSSION_DURATION_MS, DAY_VOTE_DURATION_MS } = gameSessionCore

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
    gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests(async () => ({ recorded: true }))
})
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests()
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

function makePlayer(uuid) {
    return { uuid, nickname: `nick-${uuid}`, isReady: true }
}

function commitSessionAtDayDiscussion({ id = 'room-day', playerCount = 4, settings = {} } = {}) {
    const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`dp-${id}-${i}`))
    const room = {
        id,
        players: new Map(players.map((p) => [p.uuid, p])),
        settings: { jokerCount: 1, ...settings },
    }
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0.999 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)

    assert.equal(session.phase, 'DAY')
    assert.equal(gameSessionCore.getDayPhase(session), DAY_PHASES.DISCUSSION)
    return { session, uuids: [...session.players.keys()] }
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
    const castVote = async (uuid, targetId) => {
        const { callback, getResponse } = countingCallback()
        sockets.get(uuid).trigger('cast_day_vote', { gameId: session.id, targetId }, callback)
        await new Promise((resolve) => setImmediate(resolve))
        return getResponse()
    }
    const readyForVote = (uuid) => {
        const { callback, getResponse } = countingCallback()
        sockets.get(uuid).trigger('ready_for_day_vote', { gameId: session.id }, callback)
        return getResponse()
    }
    return { io, sockets, castVote, readyForVote }
}

function assertVoteAccepted(response) {
    assert.deepEqual(Object.keys(response).sort(), ['ok', 'sfxEvent'])
    assert.equal(response.ok, true)
    assert.equal(typeof response.sfxEvent.eventId, 'string')
    return response
}

function directEmits(sockets, event) {
    const received = []
    for (const [uuid, socket] of sockets) {
        for (const entry of socket.emitted) {
            if (entry.event === event && entry.broadcastTo === undefined) received.push([uuid, entry.payload])
        }
    }
    return received
}

function channelBroadcasts(io, event) {
    return io.broadcasts.filter((b) => b.event === event)
}

test('day timer: 토론 제한시간 직전에는 토론이 유지되고, 만료되는 순간 DAY_VOTE로 전환된다', () => {
    const { session } = commitSessionAtDayDiscussion({ settings: { dayDiscussionTime: 90, dayVoteTime: 30 } })
    const { io } = wireSession(session)
    const clock = createManualClock()

    startDayPhaseTimer(io, session, { ...clock })

    clock.advance(90_000 - 1)
    assert.equal(gameSessionCore.getDayPhase(session), DAY_PHASES.DISCUSSION, '만료 직전에는 아직 토론이다')
    assert.deepEqual(channelBroadcasts(io, 'day_phase_changed'), [])

    clock.advance(1)
    assert.equal(session.phase, 'DAY')
    assert.equal(gameSessionCore.getDayPhase(session), DAY_PHASES.VOTE)

    const broadcasts = channelBroadcasts(io, 'day_phase_changed')
    assert.equal(broadcasts.length, 1, '자동 전환도 수동 전환과 마찬가지로 정확히 한 번만 방송된다')
    assert.equal(broadcasts[0].roomId, session.channelId)
    assert.deepEqual(broadcasts[0].payload, {
        gameId: session.id,
        dayIndex: session.dayIndex,
        dayPhase: DAY_PHASES.VOTE,
        round: 1,
    })
})

test('day timer: 토론 시간이 설정되지 않은 세션은 canonical 기본 상수를 쓴다', () => {
    const { session } = commitSessionAtDayDiscussion({ id: 'room-day-default' })
    const { io } = wireSession(session)
    const clock = createManualClock()

    startDayPhaseTimer(io, session, { ...clock })

    clock.advance(DAY_DISCUSSION_DURATION_MS - 1)
    assert.equal(gameSessionCore.getDayPhase(session), DAY_PHASES.DISCUSSION)
    clock.advance(1)
    assert.equal(gameSessionCore.getDayPhase(session), DAY_PHASES.VOTE)

    clock.advance(DAY_VOTE_DURATION_MS - 1)
    assert.equal(session.dayVoteResolution, null)
    clock.advance(1)
    assert.equal(session.dayVoteResolution !== null, true)
})

test('day timer: 자동 전환 직후 투표 제한시간이 이어서 걸린다', () => {
    const { session } = commitSessionAtDayDiscussion({ settings: { dayDiscussionTime: 60, dayVoteTime: 30 } })
    const { io } = wireSession(session)
    const clock = createManualClock()

    startDayPhaseTimer(io, session, { ...clock })
    clock.advance(60_000)

    assert.equal(clock.pendingCount(), 1, '투표 제한시간이 예약돼 있다')
    clock.advance(30_000 - 1)
    assert.equal(session.phase, 'DAY', '투표 만료 직전에는 아직 낮이다')
    clock.advance(1)
    assert.notEqual(gameSessionCore.getDayPhase(session), DAY_PHASES.DISCUSSION)
    assert.equal(session.dayVoteResolution !== null, true, '투표 제한시간이 만료돼 판정까지 끝났다')
})

test('day timer: 전원 준비로 투표가 조기 개시되면 남은 토론 시간은 버려지고 투표 시간이 걸린다', () => {
    const { session, uuids } = commitSessionAtDayDiscussion({ settings: { dayDiscussionTime: 150, dayVoteTime: 30 } })
    const { io, readyForVote } = wireSession(session)
    const clock = createManualClock()

    startDayPhaseTimer(io, session, { ...clock })
    for (const uuid of uuids) assert.deepEqual(readyForVote(uuid).ok, true)

    assert.equal(gameSessionCore.getDayPhase(session), DAY_PHASES.VOTE)
    clock.advance(30_000 - 1)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayVoteResolution, null)
    clock.advance(1)
    assert.equal(session.dayVoteResolution !== null, true)
})

test('day timer: 낮이 아닌 세션에는 타이머를 걸지 않고 남아있던 run도 정리한다', () => {
    const { session } = commitSessionAtDayDiscussion({ id: 'room-day-not-day' })
    const { io } = wireSession(session)
    const clock = createManualClock()

    startDayPhaseTimer(io, session, { ...clock })
    assert.equal(clock.pendingCount(), 1)

    session.phase = 'NIGHT'
    startDayPhaseTimer(io, session, { ...clock })
    assert.equal(clock.pendingCount(), 0, '낮을 벗어난 세션의 타이머는 남지 않는다')
})

test('day timer: stopDayPhaseTimer가 예약된 만료를 해제해 전환이 일어나지 않는다', () => {
    const { session } = commitSessionAtDayDiscussion({ id: 'room-day-stop' })
    const { io } = wireSession(session)
    const clock = createManualClock()

    startDayPhaseTimer(io, session, { ...clock })
    stopDayPhaseTimer(session.id)

    clock.advance(DAY_DISCUSSION_DURATION_MS * 5)
    assert.equal(gameSessionCore.getDayPhase(session), DAY_PHASES.DISCUSSION)
    assert.equal(clock.pendingCount(), 0)
})

test('day timer: __resetStateForTests가 낮 타이머까지 정리한다', () => {
    const { session } = commitSessionAtDayDiscussion({ id: 'room-day-reset' })
    const { io } = wireSession(session)
    const clock = createManualClock()

    startDayPhaseTimer(io, session, { ...clock })
    gameSessionSocketLayer.__resetStateForTests()

    assert.equal(clock.pendingCount(), 0)
})

function startAtDayVote({ id, playerCount = 4, settings = {} } = {}) {
    const fixture = commitSessionAtDayDiscussion({ id, playerCount, settings })
    const wired = wireSession(fixture.session)
    const clock = createManualClock()
    gameSessionCore.enterDayVotePhase(fixture.session)
    startDayPhaseTimer(wired.io, fixture.session, { ...clock })
    return { ...fixture, ...wired, clock }
}

test('day vote timer: 미투표 생존자의 표가 기권으로 집계되고 유효 표는 그대로 반영된다', async () => {
    const { session, uuids, io, sockets, castVote, clock } = startAtDayVote({
        id: 'room-vote-tribunal',
        settings: { dayVoteTime: 30 },
    })

    assertVoteAccepted(await castVote(uuids[0], uuids[1]))

    clock.advance(30_000)

    const resolution = session.dayVoteResolution
    assert.equal(resolution.outcome, 'TRIBUNAL')
    assert.equal(resolution.tribunalTargetUuid, uuids[1])
    assert.equal(resolution.publicVoteCount, 4, '생존자 전원이 집계 분모다')
    assert.equal(resolution.publicAbstainCount, 3, '투표하지 않은 세 명이 기권으로 집계됐다')
    assert.equal(session.phase, 'TRIBUNAL')

    const delivered = directEmits(sockets, 'day_vote_resolved')
    assert.equal(delivered.length, session.players.size, '참가자 전원이 판정 결과를 받는다')
    assert.deepEqual(delivered[0][1], gameSessionCore.buildDayVoteResolvedPayload(session, resolution))
    assert.equal(channelBroadcasts(io, 'day_vote_resolved').length, 0, '개별 emit 경로를 그대로 쓴다')
})

test('day vote timer: 아무도 투표하지 않고 만료되면 전원 기권으로 그 밤(NIGHT)으로 넘어간다', () => {
    const { session, clock } = startAtDayVote({ id: 'room-vote-abstain', settings: { dayVoteTime: 30 } })
    const dayIndexBefore = session.dayIndex

    clock.advance(30_000)

    assert.equal(session.dayVoteResolution.outcome, 'ABSTAINED')
    assert.equal(session.dayVoteResolution.publicAbstainCount, 4)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.dayIndex, dayIndexBefore, 'dayIndex는 밤 판정에서만 오른다')
    assert.equal(session.nightActions.size, 0)
    assert.equal(clock.pendingCount(), 0, '낮을 벗어났으므로 남은 낮 타이머가 없다')
})

test('day vote timer: 1라운드 동점이면 재투표가 열리고 그 라운드의 제한시간이 다시 걸린다', async () => {
    const { session, uuids, castVote, clock } = startAtDayVote({
        id: 'room-vote-revote',
        settings: { dayVoteTime: 30 },
    })

    assertVoteAccepted(await castVote(uuids[0], uuids[2]))
    assertVoteAccepted(await castVote(uuids[1], uuids[3]))

    clock.advance(30_000)

    assert.equal(session.dayVoteResolution.outcome, 'REVOTE')
    assert.equal(session.phase, 'DAY', '재투표는 낮에 머문다')
    assert.equal(gameSessionCore.getDayVoteRound(session), 2)
    assert.deepEqual([...session.dayVoteExcludedUuids].sort(), [uuids[2], uuids[3]].sort())
    assert.equal(session.dayVotes.size, 0, '재투표는 빈 표로 시작한다')
    assert.equal(clock.pendingCount(), 1, '2라운드 투표 제한시간이 새로 걸렸다')

    clock.advance(30_000)
    assert.equal(session.dayVoteResolution.outcome, 'ABSTAINED')
    assert.equal(session.dayVoteResolution.round, 2)
    assert.equal(session.phase, 'NIGHT')
})

test('day vote timer: 만료 전에 전원이 투표해도 제한시간까지는 판정하지 않는다', async () => {
    const { session, uuids, castVote, clock } = startAtDayVote({
        id: 'room-vote-early',
        settings: { dayVoteTime: 30 },
    })

    for (const uuid of uuids) assertVoteAccepted(await castVote(uuid, null))
    assert.equal(session.dayVoteResolution, null)

    clock.advance(30_000)
    assert.equal(session.dayVoteResolution.outcome, 'ABSTAINED')
})

test('day vote timer: 수동 판정이 먼저 끝나면 만료 타이머가 같은 낮을 다시 판정하지 않는다', async () => {
    const { session, uuids, sockets, castVote, clock } = startAtDayVote({
        id: 'room-vote-manual-first',
        settings: { dayVoteTime: 30 },
    })

    for (const uuid of uuids) assertVoteAccepted(await castVote(uuid, uuids[1] === uuid ? null : uuids[1]))

    const { callback, getResponse } = countingCallback()
    sockets.get(uuids[0]).trigger('resolve_day_vote', { gameId: session.id, dayIndex: session.dayIndex }, callback)
    assert.equal(getResponse().ok, true)
    assert.equal(session.phase, 'TRIBUNAL')
    const resolvedCountAfterManual = directEmits(sockets, 'day_vote_resolved').length

    clock.advance(30_000 * 5)
    assert.equal(directEmits(sockets, 'day_vote_resolved').length, resolvedCountAfterManual)
    assert.equal(session.phase, 'TRIBUNAL')
})

test('day vote timer: 판정으로 게임이 낮을 벗어나면 낮 타이머 run 자체가 사라진다', () => {
    const { session, clock } = startAtDayVote({ id: 'room-vote-cleanup', settings: { dayVoteTime: 30 } })

    clock.advance(30_000)
    assert.equal(session.phase, 'NIGHT')

    clock.advance(30_000 * 10)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(clock.pendingCount(), 0)
})

test('day vote timer: 사망자는 기권 집계 분모에도 들어가지 않는다', async () => {
    const { session, uuids, castVote, clock } = startAtDayVote({ id: 'room-vote-dead', settings: { dayVoteTime: 30 } })
    session.players.get(uuids[3]).alive = false

    assertVoteAccepted(await castVote(uuids[0], uuids[1]))
    clock.advance(30_000)

    const resolution = session.dayVoteResolution
    assert.equal(resolution.publicVoteCount, 3, '생존자 3명만 분모다')
    assert.equal(resolution.publicAbstainCount, 2)
    assert.equal(session.dayVotes.has(uuids[3]), false, '사망자에게는 기권이 기록되지 않는다')
})
