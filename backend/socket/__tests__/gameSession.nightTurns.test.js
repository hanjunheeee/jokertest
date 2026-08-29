const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
const { createFakeSocket, createFakeIo, countingCallback } = require('./testHelpers/matchmakingFixtures')

const { startNightTurnSequence, computeEmptyTurnDelayMs, resolveNightTurnDurationMs } = gameSessionSocketLayer.__testables
const { NIGHT_TURN_ORDER, NIGHT_TURN_DURATION_MS } = gameSessionCore

/**
 * 밤 턴 엔진 전용 테스트 파일. 기존 gameSession.test.js와 분리한 이유는 이 파일의 모든
 * 테스트가 주입된 수동 시계(createManualClock) 위에서만 성립하기 때문이다 — 실시간 타이머에
 * 기대는 테스트와 한 파일에 섞이면 "시간이 흐르지 않았다"는 단언의 의미가 흐려진다.
 */

/** gameSession.test.js의 동명 헬퍼와 계약이 같다(공유 테스트 헬퍼 파일을 새로 만들 수 없어 동일하게 둔다). */
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
    // 진행 중인 턴 시퀀스의 대기 타이머까지 해제한다(수동 시계라 실제로 새어나가지는 않지만,
    // 다음 테스트가 이전 테스트의 run을 상속하지 않게 하려는 것이 목적이다).
    gameSessionSocketLayer.__resetStateForTests()
})

/**
 * setTimeout/clearTimeout/Date.now를 대신하는 수동 시계. advance(ms)로 명시적으로 진행시키기
 * 전에는 어떤 타이머도 실행되지 않으므로, "시간 만료로 끝나지 않았다"를 단언할 수 있다.
 * 만료 시각이 이른 타이머부터 순서대로 실행하고, 콜백 안에서 새로 걸린 타이머도 같은 advance
 * 구간 안에 들어오면 함께 실행한다.
 */
function createManualClock(startMs = 1_000_000) {
    let now = startMs
    let nextId = 1
    const timers = new Map()
    return {
        now: () => now,
        // startNightTurnSequence의 deps 이름과 맞춘 별칭 — 시계 객체를 그대로 spread해서 주입한다.
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

/** gameSession.test.js의 동명 헬퍼와 계약이 같다 — 전원 역할 확인 후 지정한 밤 상태로 되돌린다. */
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

/**
 * playerCount=10·jokerCount=1 세션을 커밋해 밤 상태로 만든다(5개 역할 전부 1명씩, CITIZEN 6명).
 * dayIndex 기본값이 2인 이유: WITCH_HUNTER의 nightActionMinDayIndex가 2라서, 그보다 이른 밤에는
 * 네 번째 턴에 생존 actor가 존재할 수 없다 — "네 직업 턴이 모두 참여 가능한 밤"을 만들려면
 * 이 경계를 넘겨야 한다.
 */
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

/** playerCount=3·jokerCount=2 세션을 밤 상태로 만든다 — 한 역할(JOKER)에 생존 actor가 2명인 구성. */
function commitJokerTrioSessionAtNight({ id = 'room-turns-joker', dayIndex = 0 } = {}) {
    const players = [makePlayer(`ja-${id}`), makePlayer(`jb-${id}`), makePlayer(`jc-${id}`)]
    const room = makeRoom({ id, players, jokerCount: 2 })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToNight(session, dayIndex)
    const jokerUuids = [...session.players.values()].filter((p) => p.role === 'JOKER').map((p) => p.uuid)
    const citizenUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    return { session, jokerUuids, citizenUuid }
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
    /** 배선된 submit_night_action 이벤트로 제출한다(targetId === null이면 건너뛰기). */
    const submit = (uuid, targetId) => {
        const { callback, getResponse } = countingCallback()
        sockets.get(uuid).trigger('submit_night_action', { gameId: session.id, targetId }, callback)
        return getResponse()
    }
    return { io, sockets, submit }
}

/** io.broadcasts에서 밤 턴 이벤트만 뽑아 [event, role] 쌍으로 요약한다. */
function turnEventLog(io) {
    return io.broadcasts
        .filter((b) => b.event === 'night_turn_started' || b.event === 'night_turn_ended')
        .map((b) => [b.event, b.payload.role])
}

function turnBroadcasts(io) {
    return io.broadcasts.filter((b) => b.event === 'night_turn_started' || b.event === 'night_turn_ended')
}

// ---------------------------------------------------------------------------
// AC-01 — 턴 순서와 deadline
// ---------------------------------------------------------------------------

test('night turn: 한 밤 동안 광대→의사→경비원→WITCH_HUNTER 순서로 각 턴마다 started/ended가 정확히 한 번씩 방송된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

    // 각 역할의 유일한 생존 actor가 건너뛰기로 제출하면 그 턴이 끝나고 다음 턴이 시작된다.
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
    // 순서 상수 자체가 이 기대값의 유일한 출처임을 고정한다.
    assert.deepEqual([...NIGHT_TURN_ORDER], ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])
})

