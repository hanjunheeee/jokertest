// 단계 마감 시험: 역할 공개 10초 마감(BE-002, 사용자 결정 2026-11-09)·재판 마감(BE-003)·낮 투표 마감 요청자(known 1-1)·동점 뒤 밤(사용자 결정 2026-11-09)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../../socket/gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../../socket/matchmaking')
const { createFakeSocket, createFakeIo, countingCallback } = require('../helpers/matchmakingFixtures')

const {
    startDayPhaseTimer,
    ensureRoleRevealTimer,
    startTribunalTimer,
    beginDisconnectGrace,
    __getRoleRevealRunForTests,
    __getTribunalRunForTests,
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
    gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests(async () => ({ recorded: true }))
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests(async () => {})
    gameSessionSocketLayer.__testables.__setGameResultPersistForTests(async () => {})
})
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests()
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests()
    gameSessionSocketLayer.__testables.__setGameResultPersistForTests()
})

function createManualClock(startMs = 1_000_000) {
    let now = startMs
    let nextId = 1
    const timers = new Map()
    return {
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
        now: () => now,
    }
}

// 5명 판(광대 1) 만들어 장부에 넣음, 첫 사람은 광대가 아니게 역할 맞바꿈 (첫 사람이 나가도 판이 안 끝나게)
function commitFivePlayerSession(id, settings = {}) {
    const players = Array.from({ length: 5 }, (_, i) => ({ uuid: `pd-${id}-${i}`, nickname: `nick-${i}`, isReady: true }))
    const room = { id, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount: 1, ...settings } }
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0.5 })
    const session = candidate.session
    const list = [...session.players.values()]
    if (list[0].role === 'JOKER') {
        const other = list.find((p) => p.role !== 'JOKER')
        ;[list[0].role, other.role] = [other.role, list[0].role]
        ;[list[0].team, other.team] = [other.team, list[0].team]
    }
    gameSessionCore.commitGameSession(session)
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
    const trigger = (uuid, event, payload) => {
        const { callback, getResponse } = countingCallback()
        sockets.get(uuid).trigger(event, payload, callback)
        return getResponse()
    }
    return { io, sockets, trigger }
}

function directEmits(sockets, event) {
    const received = []
    for (const socket of sockets.values()) {
        for (const entry of socket.emitted) {
            if (entry.event === event && entry.broadcastTo === undefined) received.push(entry.payload)
        }
    }
    return received
}

function toDayVote(session) {
    for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    gameSessionCore.enterDayVotePhase(session)
}

test('BE-002(사용자 규칙 변경): 모두 확인을 보내도 넘어가지 않고 10초 마감 때 무조건 첫 낮으로, 끊긴 사람은 유예 만료로 탈락한다', () => {
    const { session, uuids } = commitFivePlayerSession('reveal-stall')
    const { io, sockets, trigger } = wireSession(session)
    const clock = createManualClock()
    const [absent, ...present] = uuids

    // 끊긴 사람 (유예는 다음 단계까지)
    sockets.get(absent).connected = false
    beginDisconnectGrace(io, session, absent, clock)
    ensureRoleRevealTimer(io, session, clock)

    // 나머지 확인은 ok만 받고 단계는 그대로 (서버는 확인 안 기다림)
    for (const uuid of present) {
        assert.deepEqual(trigger(uuid, 'acknowledge_role_reveal', { gameId: session.id }), { ok: true })
    }
    assert.equal(session.phase, 'ROLE_REVEAL')
    assert.equal(session.roleRevealAcks.size, 0, '확인은 기록도 안 함')

    clock.advance(10_000 - 1)
    assert.equal(session.phase, 'ROLE_REVEAL', '마감 직전엔 그대로')
    clock.advance(1)
    assert.equal(session.phase, 'DAY', '10초 마감 때 첫 낮으로')
    assert.equal(session.dayIndex, 1)
    assert.equal(session.players.get(absent).alive, false, '끊긴 채 안 돌아온 사람은 유예 만료로 탈락')
    const phaseChanged = io.broadcasts.filter((b) => b.event === 'game_phase_changed')
    assert.equal(phaseChanged.length, 1)
    assert.equal(phaseChanged[0].payload.phase, 'DAY')
    assert.equal(__getRoleRevealRunForTests(session.id), null)
})

