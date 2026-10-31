process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../../socket/gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../../socket/matchmaking')
const gameResultRepository = require('../../repositories/gameResult.repositories')
const { createFakeSocket, createFakeIo, countingCallback } = require('../helpers/matchmakingFixtures')

const {
    startNightTurnSequence,
    computeEmptyTurnDelayMs,
    resolveNightTurnDurationMs,
    handleResolveNight,
} = gameSessionSocketLayer.__testables
const { NIGHT_TURN_ORDER, NIGHT_TURN_DURATION_MS } = gameSessionCore

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

function makeRoom({ id = 'room-1', players, jokerCount = 1, settings = {} } = {}) {
    return {
        id,
        players: new Map(players.map((p) => [p.uuid, p])),
        settings: { jokerCount, ...settings },
    }
}

function ackAllAndRewindToNight(session, dayIndex) {
    for (const uuid of session.players.keys()) {
        gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    }
    session.phase = 'NIGHT'
    session.dayIndex = dayIndex
    session.nightActions = new Map()
    session.nightResolution = null
    session.dayVotes = new Map()
    session.dayVoteResolution = null
    session.tribunal = null
}

function commitFullRoleSessionAtNight({ id = 'room-turns', dayIndex = 2, settings = {} } = {}) {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`fp-${id}-${i}`))
    const room = makeRoom({ id, players, jokerCount: 1, settings })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0.999 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToNight(session, dayIndex)
    const byRole = (role) => [...session.players.values()].find((p) => p.role === role).uuid
    return {
        session,
        jokerUuid: byRole('JOKER'),
        doctorUuid: byRole('DOCTOR'),
        guardUuid: byRole('GUARD'),
        witchHunterUuid: byRole('WITCH_HUNTER'),
        citizenUuid: byRole('CITIZEN'),
    }
}