test('night turn: 모든 night_turn_started payload가 deadline을 포함하고 그 값이 시작 시각 + 턴 제한시간이다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock(5_000_000)
    const startedAt = clock.now()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    for (const uuid of [jokerUuid, doctorUuid, guardUuid, witchHunterUuid]) submit(uuid, null)

    const started = io.broadcasts.filter((b) => b.event === 'night_turn_started')
    assert.equal(started.length, 4)
    for (const broadcast of started) {
        assert.equal(broadcast.roomId, session.channelId)
        assert.deepEqual(Object.keys(broadcast.payload).sort(), ['dayIndex', 'deadline', 'gameId', 'role'])
        // 제출은 시계를 진행시키지 않으므로 네 턴 모두 같은 시각에 시작됐다.
        assert.equal(broadcast.payload.deadline, startedAt + NIGHT_TURN_DURATION_MS)
        assert.equal(broadcast.payload.gameId, session.id)
        assert.equal(broadcast.payload.dayIndex, session.dayIndex)
    }
})

// ---------------------------------------------------------------------------
// AC-02 — 현재 턴이 아닌 직업의 제출 거부
// ---------------------------------------------------------------------------

test('night turn: 현재 턴이 아닌 직업의 제출은 NOT_YOUR_TURN으로 거부되고 nightActions에 기록되지 않는다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } = commitFullRoleSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })

    // 지금은 JOKER 턴이다 — 나머지 세 직업의 제출은 전부 거부된다.
    for (const uuid of [doctorUuid, guardUuid, witchHunterUuid]) {
        assert.deepEqual(submit(uuid, null), {
            ok: false,
            code: 'NOT_YOUR_TURN',
            message: '요청을 처리할 수 없습니다.',
        })
    }
    assert.equal(session.nightActions.size, 0)

    // 밤 행동이 아예 없는 역할은 턴과 무관하게 기존 NOT_ELIGIBLE 그대로다(턴 검사가 역할 자격
    // 판정을 가리지 않는다).
    assert.equal(submit(citizenUuid, null).code, 'NOT_ELIGIBLE')

    // 현재 턴 주인의 제출만 통과한다.
    assert.deepEqual(submit(jokerUuid, null), { ok: true })
    assert.equal(session.nightActions.size, 1)
})

test('night turn: 턴이 넘어가면 직전 턴 주인의 뒤늦은 제출이 거부된다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, null)

    // 이제 DOCTOR 턴이다.
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
    assert.equal(submit(jokerUuid, doctorUuid).code, 'NOT_YOUR_TURN')
})

test('night turn: 턴 시퀀스가 돌고 있지 않으면 어떤 직업의 제출도 턴 때문에 거부되지 않는다', () => {
    const { session, doctorUuid, citizenUuid } = commitFullRoleSessionAtNight()
    const { submit } = wireSession(session)

    // startNightTurnSequence를 호출하지 않았다 — 턴 상태가 없으므로 기존 규칙만 적용된다.
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), null)
    assert.deepEqual(submit(doctorUuid, citizenUuid), { ok: true })
})

// ---------------------------------------------------------------------------
// 생존 직업 턴은 전원 제출로 즉시, 또는 제한시간 만료로 끝난다
// ---------------------------------------------------------------------------

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

    // 시계를 단 1ms도 진행시키지 않았는데 종료 방송이 이미 나갔다.
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

    // 두 JOKER가 서로를 지목한다 — 응답은 ok지만 nightActions에는 아무 것도 남지 않는다.
    assert.deepEqual(submit(jokerUuids[0], jokerUuids[1]), { ok: true })
    assert.deepEqual(submit(jokerUuids[1], jokerUuids[0]), { ok: true })
    assert.equal(session.nightActions.size, 0)
    assert.deepEqual(turnEventLog(io), [['night_turn_started', 'JOKER']])

    // 정식 제출(건너뛰기)로 채워야 비로소 끝난다.
    submit(jokerUuids[0], null)
    submit(jokerUuids[1], null)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
})