test('BE-002(사용자 규칙 변경): 아무도 확인 안 보내도 10초 마감 때 첫 낮으로, 확인 이벤트는 마감을 새로 걸거나 끄지 않는다', () => {
    const { session, uuids } = commitFivePlayerSession('reveal-auto')
    const { io, trigger } = wireSession(session)
    const clock = createManualClock()

    // 확인만으로는 마감이 안 걸림 (판 시작 때 거는 것)
    assert.deepEqual(trigger(uuids[0], 'acknowledge_role_reveal', { gameId: session.id }), { ok: true })
    assert.equal(__getRoleRevealRunForTests(session.id), null)

    ensureRoleRevealTimer(io, session, clock)
    for (const uuid of uuids) trigger(uuid, 'acknowledge_role_reveal', { gameId: session.id })
    assert.equal(session.phase, 'ROLE_REVEAL', '전원 확인해도 안 넘어감')
    assert.notEqual(__getRoleRevealRunForTests(session.id), null, '전원 확인해도 마감은 그대로')

    clock.advance(10_000)
    assert.equal(session.phase, 'DAY')
    assert.equal(__getRoleRevealRunForTests(session.id), null)
})

test('acknowledge_role_reveal(사용자 규칙 변경): 옛 화면이 아무 모양으로 보내도 ok만 답하고 판은 그대로다', () => {
    const { session, uuids } = commitFivePlayerSession('reveal-legacy')
    const { trigger } = wireSession(session)

    for (const payload of [{ gameId: session.id }, { gameId: 'other' }, null, 'x', {}]) {
        assert.deepEqual(trigger(uuids[0], 'acknowledge_role_reveal', payload), { ok: true })
    }
    assert.equal(session.phase, 'ROLE_REVEAL')
    assert.equal(session.roleRevealAcks.size, 0)
})

test('BE-003: 재판 중 한 명이 표를 안 내도 마감 때 기권으로 채우고 판정한다', () => {
    const { session, uuids } = commitFivePlayerSession('tribunal-stall', { dayVoteTime: 30 })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()
    toDayVote(session)

    // 전원이 피고 한 명을 찍어 재판으로
    const defendant = uuids[1]
    for (const uuid of uuids) gameSessionCore.submitDayVote(uuid, session.id, uuid === defendant ? uuids[0] : defendant)
    const prepared = gameSessionCore.prepareDayVoteResolution(uuids[0], session.id, session.dayIndex)
    gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution)
    assert.equal(session.phase, 'TRIBUNAL')

    startTribunalTimer(io, session, clock)
    assert.equal(session.tribunalDeadline, clock.now() + 30_000)
    const voters = uuids.filter((u) => u !== defendant)
    gameSessionCore.submitTribunalVote(voters[0], session.id, session.dayIndex, 'GUILTY')
    gameSessionCore.submitTribunalVote(voters[1], session.id, session.dayIndex, 'GUILTY')
    gameSessionCore.submitTribunalVote(voters[2], session.id, session.dayIndex, 'NOT_GUILTY')
    // voters[3]은 안 냄 → 예전엔 재판이 영영 안 끝남

    clock.advance(30_000 - 1)
    assert.equal(session.tribunal.resolved, undefined)
    clock.advance(1)
    assert.equal(session.tribunal.resolved, true)
    assert.deepEqual(session.tribunal.counts, { guilty: 2, notGuilty: 1 })
    assert.equal(session.tribunal.outcome, 'GUILTY')
    assert.notEqual(session.phase, 'TRIBUNAL')
    assert.equal(directEmits(sockets, 'tribunal_vote_resolved').length > 0, true)
    assert.equal(__getTribunalRunForTests(session.id), null, '판정 뒤 재판 마감은 꺼짐')
})

