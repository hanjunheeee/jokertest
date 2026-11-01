// backend/models(→Sequelize)는 require 시점에 DATABASE_URL을 문자열로 파싱한다(연결을 실제로
// 시도하지는 않는다). npm test(--env-file=.env.test) 밖에서 이 파일만 직접 실행하면 그 값이
// 비어 있어 require 자체가 죽으므로, 다른 스위트(gameSession.test.js 등)와 같은 더미 폴백을 둔다.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
const { createFakeSocket, createFakeIo, countingCallback } = require('./testHelpers/matchmakingFixtures')

const { startDayPhaseTimer, stopDayPhaseTimer } = gameSessionSocketLayer.__testables
const { DAY_PHASES, DAY_DISCUSSION_DURATION_MS, DAY_VOTE_DURATION_MS } = gameSessionCore

/**
 * 낮 페이즈 타이머 전용 테스트 파일. gameSession.nightTurns.test.js와 같은 이유로 분리한다 —
 * 이 파일의 모든 테스트는 주입된 수동 시계 위에서만 성립하고, "제한시간이 아직 지나지 않았다"를
 * 단언할 수 있어야 한다.
 */

/** gameSession.test.js/nightTurns 테스트의 동명 헬퍼와 계약이 같다. */
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
    // F-11: handleSubmitDayVote는 비기권 투표의 성공 ack 전에 투표 참여 저장을 await한다
    // (A-03) — 이 파일은 실제 DB 없이 타이머 로직만 태우는 순수 단위 테스트이므로, 그 저장을
    // 즉시 성공하는 스텁으로 갈아끼운다(gameSession.test.js와 같은 관례).
    gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests(async () => ({ recorded: true }))
})
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests()
})

/** gameSession.nightTurns.test.js의 동명 헬퍼와 같은 계약(수동 시계)이다. */
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

/**
 * playerCount명·jokerCount 1 세션을 커밋한 뒤 전원 역할 확인까지 마쳐 첫 DAY(토론)로 만든다.
 * 소켓 계층 핸들러가 아니라 game-core의 acknowledgeRoleReveal을 직접 쓰는 이유: 이 헬퍼는
 * 타이머를 걸지 않은 낮 상태만 만들고, 타이머는 각 테스트가 수동 시계와 함께 명시적으로
 * 시작해야 "언제 걸렸는지"가 테스트 본문에서 드러나기 때문이다.
 */
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

/** 세션 참가자 전원의 fake socket을 만들고 registerGameHandlers로 실제 이벤트 배선까지 마친 io를 돌려준다. */
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
    // F-11: cast_day_vote(handleSubmitDayVote)는 비기권 투표에서 성공 ack 전에 투표 참여 저장을
    // await하므로(A-03) 더 이상 항상 동기로 응답하지 않는다 — socket.trigger는 핸들러의 반환
    // Promise를 넘겨주지 않으므로, 콜백이 실제로 호출될 때까지 한 틱 기다린 뒤 응답을 읽는다.
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

/**
 * F-16(AC-01): cast_day_vote 성공 ack는 ok와 개인 사건 봉투(sfxEvent) 두 키를 담는다.
 * 이 스위트가 검증하는 것은 타이머·집계이므로 봉투의 세부 계약은 gameSession.test.js가
 * 맡고, 여기서는 "성공 ack이고 봉투가 함께 온다"만 확인한다.
 */
function assertVoteAccepted(response) {
    assert.deepEqual(Object.keys(response).sort(), ['ok', 'sfxEvent'])
    assert.equal(response.ok, true)
    assert.equal(typeof response.sfxEvent.eventId, 'string')
    return response
}

/** 모든 참가자 소켓이 받은 이벤트를 [uuid, event] 쌍으로 모은다(개별 emit 경로 확인용). */
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