// ---------------------------------------------------------------------------
// AC-04 — 생존자가 없는 직업의 턴은 제한시간의 20~60% 무작위 지연 후 끝난다
// ---------------------------------------------------------------------------

test('night turn: 생존자가 없는 직업의 턴은 지연 시각 직전에는 끝나지 않고 그 시각에 끝난다', () => {
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight()
    session.players.get(doctorUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock()
    // 0.5 → 비율 0.2 + 0.5*0.4 = 0.4
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

    // 경계값과 범위 밖 입력(음수·1 초과·NaN)까지 포함해 비율이 절대 구간을 벗어나지 않음을 고정한다.
    for (const r of [0, 0.0001, 0.25, 0.5, 0.75, 0.9999, 1, -3, 7, NaN]) {
        const delay = computeEmptyTurnDelayMs(NIGHT_TURN_DURATION_MS, () => r)
        assert.ok(delay >= Math.floor(lower) && delay <= upper, `r=${r} → ${delay}ms가 20~60% 범위를 벗어났다`)
    }

    assert.equal(computeEmptyTurnDelayMs(NIGHT_TURN_DURATION_MS, () => 0), Math.floor(lower))
    assert.equal(computeEmptyTurnDelayMs(NIGHT_TURN_DURATION_MS, () => 1), Math.floor(upper))
})

test('night turn: dayIndex 때문에 아직 능력이 없는 WITCH_HUNTER 턴도 무인 턴과 같은 지연 경로로 끝난다', () => {
    // 첫 밤(dayIndex 0)에는 WITCH_HUNTER가 살아 있어도 행동 자격이 없다(nightActionMinDayIndex: 2).
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

// ---------------------------------------------------------------------------
// AC-05 — 죽은 직업 턴과 산 직업 턴의 payload가 구별 불가능하다
// ---------------------------------------------------------------------------

/**
 * payload 키를 camelCase·snake_case 경계로 잘라 소문자 단어 목록으로 만든다.
 *
 * 부분 문자열이 아니라 단어 단위로 비교하는 것이 핵심이다 — 'deadline'은 'dead'를 품고 있지만
 * AC-01이 명시적으로 요구하는 필드이고 생존 여부와 아무 관계가 없다. 부분 문자열로 검사하면
 * 이 정상 필드가 위반으로 잡히고, 반대로 'aliveCount' 같은 진짜 누출 필드는 단어 경계가 '_'가
 * 아니라 대문자라 놓치게 된다.
 */
function payloadKeyWords(key) {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((word) => word.toLowerCase())
}

/**
 * 턴 payload에 등장해서는 안 되는 단어들. 생존 여부 그 자체(alive/dead)와, 생존 여부에서
 * 파생되어 간접적으로 전멸을 알려주는 값(그 턴의 actor 수·남은 제출 수·종료 사유)을 모두 막는다.
 */
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
    submit(jokerUuid, null) // 산 직업(JOKER) 턴 종료 → 죽은 직업(DOCTOR) 턴 시작
    clock.advance(NIGHT_TURN_DURATION_MS) // 죽은 직업 턴 종료

    const byKey = new Map(turnBroadcasts(io).map((b) => [`${b.event}:${b.payload.role}`, b]))
    const aliveStarted = byKey.get('night_turn_started:JOKER')
    const deadStarted = byKey.get('night_turn_started:DOCTOR')
    const aliveEnded = byKey.get('night_turn_ended:JOKER')
    const deadEnded = byKey.get('night_turn_ended:DOCTOR')
    for (const b of [aliveStarted, deadStarted, aliveEnded, deadEnded]) assert.ok(b, '네 방송이 모두 존재한다')

    // 같은 channel로, 같은 필드 집합으로 나간다.
    assert.equal(deadStarted.roomId, aliveStarted.roomId)
    assert.equal(deadEnded.roomId, aliveEnded.roomId)
    assert.deepEqual(Object.keys(deadStarted.payload).sort(), Object.keys(aliveStarted.payload).sort())
    assert.deepEqual(Object.keys(deadEnded.payload).sort(), Object.keys(aliveEnded.payload).sort())

    // role만 다르고 나머지 값은 완전히 동일하다 — 참가자 수·남은 제출 수·종료 사유처럼 생존
    // 여부에서 파생되는 값이 payload에 전혀 없다는 뜻이다.
    assert.deepEqual({ ...deadStarted.payload, role: 'X' }, { ...aliveStarted.payload, role: 'X' })
    assert.deepEqual({ ...deadEnded.payload, role: 'X' }, { ...aliveEnded.payload, role: 'X' })

    // 두 경로 모두 payload에 생존 관련 어떤 키도 담지 않는다.
    for (const b of [aliveStarted, deadStarted, aliveEnded, deadEnded]) {
        for (const key of Object.keys(b.payload)) {
            const leaked = payloadKeyWords(key).filter((word) => ALIVENESS_LEAKING_WORDS.has(word))
            assert.deepEqual(leaked, [], `${b.event} payload의 금지된 필드: ${key}`)
        }
    }
})

test('night turn: payload 키 단어 분해가 deadline은 통과시키고 생존 파생 필드는 잡아낸다', () => {
    // 이 검사 자체가 오탐/미탐 없이 동작한다는 것을 고정한다 — AC-05의 단언이 의미를 가지려면
    // 검사기가 정상 필드(deadline)를 걸지 않으면서 누출 필드는 표기법과 무관하게 잡아야 한다.
    const leaks = (key) => payloadKeyWords(key).some((word) => ALIVENESS_LEAKING_WORDS.has(word))

    for (const key of ['gameId', 'dayIndex', 'role', 'deadline']) {
        assert.equal(leaks(key), false, `정상 필드가 위반으로 잡혔다: ${key}`)
    }
    for (const key of ['aliveCount', 'alive_count', 'isDead', 'actorUuids', 'remainingSubmissions', 'endReason']) {
        assert.equal(leaks(key), true, `누출 필드를 놓쳤다: ${key}`)
    }
})

/**
 * 한 밤을 끝까지 돌리고 그동안의 턴 방송을 모두 담아 돌려준다. deadRoles에 든 역할은 그 역할의
 * 참가자를 전부 사망 처리한 뒤 시작하므로 무인 턴이 되고, 그 턴은 지연 타이머로만 끝난다.
 *
 * 생존 actor가 있는 턴은 제출로 끝내므로 시계가 전혀 흐르지 않는다 — 그래서 deadRoles를 바꿔도
 * 그보다 앞선 턴들의 시작 시각이 달라지지 않고, 두 실행의 같은 역할 턴을 같은 시각 기준으로
 * 비교할 수 있다(이 성질이 아래 대조 테스트의 전제다).
 */
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
        // 무인 턴은 제출할 사람이 없으므로 지연 타이머가 끝내도록 시계를 진행시킨다.
        if (deadRoles.includes(role)) clock.advance(NIGHT_TURN_DURATION_MS)
        else submit(uuidByRole[role], null)
    }
    return { io, session }
}