test('known 1-1: 판 첫 사람이 나간 판도 낮 투표 마감 타이머가 판정한다', () => {
    const { session, uuids } = commitFivePlayerSession('dayvote-first-left', { dayVoteTime: 30 })
    const { io, trigger } = wireSession(session)
    const clock = createManualClock()
    toDayVote(session)

    // 판 첫 사람이 게임 중 나감
    assert.equal(trigger(uuids[0], 'leave_game_session', { gameId: session.id }).ok, true)
    assert.equal(session.phase, 'DAY')

    startDayPhaseTimer(io, session, { ...clock, voteDurationMs: 30_000 })
    clock.advance(30_000)
    assert.notEqual(session.dayVoteResolution, null, '첫 사람이 나가도 마감 판정이 됨')
})

test('known 1-13 → 사용자 규칙 변경: 동점이면 재투표 없이 day_vote_resolved(outcome TIE, round 1, revoteExcludedUuids 빈 배열) 뒤 바로 밤이다', () => {
    const { session, uuids } = commitFivePlayerSession('revote-deadline')
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()
    toDayVote(session)
    startDayPhaseTimer(io, session, { ...clock, voteDurationMs: 30_000 })

    // 2:2 동표 + 1 기권(마감 채움)
    const [a, b, c, d] = uuids
    gameSessionCore.submitDayVote(a, session.id, c)
    gameSessionCore.submitDayVote(b, session.id, c)
    gameSessionCore.submitDayVote(c, session.id, a)
    gameSessionCore.submitDayVote(d, session.id, a)
    clock.advance(30_000)

    const resolved = directEmits(sockets, 'day_vote_resolved')
    assert.equal(resolved.length > 0, true)
    for (const payload of resolved) {
        assert.equal(payload.outcome, 'TIE')
        assert.equal(payload.round, 1)
        assert.equal(payload.phase, 'NIGHT')
        assert.deepEqual(payload.revoteExcludedUuids, [])
    }
    assert.equal(session.phase, 'NIGHT')
})

test('BE-023: 마지막 턴 뒤 밤 자동 마무리가 한 번 실패해도 잠깐 뒤 다시 해서 낮으로 넘어간다', () => {
    const { phaseHooks } = require('../../socket/gameSession/core/state')
    const { startNightTurnSequence } = gameSessionSocketLayer.__testables
    const { session } = commitFivePlayerSession('night-finalize-retry')
    const { io } = wireSession(session)
    const clock = createManualClock()
    for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null

    const original = phaseHooks.finalizeNightForSession
    let calls = 0
    phaseHooks.finalizeNightForSession = (...args) => {
        calls += 1
        if (calls === 1) return { ok: false, code: 'INTERNAL_ERROR' }
        return original(...args)
    }
    try {
        startNightTurnSequence(io, session, { ...clock, turnDurationMs: 1_000, randomFn: () => 0.5, presentationWaitTimeoutMs: 1_000 })
        clock.advance(120_000)
    } finally {
        phaseHooks.finalizeNightForSession = original
    }
    assert.equal(calls >= 2, true, '실패 뒤 다시 부름')
    assert.notEqual(session.phase, 'NIGHT', '밤에 멈추지 않음')
    assert.notEqual(session.nightResolution, null)
})

test('BE-003: 재판 중 스냅샷에 재판 마감 시각이 실린다 (칸 더하기만)', () => {
    const { session, uuids } = commitFivePlayerSession('tribunal-snapshot', { dayVoteTime: 30 })
    const { io } = wireSession(session)
    const clock = createManualClock()
    toDayVote(session)
    const defendant = uuids[1]
    for (const uuid of uuids) gameSessionCore.submitDayVote(uuid, session.id, uuid === defendant ? uuids[0] : defendant)
    const prepared = gameSessionCore.prepareDayVoteResolution(uuids[0], session.id, session.dayIndex)
    gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution)
    startTribunalTimer(io, session, clock)

    const snap = gameSessionCore.getSessionSnapshotForPlayer(uuids[0], session.id)
    assert.equal(snap.ok, true)
    assert.equal(snap.snapshot.tribunalDeadline, session.tribunalDeadline)
})