function commitJokerTrioSessionAtNight({ id = 'room-turns-joker', dayIndex = 0, keepComposition = false } = {}) {
    const players = [makePlayer(`ja-${id}`), makePlayer(`jb-${id}`), makePlayer(`jc-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 2 })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    if (!keepComposition) delete session.roleComposition
    ackAllAndRewindToNight(session, dayIndex)
    const jokerUuids = [...session.players.values()].filter((p) => p.role === 'JOKER').map((p) => p.uuid)
    const citizenUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    return { session, jokerUuids, citizenUuid }
}

function drainPresentationWait(session) {
    for (let guard = 0; guard < 20; guard += 1) {
        const run = gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id)
        if (!run || !run.wait || run.wait.active !== true) return
        gameSessionSocketLayer.__testables.releaseNightPresentationWait(run, run.wait)
    }
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
    const submit = (uuid, targetId, { autoDrainWait = true } = {}) => {
        const { callback, getResponse } = countingCallback()
        sockets.get(uuid).trigger('submit_night_action', { gameId: session.id, targetId }, callback)
        if (autoDrainWait) drainPresentationWait(session)
        return getResponse()
    }
    return { io, sockets, submit }
}

function turnEventLog(io) {
    return io.broadcasts
        .filter((b) => b.event === 'night_turn_started' || b.event === 'night_turn_ended')
        .map((b) => [b.event, b.payload.role])
}

function turnBroadcasts(io) {
    return io.broadcasts.filter((b) => b.event === 'night_turn_started' || b.event === 'night_turn_ended')
}

test('night turn: 한 밤 동안 광대→의사→경비원→WITCH_HUNTER 순서로 각 턴마다 started/ended가 정확히 한 번씩 방송된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

    for (const uuid of [jokerUuid, doctorUuid, guardUuid, witchHunterUuid]) {
        assert.deepEqual(submit(uuid, null), { ok: true })
    }

    assert.deepEqual(turnEventLog(io), [
        ['night_turn_started', 'JOKER'],
        ['night_turn_ended', 'JOKER'],
        ['night_turn_started', 'DOCTOR'],
        ['night_turn_ended', 'DOCTOR'],
        ['night_turn_started', 'GUARD'],
        ['night_turn_ended', 'GUARD'],
        ['night_turn_started', 'WITCH_HUNTER'],
        ['night_turn_ended', 'WITCH_HUNTER'],
    ])
    assert.deepEqual([...NIGHT_TURN_ORDER], ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])
})

test('night turn: 모든 night_turn_started payload가 deadline을 포함하고 그 값이 시작 시각 + 턴 제한시간이다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock(5_000_000)
    const startedAt = clock.now()
    const nightDayIndex = session.dayIndex

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    for (const uuid of [jokerUuid, doctorUuid, guardUuid, witchHunterUuid]) submit(uuid, null)

    const started = io.broadcasts.filter((b) => b.event === 'night_turn_started')
    assert.equal(started.length, 4)
    for (const broadcast of started) {
        assert.equal(broadcast.roomId, session.channelId)
        assert.deepEqual(Object.keys(broadcast.payload).sort(), ['dayIndex', 'deadline', 'gameId', 'role'])
        assert.equal(broadcast.payload.deadline, startedAt + NIGHT_TURN_DURATION_MS)
        assert.equal(broadcast.payload.gameId, session.id)
        assert.equal(broadcast.payload.dayIndex, nightDayIndex)
    }
})

test('night turn: 현재 턴이 아닌 직업의 제출은 NOT_YOUR_TURN으로 거부되고 nightActions에 기록되지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } = commitFullRoleSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

    for (const uuid of [doctorUuid, guardUuid, witchHunterUuid]) {
        assert.deepEqual(submit(uuid, null), {
            ok: false,
            code: 'NOT_YOUR_TURN',
            message: '요청을 처리할 수 없습니다.',
        })
    }
    assert.equal(session.nightActions.size, 0)

    assert.equal(submit(citizenUuid, null).code, 'NOT_ELIGIBLE')

    assert.deepEqual(submit(jokerUuid, null), { ok: true })
    assert.equal(session.nightActions.size, 1)
})

test('night turn: 턴이 넘어가면 직전 턴 주인의 뒤늦은 제출이 거부된다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
    assert.equal(submit(jokerUuid, doctorUuid).code, 'NOT_YOUR_TURN')
})

test('night turn: 턴 시퀀스가 돌고 있지 않으면 어떤 직업의 제출도 턴 때문에 거부되지 않는다', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight()
    const { submit } = wireSession(session)

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null)
    assert.deepEqual(submit(doctorUuid, citizenUuid), { ok: true })
})

test('night turn: 생존자가 있는 턴은 제한시간 직전까지는 끝나지 않는다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuids[0], null)

    clock.advance(NIGHT_TURN_DURATION_MS - 1)

    assert.deepEqual(turnEventLog(io), [['night_turn_started', 'JOKER']])
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'JOKER')
    assert.equal(session.nightActions.has(jokerUuids[1]), false, '만료 전에는 아무도 기권으로 기록되지 않는다')
})

test('night turn: 그 역할 생존자 전원이 제출을 마치는 순간, 시계를 진행시키지 않아도 턴이 즉시 끝난다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuids[0], null)
    assert.equal(turnEventLog(io).length, 1, '한 명만 제출한 상태에서는 아직 끝나지 않는다')

    const beforeNow = clock.now()
    submit(jokerUuids[1], null)

    assert.equal(clock.now(), beforeNow)
    assert.deepEqual(turnEventLog(io).slice(0, 3), [
        ['night_turn_started', 'JOKER'],
        ['night_turn_ended', 'JOKER'],
        ['night_turn_started', 'DOCTOR'],
    ])
})

test('night turn: JOKER 동료 지목은 기록 없는 no-op이라 전원 제출로 계산되지 않는다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

    assert.deepEqual(submit(jokerUuids[0], jokerUuids[1]), { ok: true })
    assert.deepEqual(submit(jokerUuids[1], jokerUuids[0]), { ok: true })
    assert.equal(session.nightActions.size, 0)
    assert.deepEqual(turnEventLog(io), [['night_turn_started', 'JOKER']])

    submit(jokerUuids[0], null)
    submit(jokerUuids[1], null)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
})

test('night turn: 생존자가 없는 직업의 턴은 지연 시각 직전에는 끝나지 않고 그 시각에 끝난다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight()
    session.players.get(doctorUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock()
    const expectedDelay = Math.floor(NIGHT_TURN_DURATION_MS * 0.4)

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')

    clock.advance(expectedDelay - 1)
    assert.deepEqual(turnEventLog(io).at(-1), ['night_turn_started', 'DOCTOR'], '지연 시각 직전에는 아직 끝나지 않았다')

    clock.advance(1)
    assert.deepEqual(turnEventLog(io).slice(2, 5), [
        ['night_turn_started', 'DOCTOR'],
        ['night_turn_ended', 'DOCTOR'],
        ['night_turn_started', 'GUARD'],
    ])
})

test('night turn: 무인 턴 지연은 난수값과 무관하게 항상 턴 제한시간의 20~60% 안에 있다', () => {
    const lower = NIGHT_TURN_DURATION_MS * 0.2
    const upper = NIGHT_TURN_DURATION_MS * 0.6

    for (const r of [0, 0.0001, 0.25, 0.5, 0.75, 0.9999, 1, -3, 7, NaN]) {
        const delay = computeEmptyTurnDelayMs(NIGHT_TURN_DURATION_MS, () => r)
        assert.ok(delay >= Math.floor(lower) && delay <= upper, `r=${r} → ${delay}ms가 20~60% 범위를 벗어났다`)
    }

    assert.equal(computeEmptyTurnDelayMs(NIGHT_TURN_DURATION_MS, () => 0), Math.floor(lower))
    assert.equal(computeEmptyTurnDelayMs(NIGHT_TURN_DURATION_MS, () => 1), Math.floor(upper))
})

test('night turn: dayIndex 때문에 아직 능력이 없는 WITCH_HUNTER 턴도 무인 턴과 같은 지연 경로로 끝난다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight({ dayIndex: 0 })
    assert.equal(session.players.get(witchHunterUuid).alive, true)
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    for (const uuid of [jokerUuid, doctorUuid, guardUuid]) submit(uuid, null)

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'WITCH_HUNTER')
    clock.advance(NIGHT_TURN_DURATION_MS)

    assert.deepEqual(turnEventLog(io).at(-1), ['night_turn_ended', 'WITCH_HUNTER'])
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '마지막 턴이 끝나면 턴 상태가 정리된다')
})

function payloadKeyWords(key) {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((word) => word.toLowerCase())
}

const ALIVENESS_LEAKING_WORDS = new Set([
    'alive', 'dead', 'alives', 'deads',
    'actor', 'actors', 'participant', 'participants',
    'remaining', 'pending', 'count', 'size',
    'reason', 'cause', 'submitted', 'skipped', 'empty',
])

test('night turn: 죽은 직업과 산 직업의 턴 방송이 같은 이벤트명·같은 필드 집합을 쓰고 role 외에는 값이 동일하다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight()
    session.players.get(doctorUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    clock.advance(NIGHT_TURN_DURATION_MS)

    const byKey = new Map(turnBroadcasts(io).map((b) => [`${b.event}:${b.payload.role}`, b]))
    const aliveStarted = byKey.get('night_turn_started:JOKER')
    const deadStarted = byKey.get('night_turn_started:DOCTOR')
    const aliveEnded = byKey.get('night_turn_ended:JOKER')
    const deadEnded = byKey.get('night_turn_ended:DOCTOR')
    for (const b of [aliveStarted, deadStarted, aliveEnded, deadEnded]) assert.ok(b, '네 방송이 모두 존재한다')

    assert.equal(deadStarted.roomId, aliveStarted.roomId)
    assert.equal(deadEnded.roomId, aliveEnded.roomId)
    assert.deepEqual(Object.keys(deadStarted.payload).sort(), Object.keys(aliveStarted.payload).sort())
    assert.deepEqual(Object.keys(deadEnded.payload).sort(), Object.keys(aliveEnded.payload).sort())

    assert.deepEqual({ ...deadStarted.payload, role: 'X' }, { ...aliveStarted.payload, role: 'X' })
    assert.deepEqual({ ...deadEnded.payload, role: 'X' }, { ...aliveEnded.payload, role: 'X' })

    for (const b of [aliveStarted, deadStarted, aliveEnded, deadEnded]) {
        for (const key of Object.keys(b.payload)) {
            const leaked = payloadKeyWords(key).filter((word) => ALIVENESS_LEAKING_WORDS.has(word))
            assert.deepEqual(leaked, [], `${b.event} payload의 금지된 필드: ${key}`)
        }
    }
})

test('night turn: payload 키 단어 분해가 deadline은 통과시키고 생존 파생 필드는 잡아낸다', () => {
    const leaks = (key) => payloadKeyWords(key).some((word) => ALIVENESS_LEAKING_WORDS.has(word))

    for (const key of ['gameId', 'dayIndex', 'role', 'deadline']) {
        assert.equal(leaks(key), false, `정상 필드가 위반으로 잡혔다: ${key}`)
    }
    for (const key of ['aliveCount', 'alive_count', 'isDead', 'actorUuids', 'remainingSubmissions', 'endReason']) {
        assert.equal(leaks(key), true, `누출 필드를 놓쳤다: ${key}`)
    }
})

function runNightCapturingTurnBroadcasts({ id, deadRoles = [], startMs = 1_000_000 } = {}) {
    const fixture = commitFullRoleSessionAtNight({ id })
    const { session } = fixture
    const uuidByRole = {
        JOKER: fixture.jokerUuid,
        DOCTOR: fixture.doctorUuid,
        GUARD: fixture.guardUuid,
        WITCH_HUNTER: fixture.witchHunterUuid,
    }
    for (const role of deadRoles) session.players.get(uuidByRole[role]).alive = false

    const { io, submit } = wireSession(session)
    const clock = createManualClock(startMs)
    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

    for (const role of NIGHT_TURN_ORDER) {
        if (gameSessionCore.getCurrentNightTurnRole(session) !== role) break
        if (deadRoles.includes(role)) clock.advance(NIGHT_TURN_DURATION_MS)
        else submit(uuidByRole[role], null)
    }
    return { io, session }
}

test('night turn: 같은 역할의 턴 방송은 그 역할의 전멸 여부와 무관하게 완전히 동일하다', () => {
    for (const role of NIGHT_TURN_ORDER) {
        const aliveRun = runNightCapturingTurnBroadcasts({ id: `alive-${role}` })
        const deadRun = runNightCapturingTurnBroadcasts({ id: `dead-${role}`, deadRoles: [role] })

        const pick = (run, event) => run.io.broadcasts.find((b) => b.event === event && b.payload.role === role)
        for (const event of ['night_turn_started', 'night_turn_ended']) {
            const fromAlive = pick(aliveRun, event)
            const fromDead = pick(deadRun, event)
            assert.ok(fromAlive, `${role}이 살아 있을 때 ${event}가 방송된다`)
            assert.ok(fromDead, `${role}이 전멸했을 때도 ${event}가 똑같이 방송된다`)

            assert.equal(fromAlive.payload.gameId, aliveRun.session.id)
            assert.equal(fromDead.payload.gameId, deadRun.session.id)
            assert.equal(fromDead.roomId, deadRun.session.channelId)

            assert.deepEqual(
                { ...fromDead.payload, gameId: 'X' },
                { ...fromAlive.payload, gameId: 'X' },
                `${role}의 ${event} payload가 전멸 여부에 따라 달라졌다`,
            )
        }
    }
})

test('night turn: 턴 payload 빌더는 생존 정보를 인자로 받지 않는다', () => {
    const { session } = commitFullRoleSessionAtNight()

    const before = gameSessionCore.buildNightTurnStartedPayload(session, 'DOCTOR', 12345)
    const beforeEnded = gameSessionCore.buildNightTurnEndedPayload(session, 'DOCTOR')
    for (const player of session.players.values()) {
        if (player.role === 'DOCTOR') player.alive = false
    }

    assert.deepEqual(gameSessionCore.buildNightTurnStartedPayload(session, 'DOCTOR', 12345), before)
    assert.deepEqual(gameSessionCore.buildNightTurnEndedPayload(session, 'DOCTOR'), beforeEnded)
    assert.deepEqual(before, { gameId: session.id, dayIndex: session.dayIndex, role: 'DOCTOR', deadline: 12345 })
    assert.deepEqual(beforeEnded, { gameId: session.id, dayIndex: session.dayIndex, role: 'DOCTOR' })
})

test('night turn: 건너뛰기(targetId null)는 nightActions에 정식으로 기록되고 전원 제출 판정에 포함된다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

    assert.deepEqual(submit(jokerUuids[0], null), { ok: true })
    assert.equal(session.nightActions.has(jokerUuids[0]), true)
    assert.equal(session.nightActions.get(jokerUuids[0]), null)
    assert.equal(gameSessionCore.isRoleTurnComplete(session, 'JOKER'), false, '아직 한 명이 남았다')

    assert.deepEqual(submit(jokerUuids[1], null), { ok: true })
    assert.equal(gameSessionCore.isRoleTurnComplete(session, 'JOKER'), true)
    assert.deepEqual(turnEventLog(io).slice(0, 2), [
        ['night_turn_started', 'JOKER'],
        ['night_turn_ended', 'JOKER'],
    ])
})

test('night turn: 건너뛰기와 실제 지목이 섞여도 전원 제출로 계산되어 턴이 끝난다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuids[0], citizenUuid), { ok: true })
    assert.deepEqual(submit(jokerUuids[1], null), { ok: true })

    assert.deepEqual(
        [...session.nightActions.entries()].sort(),
        [[jokerUuids[0], citizenUuid], [jokerUuids[1], null]].sort(),
    )
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
})

test('night turn: 제한시간이 만료되면 미제출 생존자만 기권으로 기록되고 다음 턴이 시작된다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuids[0], citizenUuid), { ok: true })

    clock.advance(NIGHT_TURN_DURATION_MS)
    drainPresentationWait(session)

    assert.equal(session.nightActions.get(jokerUuids[0]), citizenUuid)
    assert.equal(session.nightActions.has(jokerUuids[1]), true, '미제출 생존자가 기권으로 기록됐다')
    assert.equal(session.nightActions.get(jokerUuids[1]), null)
    assert.equal(gameSessionCore.isRoleTurnComplete(session, 'JOKER'), true)

    assert.deepEqual(turnEventLog(io).slice(0, 3), [
        ['night_turn_started', 'JOKER'],
        ['night_turn_ended', 'JOKER'],
        ['night_turn_started', 'DOCTOR'],
    ])
})

test('night turn: 아무도 제출하지 않은 채 만료되면 그 역할 생존자 전원이 기권으로 기록된다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const { io } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    clock.advance(NIGHT_TURN_DURATION_MS)

    for (const jokerUuid of jokerUuids) {
        assert.equal(session.nightActions.get(jokerUuid), null, `${jokerUuid}가 기권으로 기록됐다`)
    }
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
})

test('night turn: 사망한 actor는 만료 기권 대상이 아니다(기록도 남지 않는다)', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    session.players.get(jokerUuids[1]).alive = false
    const { io } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    clock.advance(NIGHT_TURN_DURATION_MS)

    assert.equal(session.nightActions.get(jokerUuids[0]), null)
    assert.equal(session.nightActions.has(jokerUuids[1]), false, '사망자에게는 기권이 기록되지 않는다')
})

test('night turn: 만료로 끝난 턴의 방송도 전원 제출로 끝난 턴과 완전히 같은 payload를 쓴다', () => {
    const expired = commitJokerTrioSessionAtNight({ id: 'expired-turn' })
    const wiredExpired = wireSession(expired.session)
    const expiredClock = createManualClock()
    startNightTurnSequence(wiredExpired.io, expired.session, { ...expiredClock, randomFn: () => 0.5 })
    expiredClock.advance(NIGHT_TURN_DURATION_MS)

    const submitted = commitJokerTrioSessionAtNight({ id: 'submitted-turn' })
    const wiredSubmitted = wireSession(submitted.session)
    const submittedClock = createManualClock()
    startNightTurnSequence(wiredSubmitted.io, submitted.session, { ...submittedClock, randomFn: () => 0.5 })
    for (const jokerUuid of submitted.jokerUuids) wiredSubmitted.submit(jokerUuid, null)

    const pick = (io, event) => io.broadcasts.find((b) => b.event === event && b.payload.role === 'JOKER')
    for (const event of ['night_turn_started', 'night_turn_ended']) {
        const fromExpired = pick(wiredExpired.io, event)
        const fromSubmitted = pick(wiredSubmitted.io, event)
        assert.ok(fromExpired && fromSubmitted, `두 경로 모두 ${event}를 방송한다`)
        assert.deepEqual(
            { ...fromExpired.payload, gameId: 'X' },
            { ...fromSubmitted.payload, gameId: 'X' },
            `${event} payload가 종료 사유에 따라 달라졌다`,
        )
    }
})

test('night turn: 전원 제출로 턴이 끝난 뒤에는 그 턴의 만료 타이머가 발화하지 않는다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    const beforeNow = clock.now()
    for (const jokerUuid of jokerUuids) submit(jokerUuid, null)

    assert.equal(clock.now(), beforeNow)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
    const endedCountBefore = turnEventLog(io).filter(([event, role]) => event === 'night_turn_ended' && role === 'JOKER').length
    assert.equal(endedCountBefore, 1)

    clock.advance(NIGHT_TURN_DURATION_MS * 3)
    const endedCountAfter = turnEventLog(io).filter(([event, role]) => event === 'night_turn_ended' && role === 'JOKER').length
    assert.equal(endedCountAfter, 1, '만료 타이머가 이미 끝난 턴을 다시 끝내지 않는다')
})

test('night turn: 한 밤의 모든 턴을 전원 제출로 끝내면 시계 없이 시퀀스 전체가 끝난다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    const startedAt = clock.now()
    for (const uuid of [jokerUuid, doctorUuid, guardUuid, witchHunterUuid]) submit(uuid, null)

    assert.equal(clock.now(), startedAt)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '마지막 턴까지 끝나 턴 상태가 정리된다')
    assert.equal(clock.pendingCount(), 0, '남아있는 예약 타이머가 없다')
})

function appliedDurationMs(session, role) {
    return resolveNightTurnDurationMs({ durationMs: null, session }, role)
}

test('night turn: 직업별 밤 시간이 있으면 그 값이, 없으면 nightActionTime이 그 턴의 길이가 된다', () => {
    const { session } = commitFullRoleSessionAtNight({
        id: 'per-role-times',
        settings: { nightActionTime: 60, roleNightActionTimes: { JOKER: 30, GUARD: 120 } },
    })

    assert.equal(appliedDurationMs(session, 'JOKER'), 30_000)
    assert.equal(appliedDurationMs(session, 'GUARD'), 120_000)
    assert.equal(appliedDurationMs(session, 'DOCTOR'), 60_000)
    assert.equal(appliedDurationMs(session, 'WITCH_HUNTER'), 60_000)
})

test('night turn: 밤 시간 설정이 아예 없는 방은 모든 턴이 canonical 기본 제한시간을 쓴다', () => {
    const { session } = commitFullRoleSessionAtNight({ id: 'no-time-settings' })
    for (const role of NIGHT_TURN_ORDER) {
        assert.equal(appliedDurationMs(session, role), NIGHT_TURN_DURATION_MS)
    }
})

test('night turn: 직업별로 다른 제한시간이 night_turn_started의 deadline에 그대로 나타난다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight({
        id: 'per-role-deadline',
        settings: { nightActionTime: 60, roleNightActionTimes: { JOKER: 30, GUARD: 120 } },
    })
    const { io, submit } = wireSession(session)
    const clock = createManualClock(7_000_000)
    const startedAt = clock.now()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    for (const uuid of [jokerUuid, doctorUuid, guardUuid, witchHunterUuid]) submit(uuid, null)

    const deadlineByRole = new Map(
        io.broadcasts.filter((b) => b.event === 'night_turn_started').map((b) => [b.payload.role, b.payload.deadline]),
    )
    assert.deepEqual([...deadlineByRole.keys()], [...NIGHT_TURN_ORDER])
    for (const role of NIGHT_TURN_ORDER) {
        assert.equal(deadlineByRole.get(role), startedAt + appliedDurationMs(session, role), `${role}의 deadline`)
    }
})

test('night turn: 직업별 제한시간이 실제 만료 시각을 결정한다', () => {
    const { session, jokerUuid } = commitFullRoleSessionAtNight({
        id: 'per-role-expiry',
        settings: { nightActionTime: 90, roleNightActionTimes: { JOKER: 30 } },
    })
    const { io } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

    clock.advance(30_000 - 1)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'JOKER', '30초 직전에는 아직 JOKER 턴이다')
    assert.equal(session.nightActions.has(jokerUuid), false)

    clock.advance(1)
    assert.equal(session.nightActions.get(jokerUuid), null, '30초에 만료돼 기권이 기록됐다')
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
})

test('night turn: deps.turnDurationMs를 주면 세션 설정보다 우선해 모든 턴에 쓰인다', () => {
    const { session } = commitFullRoleSessionAtNight({
        id: 'explicit-duration',
        settings: { nightActionTime: 60, roleNightActionTimes: { JOKER: 30 } },
    })
    const { io } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5, turnDurationMs: 5_000 })
    const started = io.broadcasts.find((b) => b.event === 'night_turn_started')
    assert.equal(started.payload.deadline, clock.now() + 5_000)
})

test('night turn: 무인 턴 지연은 전체 밤 시간이 아니라 그 직업에 적용된 제한시간을 기준으로 계산된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid } = commitFullRoleSessionAtNight({
        id: 'empty-turn-per-role',
        settings: { nightActionTime: 30, roleNightActionTimes: { GUARD: 120 } },
    })
    session.players.get(guardUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    const expectedDelay = Math.floor(120_000 * 0.4)
    assert.equal(expectedDelay, 48_000)

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    submit(doctorUuid, null)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'GUARD')

    clock.advance(expectedDelay - 1)
    assert.deepEqual(turnEventLog(io).at(-1), ['night_turn_started', 'GUARD'], '48초 직전에는 아직 끝나지 않았다')

    clock.advance(1)
    assert.deepEqual(turnEventLog(io).slice(4, 6), [
        ['night_turn_started', 'GUARD'],
        ['night_turn_ended', 'GUARD'],
    ])
})

test('night turn: 무인 턴 지연 비율은 어떤 제한시간에서도 20~60% 구간을 벗어나지 않는다', () => {
    for (const durationMs of [30_000, 60_000, 90_000, 120_000]) {
        for (const r of [0, 0.25, 0.5, 0.75, 1, -3, 7, NaN]) {
            const delay = computeEmptyTurnDelayMs(durationMs, () => r)
            assert.ok(
                delay >= Math.floor(durationMs * 0.2) && delay <= durationMs * 0.6,
                `duration=${durationMs}, r=${r} → ${delay}ms가 20~60% 범위를 벗어났다`,
            )
        }
    }
})

const NIGHT_TURN_EVENTS = ['night_turn_started', 'night_turn_ended']

function stampBroadcastTimes(io, clock) {
    const stamped = []
    const originalTo = io.to.bind(io)
    io.to = (roomId) => {
        const channel = originalTo(roomId)
        return {
            emit(event, payload) {
                stamped.push({ at: clock.now(), roomId, event, payload })
                return channel.emit(event, payload)
            },
        }
    }
    return stamped
}

function captureRoleTurnStream(role, mode, { id, startMs = 1_000_000, randomFn = () => 0.5 } = {}) {
    const fixture = commitFullRoleSessionAtNight({ id: id ?? `conceal-${mode}-${role}` })
    const { session } = fixture
    const uuidByRole = {
        JOKER: fixture.jokerUuid,
        DOCTOR: fixture.doctorUuid,
        GUARD: fixture.guardUuid,
        WITCH_HUNTER: fixture.witchHunterUuid,
    }
    if (mode === 'wiped') session.players.get(uuidByRole[role]).alive = false

    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock(startMs)
    const stamped = stampBroadcastTimes(io, clock)
    startNightTurnSequence(io, session, { ...clock, randomFn })

    for (const earlierRole of NIGHT_TURN_ORDER) {
        if (earlierRole === role) break
        assert.deepEqual(submit(uuidByRole[earlierRole], null), { ok: true }, `${earlierRole} 턴을 제출로 넘긴다`)
    }
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), role, `${role} 턴에 도달했다`)

    const turnStartedAt = clock.now()
    const durationMs = appliedDurationMs(session, role)
    if (mode === 'skipped') assert.deepEqual(submit(uuidByRole[role], null), { ok: true })
    else clock.advance(durationMs)

    const startedIndex = stamped.findIndex((b) => b.event === 'night_turn_started' && b.payload.role === role)
    const endedIndex = stamped.findIndex((b) => b.event === 'night_turn_ended' && b.payload.role === role)
    assert.ok(startedIndex >= 0, `${mode}: ${role} 턴 시작이 방송됐다`)
    assert.ok(endedIndex > startedIndex, `${mode}: ${role} 턴 종료가 시작 뒤에 방송됐다`)

    return {
        session,
        io,
        sockets,
        clock,
        durationMs,
        turnStartedAt,
        turnEndedAt: stamped[endedIndex].at,
        stream: stamped.slice(startedIndex, endedIndex + 1),
    }
}

function runNightWithForcedAbstentions(role, options = {}) {
    const captured = captureRoleTurnStream(role, 'expired', options)
    const actorUuids = [...captured.session.players.values()].filter((p) => p.role === role).map((p) => p.uuid)
    assert.ok(actorUuids.length > 0, `${role}에 생존 actor가 있어야 기권 경로가 성립한다`)
    for (const uuid of actorUuids) {
        assert.equal(captured.session.nightActions.get(uuid), null, `${uuid}가 만료 기권으로 기록됐다`)
    }
    return captured
}

function normalizeTurnEventStream(stream, session) {
    return stream.map(({ roomId, event, payload }) => {
        assert.equal(roomId, session.channelId, `${event}는 세션 channel로 나간다`)
        const normalizedPayload = Object.fromEntries(
            Object.entries(payload).map(([key, value]) => {
                if (key === 'gameId') {
                    assert.equal(value, session.id, 'gameId는 자기 세션의 id다')
                    return [key, '<gameId>']
                }
                return [key, value]
            }),
        )
        return { event, roomId: '<channel>', payload: normalizedPayload }
    })
}

const UUID_VALUE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALIVENESS_LEAKING_VALUE_WORDS = new Set([
    'alive', 'dead', 'wiped', 'empty', 'none', 'nobody', 'noone',
    'timeout', 'timedout', 'timed', 'expired', 'abstain', 'abstained', 'skip', 'skipped', 'auto',
])

function detectAliveLeak(payload) {
    const findings = []
    for (const [key, value] of Object.entries(payload)) {
        const keyHits = payloadKeyWords(key).filter((word) => ALIVENESS_LEAKING_WORDS.has(word))
        if (keyHits.length > 0) findings.push(`${key}: 금지된 키 단어(${keyHits.join(', ')})`)

        if (Array.isArray(value)) {
            findings.push(`${key}: 배열 값은 그 턴의 인원 구성을 드러낸다`)
        } else if (value !== null && typeof value === 'object') {
            findings.push(`${key}: 객체 값은 그 턴의 인원 구성을 드러낸다`)
        } else if (typeof value === 'boolean') {
            findings.push(`${key}: 불리언 값은 생존/전멸 플래그다`)
        } else if (typeof value === 'string' && !UUID_VALUE_PATTERN.test(value)) {
            const valueHits = payloadKeyWords(value).filter((word) => ALIVENESS_LEAKING_VALUE_WORDS.has(word))
            if (valueHits.length > 0) findings.push(`${key}=${value}: 금지된 값 단어(${valueHits.join(', ')})`)
        }
    }
    return findings
}

function assertConcealedStreamsMatch(left, right, label) {
    assert.deepEqual(left.map((e) => e.event), right.map((e) => e.event), `${label}: 이벤트 종류·순서가 다르다`)
    assert.deepEqual(left, right, `${label}: 턴 구간 스트림이 다르다`)
    for (const entry of [...left, ...right]) {
        assert.deepEqual(detectAliveLeak(entry.payload), [], `${label}: ${entry.event} payload에 생존 정보가 있다`)
    }
}

test('night turn: [은폐] 전멸한 직업의 턴 스트림이 전원 건너뛰기 턴·전원 기권 만료 턴과 완전히 같다', () => {
    for (const role of NIGHT_TURN_ORDER) {
        const wiped = captureRoleTurnStream(role, 'wiped', { id: `wiped-${role}` })
        const skipped = captureRoleTurnStream(role, 'skipped', { id: `skipped-${role}` })
        const expired = runNightWithForcedAbstentions(role, { id: `expired-${role}` })

        const wipedStream = normalizeTurnEventStream(wiped.stream, wiped.session)
        assertConcealedStreamsMatch(
            wipedStream,
            normalizeTurnEventStream(skipped.stream, skipped.session),
            `${role}: 전멸 vs 전원 건너뛰기`,
        )
        assertConcealedStreamsMatch(
            wipedStream,
            normalizeTurnEventStream(expired.stream, expired.session),
            `${role}: 전멸 vs 전원 기권(만료)`,
        )

        assert.deepEqual(turnEventLog(wiped.io), turnEventLog(skipped.io), `${role}: 밤 전체 이벤트 흐름`)
        assert.deepEqual(turnEventLog(wiped.io), turnEventLog(expired.io), `${role}: 밤 전체 이벤트 흐름(만료)`)

        assert.deepEqual(wipedStream.map((e) => e.event), NIGHT_TURN_EVENTS, `${role}: 전멸 턴 구간 방송`)
    }
})

test('night turn: [은폐] 전멸 여부는 개별 소켓 emit으로도 새지 않는다', () => {
    const wiped = captureRoleTurnStream('GUARD', 'wiped', { id: 'sockets-wiped' })
    const skipped = captureRoleTurnStream('GUARD', 'skipped', { id: 'sockets-skipped' })

    for (const [label, captured] of [['전멸', wiped], ['건너뛰기', skipped]]) {
        for (const socket of captured.sockets.values()) {
            const targetedTurnEmits = socket.emitted
                .filter((e) => NIGHT_TURN_EVENTS.includes(e.event) && e.viaBroadcast !== true)
            assert.deepEqual(targetedTurnEmits, [], `${label}: 턴 이벤트가 개별 소켓으로 나갔다(${socket.id})`)
        }
    }

    for (const [label, captured] of [['전멸', wiped], ['건너뛰기', skipped]]) {
        const streams = [...captured.sockets.values()].map((socket) => ({
            id: socket.id,
            turns: socket.received.filter((e) => NIGHT_TURN_EVENTS.includes(e.event)),
        }))
        assert.ok(streams.length > 1, '대조할 소켓이 둘 이상이어야 한다')
        for (const stream of streams) {
            assert.deepEqual(stream.turns, streams[0].turns,
                `${label}: 소켓마다 받은 턴 이벤트가 다르다(${stream.id})`)
        }
    }
})

function createSeededRandom(seed) {
    let state = seed >>> 0
    return () => {
        state ^= state << 13
        state >>>= 0
        state ^= state >>> 17
        state ^= state << 5
        state >>>= 0
        return state / 4_294_967_296
    }
}

function measureEmptyTurnLength({ id, randomFn = null, nightActionTime = null } = {}) {
    const settings = nightActionTime === null ? {} : { nightActionTime }
    const { session, jokerUuid } = commitFullRoleSessionAtNight({ id, settings })
    session.players.get(jokerUuid).alive = false
    const { io } = wireSession(session)
    const clock = createManualClock()
    const stamped = stampBroadcastTimes(io, clock)

    const durationMs = appliedDurationMs(session, 'JOKER')
    startNightTurnSequence(io, session, randomFn === null ? { ...clock } : { ...clock, randomFn })
    clock.advance(durationMs)

    const started = stamped.find((b) => b.event === 'night_turn_started' && b.payload.role === 'JOKER')
    const ended = stamped.find((b) => b.event === 'night_turn_ended' && b.payload.role === 'JOKER')
    assert.ok(started && ended, '무인 턴도 시작과 종료를 모두 방송한다')
    return { durationMs, delayMs: ended.at - started.at }
}

test('night turn: [은폐] 무인 턴의 실제 길이가 주입 난수 표본 전체에서 제한시간의 20~60%다', () => {
    const nextRandom = createSeededRandom(0x5eed_1234)
    const samples = [0, Number.EPSILON, 0.5, 1 - Number.EPSILON, 1, ...Array.from({ length: 20 }, () => nextRandom())]

    const observed = []
    samples.forEach((r, index) => {
        const { durationMs, delayMs } = measureEmptyTurnLength({ id: `empty-len-${index}`, randomFn: () => r })
        assert.ok(
            delayMs >= Math.floor(durationMs * 0.2) && delayMs <= durationMs * 0.6,
            `r=${r} → ${delayMs}ms가 제한시간(${durationMs}ms)의 20~60%를 벗어났다`,
        )
        observed.push(delayMs)
    })

    assert.equal(observed.length, samples.length)
    assert.ok(new Set(observed).size >= 10, `관측된 길이가 ${new Set(observed).size}종뿐이라 사실상 고정값이다`)
    assert.equal(Math.min(...observed), Math.floor(NIGHT_TURN_DURATION_MS * 0.2), 'r=0에서 하한을 실제로 찍는다')
    assert.equal(Math.max(...observed), Math.floor(NIGHT_TURN_DURATION_MS * 0.6), 'r=1에서 상한을 실제로 찍는다')
})

test('night turn: [은폐] 난수원을 주입하지 않은 무인 턴도 반복 실행 내내 20~60%를 지킨다', () => {
    const observed = []
    for (let index = 0; index < 16; index += 1) {
        const { durationMs, delayMs } = measureEmptyTurnLength({ id: `empty-real-${index}` })
        assert.ok(
            delayMs >= Math.floor(durationMs * 0.2) && delayMs <= durationMs * 0.6,
            `${index}회차 → ${delayMs}ms가 제한시간(${durationMs}ms)의 20~60%를 벗어났다`,
        )
        observed.push(delayMs)
    }
    assert.ok(new Set(observed).size > 1, '반복 실행에서 턴 길이가 매번 똑같다(무작위가 아니다)')
})

test('night turn: [은폐] 직업별 제한시간을 바꿔도 무인 턴의 실제 길이 비율은 20~60%다', () => {
    const nextRandom = createSeededRandom(0xc0ffee)
    for (const nightActionTime of [30, 60, 120]) {
        for (let index = 0; index < 5; index += 1) {
            const r = nextRandom()
            const { durationMs, delayMs } = measureEmptyTurnLength({
                id: `empty-dur-${nightActionTime}-${index}`,
                randomFn: () => r,
                nightActionTime,
            })
            assert.equal(durationMs, nightActionTime * 1000)
            assert.ok(
                delayMs >= Math.floor(durationMs * 0.2) && delayMs <= durationMs * 0.6,
                `${nightActionTime}초 설정, r=${r} → ${delayMs}ms가 20~60%를 벗어났다`,
            )
        }
    }
})

test('night turn: [conceal 회귀 8/27-fix] 생존자가 있는 직업의 턴은 무인 턴 지연이 다 지나도 제출 없이는 넘어가지 않는다', () => {
    for (const role of NIGHT_TURN_ORDER) {
        const fixture = commitFullRoleSessionAtNight({ id: `regress-alive-${role}` })
        const { session } = fixture
        const uuidByRole = {
            JOKER: fixture.jokerUuid,
            DOCTOR: fixture.doctorUuid,
            GUARD: fixture.guardUuid,
            WITCH_HUNTER: fixture.witchHunterUuid,
        }
        const { io, submit } = wireSession(session)
        const clock = createManualClock()
        startNightTurnSequence(io, session, { ...clock, randomFn: () => 1 })

        for (const earlierRole of NIGHT_TURN_ORDER) {
            if (earlierRole === role) break
            assert.deepEqual(submit(uuidByRole[earlierRole], null), { ok: true })
        }
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), role)
        const actorUuid = uuidByRole[role]
        assert.equal(session.players.get(actorUuid).alive, true, `${role} 보유자가 살아 있다`)

        const durationMs = appliedDurationMs(session, role)
        const emptyTurnUpperBound = computeEmptyTurnDelayMs(durationMs, () => 1)
        const endedCount = () => turnEventLog(io).filter(([event, r]) => event === 'night_turn_ended' && r === role).length

        clock.advance(emptyTurnUpperBound)
        assert.equal(endedCount(), 0, `${role}: 무인 턴 지연 상한(${emptyTurnUpperBound}ms)에 턴이 끝나버렸다`)
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), role, `${role}: 제출 없이 턴이 넘어갔다`)

        clock.advance(durationMs - emptyTurnUpperBound - 1)
        assert.equal(endedCount(), 0, `${role}: 만료 직전인데 턴이 끝났다`)
        assert.equal(session.nightActions.has(actorUuid), false, `${role}: 만료 전에 기권으로 기록됐다`)

        assert.deepEqual(submit(actorUuid, null), { ok: true }, `${role}: 뒤늦은 제출이 거부됐다`)
        assert.equal(endedCount(), 1, `${role}: 제출로 턴이 끝난다`)
    }
})

test('night turn: [conceal 회귀 8/27] 보유자가 전멸한 직업의 턴 안내도 같은 자리에서 그대로 재생된다', () => {
    const drive = ({ id, deadRole }) => {
        const fixture = commitFullRoleSessionAtNight({ id })
        const { session } = fixture
        const uuidByRole = {
            JOKER: fixture.jokerUuid,
            DOCTOR: fixture.doctorUuid,
            GUARD: fixture.guardUuid,
            WITCH_HUNTER: fixture.witchHunterUuid,
        }
        if (deadRole) session.players.get(uuidByRole[deadRole]).alive = false
        const { io, submit } = wireSession(session)
        const clock = createManualClock()
        startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
        for (const role of NIGHT_TURN_ORDER) {
            if (gameSessionCore.getCurrentNightTurnRole(session) !== role) break
            if (role === deadRole) clock.advance(appliedDurationMs(session, role))
            else assert.deepEqual(submit(uuidByRole[role], null), { ok: true })
        }
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, `${id}: 밤이 끝까지 진행됐다`)
        return io
    }

    const baselineIo = drive({ id: 'regress-announce-alive' })
    const baselineLog = turnEventLog(baselineIo)
    for (const deadRole of NIGHT_TURN_ORDER) {
        const wipedIo = drive({ id: `regress-announce-${deadRole}`, deadRole })

        const log = turnEventLog(wipedIo)
        assert.deepEqual(log, baselineLog, `${deadRole} 전멸 시 턴 안내 순서가 달라졌다`)
        const announcementIndex = (entries) =>
            entries.findIndex(([event, role]) => event === 'night_turn_started' && role === deadRole)
        assert.ok(announcementIndex(baselineLog) >= 0, `${deadRole}: 기준선에 그 역할의 안내가 있다`)
        assert.equal(
            announcementIndex(log),
            announcementIndex(baselineLog),
            `${deadRole} 전멸 시 안내가 나오는 자리가 밀렸다`,
        )

        for (const event of NIGHT_TURN_EVENTS) {
            const fromWiped = wipedIo.broadcasts.find((b) => b.event === event && b.payload.role === deadRole)
            const fromAlive = baselineIo.broadcasts.find((b) => b.event === event && b.payload.role === deadRole)
            assert.ok(fromWiped && fromAlive, `${deadRole}: 양쪽 모두 ${event}를 방송한다`)
            assert.deepEqual(
                { ...fromWiped.payload, gameId: 'X' },
                { ...fromAlive.payload, gameId: 'X' },
                `${deadRole}: 전멸 시 ${event} 안내 내용이 달라졌다`,
            )
        }
    }
})

test('night turn: [conceal 회귀 8/27] 은폐를 위해 판정을 되돌리지 않는다 — 죽은 보유자는 제출 대상에서 빠진 채 밤이 끝난다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight({
        id: 'regress-no-deadlock',
    })
    session.players.get(doctorUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, null), { ok: true })
    clock.advance(appliedDurationMs(session, 'DOCTOR'))
    assert.deepEqual(submit(guardUuid, null), { ok: true })
    assert.deepEqual(submit(witchHunterUuid, null), { ok: true })

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '밤이 교착 없이 끝까지 진행됐다')
    assert.deepEqual(
        [...session.nightActions.keys()].sort(),
        [jokerUuid, guardUuid, witchHunterUuid].sort(),
        '생존 제출자만 기록된다',
    )
    assert.equal(session.nightActions.has(doctorUuid), false, '죽은 보유자에게는 기권조차 기록되지 않는다')
    assert.equal(gameSessionCore.isRoleTurnComplete(session, 'DOCTOR'), true, '무인 역할은 공집합이라 제출 대기가 없다')
})

test('night turn: [conceal 회귀 8/27] 아직 능력이 없는 WITCH_HUNTER의 턴이 전멸 턴과 구별되지 않는다', () => {
    const capture = ({ id, dayIndex, wipe }) => {
        const fixture = commitFullRoleSessionAtNight({ id, dayIndex })
        const { session } = fixture
        if (wipe) session.players.get(fixture.witchHunterUuid).alive = false
        const { io, submit } = wireSession(session)
        const clock = createManualClock()
        const stamped = stampBroadcastTimes(io, clock)
        startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
        for (const uuid of [fixture.jokerUuid, fixture.doctorUuid, fixture.guardUuid]) {
            assert.deepEqual(submit(uuid, null), { ok: true })
        }
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'WITCH_HUNTER')

        const startedAt = clock.now()
        const durationMs = appliedDurationMs(session, 'WITCH_HUNTER')
        clock.advance(durationMs)
        const started = stamped.find((b) => b.event === 'night_turn_started' && b.payload.role === 'WITCH_HUNTER')
        const ended = stamped.find((b) => b.event === 'night_turn_ended' && b.payload.role === 'WITCH_HUNTER')
        assert.ok(started && ended, 'WITCH_HUNTER 턴도 시작과 종료를 모두 방송한다')
        return {
            events: stamped.slice(stamped.indexOf(started), stamped.indexOf(ended) + 1).map((b) => b.event),
            payloadKeys: Object.keys(started.payload).sort().join(','),
            deadlineOffset: started.payload.deadline - startedAt,
            turnLengthMs: ended.at - started.at,
        }
    }

    const ineligible = capture({ id: 'regress-wh-ineligible', dayIndex: 0, wipe: false })
    const wipedOut = capture({ id: 'regress-wh-wiped', dayIndex: 2, wipe: true })

    assert.deepEqual(ineligible.events, wipedOut.events, 'WH 턴 구간의 이벤트 종류·순서가 다르다')
    assert.deepEqual(ineligible.events, NIGHT_TURN_EVENTS)
    assert.equal(ineligible.payloadKeys, wipedOut.payloadKeys, 'WH 턴 payload의 필드 집합이 다르다')
    assert.equal(ineligible.deadlineOffset, wipedOut.deadlineOffset, 'deadline이 자격 유무에 따라 달라졌다')
    assert.equal(ineligible.turnLengthMs, wipedOut.turnLengthMs, '턴 길이가 자격 유무에 따라 달라졌다')
})

test('night turn: [conceal 회귀] 무인 턴이 즉시 끝나지 않는다(공집합 전원제출 판정 회귀)', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight({ id: 'conceal-instant-end' })
    session.players.get(doctorUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0 })
    const lowerBoundDelay = Math.floor(NIGHT_TURN_DURATION_MS * 0.2)

    submit(jokerUuid, null)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
    assert.deepEqual(turnEventLog(io).at(-1), ['night_turn_started', 'DOCTOR'], '시작하자마자 끝나지 않았다')

    clock.advance(lowerBoundDelay - 1)
    assert.deepEqual(turnEventLog(io).at(-1), ['night_turn_started', 'DOCTOR'], '하한 직전까지도 끝나지 않았다')

    clock.advance(1)
    assert.deepEqual(turnEventLog(io).slice(2, 4), [
        ['night_turn_started', 'DOCTOR'],
        ['night_turn_ended', 'DOCTOR'],
    ])
})

test('night turn: [conceal 회귀] 무인 턴의 deadline이 지연 시각이 아니라 제한시간 기준이다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight({ id: 'conceal-deadline' })
    session.players.get(doctorUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock(3_000_000)

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)

    const turnStartedAt = clock.now()
    const durationMs = appliedDurationMs(session, 'DOCTOR')
    const started = io.broadcasts.find((b) => b.event === 'night_turn_started' && b.payload.role === 'DOCTOR')
    assert.equal(started.payload.deadline, turnStartedAt + durationMs, 'deadline은 언제나 시작 시각 + 제한시간이다')
    assert.notEqual(
        started.payload.deadline,
        turnStartedAt + computeEmptyTurnDelayMs(durationMs, () => 0.5),
        'deadline이 무인 턴 지연 시각을 그대로 노출했다',
    )
})

test('night turn: [conceal 회귀] 무인 턴에도 타이머가 정확히 하나 걸려 있다', () => {
    const pendingTimersOnFirstTurn = (wipe) => {
        const { session, jokerUuid } = commitFullRoleSessionAtNight({ id: `conceal-timer-${wipe ? 'wiped' : 'alive'}` })
        if (wipe) session.players.get(jokerUuid).alive = false
        const { io } = wireSession(session)
        const clock = createManualClock()
        startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
        return clock.pendingCount()
    }

    const wipedTimers = pendingTimersOnFirstTurn(true)
    const aliveTimers = pendingTimersOnFirstTurn(false)
    assert.equal(wipedTimers, 1, '무인 턴에도 타이머가 하나 걸린다')
    assert.equal(wipedTimers, aliveTimers, '타이머 개수가 전멸 여부에 따라 달라진다')
})

test('night turn: [conceal 회귀] 밤 전체를 통틀어 방송 개수·순서·필드 집합이 전멸 조합과 무관하다', () => {
    const driveWholeNight = ({ id, deadRoles = [] }) => {
        const fixture = commitFullRoleSessionAtNight({ id })
        const { session } = fixture
        const uuidByRole = {
            JOKER: fixture.jokerUuid,
            DOCTOR: fixture.doctorUuid,
            GUARD: fixture.guardUuid,
            WITCH_HUNTER: fixture.witchHunterUuid,
        }
        for (const role of deadRoles) session.players.get(uuidByRole[role]).alive = false

        const { io, submit } = wireSession(session)
        const clock = createManualClock()
        startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

        for (let guard = 0; guard <= NIGHT_TURN_ORDER.length; guard += 1) {
            const role = gameSessionCore.getCurrentNightTurnRole(session)
            if (role === null) break
            if (deadRoles.includes(role)) clock.advance(appliedDurationMs(session, role))
            else assert.deepEqual(submit(uuidByRole[role], null), { ok: true })
        }
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, `${id}: 밤이 끝까지 진행됐다`)
        return io
    }

    const baselineIo = driveWholeNight({ id: 'conceal-night-none' })
    const baselineLog = turnEventLog(baselineIo)
    const baselineShape = turnBroadcasts(baselineIo).map((b) => Object.keys(b.payload).sort().join(','))
    assert.equal(baselineLog.length, NIGHT_TURN_ORDER.length * 2, '기준선은 네 턴의 시작·종료 여덟 방송이다')

    const combinations = [
        ['JOKER'],
        ['DOCTOR', 'GUARD'],
        ['JOKER', 'WITCH_HUNTER'],
        [...NIGHT_TURN_ORDER],
    ]
    for (const deadRoles of combinations) {
        const io = driveWholeNight({ id: `conceal-night-${deadRoles.join('-')}`, deadRoles })
        assert.deepEqual(turnEventLog(io), baselineLog, `전멸 조합 ${deadRoles.join('+')}에서 이벤트 흐름이 달라졌다`)
        assert.deepEqual(
            turnBroadcasts(io).map((b) => Object.keys(b.payload).sort().join(',')),
            baselineShape,
            `전멸 조합 ${deadRoles.join('+')}에서 payload 필드 집합이 달라졌다`,
        )
        for (const broadcast of turnBroadcasts(io)) {
            assert.deepEqual(
                detectAliveLeak(broadcast.payload),
                [],
                `전멸 조합 ${deadRoles.join('+')}의 ${broadcast.event} payload에 생존 정보가 있다`,
            )
        }
    }
})

function withInjectedField(stream, key, value) {
    return stream.map((entry, index) =>
        index === stream.length - 1 ? { ...entry, payload: { ...entry.payload, [key]: value } } : { ...entry, payload: { ...entry.payload } },
    )
}

function withoutField(stream, key) {
    return stream.map((entry) => {
        const payload = { ...entry.payload }
        delete payload[key]
        return { ...entry, payload }
    })
}

test('night turn: [음성 대조] payload에 생존 정보를 넣으면 은폐 가드가 실패하고, 빼면 다시 통과한다', () => {
    const wiped = captureRoleTurnStream('DOCTOR', 'wiped', { id: 'negative-wiped' })
    const skipped = captureRoleTurnStream('DOCTOR', 'skipped', { id: 'negative-skipped' })
    const clean = normalizeTurnEventStream(wiped.stream, wiped.session)
    const reference = normalizeTurnEventStream(skipped.stream, skipped.session)

    assertConcealedStreamsMatch(clean, reference, '오염 전')

    const injections = [
        ['aliveCount', 0],
        ['actorUuids', []],
        ['endReason', 'EMPTY'],
        ['remainingSubmissions', 0],
        ['isRoleWipedOut', true],
        ['status', 'TIMED_OUT'],
    ]
    for (const [key, value] of injections) {
        const polluted = withInjectedField(clean, key, value)

        assert.throws(
            () => assertConcealedStreamsMatch(polluted, reference, `${key} 주입`),
            assert.AssertionError,
            `${key}를 심었는데 스트림 대조가 통과했다`,
        )

        assert.throws(
            () => assertConcealedStreamsMatch(polluted, withInjectedField(reference, key, value), `${key} 양측 주입`),
            assert.AssertionError,
            `${key}를 양쪽에 심었는데 누출 가드가 통과했다`,
        )
        assert.ok(detectAliveLeak(polluted.at(-1).payload).length > 0, `${key}를 누출로 지목하지 못했다`)

        assert.deepEqual(withoutField(polluted, key), clean, `${key} 제거가 원래 스트림을 되돌린다`)
        assertConcealedStreamsMatch(withoutField(polluted, key), reference, `${key} 제거 후`)
    }
})

test('night turn: [음성 대조] 누출 탐지기가 정상 payload는 통과시키고 생존 정보만 잡는다', () => {
    const cleanPayloads = [
        { gameId: '11111111-2222-4333-8444-555555555555', dayIndex: 2, role: 'WITCH_HUNTER', deadline: 1_060_000 },
        { gameId: '11111111-2222-4333-8444-555555555555', dayIndex: 0, role: 'JOKER' },
    ]
    for (const payload of cleanPayloads) {
        assert.deepEqual(detectAliveLeak(payload), [], `정상 payload가 누출로 잡혔다: ${JSON.stringify(payload)}`)
    }

    const leakyPayloads = [
        { role: 'JOKER', aliveCount: 1 },
        { role: 'JOKER', alive_actors: 1 },
        { role: 'JOKER', actorUuids: ['fp-1'] },
        { role: 'JOKER', endReason: 'ALL_SUBMITTED' },
        { role: 'JOKER', isEmptyTurn: false },
        { role: 'JOKER', turnSummary: { submitted: 0 } },
        { role: 'JOKER', outcome: 'TIMEOUT' },
    ]
    for (const payload of leakyPayloads) {
        assert.ok(detectAliveLeak(payload).length > 0, `누출 payload를 놓쳤다: ${JSON.stringify(payload)}`)
    }
})

function captureCommitEvents() {
    const events = []
    gameSessionCore.__setNightCommitObserverForTests((event, detail) => events.push({ event, ...detail }))
    return {
        events,
        countOf: (event) => events.filter((e) => e.event === event).length,
        winEvaluations: (source) => events.filter((e) => e.event === 'WIN_EVALUATED' && e.source === source).length,
    }
}

function nightResultDeliveryCounts(sockets) {
    const counts = new Map()
    for (const [uuid, socket] of sockets) {
        counts.set(uuid, socket.emitted.filter((e) => e.event === 'night_result_applied').length)
    }
    return counts
}

test('AC-01(F-25b): 광대 턴이 끝난 시점에는 대상이 여전히 canonical alive이고 승패 판정·종료 확정·밤 결과 방송이 하나도 시작되지 않는다', () => {
    const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'f25b-ac01' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid), { ok: true })

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.nightResolution, null)
    assert.equal(Object.hasOwn(session, 'winResult'), false)
    assert.deepEqual(observed.events, [])
    assert.equal(observed.countOf('RESULT_RECORD_BUILD_STARTED'), 0, '경기 기록 조립이 시작되면 안 된다')
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 0)
})

test('AC-02/AC-03(F-25b): 치료가 성공한 밤은 마지막 턴이 끝나는 순간 자동 확정되고 사망 0·승패 평가 1회·수신자별 결과 1건이다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25b-ac02' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const nightDayIndex = session.dayIndex
    const aliveBefore = [...session.players.values()].filter((p) => p.alive).length
    const observed = captureCommitEvents()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid), { ok: true })
    assert.deepEqual(submit(doctorUuid, citizenUuid), { ok: true })
    assert.deepEqual(submit(guardUuid, null), { ok: true })
    assert.deepEqual(submit(witchHunterUuid, null), { ok: true })

    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.equal([...session.players.values()].filter((p) => p.alive).length, aliveBefore)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, nightDayIndex + 1)
    assert.equal(Object.hasOwn(session, 'winResult'), false)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    assert.equal(observed.countOf('GAME_FINALIZED'), 0)

    for (const [uuid, count] of nightResultDeliveryCounts(sockets)) {
        assert.equal(count, 1, `${uuid}의 night_result_applied 건수`)
    }
    const applied = sockets.get(citizenUuid).emitted.find((e) => e.event === 'night_result_applied')
    assert.equal(applied.payload.victimUuid, null)
    assert.deepEqual(applied.payload.deathReveals, [])
    assert.equal(applied.payload.players.find((p) => p.uuid === citizenUuid).alive, true)
})

test('AC-03(F-25b): 치료되지 않은 밤은 마지막 턴 종료 뒤 사망 1회·승패 평가 1회로 확정되고 그 전에는 어떤 것도 확정되지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25b-ac03' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'GUARD')
    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.deepEqual(observed.events, [])

    submit(guardUuid, citizenUuid)
    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.deepEqual(observed.events, [])

    submit(witchHunterUuid, null)

    assert.equal(session.players.get(citizenUuid).alive, false)
    assert.equal(session.players.get(citizenUuid).deathReason, 'ASSASSINATION')
    assert.equal(session.phase, 'DAY')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    assert.equal(observed.winEvaluations('DISCONNECT'), 0)

    for (const [uuid, count] of nightResultDeliveryCounts(sockets)) {
        assert.equal(count, 1, `${uuid}의 night_result_applied 건수`)
    }
    const applied = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_result_applied')
    assert.equal(applied.payload.victimUuid, citizenUuid)
    assert.deepEqual(applied.payload.deathReveals, [{ victimUuid: citizenUuid, source: 'JOKER' }])
    const guardResult = sockets.get(guardUuid).emitted.find((e) => e.event === 'night_action_result')
    assert.equal(guardResult.payload.actionType, 'INVESTIGATE')
    assert.equal(guardResult.payload.targetId, citizenUuid)
})

test('AC-05(F-25b): 자동 최종화가 끝난 뒤 도착한 수동 resolve_night는 거부되고 사망·승패 평가·결과 방송이 늘지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25b-ac05-auto-first' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    for (const [uuid, target] of [[jokerUuid, citizenUuid], [doctorUuid, null], [guardUuid, null], [witchHunterUuid, null]]) {
        submit(uuid, target)
    }
    assert.equal(session.phase, 'DAY')
    const deliveriesAfterAuto = nightResultDeliveryCounts(sockets)

    const { callback, getResponse } = countingCallback()
    handleResolveNight(io, sockets.get(jokerUuid), jokerUuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), {
        ok: false, code: 'NIGHT_ALREADY_RESOLVED', message: '요청을 처리할 수 없습니다.',
    })
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    assert.deepEqual(nightResultDeliveryCounts(sockets), deliveriesAfterAuto)
})

test('AC-05(F-25b): 네 역할이 끝나기 전의 수동 resolve_night는 ACTIONS_PENDING이고, 이후 자동 진행이 그 밤을 정확히 1회 확정한다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25b-ac05-manual-early' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)

    const { callback, getResponse } = countingCallback()
    handleResolveNight(io, sockets.get(jokerUuid), jokerUuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), {
        ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.',
    })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.deepEqual(observed.events, [])
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 0)

    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    assert.equal(session.phase, 'DAY')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 1)
})

test('AC-03/AC-05(F-25b): 마지막 턴이 제출 없이 만료돼도(전원 기권) 그 밤은 자동으로 정확히 1회 확정된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25b-expire-last' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'WITCH_HUNTER')
    assert.equal(session.phase, 'NIGHT')
    assert.deepEqual(observed.events, [])

    clock.advance(NIGHT_TURN_DURATION_MS)

    assert.equal(session.phase, 'DAY')
    assert.equal(session.players.get(citizenUuid).alive, false)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 1)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null)
})

test('A-12(F-25b): 유효한 진행 세션의 수신자가 0명이어도 밤 커밋과 단계 전이는 그대로 수행된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25b-no-recipients' })
    const { io, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    io.sockets.sockets.clear()

    clock.advance(NIGHT_TURN_DURATION_MS)

    assert.equal(session.phase, 'DAY', '수신자가 없어도 밤은 확정되고 낮으로 넘어간다')
    assert.equal(session.players.get(citizenUuid).alive, false)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
})

function commitLastNightSessionAtNight({ id = 'room-turns-last', dayIndex = 2 } = {}) {
    const players = [makePlayer(`ln-${id}-a`), makePlayer(`ln-${id}-b`), makePlayer(`ln-${id}-c`)]
    const room = makeRoom({ id, players, jokerCount: 1 })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0.999 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    delete session.roleComposition
    ackAllAndRewindToNight(session, dayIndex)
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const targetUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    return { session, jokerUuid, targetUuid }
}

function driveNightToFinalization(session, submit, clock, jokerUuid, targetUuid) {
    for (let guard = 0; guard <= NIGHT_TURN_ORDER.length; guard += 1) {
        const role = gameSessionCore.getCurrentNightTurnRole(session)
        if (role === null) break
        const actors = gameSessionCore.getAliveActorUuidsForRole(session, role)
        if (actors.length === 0) {
            clock.advance(NIGHT_TURN_DURATION_MS)
            continue
        }
        for (const actorUuid of actors) {
            assert.deepEqual(submit(actorUuid, actorUuid === jokerUuid ? targetUuid : null), { ok: true })
        }
    }
}

async function settlePendingWork() {
    for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

test('AC-05(F-25b): 저장이 한 번 실패한 뒤 재시도해도 같은 밤의 사망·경기 기록 조립·보상 평가가 두 번 일어나지 않는다', async () => {
    const { session, jokerUuid, targetUuid } = commitLastNightSessionAtNight({ id: 'f25b-persist-retry' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()
    const participantUuids = [...session.players.keys()]

    const persistCalls = []
    const originalPersist = gameResultRepository.persistGameResultRecord
    gameResultRepository.persistGameResultRecord = async (record) => {
        persistCalls.push(record)
        if (persistCalls.length === 1) throw new Error('저장 실패(테스트 주입)')
        return { persisted: true }
    }
    const evaluatedUuids = []
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests(async (userId) => {
        evaluatedUuids.push(userId)
    })
    gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests({
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
    })

    try {
        startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
        driveNightToFinalization(session, submit, clock, jokerUuid, targetUuid)

        assert.equal(session.phase, 'ENDED', '그 밤의 사망으로 광대가 동수가 되어 경기가 끝난다')
        assert.deepEqual(session.winResult, { winner: 'JOKER' })
        assert.equal(session.players.get(targetUuid).alive, false)

        await settlePendingWork()
        assert.equal(persistCalls.length, 1, '첫 저장 시도가 실패했다')
        assert.equal(evaluatedUuids.length, 0, '저장을 확인하기 전에는 보상 평가가 시작되지 않는다')

        clock.advance(1_000)
        await settlePendingWork()

        assert.equal(persistCalls.length, 2, '정확히 한 번 재시도했다')
        assert.equal(persistCalls[1], persistCalls[0], '재시도는 처음 조립한 바로 그 레코드 객체를 다시 쓴다')
        assert.equal(observed.countOf('RESULT_RECORD_BUILD_STARTED'), 1, '경기 기록 조립은 재시도에도 1회뿐이다')
        assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1, '사망 확정은 1회뿐이다')
        assert.equal(observed.winEvaluations('NIGHT'), 1)
        assert.equal(observed.countOf('GAME_FINALIZED'), 1)
        assert.deepEqual([...evaluatedUuids].sort(), [...participantUuids].sort(), '보상 평가는 원 참가자마다 1회다')
        for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 1)

        gameSessionSocketLayer.__testables.persistTerminalSession(session, { completed: true })
        await settlePendingWork()

        assert.equal(persistCalls.length, 2)
        assert.equal(observed.countOf('RESULT_RECORD_BUILD_STARTED'), 1)
        assert.deepEqual([...evaluatedUuids].sort(), [...participantUuids].sort())
    } finally {
        gameResultRepository.persistGameResultRecord = originalPersist
        gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests()
        gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests()
    }
})

test('AC-01(F-25b): 무인 턴만으로 진행되는 밤도 마지막 무인 턴이 끝나기 전까지는 아무 것도 확정하지 않는다', () => {
    const { session } = commitFullRoleSessionAtNight({ id: 'f25b-empty-turns', dayIndex: 0 })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    clock.advance(NIGHT_TURN_DURATION_MS * 3)
    assert.equal(session.phase, 'NIGHT')
    assert.deepEqual(observed.events, [])

    clock.advance(NIGHT_TURN_DURATION_MS)

    assert.equal(session.phase, 'DAY')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0, '아무도 지목되지 않은 밤이다')
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 1)
})

const {
    buildNightPresentationContract,
    releaseNightPresentationWait,
    isNightPresentationWaitActive,
    NIGHT_TURN_STAGES,
    finalizeNightForSession,
    endNightTurn,
    stopDayPhaseTimer,
} = gameSessionSocketLayer.__testables

function observeNightTurnEnds(sockets, observe) {
    const socket = [...sockets.values()][0]
    const originalEmit = socket.emit.bind(socket)
    socket.emit = (event, payload) => {
        if (event === 'night_turn_ended') observe(payload)
        return originalEmit(event, payload)
    }
}

function commitDualJokerSessionAtNight({ id = 'room-dual-joker', dayIndex = 2 } = {}) {
    const players = Array.from({ length: 4 }, (_, i) => makePlayer(`dj-${id}-${i}`))
    const room = makeRoom({ id, players, jokerCount: 2 })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0.999 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToNight(session, dayIndex)
    const jokerUuids = [...session.players.values()].filter((p) => p.role === 'JOKER').map((p) => p.uuid)
    const otherUuids = [...session.players.values()].filter((p) => p.role !== 'JOKER').map((p) => p.uuid)
    return { session, jokerUuids, otherUuids }
}

test('AC-01(F-25): 네 역할이 각각 종료 방송 중 PRESENTATION_WAIT를 거치고 그 순간에는 다음 역할도 최종화도 시작되지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-wait-order' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()
    const nightDayIndex = session.dayIndex

    let run = null
    const seen = []
    observeNightTurnEnds(sockets, (payload) => {
        seen.push({
            role: payload.role,
            stage: run.stage,
            waitRole: run.wait?.role ?? null,
            waitRevision: run.wait?.revision ?? null,
            waitId: run.wait?.waitId ?? null,
            contractRole: run.wait?.contract?.role ?? null,
            waitActive: isNightPresentationWaitActive(session.id),
            currentTurnRole: gameSessionCore.getCurrentNightTurnRole(session),
            deadline: run.deadline,
            timerId: run.timerId,
            pendingTimers: clock.pendingCount(),
            phase: session.phase,
            dayIndex: session.dayIndex,
            nightResolution: session.nightResolution,
            commitEvents: observed.events.length,
            startedCount: io.broadcasts.filter((b) => b.event === 'night_turn_started').length,
        })
    })

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

    const expectedOrder = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']
    const submissions = [[jokerUuid, citizenUuid], [doctorUuid, citizenUuid], [guardUuid, citizenUuid], [witchHunterUuid, null]]
    for (let i = 0; i < submissions.length; i += 1) {
        assert.equal(run.stage, NIGHT_TURN_STAGES.SUBMITTING, `${expectedOrder[i]} 제출 구간`)
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), expectedOrder[i])
        assert.equal(clock.pendingCount(), 1, '제출 구간의 타이머는 정확히 하나다')
        assert.deepEqual(submit(submissions[i][0], submissions[i][1]), { ok: true })
    }

    assert.deepEqual(seen.map((entry) => entry.role), expectedOrder, '네 역할 모두 대기를 거쳤다')
    for (const entry of seen) {
        assert.equal(entry.stage, NIGHT_TURN_STAGES.PRESENTATION_WAIT, `${entry.role}: 종료 방송 중에는 연출 대기다`)
        assert.equal(entry.waitActive, true)
        assert.equal(entry.waitRole, entry.role, '대기 토큰은 그 역할의 것이다')
        assert.equal(entry.contractRole, entry.role, '그 역할의 계약이 대기에 묶여 있다')
        assert.equal(entry.currentTurnRole, null, '대기 중에는 현재 역할이 비어 있다')
        assert.equal(entry.deadline, null, '제출 deadline은 비워졌다')
        assert.equal(entry.timerId, null)
        assert.equal(entry.pendingTimers, 0, '대기용 타이머는 만들지 않는다(즉시 통과)')
        assert.equal(entry.phase, 'NIGHT')
        assert.equal(entry.dayIndex, nightDayIndex)
        assert.equal(entry.nightResolution, null, '대기 중에는 밤이 확정되지 않는다')
        assert.equal(entry.commitEvents, 0, '대기 중에는 사망·승패·종료가 하나도 시작되지 않는다')
    }
    assert.deepEqual(seen.map((entry) => entry.startedCount), [1, 2, 3, 4])
    assert.deepEqual(seen.map((entry) => entry.waitRevision), [1, 2, 3, 4])
    assert.equal(new Set(seen.map((entry) => entry.waitId)).size, 4)

    assert.deepEqual(turnEventLog(io), [
        ['night_turn_started', 'JOKER'], ['night_turn_ended', 'JOKER'],
        ['night_turn_started', 'DOCTOR'], ['night_turn_ended', 'DOCTOR'],
        ['night_turn_started', 'GUARD'], ['night_turn_ended', 'GUARD'],
        ['night_turn_started', 'WITCH_HUNTER'], ['night_turn_ended', 'WITCH_HUNTER'],
    ])
    assert.equal(session.phase, 'DAY')
    assert.equal(isNightPresentationWaitActive(session.id), false)
    assert.equal(run.stage, NIGHT_TURN_STAGES.STOPPED, '정리된 run의 단계는 무효화된다')
    assert.equal(run.wait, null)
    assert.equal(clock.pendingCount(), 0, '밤이 끝나면 밤 타이머는 남지 않는다')
    assert.equal(observed.winEvaluations('NIGHT'), 1)
})

test('AC-01/AC-04(F-25): 종료 방송 중의 재진입(중복 종료·제출·수동 판정·공통 최종화)은 단계를 진행시키지도 밤을 확정하지도 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-reentry' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    let run = null
    let prepareCalls = 0
    const countingPrepare = (...args) => {
        prepareCalls += 1
        return gameSessionCore.prepareNightResolution(...args)
    }
    const reentry = []
    observeNightTurnEnds(sockets, (payload) => {
        if (payload.role !== 'JOKER') return
        const staleToken = run.wait
        const { callback, getResponse } = countingCallback()
        handleResolveNight(io, sockets.get(doctorUuid), doctorUuid, { gameId: session.id }, callback, { prepare: countingPrepare })
        reentry.push({
            duplicateEnd: endNightTurn(run, 'JOKER'),
            sameRoleSubmit: submit(jokerUuid, citizenUuid),
            nextRoleSubmit: submit(doctorUuid, citizenUuid),
            resolveResponse: getResponse(),
            finalizeOutcome: finalizeNightForSession(io, session),
            staleRelease: releaseNightPresentationWait(run, { ...staleToken, waitId: 'forged' }),
            stageAfter: run.stage,
            startedCount: io.broadcasts.filter((b) => b.event === 'night_turn_started').length,
            nightActionsSize: session.nightActions.size,
            commitEvents: observed.events.length,
        })
    })

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)

    assert.equal(reentry.length, 1)
    const [attempt] = reentry
    assert.equal(attempt.duplicateEnd, undefined, '중복 종료는 조용한 no-op이다')
    const pending = { ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.' }
    assert.deepEqual(attempt.sameRoleSubmit, pending)
    assert.deepEqual(attempt.nextRoleSubmit, pending)
    assert.deepEqual(attempt.resolveResponse, pending)
    assert.equal(prepareCalls, 0, '연출 대기 중에는 준비조차 시작되지 않는다')
    assert.deepEqual(attempt.finalizeOutcome, { ok: false, code: 'ACTIONS_PENDING' })
    assert.equal(attempt.staleRelease, false, '위조된 토큰은 대기를 닫지 못한다')
    assert.equal(attempt.stageAfter, NIGHT_TURN_STAGES.PRESENTATION_WAIT, '재진입 뒤에도 단계는 그대로다')
    assert.equal(attempt.startedCount, 1, '단계가 두 번 진행되지 않았다')
    assert.equal(attempt.nightActionsSize, 1, '거부된 제출은 canonical에 기록되지 않는다')
    assert.equal(attempt.commitEvents, 0)
    assert.equal(observed.countOf('RESULT_RECORD_BUILD_STARTED'), 0, '경기 기록 조립도 시작되지 않는다')

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.phase, 'DAY')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 1)
})

test('AC-02(F-25): 킬과 치료가 서로 다른 ID의 두 사건으로 남고, 대상은 임시 회복을 거쳐 최종 생존한다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-kill-heal' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()
    const nightDayIndex = session.dayIndex
    const aliveBefore = [...session.players.values()].filter((p) => p.alive).length

    let run = null
    const contracts = new Map()
    const canonical = new Map()
    observeNightTurnEnds(sockets, (payload) => {
        contracts.set(payload.role, run.wait.contract)
        const progress = gameSessionCore.getNightProgress(session)
        canonical.set(payload.role, {
            events: (progress?.events ?? []).map((event) => ({ ...event })),
            recoveryState: progress?.recoveryStates?.get(citizenUuid) ?? null,
            alive: session.players.get(citizenUuid).alive,
            phase: session.phase,
            nightResolution: session.nightResolution,
            commitEvents: observed.events.length,
        })
    })

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, citizenUuid)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const kill = contracts.get('JOKER')
    assert.equal(kill.version, 1)
    assert.equal(kill.gameId, session.id)
    assert.equal(kill.nightDayIndex, nightDayIndex)
    assert.equal(kill.revision, 1)
    assert.deepEqual(kill.step, { role: 'JOKER', targetId: citizenUuid, status: 'RESOLVED' })
    assert.equal(kill.healingClosed, false, '광대 턴에서는 치료 가능성이 아직 열려 있다')
    assert.equal(kill.events.length, 1)
    assert.equal(kill.events[0].type, 'KILL')
    assert.equal(kill.events[0].targetId, citizenUuid)
    assert.deepEqual(kill.events[0].actorUuids, [jokerUuid])
    assert.equal(kill.recoveryStates[citizenUuid], 'PENDING_RECOVERY')

    const heal = contracts.get('DOCTOR')
    assert.equal(heal.revision, 2)
    assert.equal(heal.healingClosed, true, '의사 턴이 끝나면 치료 가능성이 닫힌다')
    assert.equal(heal.events.length, 1)
    assert.equal(heal.events[0].type, 'HEAL')
    assert.equal(heal.events[0].targetId, citizenUuid)
    assert.deepEqual(heal.events[0].actorUuids, [doctorUuid])
    assert.equal(heal.recoveryStates[citizenUuid], 'RECOVERED')
    assert.notEqual(heal.events[0].eventId, kill.events[0].eventId, '킬과 치료는 서로 다른 사건이다')

    assert.deepEqual(kill.events.map((event) => event.type), ['KILL'])
    assert.equal(kill.recoveryStates[citizenUuid], 'PENDING_RECOVERY')
    assert.deepEqual(canonical.get('JOKER').events, [{ type: 'KILL', targetId: citizenUuid }])
    assert.deepEqual(canonical.get('DOCTOR').events, [
        { type: 'KILL', targetId: citizenUuid },
        { type: 'HEAL', targetId: citizenUuid },
    ])
    assert.deepEqual(
        ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'].map((role) => canonical.get(role).recoveryState),
        ['PENDING_RECOVERY', 'RECOVERED', 'RECOVERED', 'RECOVERED'],
    )
    for (const role of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        assert.equal(canonical.get(role).alive, true, `${role} 대기 중 대상은 여전히 생존이다`)
        assert.equal(canonical.get(role).phase, 'NIGHT')
        assert.equal(canonical.get(role).nightResolution, null)
        assert.equal(canonical.get(role).commitEvents, 0)
    }

    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.equal([...session.players.values()].filter((p) => p.alive).length, aliveBefore)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 1)
    const applied = sockets.get(citizenUuid).emitted.find((e) => e.event === 'night_result_applied')
    assert.equal(applied.payload.victimUuid, null)
    assert.deepEqual(applied.payload.deathReveals, [])
})

test('AC-02(F-25): 반환된 계약을 변형해도 보관 계약·다음 반환·core 진행 자료가 오염되지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-defensive-copy' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    let run = null
    let observedResult = null
    observeNightTurnEnds(sockets, (payload) => {
        if (payload.role !== 'JOKER') return
        const handed = run.wait.contract
        const originalEventId = handed.events[0].eventId
        handed.events[0].targetId = 'tampered-target'
        handed.events[0].actorUuids.push('intruder')
        handed.events[0].recipients.push({ uuid: 'intruder', membershipId: null, socketId: null, perspectives: ['USER'] })
        handed.events[0].recipients[0].perspectives.push('GHOST')
        handed.recoveryStates[citizenUuid] = 'TAMPERED'
        handed.step.status = 'TAMPERED'
        handed.events.push({ eventId: 'forged' })

        const again = buildNightPresentationContract(run, { role: 'JOKER', revision: run.wait.revision })
        const progress = gameSessionCore.getNightProgress(session)
        observedResult = {
            originalEventId,
            again,
            coreEvents: (progress?.events ?? []).map((event) => ({ ...event })),
            coreRecoveryState: progress?.recoveryStates?.get(citizenUuid) ?? null,
        }
    })

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)

    assert.ok(observedResult, '광대 턴 종료를 관측했다')
    const { again } = observedResult
    assert.equal(again.events.length, 1)
    assert.equal(again.events[0].eventId, observedResult.originalEventId, '사건 ID는 재조회에도 같다')
    assert.equal(again.events[0].targetId, citizenUuid)
    assert.deepEqual(again.events[0].actorUuids, [jokerUuid])
    assert.deepEqual(again.events[0].recipients[0].perspectives.filter((p) => p === 'GHOST'), [])
    assert.equal(again.recoveryStates[citizenUuid], 'PENDING_RECOVERY')
    assert.deepEqual(again.step, { role: 'JOKER', targetId: citizenUuid, status: 'RESOLVED' })
    assert.deepEqual(observedResult.coreEvents, [{ type: 'KILL', targetId: citizenUuid }])
    assert.equal(observedResult.coreRecoveryState, 'PENDING_RECOVERY')

    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.players.get(citizenUuid).alive, false, '오염 시도가 판정을 바꾸지 않았다')
})

test('AC-03(F-25): 치료되지 않은 대상은 회복 대기→사망 후보를 거쳐 마지막 역할이 끝난 뒤에야 최종 사망한다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-pending-death' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    let run = null
    const contracts = new Map()
    const canonical = new Map()
    observeNightTurnEnds(sockets, (payload) => {
        contracts.set(payload.role, run.wait.contract)
        canonical.set(payload.role, {
            alive: session.players.get(citizenUuid).alive,
            phase: session.phase,
            nightResolution: session.nightResolution,
            commitEvents: observed.events.length,
            deliveries: [...nightResultDeliveryCounts(sockets).values()].reduce((a, b) => a + b, 0),
        })
    })

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, citizenUuid)

    assert.equal(contracts.get('JOKER').recoveryStates[citizenUuid], 'PENDING_RECOVERY')
    assert.equal(contracts.get('DOCTOR').recoveryStates[citizenUuid], 'DEATH_CANDIDATE', '의사 턴이 끝나면 사망 후보다')
    assert.equal(contracts.get('DOCTOR').healingClosed, true)
    assert.deepEqual(contracts.get('DOCTOR').events, [], '기권한 의사는 사건을 만들지 않는다')
    assert.equal(contracts.get('GUARD').events.length, 1)
    assert.equal(contracts.get('GUARD').events[0].type, 'INVESTIGATE')
    assert.equal(contracts.get('GUARD').events[0].targetId, citizenUuid)

    assert.deepEqual(submit(witchHunterUuid, citizenUuid), {
        ok: false, code: 'TARGET_NOT_DEAD', message: '요청을 처리할 수 없습니다.',
    })
    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.deepEqual(observed.events, [])
    submit(witchHunterUuid, null)

    for (const role of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        assert.equal(canonical.get(role).alive, true, `${role} 대기 중에는 아직 생존이다`)
        assert.equal(canonical.get(role).phase, 'NIGHT')
        assert.equal(canonical.get(role).nightResolution, null)
        assert.equal(canonical.get(role).commitEvents, 0)
        assert.equal(canonical.get(role).deliveries, 0, '대기 중에는 최종 결과가 전달되지 않는다')
    }
    assert.equal(session.players.get(citizenUuid).alive, false)
    assert.equal(session.players.get(citizenUuid).deathReason, 'ASSASSINATION')
    assert.equal(session.phase, 'DAY')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 1)
})

test('AC-05(F-25): 유효 제출자와 대상자만 수신 대상이고, 기권·무관 참가자는 어떤 관점으로도 들어오지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-recipients' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    let run = null
    const contracts = new Map()
    observeNightTurnEnds(sockets, (payload) => contracts.set(payload.role, run.wait.contract))

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const kill = contracts.get('JOKER').events[0]
    assert.deepEqual(
        kill.recipients.map((r) => r.uuid).sort(),
        [jokerUuid, citizenUuid].sort(),
        '제출한 광대와 그 대상자 둘뿐이다',
    )
    const actor = kill.recipients.find((r) => r.uuid === jokerUuid)
    assert.deepEqual(actor.perspectives, ['USER'])
    assert.equal(actor.socketId, sockets.get(jokerUuid).id)
    assert.equal(actor.membershipId, session.players.get(jokerUuid).membershipId ?? null)
    const target = kill.recipients.find((r) => r.uuid === citizenUuid)
    assert.deepEqual(target.perspectives, ['TARGET'])
    assert.equal(target.socketId, sockets.get(citizenUuid).id)
    assert.deepEqual(Object.keys(target).sort(), ['membershipId', 'perspectives', 'socketId', 'uuid'])

    for (const role of ['DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        assert.deepEqual(contracts.get(role).events, [], `${role}: 기권은 사건을 만들지 않는다`)
    }
    assert.deepEqual(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'].map((r) => contracts.get(r).revision), [1, 2, 3, 4])

    const received = new Set()
    for (const socket of sockets.values()) for (const entry of socket.emitted) received.add(entry.event)
    assert.deepEqual([...received].sort(), [
        'night_action_success', 'night_actions_resolved', 'night_presentation_wait',
        'night_result_applied', 'night_turn_ended', 'night_turn_started',
    ])
    for (const [uuid, socket] of sockets) {
        const count = socket.emitted.filter((e) => e.event === 'night_action_success').length
        assert.equal(count, [jokerUuid, citizenUuid].includes(uuid) ? 1 : 0, `${uuid}: 성공 사건 수신 건수`)
    }
    for (const broadcast of turnBroadcasts(io)) {
        const keys = Object.keys(broadcast.payload).sort()
        assert.deepEqual(
            keys,
            broadcast.event === 'night_turn_started' ? ['dayIndex', 'deadline', 'gameId', 'role'] : ['dayIndex', 'gameId', 'role'],
        )
        const serialized = JSON.stringify(broadcast.payload)
        for (const uuid of session.players.keys()) {
            assert.equal(serialized.includes(uuid), false, '공개 턴 payload에 참가자 uuid가 실리지 않는다')
        }
    }
})

test('AC-05/AC-06(F-25): 의사의 자기 치료는 한 수신 항목에 사용자·대상자 관점이 합쳐진다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-self-heal' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    let run = null
    const contracts = new Map()
    observeNightTurnEnds(sockets, (payload) => contracts.set(payload.role, run.wait.contract))

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, doctorUuid)
    submit(doctorUuid, doctorUuid)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const heal = contracts.get('DOCTOR').events[0]
    assert.equal(heal.type, 'HEAL')
    assert.equal(heal.targetId, doctorUuid)
    assert.deepEqual(heal.actorUuids, [doctorUuid])
    assert.equal(heal.recipients.length, 1, '같은 계정의 두 자격은 한 항목으로 합쳐진다')
    assert.equal(heal.recipients[0].uuid, doctorUuid)
    assert.deepEqual(heal.recipients[0].perspectives, ['USER', 'TARGET'])
    assert.equal(contracts.get('DOCTOR').recoveryStates[doctorUuid], 'RECOVERED')

    assert.equal(session.players.get(doctorUuid).alive, true, '자기 치료로 최종 생존한다')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
})

test('AC-05(F-25): 회복 차단된 행위자는 사용자 자격을 얻지 못하고, 회복된 행위자는 얻는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-recovery-block' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    let run = null
    const contracts = new Map()
    observeNightTurnEnds(sockets, (payload) => contracts.set(payload.role, run.wait.contract))

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, guardUuid)
    submit(doctorUuid, null)
    assert.deepEqual(submit(guardUuid, citizenUuid), { ok: true })
    submit(witchHunterUuid, null)

    const investigate = contracts.get('GUARD')
    assert.equal(investigate.step.status, 'RECOVERY_BLOCKED', 'core가 그 역할의 행동을 집계에서 뺐다')
    assert.deepEqual(investigate.events, [], '집계에서 빠진 행동은 사건도 수신 대상도 만들지 않는다')
    assert.equal(investigate.revision, 3, '사건이 없어도 완료 revision은 오른다')
    assert.equal(investigate.recoveryStates[guardUuid], 'DEATH_CANDIDATE')
})

test('AC-05(F-25): 후보를 구한 뒤 자격을 잃은 연결은 수신 대상에서 빠지고 교체된 현재 연결이 대신 들어온다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-eligibility' })
    const registry = new Map([...session.players.keys()].map((uuid) => [uuid, `sock-${uuid}`]))
    gameSessionSocketLayer.setOnlineUsersRegistry(registry)
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    let run = null
    const contracts = new Map()
    observeNightTurnEnds(sockets, (payload) => contracts.set(payload.role, run.wait.contract))

    const replacement = createFakeSocket(citizenUuid, { id: 'sock-citizen-new' })
    replacement.rooms.add(session.channelId)
    replacement.data.activeGameId = session.id
    io.sockets.sockets.set(replacement.id, replacement)
    registry.set(citizenUuid, replacement.id)

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    sockets.get(guardUuid).rooms.delete(session.channelId)
    submit(guardUuid, citizenUuid)
    submit(witchHunterUuid, null)

    const kill = contracts.get('JOKER').events[0]
    const target = kill.recipients.find((r) => r.uuid === citizenUuid)
    assert.ok(target, '교체된 현재 연결은 정상 수신 대상이다(양성 대조)')
    assert.equal(target.socketId, replacement.id, '옛 소켓이 아니라 현재 연결이다')
    assert.equal(kill.recipients.filter((r) => r.socketId === sockets.get(citizenUuid).id).length, 0)

    const investigate = contracts.get('GUARD').events[0]
    assert.equal(investigate.type, 'INVESTIGATE')
    assert.deepEqual(investigate.actorUuids, [guardUuid], '역할 확정 당시의 유효 행동 근거는 남는다')
    assert.deepEqual(investigate.recipients.map((r) => r.uuid), [citizenUuid], '채널에서 빠진 조사자는 수신 대상이 아니다')
})

test('AC-05(F-25): 마녀사냥꾼의 확인 대상이 확정 사망자여도 연결이 유지되면 수신 대상이다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-dead-target', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)

    const firstClock = createManualClock()
    startNightTurnSequence(io, session, { ...firstClock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.players.get(citizenUuid).alive, false)
    stopDayPhaseTimer(session.id)

    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null

    let run = null
    const contracts = new Map()
    observeNightTurnEnds(sockets, (payload) => contracts.set(payload.role, run.wait.contract))

    const clock = createManualClock()
    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    assert.deepEqual(submit(witchHunterUuid, citizenUuid), { ok: true })

    const confirm = contracts.get('WITCH_HUNTER').events[0]
    assert.equal(confirm.type, 'CONFIRM')
    assert.equal(confirm.targetId, citizenUuid)
    assert.deepEqual(confirm.actorUuids, [witchHunterUuid])
    assert.deepEqual(
        confirm.recipients.map((r) => r.uuid).sort(),
        [witchHunterUuid, citizenUuid].sort(),
        '확정 사망한 대상자도 연결이 유지되면 수신 대상이다',
    )
    assert.deepEqual(confirm.recipients.find((r) => r.uuid === citizenUuid).perspectives, ['TARGET'])
    assert.equal(session.players.get(citizenUuid).alive, false, '수신 대상 계산이 생존 상태를 바꾸지 않는다')
})

test('AC-05/AC-06(F-25): 복수 행위자의 다수결 성공은 제출자 전원을 사용자 자격으로 묶고, 동률은 사건을 만들지 않는다', () => {
    const agreed = commitDualJokerSessionAtNight({ id: 'f25-plurality-ok' })
    const agreedWiring = wireSession(agreed.session)
    const agreedClock = createManualClock()
    let agreedRun = null
    const agreedContracts = new Map()
    observeNightTurnEnds(agreedWiring.sockets, (payload) => agreedContracts.set(payload.role, agreedRun.wait.contract))

    agreedRun = startNightTurnSequence(agreedWiring.io, agreed.session, { ...agreedClock, randomFn: () => 0.5 })
    for (const jokerUuid of agreed.jokerUuids) {
        assert.deepEqual(agreedWiring.submit(jokerUuid, agreed.otherUuids[0]), { ok: true })
    }

    const kill = agreedContracts.get('JOKER').events[0]
    assert.equal(kill.type, 'KILL')
    assert.equal(kill.targetId, agreed.otherUuids[0])
    assert.deepEqual([...kill.actorUuids].sort(), [...agreed.jokerUuids].sort(), '유효 제출을 낸 두 행위자 모두 사용자 자격이다')
    assert.deepEqual(
        kill.recipients.map((r) => r.uuid).sort(),
        [...agreed.jokerUuids, agreed.otherUuids[0]].sort(),
    )

    const tied = commitDualJokerSessionAtNight({ id: 'f25-plurality-tie' })
    const tiedWiring = wireSession(tied.session)
    const tiedClock = createManualClock()
    let tiedRun = null
    const tiedContracts = new Map()
    observeNightTurnEnds(tiedWiring.sockets, (payload) => tiedContracts.set(payload.role, tiedRun.wait.contract))

    tiedRun = startNightTurnSequence(tiedWiring.io, tied.session, { ...tiedClock, randomFn: () => 0.5 })
    tiedWiring.submit(tied.jokerUuids[0], tied.otherUuids[0])
    tiedWiring.submit(tied.jokerUuids[1], tied.otherUuids[1])

    assert.equal(tiedContracts.get('JOKER').step.status, 'NO_RESULT', '동률은 그 역할의 행동을 없던 것으로 만든다')
    assert.deepEqual(tiedContracts.get('JOKER').events, [], '합의 실패는 사건도 수신 대상도 만들지 않는다')
    assert.equal(tiedContracts.get('JOKER').revision, 1, '사건이 없어도 완료 revision은 오른다')
})

test('AC-06(F-25): 무인 역할·미제출 만료·존재하지 않는 직업도 같은 대기를 거치고 밤 타이머를 남기지 않는다', () => {
    const { session } = commitFullRoleSessionAtNight({ id: 'f25-exceptions', dayIndex: 0 })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    let run = null
    const seen = []
    observeNightTurnEnds(sockets, (payload) => {
        seen.push({
            role: payload.role,
            stage: run.stage,
            events: run.wait.contract.events,
            status: run.wait.contract.step.status,
            revision: run.wait.contract.revision,
            pendingTimers: clock.pendingCount(),
            commitEvents: observed.events.length,
        })
    })

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    clock.advance(NIGHT_TURN_DURATION_MS * 4)

    assert.deepEqual(seen.map((entry) => entry.role), ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])
    for (const entry of seen) {
        assert.equal(entry.stage, NIGHT_TURN_STAGES.PRESENTATION_WAIT, `${entry.role}: 사건이 없어도 대기를 거친다`)
        assert.deepEqual(entry.events, [], `${entry.role}: 사건 없는 역할의 계약은 비어 있다`)
        assert.equal(entry.pendingTimers, 0, '대기용 타이머는 생기지 않는다')
    }
    assert.deepEqual(seen.map((entry) => entry.revision), [1, 2, 3, 4])
    assert.equal(seen[3].status, 'NO_ACTOR', '아직 능력이 없는 마녀사냥꾼은 무행위자다')
    assert.equal(session.phase, 'DAY')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    assert.equal(clock.pendingCount(), 0, '밤이 끝나면 밤 타이머가 하나도 남지 않는다')
    assert.equal(isNightPresentationWaitActive(session.id), false)
})

test('AC-06(F-25, 2026-09-22 개정): 구성이 없는 구버전 세션에서는 존재하지 않는 직업의 턴도 완료 계약을 남기고 순서를 건너뛰지 않는다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight({ id: 'f25-no-role' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    let run = null
    const contracts = new Map()
    observeNightTurnEnds(sockets, (payload) => contracts.set(payload.role, run.wait.contract))

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    for (const jokerUuid of jokerUuids) submit(jokerUuid, null)
    clock.advance(NIGHT_TURN_DURATION_MS * 4)

    assert.deepEqual([...contracts.keys()], ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'], '네 역할 모두 확정된다')
    const statuses = ['DOCTOR', 'GUARD', 'WITCH_HUNTER'].map((role) => contracts.get(role).step.status)
    assert.ok(statuses.includes('NO_ROLE'), `존재하지 않는 직업이 있어야 한다: ${statuses.join(',')}`)
    for (const role of ['DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        if (contracts.get(role).step.status === 'RESOLVED') continue
        assert.deepEqual(contracts.get(role).events, [], `${role}: 확정되지 않은 역할은 사건이 없다`)
    }
    assert.deepEqual(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'].map((r) => contracts.get(r).revision), [1, 2, 3, 4])
    assert.equal(session.nightResolution !== null || session.phase !== 'NIGHT', true, '밤은 정상적으로 확정된다')
})

test('AC-04(F-25): 이전 밤·정리된 run의 대기 토큰은 현재 진행을 닫지 못한다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f25-stale-token' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    let run = null
    let jokerToken = null
    observeNightTurnEnds(sockets, (payload) => {
        if (payload.role === 'JOKER') jokerToken = run.wait
    })

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    assert.ok(jokerToken)

    const startedBefore = io.broadcasts.filter((b) => b.event === 'night_turn_started').length
    assert.equal(releaseNightPresentationWait(run, jokerToken), false)
    assert.equal(io.broadcasts.filter((b) => b.event === 'night_turn_started').length, startedBefore)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')

    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.phase, 'DAY')

    const dayIndexAfter = session.dayIndex
    assert.equal(releaseNightPresentationWait(run, jokerToken), false)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, dayIndexAfter)
    assert.equal(clock.pendingCount(), 0)
})

test('AC-01(F-26a): 역할별 성공 사건은 능력 사용자·대상자에게만 전달되고 다른 역할·비참가자는 0건이다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac01' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    const outsider = createFakeSocket('f26a-ac01-outsider')
    outsider.rooms.add(session.channelId)
    io.sockets.sockets.set(outsider.id, outsider)

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, doctorUuid)
    submit(doctorUuid, doctorUuid)
    submit(guardUuid, citizenUuid)
    submit(witchHunterUuid, null)

    assert.equal(sockets.get(jokerUuid).countReceived('night_action_success'), 1, '광대는 KILL의 USER다')
    assert.equal(sockets.get(guardUuid).countReceived('night_action_success'), 1, '경비원은 INVESTIGATE의 USER다')
    assert.equal(sockets.get(citizenUuid).countReceived('night_action_success'), 1, '시민은 INVESTIGATE의 TARGET이다')
    assert.equal(sockets.get(doctorUuid).countReceived('night_action_success'), 2, '의사는 KILL의 TARGET이자 HEAL의 USER/TARGET이다')
    assert.equal(sockets.get(witchHunterUuid).countReceived('night_action_success'), 0, '기권한 역할은 어떤 사건도 받지 못한다')
    assert.equal(outsider.countReceived('night_action_success'), 0, '이 판의 참가자가 아닌 소켓은 받지 못한다')
})

test('AC-01(F-26a): 계약 수신자 목록은 계산 시점의 사실이다 — 첫 수신자 전달 중 대상자가 자격을 잃으면 후속 전송은 없다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac01-reverify' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    const jokerSocket = sockets.get(jokerUuid)
    const citizenSocket = sockets.get(citizenUuid)
    const originalEmit = jokerSocket.emit.bind(jokerSocket)
    jokerSocket.emit = (event, payload) => {
        if (event === 'night_action_success') citizenSocket.rooms.delete(session.channelId)
        return originalEmit(event, payload)
    }

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    assert.equal(jokerSocket.countReceived('night_action_success'), 1, '먼저 전달된 행위자는 정상 수신한다')
    assert.equal(citizenSocket.countReceived('night_action_success'), 0, '전달 도중 자격을 잃은 대상자는 받지 못한다')
})

test('AC-02(F-26a): 대상 전용 성공 사건 payload는 허용 키만 가지고 조사자 신원·조사 결과를 담지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac02' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const nightDayIndex = session.dayIndex

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    submit(doctorUuid, null)
    submit(guardUuid, citizenUuid)
    submit(witchHunterUuid, null)

    const citizenSocket = sockets.get(citizenUuid)
    const targetEntries = citizenSocket.emitted.filter((e) => e.event === 'night_action_success')
    assert.equal(targetEntries.length, 1)
    const targetPayload = targetEntries[0].payload
    assert.deepEqual(Object.keys(targetPayload).sort(), ['eventId', 'gameId', 'nightDayIndex', 'perspectives', 'type'])
    assert.deepEqual(targetPayload.perspectives, ['TARGET'])
    assert.equal(targetPayload.type, 'INVESTIGATE')
    assert.equal(targetPayload.gameId, session.id)
    assert.equal(targetPayload.nightDayIndex, nightDayIndex)
    const serializedTarget = JSON.stringify(targetPayload)
    assert.equal(serializedTarget.includes(guardUuid), false, '조사자 uuid가 담기지 않는다')
    assert.equal(serializedTarget.includes('role'), false, '조사 결과(대상의 실제 역할)가 담기지 않는다')
    assert.equal(citizenSocket.countReceived('night_action_result'), 0, '대상자는 기존 조사 결과 경로도 받지 않는다')

    const guardSocket = sockets.get(guardUuid)
    const guardPayload = guardSocket.emitted.find((e) => e.event === 'night_action_success').payload
    assert.deepEqual(Object.keys(guardPayload).sort(), ['eventId', 'gameId', 'nightDayIndex', 'perspectives', 'targetId', 'type'])
    assert.equal(guardPayload.targetId, citizenUuid)
    assert.equal(JSON.stringify(guardPayload).includes('role'), false)
    assert.equal(guardSocket.countReceived('night_action_result'), 1, '조사자 본인은 기존 결과 경로로 역할을 받는다(변경 없음)')
})

test('AC-03(F-26a): 복수 인원 역할에서 명시적으로 기권한 행위자는 사용자 사건 수신자에서 제외된다', () => {
    const { session, jokerUuids, otherUuids } = commitDualJokerSessionAtNight({ id: 'f26a-ac03-explicit' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuids[0], otherUuids[0])
    submit(jokerUuids[1], null)

    assert.equal(sockets.get(jokerUuids[0]).countReceived('night_action_success'), 1, '유효 제출자는 사용자 사건을 받는다')
    assert.equal(sockets.get(jokerUuids[1]).countReceived('night_action_success'), 0, '명시적 기권자는 받지 못한다')
    assert.equal(sockets.get(otherUuids[0]).countReceived('night_action_success'), 1, '대상자는 그대로 받는다')

    const payload = sockets.get(jokerUuids[0]).emitted.find((e) => e.event === 'night_action_success').payload
    assert.deepEqual(payload.perspectives, ['USER'])
    assert.equal(payload.targetId, otherUuids[0])
})

test('AC-03(F-26a): 시간 만료로 기권 처리된 행위자도 사용자 사건 수신자에서 제외된다', () => {
    const { session, jokerUuids, otherUuids } = commitDualJokerSessionAtNight({ id: 'f26a-ac03-timeout' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuids[0], otherUuids[0])
    clock.advance(NIGHT_TURN_DURATION_MS)
    drainPresentationWait(session)

    assert.equal(sockets.get(jokerUuids[0]).countReceived('night_action_success'), 1)
    assert.equal(sockets.get(jokerUuids[1]).countReceived('night_action_success'), 0, '시간 만료 기권자도 받지 못한다')
    assert.equal(sockets.get(otherUuids[0]).countReceived('night_action_success'), 1)
})

test('AC-04(F-26a): 사망한 대상자가 연결 중이면 확정 성공 사건을 실제로 수신한다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac04', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)

    const firstClock = createManualClock()
    startNightTurnSequence(io, session, { ...firstClock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.players.get(citizenUuid).alive, false)
    stopDayPhaseTimer(session.id)

    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null

    const clock = createManualClock()
    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    assert.deepEqual(submit(witchHunterUuid, citizenUuid), { ok: true })

    const citizenSocket = sockets.get(citizenUuid)
    assert.equal(citizenSocket.connected, true)
    assert.equal(session.players.get(citizenUuid).alive, false, '수신 확인이 생존 상태를 바꾸지 않는다')

    const confirmEntries = citizenSocket.emitted.filter((e) => e.event === 'night_action_success' && e.payload.type === 'CONFIRM')
    assert.equal(confirmEntries.length, 1, '사망했지만 연결·참여가 유지되는 대상자는 CONFIRM 성공 사건을 받는다')
    assert.deepEqual(confirmEntries[0].payload.perspectives, ['TARGET'])
    assert.deepEqual(Object.keys(confirmEntries[0].payload).sort(), ['eventId', 'gameId', 'nightDayIndex', 'perspectives', 'type'])

    for (const uuid of [doctorUuid, guardUuid]) {
        assert.equal(sockets.get(uuid).countReceived('night_action_success'), 0, `${uuid}: 무관 참가자는 받지 않는다`)
    }
    assert.equal(sockets.get(jokerUuid).countReceived('night_action_success'), 1)
    assert.equal(sockets.get(jokerUuid).emitted.some((e) => e.event === 'night_action_success' && e.payload.type === 'CONFIRM'), false)
    assert.equal(sockets.get(witchHunterUuid).countReceived('night_action_success'), 1, '마녀사냥꾼 본인은 CONFIRM의 USER 관점으로 받는다')
})

test('AC-04(F-26a): 같은 대상이 연결이 끊긴 상태라면 성공 사건을 받지 못한다(음성 대조)', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac04-negative', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)

    const firstClock = createManualClock()
    startNightTurnSequence(io, session, { ...firstClock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.players.get(citizenUuid).alive, false)
    stopDayPhaseTimer(session.id)

    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    sockets.get(citizenUuid).connected = false

    const before = sockets.get(citizenUuid).countReceived('night_action_success')

    const clock = createManualClock()
    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    assert.deepEqual(submit(witchHunterUuid, citizenUuid), { ok: true })

    assert.equal(sockets.get(citizenUuid).countReceived('night_action_success'), before, '연결이 끊긴 대상자는 새 성공 사건을 받지 못한다')
    assert.equal(
        sockets.get(citizenUuid).emitted.some((e) => e.event === 'night_action_success' && e.payload.type === 'CONFIRM'),
        false,
        'CONFIRM은 전달되지 않는다',
    )
})

test('AC-05(F-26a): 능력 사용자와 대상자가 같은 자기 치료 사건은 그 소켓에 정확히 한 번만 전달된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac05' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, doctorUuid)
    submit(doctorUuid, doctorUuid)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const doctorSocket = sockets.get(doctorUuid)
    const healEntries = doctorSocket.emitted.filter((e) => e.event === 'night_action_success' && e.payload.type === 'HEAL')
    assert.equal(healEntries.length, 1, 'HEAL 사건은 의사 소켓에 정확히 한 번만 전달된다')
    assert.deepEqual(healEntries[0].payload.perspectives, ['USER', 'TARGET'])
    assert.equal(healEntries[0].payload.targetId, doctorUuid)

    for (const [uuid, socket] of sockets) {
        if (uuid === doctorUuid) continue
        assert.equal(
            socket.emitted.filter((e) => e.event === 'night_action_success' && e.payload.type === 'HEAL').length,
            0,
            `${uuid}: HEAL 사건은 다른 소켓에 가지 않는다`,
        )
    }
    assert.equal(session.players.get(doctorUuid).alive, true)
})

test('AC-06(F-26a): 성공 사건 payload마다 게임 ID·밤 번호·사건 ID가 포함되고, 같은 사건은 같은 ID·다른 사건은 다른 ID다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac06' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()
    const nightDayIndex = session.dayIndex

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, doctorUuid)
    submit(doctorUuid, doctorUuid)
    submit(guardUuid, citizenUuid)
    submit(witchHunterUuid, null)

    const allSuccess = []
    for (const socket of sockets.values()) {
        for (const entry of socket.emitted) {
            if (entry.event === 'night_action_success') allSuccess.push(entry.payload)
        }
    }
    assert.ok(allSuccess.length > 0)
    for (const payload of allSuccess) {
        assert.equal(payload.gameId, session.id)
        assert.equal(payload.nightDayIndex, nightDayIndex)
        assert.equal(typeof payload.eventId, 'string')
        assert.ok(payload.eventId.length > 0)
    }

    const killAtActor = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success').payload
    const killAtTarget = sockets.get(doctorUuid).emitted.find((e) => e.event === 'night_action_success' && e.payload.type === 'KILL').payload
    const healAtDoctor = sockets.get(doctorUuid).emitted.find((e) => e.event === 'night_action_success' && e.payload.type === 'HEAL').payload

    assert.equal(killAtTarget.eventId, killAtActor.eventId, '같은 사건의 사용자·대상 payload는 eventId가 같다')
    assert.notEqual(killAtActor.eventId, healAtDoctor.eventId, 'KILL과 HEAL은 서로 다른 사건 ID다')
})

test('AC-06(F-26a): 같은 역할의 사건이라도 밤이 다르면 사건 ID가 다르다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac06-nights', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)

    const firstClock = createManualClock()
    startNightTurnSequence(io, session, { ...firstClock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    const firstKillPayload = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success').payload
    stopDayPhaseTimer(session.id)

    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null

    const secondClock = createManualClock()
    startNightTurnSequence(io, session, { ...secondClock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    assert.deepEqual(submit(witchHunterUuid, citizenUuid), { ok: true })
    const secondConfirmEntries = sockets.get(witchHunterUuid).emitted.filter((e) => e.event === 'night_action_success')
    const secondConfirmPayload = secondConfirmEntries[secondConfirmEntries.length - 1].payload

    assert.notEqual(firstKillPayload.eventId, secondConfirmPayload.eventId)
    assert.equal(firstKillPayload.nightDayIndex < secondConfirmPayload.nightDayIndex, true)
})

function ackSuccess(sockets, uuid, payload) {
    const { callback, getResponse } = countingCallback()
    sockets.get(uuid).trigger('acknowledge_night_action_success', payload, callback)
    return getResponse()
}

test('AC-05(F-26b): 완료 ACK은 서버 기록을 정확히 한 번 바꾸고, 같은 요청의 재전달은 duplicate:true다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26b-ac05-basic', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    assert.ok(killEntry, '전제: 광대가 KILL 성공 사건을 받아야 한다')
    const payload = {
        gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId,
    }

    const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
    assert.equal(stored?.byEvent.get(payload.eventId)?.get(jokerUuid)?.completed, false,
        '전제: 완료 전 기록은 completed:false다')

    const first = ackSuccess(sockets, jokerUuid, payload)
    assert.deepEqual(first, { ok: true, duplicate: false })
    assert.equal(stored.byEvent.get(payload.eventId).get(jokerUuid).completed, true)

    const second = ackSuccess(sockets, jokerUuid, payload)
    assert.deepEqual(second, { ok: true, duplicate: true })
    assert.equal(stored.byEvent.get(payload.eventId).get(jokerUuid).completed, true)
})

test('AC-03/AC-05(F-26b): 광대가 의사를 공격하고 의사가 자신을 치료하면 KILL·HEAL 두 사건이 각각 한 번씩만 완료된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } =
        commitFullRoleSessionAtNight({ id: 'f26b-ac03-selfheal', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, doctorUuid)
    submit(doctorUuid, doctorUuid)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const jokerEvents = sockets.get(jokerUuid).emitted.filter((e) => e.event === 'night_action_success')
    assert.equal(jokerEvents.length, 1)
    const doctorHealEvents = sockets.get(doctorUuid).emitted
        .filter((e) => e.event === 'night_action_success' && e.payload.type === 'HEAL')
    assert.equal(doctorHealEvents.length, 1, '자기 치료는 한 소켓에 정확히 한 번만 전달돼야 한다(USER·TARGET 합쳐진 recipient)')
    assert.deepEqual([...doctorHealEvents[0].payload.perspectives].sort(), ['TARGET', 'USER'])
    assert.notEqual(jokerEvents[0].payload.eventId, doctorHealEvents[0].payload.eventId, 'KILL과 HEAL은 서로 다른 사건이어야 한다')

    const killPayload = {
        gameId: session.id, nightDayIndex: jokerEvents[0].payload.nightDayIndex, eventId: jokerEvents[0].payload.eventId,
    }
    const healPayload = {
        gameId: session.id, nightDayIndex: doctorHealEvents[0].payload.nightDayIndex, eventId: doctorHealEvents[0].payload.eventId,
    }

    assert.deepEqual(ackSuccess(sockets, jokerUuid, killPayload), { ok: true, duplicate: false })
    assert.deepEqual(ackSuccess(sockets, doctorUuid, healPayload), { ok: true, duplicate: false })
    assert.deepEqual(ackSuccess(sockets, doctorUuid, healPayload), { ok: true, duplicate: true })
})

test('AC-05(F-26b): 형태 오류·비수신자·변조된 사건 ID·다른 게임·옛 소켓의 완료 요청은 전부 거부되고 완료 상태를 바꾸지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26b-ac05-reject', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const payload = {
        gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId,
    }

    assert.equal(ackSuccess(sockets, jokerUuid, {}).code, 'INVALID_PAYLOAD')
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, nightDayIndex: -1 }).code, 'INVALID_PAYLOAD')
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, eventId: '' }).code, 'INVALID_PAYLOAD')

    assert.equal(ackSuccess(sockets, guardUuid, payload).code, 'NOT_ELIGIBLE')

    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, eventId: 'tampered-event-id' }).code, 'STALE_EVENT')

    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, gameId: 'game-other' }).code, 'NOT_ELIGIBLE')

    const reconnected = createFakeSocket(jokerUuid, { id: sockets.get(jokerUuid).id })
    io.sockets.sockets.set(reconnected.id, reconnected)
    gameSessionSocketLayer.registerGameHandlers(io, reconnected, jokerUuid)
    assert.equal(ackSuccess(sockets, jokerUuid, payload).code, 'NOT_ELIGIBLE', '옛 소켓 객체의 완료 요청이 통과했다')
    const reconnectedAck = countingCallback()
    reconnected.trigger('acknowledge_night_action_success', payload, reconnectedAck.callback)
    assert.equal(reconnectedAck.getResponse().code, 'NOT_ELIGIBLE', '이 사건을 실제로 받지 않은 새 연결이 완료를 통과했다')

    const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
    assert.equal(stored.byEvent.get(payload.eventId).get(jokerUuid).completed, false)
})

test('AC-05(F-26b) 전이: 다음 밤이 시작되면 이전 밤의 완료 수신 보관함이 교체되고 옛 요청은 STALE_EVENT로 거부된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26b-ac05-nextnight', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const firstClock = createManualClock()

    startNightTurnSequence(io, session, { ...firstClock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const firstPayload = {
        gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId,
    }
    gameSessionSocketLayer.__testables.stopDayPhaseTimer(session.id)

    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    assert.notEqual(session.dayIndex, firstPayload.nightDayIndex, '전제: 자동 최종화가 다음 밤으로 넘어가야 한다')

    const secondClock = createManualClock()
    startNightTurnSequence(io, session, { ...secondClock, randomFn: () => 0.5 })

    const ack = ackSuccess(sockets, jokerUuid, firstPayload)
    assert.equal(ack.code, 'STALE_EVENT', '다음 밤 시작 뒤에도 이전 밤 사건을 완료할 수 있었다')
})

test('AC-05(F-26b): finalizeGameSessionEnd는 완료 수신 보관함을 지우고, 그 뒤의 완료 요청은 STALE_EVENT다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26b-ac05-finalize', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const payload = {
        gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId,
    }
    assert.ok(gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session),
        '전제: 완료 수신 보관함이 있어야 한다')

    gameSessionSocketLayer.__testables.finalizeGameSessionEnd(
        io, session, 'TEST_TERMINATION', null, [jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid],
    )
    assert.equal(gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session), null,
        'finalizeGameSessionEnd가 완료 수신 보관함을 지우지 않았다')

    const ack = ackSuccess(sockets, jokerUuid, payload)
    assert.equal(ack.code, 'STALE_EVENT')
})

test('AC-05(F-26b): 콜백이 없어도 검증·최초 완료 기록은 그대로 수행되고, 응답만 생략된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26b-ac05-nocallback', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const payload = {
        gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId,
    }

    assert.doesNotThrow(() => sockets.get(jokerUuid).trigger('acknowledge_night_action_success', payload))

    const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
    assert.equal(stored.byEvent.get(payload.eventId).get(jokerUuid).completed, true,
        '콜백 없는 요청도 최초 완료를 기록해야 한다')

    assert.deepEqual(ackSuccess(sockets, jokerUuid, payload), { ok: true, duplicate: true })
})

test('AC-05(F-26b): gameId·nightDayIndex·eventId 외의 여분 필드가 있으면 INVALID_PAYLOAD다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26b-ac05-extrakeys', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const payload = {
        gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId,
    }

    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, uuid: jokerUuid }).code, 'INVALID_PAYLOAD')
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, membershipId: 'mem-x' }).code, 'INVALID_PAYLOAD')
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, extra: true }).code, 'INVALID_PAYLOAD')

    assert.deepEqual(ackSuccess(sockets, jokerUuid, payload), { ok: true, duplicate: false })
})

test('AC-05(F-26b) 전이: DAY n+1로 넘어간 뒤에도 그 밤의 사건을 완료할 수 있고, 두 밤을 더 지난 뒤의 완료는 STALE_EVENT다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26b-ac05-daywindow', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const payload = {
        gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId,
    }
    assert.equal(session.phase, 'DAY', '전제: 자동 최종화가 다음 낮으로 넘어가야 한다')
    assert.equal(session.dayIndex, payload.nightDayIndex + 1, '전제: 낮 번호가 그 밤의 다음 번호여야 한다')

    assert.deepEqual(ackSuccess(sockets, jokerUuid, payload), { ok: true, duplicate: false })

    session.phase = 'NIGHT'
    session.dayIndex = payload.nightDayIndex + 2

    const staleAck = ackSuccess(sockets, jokerUuid, payload)
    assert.equal(staleAck.code, 'STALE_EVENT', '수명 밖(두 밤 뒤)의 완료 요청이 통과했다')
})

function getSnapshot(socket, payload = {}) {
    const { callback, getResponse } = countingCallback()
    socket.trigger('get_session_snapshot', payload, callback)
    return getResponse()
}

function reconnectSocket(io, session, uuid, { joinChannel = true } = {}) {
    const next = createFakeSocket(uuid)
    if (joinChannel) next.rooms.add(session.channelId)
    next.data.activeGameId = session.id
    io.sockets.sockets.set(next.id, next)
    gameSessionSocketLayer.registerGameHandlers(io, next, uuid)
    return next
}

function startNightWithKill(id) {
    const ctx = commitFullRoleSessionAtNight({ id, dayIndex: 2 })
    const wired = wireSession(ctx.session)
    const clock = createManualClock()
    startNightTurnSequence(wired.io, ctx.session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(wired.submit(ctx.jokerUuid, ctx.citizenUuid), { ok: true })
    const killEntry = wired.sockets.get(ctx.jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    assert.ok(killEntry, '전제: 광대가 KILL 성공 사건을 받아야 한다')
    assert.equal(ctx.session.phase, 'NIGHT', '전제: 한 역할만 끝났으므로 같은 밤이 계속된다')
    return { ...ctx, ...wired, clock, successPayload: killEntry.payload }
}

test('AC-01(F-26): 전달된 성공 사건의 제한 payload가 수신 기록에 보관되고, 재접속 조회가 그것을 그대로 복원한다', () => {
    const { session, io, jokerUuid, citizenUuid, successPayload } = startNightWithKill('f26-ac01-recover')

    const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
    const jokerRecord = stored.byEvent.get(successPayload.eventId).get(jokerUuid)
    assert.deepEqual(jokerRecord.payload, successPayload,
        '전달한 그 payload가 필드별로 보관돼야 복원할 자료가 있다')
    assert.notEqual(jokerRecord.payload, successPayload, '보관본은 전달본과 같은 참조여서는 안 된다')

    const reconnected = reconnectSocket(io, session, jokerUuid)
    const response = getSnapshot(reconnected, { gameId: session.id })
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.deepEqual(response.nightSuccessRecovery, [successPayload],
        '미완료 사건이 같은 eventId·같은 허용 필드로 복원되지 않았다')
    assert.notEqual(response.nightSuccessRecovery[0], jokerRecord.payload,
        '응답이 보관본 참조를 그대로 내보냈다(응답 변형이 보관본을 오염시킨다)')

    const targetReconnected = reconnectSocket(io, session, citizenUuid)
    const targetResponse = getSnapshot(targetReconnected, { gameId: session.id })
    assert.equal(targetResponse.nightSuccessRecovery.length, 1)
    assert.deepEqual(Object.keys(targetResponse.nightSuccessRecovery[0]).sort(),
        ['eventId', 'gameId', 'nightDayIndex', 'perspectives', 'type'])
    assert.deepEqual(targetResponse.nightSuccessRecovery[0].perspectives, ['TARGET'])

    const ack = countingCallback()
    reconnected.trigger('acknowledge_night_action_success', {
        gameId: session.id, nightDayIndex: successPayload.nightDayIndex, eventId: successPayload.eventId,
    }, ack.callback)
    assert.deepEqual(ack.getResponse(), { ok: true, duplicate: false }, '복원 뒤의 최초 완료가 거부됐다')
    assert.equal(jokerRecord.completed, true)
})

test('AC-02(F-26): 이미 완료된 사건은 재접속 조회에 실리지 않는다(응답만 유실된 경우도 같다)', () => {
    const { session, io, sockets, jokerUuid, successPayload } = startNightWithKill('f26-ac02-completed')
    const ackPayload = {
        gameId: session.id, nightDayIndex: successPayload.nightDayIndex, eventId: successPayload.eventId,
    }

    assert.deepEqual(ackSuccess(sockets, jokerUuid, ackPayload), { ok: true, duplicate: false })

    const reconnected = reconnectSocket(io, session, jokerUuid)
    const response = getSnapshot(reconnected, { gameId: session.id })
    assert.equal(response.ok, true)
    assert.deepEqual(response.nightSuccessRecovery, [],
        '서버가 완료를 기록한 사건이 다시 복원 목록에 실렸다')

    const citizenUuid = [...session.players.keys()]
        .find((uuid) => (gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
            .byEvent.get(successPayload.eventId).has(uuid) && uuid !== jokerUuid))
    const targetReconnected = reconnectSocket(io, session, citizenUuid)
    assert.equal(getSnapshot(targetReconnected, { gameId: session.id }).nightSuccessRecovery.length, 1,
        'ACK를 보내지 않은 수신자의 사건까지 함께 사라졌다')
})

test('AC-02(F-26): 전송 예외는 기록을 지우지 않고 결속만 풀며, 새 연결의 복원이 그 기록을 다시 결속한다', () => {
    const ctx = commitFullRoleSessionAtNight({ id: 'f26-ac02-delivery-error', dayIndex: 2 })
    const { session, jokerUuid, citizenUuid } = ctx
    const { io, sockets, submit } = wireSession(session)
    sockets.get(jokerUuid).emitShouldThrowOn = 'night_action_success'

    const clock = createManualClock()
    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid), { ok: true })

    const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
    const eventId = [...stored.byEvent.keys()][0]
    const record = stored.byEvent.get(eventId).get(jokerUuid)
    assert.ok(record, '전송 예외가 수신 기록을 통째로 지웠다 — 그러면 복원할 자료가 없다')
    assert.equal(record.completed, false)
    assert.equal(record.socket, null, '실패한 연결의 결속이 그대로 남았다')
    assert.equal(record.socketId, null)
    assert.ok(record.payload, '복원 payload가 사라졌다')

    const nightDayIndex = record.payload.nightDayIndex
    assert.equal(ackSuccess(sockets, jokerUuid, { gameId: session.id, nightDayIndex, eventId }).code,
        'NOT_ELIGIBLE', '전달받지 못한 연결의 완료가 통과했다')

    const reconnected = reconnectSocket(io, session, jokerUuid)
    const response = getSnapshot(reconnected, { gameId: session.id })
    assert.equal(response.nightSuccessRecovery.length, 1, '전송에 실패한 사건이 복원되지 않았다')
    assert.equal(record.socket, reconnected)
    const ack = countingCallback()
    reconnected.trigger('acknowledge_night_action_success',
        { gameId: session.id, nightDayIndex, eventId }, ack.callback)
    assert.deepEqual(ack.getResponse(), { ok: true, duplicate: false })
})

test('AC-03(F-26): 사망해 연결이 끊겼던 대상자도 다음 낮에 재접속하면 자기 CONFIRM 사건을 복원받고 완료할 수 있다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26-ac03-dead-target', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)

    const firstClock = createManualClock()
    startNightTurnSequence(io, session, { ...firstClock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.players.get(citizenUuid).alive, false, '전제: 대상자가 실제로 사망해야 한다')
    gameSessionSocketLayer.__testables.stopDayPhaseTimer(session.id)

    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    const clock = createManualClock()
    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    assert.deepEqual(submit(witchHunterUuid, citizenUuid), { ok: true })

    const confirmEntry = sockets.get(citizenUuid).emitted
        .find((e) => e.event === 'night_action_success' && e.payload.type === 'CONFIRM')
    assert.ok(confirmEntry, '전제: 사망한 대상자가 연결 중에 CONFIRM을 받아야 한다')
    const confirmPayload = confirmEntry.payload
    const nightDayIndex = confirmPayload.nightDayIndex

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, nightDayIndex + 1)
    gameSessionSocketLayer.__testables.stopDayPhaseTimer(session.id)

    sockets.get(citizenUuid).connected = false
    const reconnected = reconnectSocket(io, session, citizenUuid)
    const response = getSnapshot(reconnected, { gameId: session.id })
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.deepEqual(response.nightSuccessRecovery, [confirmPayload],
        'DAY n+1의 재접속이 그 밤의 CONFIRM을 복원하지 않았다')
    assert.deepEqual(Object.keys(response.nightSuccessRecovery[0]).sort(),
        ['eventId', 'gameId', 'nightDayIndex', 'perspectives', 'type'])
    assert.equal(session.players.get(citizenUuid).alive, false, '복원이 생존 상태를 바꿨다')

    const ack = countingCallback()
    reconnected.trigger('acknowledge_night_action_success',
        { gameId: session.id, nightDayIndex, eventId: confirmPayload.eventId }, ack.callback)
    assert.deepEqual(ack.getResponse(), { ok: true, duplicate: false }, '복원 뒤 최초 완료가 거부됐다')

    session.phase = 'TRIBUNAL'
    const hunterReconnected = reconnectSocket(io, session, witchHunterUuid)
    const tribunalResponse = getSnapshot(hunterReconnected, { gameId: session.id })
    assert.equal(tribunalResponse.nightSuccessRecovery.length, 1, 'TRIBUNAL n+1 복원이 막혔다')
    assert.deepEqual(tribunalResponse.nightSuccessRecovery[0].perspectives, ['USER'])

    session.phase = 'ENDED'
    assert.deepEqual(getSnapshot(hunterReconnected, { gameId: session.id }).nightSuccessRecovery,
        [], '결과가 확정된 판에서 성공 사건이 복원됐다')
    session.phase = 'NIGHT'
    session.dayIndex = nightDayIndex + 1
    assert.deepEqual(getSnapshot(hunterReconnected, { gameId: session.id }).nightSuccessRecovery,
        [], '다음 밤에서 이전 밤의 사건이 복원됐다')
})

test('AC-03(F-26): 재가입이 끝나지 않은 조회는 SESSION_ROUTING_PENDING이고, 그 조회가 시작한 재동기화 뒤에 복원된다', async () => {
    const { session, io, jokerUuid, successPayload } = startNightWithKill('f26-ac03-pending')

    const reconnected = reconnectSocket(io, session, jokerUuid, { joinChannel: false })
    const pending = getSnapshot(reconnected, { gameId: session.id })
    assert.equal(pending.ok, false)
    assert.equal(pending.code, 'SESSION_ROUTING_PENDING',
        '재가입 중 조회가 빈 복원 성공으로 답했다 — 클라이언트는 다시 묻지 않는다')
    assert.equal(Object.hasOwn(pending, 'nightSuccessRecovery'), false)
    assert.equal(Object.hasOwn(pending, 'phase'), false, '보류 응답이 snapshot 본문을 실었다')

    await Promise.resolve()
    await Promise.resolve()
    assert.equal(reconnected.rooms.has(session.channelId), true, '보류 응답이 재가입을 시작하지 않았다')
    assert.deepEqual(reconnected.joined, [session.channelId], '같은 범위의 재가입은 한 번이어야 한다')

    const response = getSnapshot(reconnected, { gameId: session.id })
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.deepEqual(response.nightSuccessRecovery, [successPayload], '재조회가 복원하지 못했다')
})

test('AC-04(F-26): 다른 밤의 사건은 복원되지 않는다(보관함 교체·수명 검사 둘 다)', () => {
    const { session, io, submit, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, successPayload } =
        startNightWithKill('f26-ac04-stale-night')

    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    gameSessionSocketLayer.__testables.stopDayPhaseTimer(session.id)
    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    const nextClock = createManualClock()
    startNightTurnSequence(io, session, { ...nextClock, randomFn: () => 0.5 })
    assert.notEqual(session.dayIndex, successPayload.nightDayIndex, '전제: 다음 밤으로 넘어가야 한다')

    const reconnected = reconnectSocket(io, session, jokerUuid)
    assert.deepEqual(getSnapshot(reconnected, { gameId: session.id }).nightSuccessRecovery,
        [], '보관함이 교체된 뒤에도 이전 밤 사건이 복원됐다')
})

test('AC-05(F-26): 그 사건의 수신자가 아닌 역할·기권자는 재접속해도 복원 목록을 받지 못한다', () => {
    const { session, io, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid, successPayload } =
        startNightWithKill('f26-ac05-recipients')

    for (const uuid of [jokerUuid, citizenUuid]) {
        const socket = reconnectSocket(io, session, uuid)
        assert.equal(getSnapshot(socket, { gameId: session.id }).nightSuccessRecovery.length, 1,
            `${uuid}: 정당한 수신자의 복원이 막혔다`)
    }
    for (const uuid of [doctorUuid, guardUuid, witchHunterUuid]) {
        const socket = reconnectSocket(io, session, uuid)
        const response = getSnapshot(socket, { gameId: session.id })
        assert.equal(response.ok, true, `${uuid}: 일반 조회 자체는 성공해야 한다`)
        assert.deepEqual(response.nightSuccessRecovery, [],
            `${uuid}: 이 사건의 수신자가 아닌 참가자에게 복원 목록이 실렸다`)
    }
    const outsider = createFakeSocket('f26-ac05-outsider')
    io.sockets.sockets.set(outsider.id, outsider)
    gameSessionSocketLayer.registerGameHandlers(io, outsider, 'f26-ac05-outsider')
    const denied = getSnapshot(outsider, { gameId: session.id })
    assert.equal(denied.ok, false)
    assert.equal(Object.hasOwn(denied, 'nightSuccessRecovery'), false)
    assert.ok(successPayload.eventId)
})

function currentWait(session) {
    return gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id)?.wait ?? null
}

test('AC-01(F-27a): 성공 사건 발생 뒤 서버는 실제 대기에 들어가고, 두 수신자가 각각 완료 보고를 마칠 때까지 다음 역할도 낮 타이머도 시작되지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f27a-ac01-block' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    const originalSetTimeout = globalThis.setTimeout
    const dayTimerCalls = []
    let fakeTimerId = 1
    globalThis.setTimeout = (fn, delay) => {
        dayTimerCalls.push({ fn, delay })
        return fakeTimerId++
    }
    try {
        startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
        assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

        const wait = currentWait(session)
        assert.ok(wait, '전제: 실제 KILL 사건이 연출 대기를 연다')
        assert.equal(wait.active, true)
        assert.equal(gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id).stage,
            NIGHT_TURN_STAGES.PRESENTATION_WAIT, '대기 중 run.stage는 PRESENTATION_WAIT다')
        assert.equal(clock.pendingCount(), 1, '상한 타이머가 정확히 하나 걸려 있다')
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '대기 중에는 다음 역할이 시작되지 않는다')
        assert.equal(session.phase, 'NIGHT')
        assert.deepEqual(turnEventLog(io), [['night_turn_started', 'JOKER'], ['night_turn_ended', 'JOKER']])
        assert.equal(dayTimerCalls.length, 0, '대기 중에는 낮 타이머가 예약되지 않는다')

        const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
        const citizenEntry = sockets.get(citizenUuid).emitted.find((e) => e.event === 'night_action_success')
        const ackOf = (uuid, entry) => {
            const { callback, getResponse } = countingCallback()
            sockets.get(uuid).trigger('acknowledge_night_action_success',
                { gameId: session.id, nightDayIndex: entry.payload.nightDayIndex, eventId: entry.payload.eventId }, callback)
            return getResponse()
        }

        const run = gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id)
        clock.advance(run.presentationWaitTimeoutMs - 1)
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null)
        assert.equal(currentWait(session), wait, '같은 토큰이 그대로 유지된다')
        assert.equal(dayTimerCalls.length, 0, '상한 직전까지도 낮 타이머는 예약되지 않는다')

        assert.deepEqual(ackOf(jokerUuid, killEntry), { ok: true, duplicate: false })
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '수신자 2명 중 1명만 완료했다')
        assert.equal(gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
            .byEvent.get(killEntry.payload.eventId).get(citizenUuid).completed, false)
        assert.equal(dayTimerCalls.length, 0)

        assert.deepEqual(ackOf(citizenUuid, citizenEntry), { ok: true, duplicate: false })
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', '두 수신자 모두 완료한 뒤에야 다음 역할이 시작된다')
        assert.equal(currentWait(session), null)
        assert.equal(dayTimerCalls.length, 0, 'JOKER 대기 해제는 낮 타이머를 만들지 않는다')

        submit(doctorUuid, null)
        submit(guardUuid, null)
        submit(witchHunterUuid, null)

        assert.equal(session.phase, 'DAY', '전제: 밤이 끝나 낮으로 넘어갔다')
        assert.equal(dayTimerCalls.length, 1, '밤이 최종화된 뒤에야 낮 타이머가 정확히 한 번 예약된다')
    } finally {
        globalThis.setTimeout = originalSetTimeout
    }
})

test('AC-01/AC-02(F-27a): 아무도 완료 보고를 하지 않으면 상한이 지날 때까지 대기가 계속되고, 상한이 지나면 정확히 한 번 해제된다', () => {
    const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'f27a-ac01-timeout' })
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

    const run = gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id)
    const timeoutMs = run.presentationWaitTimeoutMs

    clock.advance(timeoutMs - 1)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '상한 직전에는 아직 풀리지 않는다')
    assert.equal(clock.pendingCount(), 1)

    clock.advance(1)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', '상한이 지나면 진행 해제로 다음 역할이 시작된다')
    assert.equal(clock.pendingCount(), 1, '해제된 대기의 상한 타이머는 남지 않고 다음 역할의 제출 타이머만 남는다')

    assert.equal(releaseNightPresentationWait(run, { run, forged: true }), false)
    assert.equal(turnEventLog(io).filter(([event, role]) => event === 'night_turn_started' && role === 'DOCTOR').length, 1,
        '다음 역할이 두 번 시작되지 않았다')
})

test('AC-02(F-27a): outcome이 COMPLETED(명시)·ERROR·SKIPPED 중 무엇이든 두 수신자가 모두 보고하면 진행 해제는 정확히 1회다', () => {
    for (const outcome of ['COMPLETED', 'ERROR', 'SKIPPED']) {
        const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: `f27a-ac02-${outcome.toLowerCase()}` })
        const { io, sockets, submit } = wireSession(session)
        const clock = createManualClock()

        startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
        assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

        const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
        const citizenEntry = sockets.get(citizenUuid).emitted.find((e) => e.event === 'night_action_success')
        const ackOf = (uuid, entry) => {
            const { callback, getResponse } = countingCallback()
            sockets.get(uuid).trigger('acknowledge_night_action_success', {
                gameId: session.id, nightDayIndex: entry.payload.nightDayIndex, eventId: entry.payload.eventId, outcome,
            }, callback)
            return getResponse()
        }
        assert.deepEqual(ackOf(jokerUuid, killEntry), { ok: true, duplicate: false })
        assert.deepEqual(ackOf(citizenUuid, citizenEntry), { ok: true, duplicate: false })

        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', `${outcome}: 두 수신자 완료 뒤 다음 역할이 시작됐다`)
        assert.equal(turnEventLog(io).filter(([event, role]) => event === 'night_turn_started' && role === 'DOCTOR').length, 1,
            `${outcome}: 다음 역할이 두 번 시작되지 않았다`)

        const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
        assert.equal(stored.byEvent.get(killEntry.payload.eventId).get(jokerUuid).outcome, outcome)
    }
})

test('AC-02(F-27a): 콜백 없는 완료 보고도 outcome·완료 기록을 그대로 반영하고 대기를 해제한다', () => {
    const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'f27a-ac02-no-callback' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const citizenEntry = sockets.get(citizenUuid).emitted.find((e) => e.event === 'night_action_success')
    sockets.get(jokerUuid).trigger('acknowledge_night_action_success',
        { gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId, outcome: 'SKIPPED' })
    sockets.get(citizenUuid).trigger('acknowledge_night_action_success',
        { gameId: session.id, nightDayIndex: citizenEntry.payload.nightDayIndex, eventId: citizenEntry.payload.eventId })

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
    const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
    assert.equal(stored.byEvent.get(killEntry.payload.eventId).get(jokerUuid).outcome, 'SKIPPED')
})

test('AC-02(F-27a): null·빈 문자열·알 수 없는 outcome과 여분 키는 INVALID_PAYLOAD이고 완료 기록도 대기도 바뀌지 않는다', () => {
    const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'f27a-ac02-invalid-outcome' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const base = { gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId }
    const ack = (payload) => {
        const { callback, getResponse } = countingCallback()
        sockets.get(jokerUuid).trigger('acknowledge_night_action_success', payload, callback)
        return getResponse()
    }

    assert.equal(ack({ ...base, outcome: null }).code, 'INVALID_PAYLOAD')
    assert.equal(ack({ ...base, outcome: '' }).code, 'INVALID_PAYLOAD')
    assert.equal(ack({ ...base, outcome: 'TIMEOUT' }).code, 'INVALID_PAYLOAD')
    assert.equal(ack({ ...base, outcome: 'COMPLETED', extra: 'x' }).code, 'INVALID_PAYLOAD')

    const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
    assert.equal(stored.byEvent.get(killEntry.payload.eventId).get(jokerUuid).completed, false,
        '거부된 요청이 완료 기록을 바꿨다')
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '거부된 요청이 대기를 풀지 않았다')
})

test('AC-03(F-27a): 이미 해제된 사건의 중복·지연 완료 보고는 진행을 다시 멈추거나 두 번째 해제를 일으키지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f27a-ac03-late' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const citizenEntry = sockets.get(citizenUuid).emitted.find((e) => e.event === 'night_action_success')
    const ackOf = (uuid, entry) => {
        const { callback, getResponse } = countingCallback()
        sockets.get(uuid).trigger('acknowledge_night_action_success',
            { gameId: session.id, nightDayIndex: entry.payload.nightDayIndex, eventId: entry.payload.eventId }, callback)
        return getResponse()
    }
    assert.deepEqual(ackOf(jokerUuid, killEntry), { ok: true, duplicate: false })
    assert.deepEqual(ackOf(citizenUuid, citizenEntry), { ok: true, duplicate: false })
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', '해제로 DOCTOR 턴이 시작됐다')

    assert.deepEqual(ackOf(jokerUuid, killEntry), { ok: true, duplicate: true })
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')

    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.phase, 'DAY')
    stopDayPhaseTimer(session.id)
    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    const nextClock = createManualClock()
    startNightTurnSequence(io, session, { ...nextClock, randomFn: () => 0.5 })

    assert.equal(ackOf(citizenUuid, citizenEntry).code, 'STALE_EVENT')
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'JOKER', '다음 밤의 진행은 옛 밤의 지연 보고로 바뀌지 않는다')
})

test('AC-03(F-27a): 상한으로 해제된 사건의 뒤늦은 최초 완료 보고는 기록만 남기고, 그 시점에 진행 중인 다른 사건의 대기 토큰·상한 타이머·진행 횟수를 그대로 둔다', () => {
    const { session, jokerUuid, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'f27a-ac03-timeout-then-late' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const run = gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id)
    clock.advance(run.presentationWaitTimeoutMs)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', '전제: 상한으로 풀려 DOCTOR 턴이 시작됐다')
    const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
    assert.equal(stored.byEvent.get(killEntry.payload.eventId).get(jokerUuid).completed, false,
        '전제: 상한으로 풀린 사건은 아무도 완료 보고를 하지 않았다')

    assert.deepEqual(submit(doctorUuid, citizenUuid, { autoDrainWait: false }), { ok: true })
    const otherWait = currentWait(session)
    assert.ok(otherWait, '전제: DOCTOR의 HEAL 사건이 실제 대기를 연다')
    const otherTimerId = otherWait.timerId
    const pendingBefore = clock.pendingCount()
    const startedCountBefore = turnEventLog(io).filter(([event]) => event === 'night_turn_started').length

    const { callback, getResponse } = countingCallback()
    sockets.get(jokerUuid).trigger('acknowledge_night_action_success',
        { gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId: killEntry.payload.eventId }, callback)
    assert.deepEqual(getResponse(), { ok: true, duplicate: false }, '늦은 최초 보고는 기록만 되고 거부되지 않는다')
    assert.equal(stored.byEvent.get(killEntry.payload.eventId).get(jokerUuid).completed, true)

    assert.equal(currentWait(session), otherWait, '다른 사건의 대기 토큰이 바뀌지 않았다')
    assert.equal(currentWait(session).timerId, otherTimerId, '다른 사건의 상한 타이머가 재예약되지 않았다')
    assert.equal(clock.pendingCount(), pendingBefore, '가짜 시계의 예약 타이머 개수가 그대로다')
    assert.equal(turnEventLog(io).filter(([event]) => event === 'night_turn_started').length, startedCountBefore,
        '늦은 보고가 새로운 진행(advance)을 만들지 않았다')
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '여전히 DOCTOR의 대기 중이다')
})

test('AC-04(F-27a): 대기 중 재접속(새 canonical 소켓)은 상한 만료 시각을 그대로 두고(재예약하지 않고), 그 연결의 복원 ACK로 정상 해제된다', () => {
    const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'f27a-ac04-snapshot-reconnect', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

    const before = currentWait(session)
    assert.ok(before)
    const run = gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id)
    const timeoutMs = run.presentationWaitTimeoutMs
    const timerIdBefore = before.timerId
    const pendingBefore = clock.pendingCount()

    const reconnected = reconnectSocket(io, session, jokerUuid)
    const snapshot = getSnapshot(reconnected, { gameId: session.id })
    assert.equal(snapshot.ok, true, JSON.stringify(snapshot))
    const killPayload = snapshot.nightSuccessRecovery.find((p) => p.type === 'KILL')
    assert.ok(killPayload, '진행 중인 KILL 사건이 복원됐다')

    assert.equal(currentWait(session), before)
    assert.equal(currentWait(session).timerId, timerIdBefore, '재접속이 상한 타이머를 취소·재예약하지 않았다')
    assert.equal(clock.pendingCount(), pendingBefore, '가짜 시계의 예약 개수가 재접속으로 바뀌지 않았다')
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null)

    clock.advance(timeoutMs - 1)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, '만료 1ms 전에는 아직 풀리지 않는다(만료 시각이 그대로다)')
    assert.equal(currentWait(session), before, '아직 같은 토큰이다')

    const ack1 = countingCallback()
    reconnected.trigger('acknowledge_night_action_success',
        { gameId: session.id, nightDayIndex: killPayload.nightDayIndex, eventId: killPayload.eventId }, ack1.callback)
    assert.deepEqual(ack1.getResponse(), { ok: true, duplicate: false })
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null, 'TARGET이 아직 완료하지 않아 대기는 계속된다')

    const citizenEntry = sockets.get(citizenUuid).emitted.find((e) => e.event === 'night_action_success')
    const ack2 = countingCallback()
    sockets.get(citizenUuid).trigger('acknowledge_night_action_success',
        { gameId: session.id, nightDayIndex: citizenEntry.payload.nightDayIndex, eventId: citizenEntry.payload.eventId }, ack2.callback)
    assert.deepEqual(ack2.getResponse(), { ok: true, duplicate: false })

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', '두 수신자 모두 완료한 뒤에야 해제된다')
})

test('AC-04(F-27a): 단절로 기다릴 대상에서 빠진 수신자는 재접속해도 다시 그 대상에 들어오지 않는다', async () => {
    const { session, jokerUuid, citizenUuid } = commitFullRoleSessionAtNight({ id: 'f27a-ac04-drop-then-reconnect', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const eventId = killEntry.payload.eventId
    assert.deepEqual([...currentWait(session).waiting.get(eventId).keys()].sort(), [jokerUuid, citizenUuid].sort(),
        '전제: 두 수신자 모두 기다림 대상이다')

    sockets.get(citizenUuid).connected = false
    await gameSessionSocketLayer.onDisconnect(io, sockets.get(citizenUuid), citizenUuid)
    assert.deepEqual([...currentWait(session).waiting.get(eventId).keys()], [jokerUuid],
        '끊긴 대상자가 기다림 대상에서 빠졌다')

    const reconnected = reconnectSocket(io, session, citizenUuid)
    const snapshot = getSnapshot(reconnected, { gameId: session.id })
    assert.equal(snapshot.ok, true, JSON.stringify(snapshot))

    assert.deepEqual([...currentWait(session).waiting.get(eventId).keys()], [jokerUuid],
        '재접속이 끊겼던 수신자를 기다림 대상으로 되돌렸다')

    const ack = countingCallback()
    sockets.get(jokerUuid).trigger('acknowledge_night_action_success',
        { gameId: session.id, nightDayIndex: killEntry.payload.nightDayIndex, eventId }, ack.callback)
    assert.deepEqual(ack.getResponse(), { ok: true, duplicate: false })
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR',
        '재접속한 옛 수신자의 완료를 기다리지 않고 해제됐다')
})

test('AC-05(F-27a): 마지막 역할의 연출 대기도 완료 보고가 오기 전까지 최종화를 막고, 해제되면 정확히 한 번 결과 단계로 진행한다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f27a-ac05-last', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)

    const firstClock = createManualClock()
    startNightTurnSequence(io, session, { ...firstClock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.players.get(citizenUuid).alive, false)
    assert.equal(session.phase, 'DAY')
    stopDayPhaseTimer(session.id)

    const observed = captureCommitEvents()
    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    const clock = createManualClock()
    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    assert.deepEqual(submit(witchHunterUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

    assert.equal(session.phase, 'NIGHT')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED') + observed.countOf('GAME_FINALIZED'), 0)
    const { callback, getResponse } = countingCallback()
    handleResolveNight(io, sockets.get(jokerUuid), jokerUuid, { gameId: session.id }, callback)
    assert.deepEqual(getResponse(), { ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.' })

    const confirmEntry = sockets.get(witchHunterUuid).emitted.find((e) => e.event === 'night_action_success')
    const citizenConfirmEntry = sockets.get(citizenUuid).emitted
        .find((e) => e.event === 'night_action_success' && e.payload.type === 'CONFIRM')
    for (const [uuid, entry] of [[witchHunterUuid, confirmEntry], [citizenUuid, citizenConfirmEntry]]) {
        const ack = countingCallback()
        sockets.get(uuid).trigger('acknowledge_night_action_success',
            { gameId: session.id, nightDayIndex: entry.payload.nightDayIndex, eventId: entry.payload.eventId }, ack.callback)
        assert.deepEqual(ack.getResponse(), { ok: true, duplicate: false })
    }

    assert.equal(session.phase, 'DAY', '해제 뒤 결과 단계(낮)로 정확히 한 번 진행했다')
    assert.equal(observed.winEvaluations('NIGHT'), 1, '해제 뒤 승패 평가가 정확히 한 번 실행됐다')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0, '이 밤은 새 사망이 없다')
    assert.equal(observed.countOf('GAME_FINALIZED'), 0, '아직 경기가 끝나지 않았다')
    assert.equal(gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id), null,
        '최종화된 밤의 run은 정리된다')
})

test('AC-05(F-27a): 마지막 밤이 경기 종료(ENDED)로 끝나는 경우에도 COMPLETED·ERROR·SKIPPED 보고와 미응답 상한 각각에서 해제는 정확히 1회이고 최종화·승패 평가도 정확히 1회다', () => {
    for (const mode of ['COMPLETED', 'ERROR', 'SKIPPED', 'TIMEOUT']) {
        const { session, jokerUuid, targetUuid } = commitLastNightSessionAtNight({ id: `f27a-ac05-ended-${mode.toLowerCase()}` })
        const { io, sockets, submit } = wireSession(session)
        const clock = createManualClock()
        const observed = captureCommitEvents()

        startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
        assert.deepEqual(submit(jokerUuid, targetUuid, { autoDrainWait: false }), { ok: true })

        const wait = currentWait(session)
        assert.ok(wait, `${mode}: 전제: 실제 KILL 사건이 대기를 연다`)
        const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
        const targetEntry = sockets.get(targetUuid).emitted.find((e) => e.event === 'night_action_success')

        if (mode === 'TIMEOUT') {
            const run = gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id)
            clock.advance(run.presentationWaitTimeoutMs)
        } else {
            for (const [uuid, entry] of [[jokerUuid, killEntry], [targetUuid, targetEntry]]) {
                const { callback, getResponse } = countingCallback()
                sockets.get(uuid).trigger('acknowledge_night_action_success', {
                    gameId: session.id, nightDayIndex: entry.payload.nightDayIndex, eventId: entry.payload.eventId, outcome: mode,
                }, callback)
                assert.deepEqual(getResponse(), { ok: true, duplicate: false }, `${mode}: ${uuid}의 완료 보고가 거부됐다`)
            }
        }
        assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', `${mode}: 해제 뒤 다음 역할이 시작됐다`)

        driveNightToFinalization(session, submit, clock, jokerUuid, targetUuid)

        assert.equal(session.phase, 'ENDED', `${mode}: 광대 동수로 그 밤에 종료된다`)
        assert.deepEqual(session.winResult, { winner: 'JOKER' }, `${mode}`)
        assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1, `${mode}: 사망 확정은 정확히 1회다`)
        assert.equal(observed.winEvaluations('NIGHT'), 1, `${mode}: 승패 평가는 정확히 1회다`)
        assert.equal(observed.countOf('GAME_FINALIZED'), 1, `${mode}: 종료 확정은 정확히 1회다`)
        assert.equal(gameSessionSocketLayer.__testables.__getNightTurnRunForTests(session.id), null,
            `${mode}: 최종화된 밤의 run은 정리된다`)
    }
})

test('AC-06(F-27a): 연출 대기 알림은 비수신자에게만 gameId·nightDayIndex·waiting 세 키로 전달되고, 수신자·외부인에게는 가지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f27a-ac06-notify' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, citizenUuid, { autoDrainWait: false }), { ok: true })

    for (const uuid of [doctorUuid, guardUuid, witchHunterUuid]) {
        const entries = sockets.get(uuid).emitted.filter((e) => e.event === 'night_presentation_wait')
        assert.equal(entries.length, 1, `${uuid}: 비수신자는 대기 알림을 정확히 한 번 받아야 한다`)
        assert.deepEqual(Object.keys(entries[0].payload).sort(), ['gameId', 'nightDayIndex', 'waiting'])
        assert.equal(entries[0].payload.gameId, session.id)
        assert.equal(entries[0].payload.waiting, true)
    }
    for (const uuid of [jokerUuid, citizenUuid]) {
        assert.equal(sockets.get(uuid).emitted.filter((e) => e.event === 'night_presentation_wait').length, 0,
            `${uuid}: 대기의 수신자 본인은 대기 알림을 받지 않는다`)
    }

    const killEntry = sockets.get(jokerUuid).emitted.find((e) => e.event === 'night_action_success')
    const citizenEntry = sockets.get(citizenUuid).emitted.find((e) => e.event === 'night_action_success')
    for (const [uuid, entry] of [[jokerUuid, killEntry], [citizenUuid, citizenEntry]]) {
        const { callback } = countingCallback()
        sockets.get(uuid).trigger('acknowledge_night_action_success',
            { gameId: session.id, nightDayIndex: entry.payload.nightDayIndex, eventId: entry.payload.eventId }, callback)
    }

    for (const uuid of [doctorUuid, guardUuid, witchHunterUuid]) {
        const entries = sockets.get(uuid).emitted.filter((e) => e.event === 'night_presentation_wait')
        assert.equal(entries.length, 2, `${uuid}: 활성화·해제 각각 한 번씩만 받아야 한다`)
        assert.equal(entries[1].payload.waiting, false)
        assert.deepEqual(Object.keys(entries[1].payload).sort(), ['gameId', 'nightDayIndex', 'waiting'])
    }
})

test('AC-06(F-27a): 사건이 없는 턴은 통지 없이 즉시 해제되고, 대기 알림이 전송되지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } =
        commitFullRoleSessionAtNight({ id: 'f27a-ac06-empty' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, null, { autoDrainWait: false }), { ok: true })

    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', '사건 없는 턴은 즉시 해제된다')
    for (const uuid of [doctorUuid, guardUuid, witchHunterUuid]) {
        assert.equal(sockets.get(uuid).emitted.filter((e) => e.event === 'night_presentation_wait').length, 0)
    }
})

test('구성 0 역할(광대 2·귀족 1 판의 의사·경비원·마녀사냥꾼)은 night_turn_started/ended가 0회이고, 판정 자료에는 NO_ROLE로 남으며, 광대 턴만 돈 뒤 밤이 정상 확정된다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight({ id: 'comp-zero-skip', keepComposition: true })
    assert.deepEqual(gameSessionCore.getNightTurnOrder(session), ['JOKER'], '구성이 있는 역할만 턴 순서에 남는다')
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    const run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    const startedRoles = () => io.broadcasts.filter((b) => b.event === 'night_turn_started').map((b) => b.payload.role)
    assert.deepEqual(startedRoles(), ['JOKER'], '광대 턴만 시작된다')

    for (const jokerUuid of jokerUuids) submit(jokerUuid, citizenUuid)
    drainPresentationWait(session)
    clock.advance(NIGHT_TURN_DURATION_MS * 4)

    assert.deepEqual(startedRoles(), ['JOKER'], '의사·경비원·마녀사냥꾼 턴은 끝까지 시작되지 않는다')
    assert.deepEqual(io.broadcasts.filter((b) => b.event === 'night_turn_ended').map((b) => b.payload.role), ['JOKER'])
    const progress = gameSessionCore.__testables.getNightProgress(session)
    for (const role of ['DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        assert.ok(progress.completedRoles.has(role), role + ': 턴 없이도 판정 자료에는 확정된 것으로 남는다')
    }
    assert.notEqual(session.phase, 'NIGHT', '밤은 광대 턴만으로 정상 확정된다')
})