test('night turn: 같은 역할의 턴 방송은 그 역할의 전멸 여부와 무관하게 완전히 동일하다', () => {
    // AC-05의 가장 강한 형태 — 같은 밤을 두 번 돌리되 한 번은 그 역할이 살아 있고 한 번은
    // 전멸한 상태로 돌린다. 두 실행에서 그 역할의 턴 방송이 (세션마다 다른 gameId를 빼면)
    // 완전히 같은 객체라면, payload의 어떤 필드도 어떤 값도 생존 여부의 함수가 아니라는 뜻이다.
    // 앞선 테스트가 "산 역할 vs 죽은 역할"을 비교하느라 role을 가려야 했던 것과 달리, 여기서는
    // 역할을 고정하고 생존 여부만 바꾸므로 가릴 필드가 없다.
    for (const role of NIGHT_TURN_ORDER) {
        const aliveRun = runNightCapturingTurnBroadcasts({ id: `alive-${role}` })
        const deadRun = runNightCapturingTurnBroadcasts({ id: `dead-${role}`, deadRoles: [role] })

        const pick = (run, event) => run.io.broadcasts.find((b) => b.event === event && b.payload.role === role)
        for (const event of ['night_turn_started', 'night_turn_ended']) {
            const fromAlive = pick(aliveRun, event)
            const fromDead = pick(deadRun, event)
            assert.ok(fromAlive, `${role}이 살아 있을 때 ${event}가 방송된다`)
            assert.ok(fromDead, `${role}이 전멸했을 때도 ${event}가 똑같이 방송된다`)

            // gameId는 세션마다 다른 식별자라 두 실행에서 다를 수밖에 없다 — 각자 자기 세션의
            // id인지만 확인하고 대조에서는 같은 값으로 가린다.
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

    // 같은 (session, role, deadline)이면 그 역할의 생존자를 전부 죽여도 payload가 바뀌지 않는다.
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

// ---------------------------------------------------------------------------
// AC-06 — 건너뛰기가 정식 제출로 계산된다
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// S1-2 AC-01 — 제한시간이 만료되면 미제출 생존자가 기권으로 기록되고 다음 턴으로 넘어간다
// ---------------------------------------------------------------------------

test('night turn: 제한시간이 만료되면 미제출 생존자만 기권으로 기록되고 다음 턴이 시작된다', () => {
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    // 두 JOKER 중 한 명만 실제로 지목하고, 나머지 한 명은 아무 것도 제출하지 않는다.
    assert.deepEqual(submit(jokerUuids[0], citizenUuid), { ok: true })

    clock.advance(NIGHT_TURN_DURATION_MS)

    // 이미 제출한 표는 기권으로 덮이지 않고, 미제출자만 SKIP(null)으로 기록된다.
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
    // 기권은 "그 역할의 생존 actor 중 미제출자"에게만 기록된다 — 사망자에게 기권을 남기면
    // 밤 판정의 제출 완료 기준(생존 actor)과 실제 기록이 어긋난다.
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
    // 종료 "사유"가 payload로 새어나가지 않는다는 기존 계약(S1-1)이 만료 경로에도 그대로
    // 적용되는지 고정한다 — 만료로 끝났다는 사실이 곧 "그 역할에 굼뜬 생존자가 있다"는 신호다.
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

// ---------------------------------------------------------------------------
// S1-2 AC-05 — 전원 제출이면 제한시간을 기다리지 않고 즉시 다음 턴으로 간다
// ---------------------------------------------------------------------------

test('night turn: 전원 제출로 턴이 끝난 뒤에는 그 턴의 만료 타이머가 발화하지 않는다', () => {
    const { session, jokerUuids } = commitJokerTrioSessionAtNight()
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    const beforeNow = clock.now()
    for (const jokerUuid of jokerUuids) submit(jokerUuid, null)

    // 시계를 1ms도 진행시키지 않았는데 이미 다음 턴이다.
    assert.equal(clock.now(), beforeNow)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
    const endedCountBefore = turnEventLog(io).filter(([event, role]) => event === 'night_turn_ended' && role === 'JOKER').length
    assert.equal(endedCountBefore, 1)

    // 원래 만료 시각을 한참 지나도 JOKER 턴이 두 번 끝나지 않는다(예약 타이머가 해제됐다).
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

// ---------------------------------------------------------------------------
// S1-2 AC-04 — 직업별 밤 제한시간이 실제 턴 길이로 쓰이고, 없으면 nightActionTime으로 폴백한다
// ---------------------------------------------------------------------------

/** 이 세션 설정에서 각 역할의 턴에 적용되는 제한시간(ms)을 소켓 계층 해석기로 직접 구한다. */
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
    // 지정하지 않은 두 직업은 전체 밤 행동 시간으로 폴백한다.
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
    // 제출은 시계를 진행시키지 않으므로 네 턴 모두 같은 시각에 시작한다 — deadline의 차이는
    // 오직 그 직업에 적용된 제한시간의 차이뿐이다.
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
    // 테스트 전용 주입 통로가 설정보다 우선한다는 계약을 고정한다(주입하지 않으면 설정을 읽는다).
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

// ---------------------------------------------------------------------------
// S1-2 AC-06 — 무인 턴 지연은 "그 직업에 적용되는" 제한시간의 20~60%다
// ---------------------------------------------------------------------------

test('night turn: 무인 턴 지연은 전체 밤 시간이 아니라 그 직업에 적용된 제한시간을 기준으로 계산된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid } = commitFullRoleSessionAtNight({
        id: 'empty-turn-per-role',
        settings: { nightActionTime: 30, roleNightActionTimes: { GUARD: 120 } },
    })
    session.players.get(guardUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    // 0.5 → 비율 0.2 + 0.5*0.4 = 0.4. GUARD의 제한시간은 120초이므로 48초여야 한다
    // (전체 nightActionTime 30초를 기준으로 삼았다면 12초에 끝났을 것이다).
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
    // computeEmptyTurnDelayMs 자체의 경계는 위(S1-1 AC-04)에서 고정했다. 여기서는 직업별
    // 제한시간이 켜졌을 때 그 기준값이 무엇이든 비율 계약이 유지되는지를 본다.
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