// ---------------------------------------------------------------------------
// AC-02 — dayDiscussionTime 만료 → DAY_VOTE 자동 전환
// ---------------------------------------------------------------------------

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
        dayPhaseDeadline: session.dayPhaseDeadline,
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

    // 투표 시간도 같은 방식으로 기본 상수를 쓴다.
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
    clock.advance(60_000) // 토론 만료 → DAY_VOTE

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
    // 조기 전환 시점부터 투표 시간(30초)을 새로 센다 — 남은 토론 시간(150초)이 아니다.
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

// ---------------------------------------------------------------------------
// AC-03 — dayVoteTime 만료 → 미투표는 기권으로 집계하고 규칙대로 해소한다
// ---------------------------------------------------------------------------

/** 토론을 건너뛰고 곧바로 DAY_VOTE 상태에서 타이머를 시작한다(투표 만료만 다루는 테스트용). */
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

    // 4명 중 한 명만 투표하고 나머지 세 명은 침묵한다 — 단독 최다 득표이므로 재판으로 간다.
    assertVoteAccepted(await castVote(uuids[0], uuids[1]))

    clock.advance(30_000)

    const resolution = session.dayVoteResolution
    assert.equal(resolution.outcome, 'TRIBUNAL')
    assert.equal(resolution.tribunalTargetUuid, uuids[1])
    assert.equal(resolution.publicVoteCount, 4, '생존자 전원이 집계 분모다')
    assert.equal(resolution.publicAbstainCount, 3, '투표하지 않은 세 명이 기권으로 집계됐다')
    assert.equal(session.phase, 'TRIBUNAL')

    // 판정 방송은 수동 판정(resolve_day_vote)과 같은 이벤트·같은 payload 빌더를 쓴다.
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

    // uuids[2]와 uuids[3]이 각각 1표씩 — 1라운드 동점이다.
    assertVoteAccepted(await castVote(uuids[0], uuids[2]))
    assertVoteAccepted(await castVote(uuids[1], uuids[3]))

    clock.advance(30_000)

    assert.equal(session.dayVoteResolution.outcome, 'REVOTE')
    assert.equal(session.phase, 'DAY', '재투표는 낮에 머문다')
    assert.equal(gameSessionCore.getDayVoteRound(session), 2)
    assert.deepEqual([...session.dayVoteExcludedUuids].sort(), [uuids[2], uuids[3]].sort())
    assert.equal(session.dayVotes.size, 0, '재투표는 빈 표로 시작한다')
    assert.equal(clock.pendingCount(), 1, '2라운드 투표 제한시간이 새로 걸렸다')

    // 2라운드도 아무도 투표하지 않으면 전원 기권으로 그 밤으로 넘어간다(두 라운드로 종결).
    clock.advance(30_000)
    assert.equal(session.dayVoteResolution.outcome, 'ABSTAINED')
    assert.equal(session.dayVoteResolution.round, 2)
    assert.equal(session.phase, 'NIGHT')
})

test('day vote timer: 만료 전에 전원이 투표해도 제한시간까지는 판정하지 않는다', async () => {
    // 낮 투표의 조기 판정(전원 투표 즉시 해소)은 이 슬라이스의 계약이 아니다 — 만료 또는
    // 명시적 resolve_day_vote만이 낮을 닫는다는 사실을 고정한다.
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

    // 수동 판정이 남은 투표 타이머를 정리했으므로, 원래 만료 시각이 지나도 아무 일도 없다.
    clock.advance(30_000 * 5)
    assert.equal(directEmits(sockets, 'day_vote_resolved').length, resolvedCountAfterManual)
    assert.equal(session.phase, 'TRIBUNAL')
})

test('day vote timer: 판정으로 게임이 낮을 벗어나면 낮 타이머 run 자체가 사라진다', () => {
    const { session, clock } = startAtDayVote({ id: 'room-vote-cleanup', settings: { dayVoteTime: 30 } })

    clock.advance(30_000)
    assert.equal(session.phase, 'NIGHT')

    // run이 남아 있었다면 이후의 어떤 시간 경과도 낮 상태를 다시 건드릴 수 있다.
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
