// backend/models(→Sequelize)는 require 시점에 DATABASE_URL을 **파싱만** 한다(연결은 시도하지
// 않는다). npm test(--env-file=.env.test) 밖에서 이 파일만 직접 실행하면 그 값이 비어 있어
// require 자체가 죽으므로, 짝이 되는 gameSession.dayTimers.test.js와 같은 더미 폴백을 둔다.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test'

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
// F-25b(AC-05): 저장 실패→재시도를 실제 저장 경계 위에서 재현하려면 이 모듈의 함수를 대역으로
// 갈아끼워야 한다(kickPlayers.test.js의 기존 관례와 같은 방식 — 시험 끝에 원본으로 되돌린다).
const gameResultRepository = require('../../repositories/gameResult.repositories')
const { createFakeSocket, createFakeIo, countingCallback } = require('./testHelpers/matchmakingFixtures')

const {
    startNightTurnSequence,
    computeEmptyTurnDelayMs,
    resolveNightTurnDurationMs,
    handleResolveNight,
} = gameSessionSocketLayer.__testables
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
    // F-25b: 마지막 턴이 끝나면 그 밤이 자동으로 최종화돼 DAY로 넘어가며 dayIndex가 하나
    // 오른다 — 턴 payload가 실어야 하는 값은 **그 턴이 속한 밤**의 dayIndex이므로 시작 전에
    // 붙잡아 둔다(판정 후의 session.dayIndex와 비교하면 기대값 자체가 달라진다).
    const nightDayIndex = session.dayIndex

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
        assert.equal(broadcast.payload.dayIndex, nightDayIndex)
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

// ---------------------------------------------------------------------------
// S1-4 — 은폐 회귀 고정
//
// 이 아래의 테스트들은 "관전자(이벤트 스트림 수신자) 관점에서 어느 직업이 전멸했는지 알 수
// 없다"는 은폐 원칙을 회귀 테스트로 못박는다. 위쪽 S1-1/S1-2 테스트가 개별 방송 하나하나를
// 검사했다면, 여기서는 한 직업의 턴 구간 "전체 스트림"을 통째로 대조한다 — 이후 슬라이스가
// 턴 중간에 새로운 이벤트를 하나 끼워 넣기만 해도(payload가 아무리 결백해도) 잡힌다.
// ---------------------------------------------------------------------------

/** 이 파일이 은폐 대상으로 삼는 방송들. 턴 구간 스트림을 잘라내는 기준점이기도 하다. */
const NIGHT_TURN_EVENTS = ['night_turn_started', 'night_turn_ended']

/**
 * fake io의 room 브로드캐스트에 "그 시점의 수동 시계 값"을 함께 기록하도록 감싼다.
 *
 * 기존 io.broadcasts는 순서만 남기므로 "무인 턴이 몇 ms 뒤에 끝났는가"를 사후에 읽을 수 없다.
 * 지연 길이를 computeEmptyTurnDelayMs로 미리 계산해 두고 그 시각에 맞춰 advance하는 방식은
 * 검증하려는 계산식을 기대값으로 되쓰는 셈이라, 여기서는 실제 발화 시각을 직접 재는 쪽을 쓴다.
 *
 * 프로덕션은 emit 시점에 run.io.to(...)를 매번 조회하므로 io 객체의 to를 바꿔 끼우면 그대로 걸린다.
 */
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

/**
 * 한 밤을 지정한 역할의 턴까지 진행시키고, 그 턴을 mode에 따라 끝낸 뒤 "그 턴 구간에 나간
 * 모든 room 브로드캐스트"를 순서대로 돌려준다.
 *
 * mode
 *  - 'wiped'   그 역할이 전멸한 상태(무인 턴). 무작위 지연 타이머만이 턴을 끝낸다.
 *  - 'skipped' 그 역할 생존자가 전원 건너뛰기로 제출. 전원 제출 판정으로 즉시 끝난다.
 *  - 'expired' 그 역할 생존자가 아무도 제출하지 않음. 제한시간 만료 → 전원 기권 기록 후 끝난다.
 *
 * 대상 역할보다 앞선 턴은 세 mode 모두 즉시 제출로 끝낸다 — 제출은 시계를 진행시키지 않으므로
 * 대상 턴의 시작 시각이 mode와 무관하게 같고, 그래서 deadline까지 포함해 스트림을 통째로
 * 대조할 수 있다(가릴 필드가 gameId·channel 뿐이라는 것이 이 러너의 존재 이유다).
 *
 * 구간을 payload.role로 거르지 않고 started~ended 사이를 통째로 자르는 것이 핵심이다 — role
 * 필드가 없는 새 이벤트(예: 기권 알림)가 한쪽 경로에만 추가돼도 그 차이가 그대로 드러난다.
 */
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
    // 'wiped'는 지연 타이머가, 'expired'는 만료 타이머가 끝낸다. 어느 쪽이든 발화 시각은
    // 제한시간 안이므로 같은 폭만큼 흘려보내면 두 경로 모두 정확히 한 번 끝난다.
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

/**
 * 전원 생존 상태에서 아무도 제출하지 않고 제한시간을 넘겨, 만료 기권 경로로만 한 턴을 끝낸다.
 * captureRoleTurnStream의 'expired' mode를 부르는 이름 있는 통로이며, 기권이 실제로 기록됐는지
 * (즉 정말 그 경로를 탔는지)까지 확인해 준다 — 확인 없이 mode 이름만 믿으면 조용히 다른 경로로
 * 끝난 스트림을 비교하게 된다.
 */
function runNightWithForcedAbstentions(role, options = {}) {
    const captured = captureRoleTurnStream(role, 'expired', options)
    const actorUuids = [...captured.session.players.values()].filter((p) => p.role === role).map((p) => p.uuid)
    assert.ok(actorUuids.length > 0, `${role}에 생존 actor가 있어야 기권 경로가 성립한다`)
    for (const uuid of actorUuids) {
        assert.equal(captured.session.nightActions.get(uuid), null, `${uuid}가 만료 기권으로 기록됐다`)
    }
    return captured
}

/**
 * 서로 다른 두 세션의 스트림을 대조할 수 있도록, 세션마다 다를 수밖에 없는 식별자만 자리표시자로
 * 바꾼다. 시각(at)은 값이 아니라 "언제 나갔는가"라 payload 대조 대상이 아니므로 여기서 떨어진다
 * — 턴 길이는 payload 동일성이 아니라 20~60% 규칙(아래 별도 테스트)이 지킨다.
 *
 * deadline은 일부러 남긴다. 두 실행의 대상 턴이 같은 시각에 시작하므로 같은 값이어야 하고,
 * 만약 무인 턴만 deadline을 지연 시각으로 바꿔 잡으면 그것이 곧 전멸 신호이기 때문이다.
 * 반대로 여기서 너무 많이 지우면 대조가 공허해지는데, 그것은 아래 음성 대조 테스트가 잡는다.
 */
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

/** canonical UUID(세션 식별자) — 값 검사에서 불투명 식별자로 취급해 건너뛴다. */
const UUID_VALUE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 값 자리에 들어오면 곧바로 종료 사유·전멸 여부를 알려주는 단어들. 키 이름만 검사하는
 * ALIVENESS_LEAKING_WORDS로는 endReason을 reason으로 잡을 수 있어도, 예컨대 status: 'EMPTY'는
 * 놓치기 때문에 값 쪽에도 같은 크기의 그물이 필요하다.
 */
const ALIVENESS_LEAKING_VALUE_WORDS = new Set([
    'alive', 'dead', 'wiped', 'empty', 'none', 'nobody', 'noone',
    'timeout', 'timedout', 'timed', 'expired', 'abstain', 'abstained', 'skip', 'skipped', 'auto',
])

/**
 * payload 하나에서 생존/인원수를 시사하는 부분을 모두 찾아 사람이 읽을 수 있는 문장 목록으로
 * 돌려준다(없으면 빈 배열). 키 이름·값의 형태·값의 단어를 모두 본다 —
 *
 *  - 키 이름: aliveCount·actorUuids·endReason 류(ALIVENESS_LEAKING_WORDS, 표기법 무관)
 *  - 값의 형태: 배열/객체는 그 턴의 인원 구성을, 불리언은 전멸 플래그를 담는 그릇이다.
 *    현재 계약의 payload 값은 문자열(gameId·role)과 정수(dayIndex·deadline)뿐이므로,
 *    그 밖의 형태가 나타났다는 것 자체가 새 정보가 실렸다는 뜻이다.
 *  - 값의 단어: 'EMPTY'·'TIMEOUT'처럼 이름은 결백하고 값이 말해 버리는 경우.
 */
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

/**
 * 두 턴 스트림이 관전자에게 구별 불가능함을 단언한다. 세 겹으로 본다 —
 * (1) 이벤트의 종류와 순서, (2) payload의 완전한 동일성, (3) 어느 쪽에도 생존 정보가 없을 것.
 *
 * (3)이 따로 필요한 이유: 두 스트림이 똑같이 생존 정보를 담고 있으면 (2)는 통과해 버린다.
 * 지금은 두 경로가 같은 빌더를 쓰므로 그런 필드는 양쪽에 동시에 생긴다 — (2)만으로는 못 잡는다.
 */
function assertConcealedStreamsMatch(left, right, label) {
    assert.deepEqual(left.map((e) => e.event), right.map((e) => e.event), `${label}: 이벤트 종류·순서가 다르다`)
    assert.deepEqual(left, right, `${label}: 턴 구간 스트림이 다르다`)
    for (const entry of [...left, ...right]) {
        assert.deepEqual(detectAliveLeak(entry.payload), [], `${label}: ${entry.event} payload에 생존 정보가 있다`)
    }
}

// ---------------------------------------------------------------------------
// S1-4 AC-01 — 전멸 턴과 기권 턴의 이벤트 스트림이 구별되지 않는다
// ---------------------------------------------------------------------------

test('night turn: [은폐] 전멸한 직업의 턴 스트림이 전원 건너뛰기 턴·전원 기권 만료 턴과 완전히 같다', () => {
    // 요구 1의 직접 대응 — "직업 X 전멸 상태의 밤 이벤트 스트림"과 "X 생존 상태에서 전원이
    // 기권한 밤 이벤트 스트림"을 나란히 놓는다. 기권에는 두 갈래가 있어 둘 다 대조한다:
    // 명시적 건너뛰기 제출(즉시 종료)과 무제출 만료(자동 기권 기록 후 종료).
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

        // 턴 구간뿐 아니라 그 밤 전체의 이벤트 흐름도 같다 — 전멸한 직업의 턴이 통째로
        // 생략되거나 순서가 밀리지 않는다.
        assert.deepEqual(turnEventLog(wiped.io), turnEventLog(skipped.io), `${role}: 밤 전체 이벤트 흐름`)
        assert.deepEqual(turnEventLog(wiped.io), turnEventLog(expired.io), `${role}: 밤 전체 이벤트 흐름(만료)`)

        // 턴 구간에 나간 방송은 정확히 started·ended 둘뿐이다(사이에 낀 다른 방송이 없다).
        assert.deepEqual(wipedStream.map((e) => e.event), NIGHT_TURN_EVENTS, `${role}: 전멸 턴 구간 방송`)
    }
})

test('night turn: [은폐] 전멸 여부는 개별 소켓 emit으로도 새지 않는다', () => {
    // 스트림 대조는 room 브로드캐스트만 본다. 같은 정보가 "그 직업 조합에게만 가는 개별 emit"
    // 형태로 나가면 대조는 통과하면서 은폐는 깨진다 — 그래서 소켓 쪽도 함께 잠근다.
    const wiped = captureRoleTurnStream('GUARD', 'wiped', { id: 'sockets-wiped' })
    const skipped = captureRoleTurnStream('GUARD', 'skipped', { id: 'sockets-skipped' })

    for (const [label, captured] of [['전멸', wiped], ['건너뛰기', skipped]]) {
        for (const socket of captured.sockets.values()) {
            // F-23(AC-04): 공용 fixture가 이제 방송을 실제 수신자에게도 전달한다(viaBroadcast로
            // 표시). 이 시험이 잡으려는 것은 **표적 개별 전달**이므로 방송 도착분은 제외한다 —
            // 채널 전체에 똑같이 간 방송은 어떤 직업 조합도 드러내지 않는다(위 스트림 대조가
            // 그 동일성을 이미 확인한다).
            const targetedTurnEmits = socket.emitted
                .filter((e) => NIGHT_TURN_EVENTS.includes(e.event) && e.viaBroadcast !== true)
            assert.deepEqual(targetedTurnEmits, [], `${label}: 턴 이벤트가 개별 소켓으로 나갔다(${socket.id})`)
        }
    }

    // 그리고 방송으로 도착한 턴 스트림 자체도 소켓마다 완전히 같아야 한다 — 어느 한 소켓만
    // 더 받거나 덜 받으면 그 차이가 곧 직업 조합의 누출이다.
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

// ---------------------------------------------------------------------------
// S1-4 AC-02 — 죽은 직업 턴의 실제 길이가 제한시간의 20~60%다(여러 회 반복)
// ---------------------------------------------------------------------------

/** 고정 시드 xorshift32 — 매 실행 같은 표본을 쓰되 값은 고르게 퍼지게 한다. */
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

/**
 * 무인 턴 하나를 실제로 돌리고, 시작 방송부터 종료 방송까지 흐른 시각을 재서 돌려준다.
 * 기대값을 computeEmptyTurnDelayMs로 되계산하지 않고 방송 시각을 직접 읽는다 — 계산식이 아니라
 * "관전자가 보는 턴 길이"가 검증 대상이기 때문이다.
 *
 * randomFn을 주지 않으면 프로덕션 기본값(Math.random)이 그대로 쓰인다.
 */
function measureEmptyTurnLength({ id, randomFn = null, nightActionTime = null } = {}) {
    const settings = nightActionTime === null ? {} : { nightActionTime }
    const { session, jokerUuid } = commitFullRoleSessionAtNight({ id, settings })
    // 첫 턴(JOKER)을 무인 턴으로 만든다 — 앞선 제출 없이 곧바로 측정 대상 턴이 시작된다.
    session.players.get(jokerUuid).alive = false
    const { io } = wireSession(session)
    const clock = createManualClock()
    const stamped = stampBroadcastTimes(io, clock)

    const durationMs = appliedDurationMs(session, 'JOKER')
    startNightTurnSequence(io, session, randomFn === null ? { ...clock } : { ...clock, randomFn })
    // 지연은 제한시간 안에서 끝나므로 제한시간만큼만 흘려보내면 반드시 발화한다. 반대로 여기서
    // 끝나지 않는다면 그것 자체가 규칙 위반이므로 아래 단언이 잡는다.
    clock.advance(durationMs)

    const started = stamped.find((b) => b.event === 'night_turn_started' && b.payload.role === 'JOKER')
    const ended = stamped.find((b) => b.event === 'night_turn_ended' && b.payload.role === 'JOKER')
    assert.ok(started && ended, '무인 턴도 시작과 종료를 모두 방송한다')
    return { durationMs, delayMs: ended.at - started.at }
}

test('night turn: [은폐] 무인 턴의 실제 길이가 주입 난수 표본 전체에서 제한시간의 20~60%다', () => {
    const nextRandom = createSeededRandom(0x5eed_1234)
    // 경계(0·1)와 그 바로 안쪽, 그리고 고른 무작위 표본을 함께 돌린다.
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

    // 범위 안이기만 하면 되는 게 아니라 실제로 흩어져 있어야 한다 — 언제나 같은 길이라면 그
    // 상수 자체가 "이 길이 = 전멸"이라는 신호가 된다.
    assert.equal(observed.length, samples.length)
    assert.ok(new Set(observed).size >= 10, `관측된 길이가 ${new Set(observed).size}종뿐이라 사실상 고정값이다`)
    assert.equal(Math.min(...observed), Math.floor(NIGHT_TURN_DURATION_MS * 0.2), 'r=0에서 하한을 실제로 찍는다')
    assert.equal(Math.max(...observed), Math.floor(NIGHT_TURN_DURATION_MS * 0.6), 'r=1에서 상한을 실제로 찍는다')
})

test('night turn: [은폐] 난수원을 주입하지 않은 무인 턴도 반복 실행 내내 20~60%를 지킨다', () => {
    // 위 테스트는 randomFn을 주입해 경계를 훑는다. 여기서는 주입 없이 프로덕션 기본 난수원
    // (Math.random)으로 돌려, 주입 통로가 아니라 실제로 쓰이는 경로가 범위를 지키는지 본다.
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

// ---------------------------------------------------------------------------
// S1-4 AC-03 — 과거 conceal 회귀 재발 방지
//
// 8/27에는 짝을 이루는 두 개의 conceal 슬라이스가 있었고, 아래 테스트들은 그 둘이 세운 규칙을
// 지금의 턴 엔진 어휘로 다시 못박는다.
//
//  (1) 20260827-joker-night-turn-conceal — "행동 역할 보유자가 사망하면 그 역할의 밤 턴 안내가
//      더 이상 나오지 않는다. 관찰자는 '안내가 사라짐 = 그 역할 사망'을 추론할 수 있다."
//      → 턴 연출은 보유자 생사와 무관하게 항상 같은 순서·리듬으로 재생돼야 한다. 단 밤 판정은
//        무변경 — 죽은 보유자는 여전히 제출 대상이 아니다(생존 필터는 교착 방지의 핵심이라
//        되돌리면 안 된다).
//
//  (2) 20260827-joker-night-turn-conceal-fix — (1)이 턴 진행에 시간 경과 요소를 넣으면서 생긴
//      회귀: "살아있는 역할의 턴까지 제출 없이 자동으로 다음 턴으로 넘어감(광대가 제출하기
//      전에 '가드의 시간입니다'로 진행됨 — 제출 불가)."
//      → 보유자가 살아있는 역할의 턴은 그 역할의 제출이 있을 때까지 진행하지 않는다. 시간
//        기반 진행은 오직 보유자가 전원 사망한 역할의 턴에만 허용된다.
//
// 그 뒤 S1-2가 "제한시간 만료 → 미제출 생존자 기권"을 더했으므로, (2)의 규칙은 지금 엔진에서
// "생존자가 있는 턴은 무인 턴 지연(제한시간의 20~60%)이 다 지나도 끝나지 않고, 오직 전원
// 제출이나 제한시간 만료로만 끝난다"로 읽힌다 — 아래 첫 테스트가 정확히 그 형태다.
//
// 이어지는 테스트들은 payload가 결백해도 남는 부채널(종료 타이밍·deadline 해석·타이머의 존재
// 여부)을 지킨다. 위 스트림 대조가 payload의 "내용"을 지키는 것과 짝이다.
// ---------------------------------------------------------------------------

test('night turn: [conceal 회귀 8/27-fix] 생존자가 있는 직업의 턴은 무인 턴 지연이 다 지나도 제출 없이는 넘어가지 않는다', () => {
    // 8/27 회귀 그 자체 — 제출 전에 다음 턴 안내로 넘어가 버려 아무도 행동할 수 없었다.
    // randomFn을 1로 고정해 무인 턴 지연이 상한(제한시간의 60%)이 되게 한 뒤, 그 상한을 지나
    // 만료 직전까지 시계를 밀어도 턴이 그대로인지 본다. 회귀가 살아 있다면 지연 시각에 턴이
    // 끝나면서 그 뒤의 제출이 NOT_YOUR_TURN으로 거부된다.
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

        // 그래서 제한시간이 다 가기 전에 도착한 제출이 정상적으로 받아들여진다 — 회귀의 증상
        // ("제출 불가")이 사라졌다는 것을 거부 코드가 아니라 성공 응답으로 확인한다.
        assert.deepEqual(submit(actorUuid, null), { ok: true }, `${role}: 뒤늦은 제출이 거부됐다`)
        assert.equal(endedCount(), 1, `${role}: 제출로 턴이 끝난다`)
    }
})

test('night turn: [conceal 회귀 8/27] 보유자가 전멸한 직업의 턴 안내도 같은 자리에서 그대로 재생된다', () => {
    // 8/27 첫 슬라이스의 증상 그대로 — GUARD 보유자가 죽으면 "경호원의 시간입니다"가 아예
    // 나오지 않아 관찰자가 사망 역할을 알아냈다. 지금 엔진에서 그 안내의 원천은
    // night_turn_started 방송 하나뿐이므로, 그 방송이 같은 순서·같은 payload로 나가는지 본다.
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

        // 안내가 "사라지지" 않는다 — 그 역할의 시작 방송이 같은 순서 자리에 그대로 있다.
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

        // 안내의 내용도 같다(gameId만 세션마다 다르다) — 문구를 만들 재료가 role·dayIndex·
        // deadline뿐이므로, 이 동일성이 곧 "같은 안내가 같은 리듬으로 재생된다"는 뜻이다.
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
    // 8/27 두 슬라이스가 공통으로 걸어 둔 금지선 — 생존 필터(교착 방지)는 건드리지 않는다.
    // 연출만 재생하면 되므로 죽은 보유자에게 기권이 기록되거나 그의 제출을 기다리는 일이
    // 있어서는 안 된다(그러면 밤이 영영 끝나지 않는다).
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } = commitFullRoleSessionAtNight({
        id: 'regress-no-deadlock',
    })
    session.players.get(doctorUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    assert.deepEqual(submit(jokerUuid, null), { ok: true })
    clock.advance(appliedDurationMs(session, 'DOCTOR')) // 무인 DOCTOR 턴은 연출만 하고 넘어간다
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
    // 8/27 규칙 3("그 밤에만 성립하는 WITCH_HUNTER 조건은 유지")은 지금 엔진에서
    // nightActionMinDayIndex=2로 남아 있다. 조건을 유지하되 그 사실이 새면 안 된다 — "오늘 WH
    // 턴이 짧았다"가 곧 "WH가 죽었다"로 읽히면 은폐가 무의미해지므로, 자격 없는 산 WH의 턴과
    // 전멸한 WH의 턴이 관전자에게 같은 모양이어야 한다.
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

    // dayIndex 0: WH는 살아 있지만 이번 밤 행동 자격이 없다. dayIndex 2 + 전멸: 보유자가 없다.
    const ineligible = capture({ id: 'regress-wh-ineligible', dayIndex: 0, wipe: false })
    const wipedOut = capture({ id: 'regress-wh-wiped', dayIndex: 2, wipe: true })

    assert.deepEqual(ineligible.events, wipedOut.events, 'WH 턴 구간의 이벤트 종류·순서가 다르다')
    assert.deepEqual(ineligible.events, NIGHT_TURN_EVENTS)
    assert.equal(ineligible.payloadKeys, wipedOut.payloadKeys, 'WH 턴 payload의 필드 집합이 다르다')
    assert.equal(ineligible.deadlineOffset, wipedOut.deadlineOffset, 'deadline이 자격 유무에 따라 달라졌다')
    assert.equal(ineligible.turnLengthMs, wipedOut.turnLengthMs, '턴 길이가 자격 유무에 따라 달라졌다')
})

test('night turn: [conceal 회귀] 무인 턴이 즉시 끝나지 않는다(공집합 전원제출 판정 회귀)', () => {
    // 회귀의 정체: 전원 제출 판정이 "미제출 생존자가 없다"를 그대로 참으로 읽으면, 생존 actor가
    // 0명인 턴은 시작하자마자 완료로 판정돼 즉시 끝난다. payload는 완벽히 결백한데 종료 시점
    // 하나만으로 전멸이 드러난다.
    const { session, jokerUuid, doctorUuid } = commitFullRoleSessionAtNight({ id: 'conceal-instant-end' })
    session.players.get(doctorUuid).alive = false
    const { io, submit } = wireSession(session)
    const clock = createManualClock()

    // r=0이면 지연은 하한(제한시간의 20%)이다 — 회귀가 살아 있다면 이 하한조차 기다리지 않는다.
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
    // 회귀의 정체: 무인 턴은 지연 뒤에 끝나므로 deadline도 그 시각으로 맞추고 싶어진다. 그러면
    // 클라이언트 타이머가 남은 시간을 그대로 보여 주고, 관전자는 deadline만 보고 전멸을 안다.
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
    // 회귀의 정체: 무인 턴을 "끝낼 사람이 없으니 타이머도 필요 없다"고 처리하면 대기 타이머의
    // 개수가 곧 전멸 신호가 된다. 서버 내부 상태이긴 하지만, 이 차이는 곧 종료 방식의 차이로
    // 이어지므로 관전자에게 드러난다.
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
    // 회귀의 정체: 턴 하나만 보면 결백해도, 전멸한 직업이 늘어날수록 방송이 하나씩 줄거나
    // 순서가 밀리면 전체 스트림의 모양만으로 몇 개 직업이 전멸했는지 셀 수 있다.
    //
    // 밤을 끝까지 몰아붙이는 방식이 위 runNightCapturingTurnBroadcasts와 다르다: 전멸 직업이
    // 연달아 있으면 한 번의 advance가 여러 무인 턴을 한꺼번에 끝내므로, NIGHT_TURN_ORDER를 한
    // 칸씩 따라가는 대신 "지금 턴이 무엇인가"를 매번 다시 읽어야 마지막 턴까지 닿는다.
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

        // 매 회차가 현재 턴을 반드시 끝내므로 최대 턴 수만큼 돌면 시퀀스가 끝난다.
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

// ---------------------------------------------------------------------------
// S1-4 AC-04 — 음성 대조: 생존 정보를 넣으면 위 가드가 실제로 실패한다
// ---------------------------------------------------------------------------

/** 스트림 사본의 마지막 이벤트(night_turn_ended — endNightTurn이 payload를 만드는 지점) payload에 필드를 심는다. */
function withInjectedField(stream, key, value) {
    return stream.map((entry, index) =>
        index === stream.length - 1 ? { ...entry, payload: { ...entry.payload, [key]: value } } : { ...entry, payload: { ...entry.payload } },
    )
}

/** withInjectedField로 심은 필드를 도로 뺀다(같은 자리에서 되돌리는지 확인하기 위한 짝). */
function withoutField(stream, key) {
    return stream.map((entry) => {
        const payload = { ...entry.payload }
        delete payload[key]
        return { ...entry, payload }
    })
}

test('night turn: [음성 대조] payload에 생존 정보를 넣으면 은폐 가드가 실패하고, 빼면 다시 통과한다', () => {
    // 성공 조건의 "의도적으로 payload에 생존 정보를 넣어 실패를 1회 확인 후 되돌린다"를
    // 프로덕션을 건드리지 않고 테스트 안에서 수행한다 — 방송에서 뽑아낸 진짜 스트림의 사본에
    // 생존 정보를 심고, 같은 가드에 먹여 실패를 확인한 뒤 되돌려 통과를 확인한다.
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
        // 키 이름만으로는 결백해 보이는 필드 — 값의 형태·단어로 잡아야 한다.
        ['isRoleWipedOut', true],
        ['status', 'TIMED_OUT'],
    ]
    for (const [key, value] of injections) {
        const polluted = withInjectedField(clean, key, value)

        // (1) 한쪽에만 심으면 스트림 대조가 두 경로를 구별해 낸다.
        assert.throws(
            () => assertConcealedStreamsMatch(polluted, reference, `${key} 주입`),
            assert.AssertionError,
            `${key}를 심었는데 스트림 대조가 통과했다`,
        )

        // (2) 양쪽에 똑같이 심어 대조를 통과시켜도 누출 가드가 잡는다 — 실제 회귀는 두 경로가
        //     같은 빌더를 쓰는 채로 필드가 늘어나는 모양이므로 이쪽이 진짜 방어선이다.
        assert.throws(
            () => assertConcealedStreamsMatch(polluted, withInjectedField(reference, key, value), `${key} 양측 주입`),
            assert.AssertionError,
            `${key}를 양쪽에 심었는데 누출 가드가 통과했다`,
        )
        assert.ok(detectAliveLeak(polluted.at(-1).payload).length > 0, `${key}를 누출로 지목하지 못했다`)

        // (3) 도로 빼면 다시 통과한다 — 가드가 주입에만 반응했고 다른 이유로 깨진 게 아니다.
        assert.deepEqual(withoutField(polluted, key), clean, `${key} 제거가 원래 스트림을 되돌린다`)
        assertConcealedStreamsMatch(withoutField(polluted, key), reference, `${key} 제거 후`)
    }
})

test('night turn: [음성 대조] 누출 탐지기가 정상 payload는 통과시키고 생존 정보만 잡는다', () => {
    // 탐지기 자체의 오탐/미탐을 고정한다. 오탐이 있으면 위 테스트들이 상시 빨간불이 되고,
    // 미탐이 있으면 음성 대조가 통과만 하는 장식이 된다.
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

// ---------------------------------------------------------------------------
// F-25b — 마지막 역할 턴이 끝난 밤의 자동 최종화
//
// 여기서 쓰는 입력은 전부 registerGameHandlers가 배선한 **실제 submit_night_action**과 실제
// 턴 타이머다. 자동 최종화(advanceNightTurn → finalizeNightForSession)와 수동
// resolve_night(handleResolveNight → 같은 finalizeNightForSession)가 같은 밤을 두 번
// 확정하지 못한다는 것이 이 절의 핵심이다.
// ---------------------------------------------------------------------------

/** 실제 사망 확정·승패 평가·종료 확정 지점의 호출 횟수를 센다(export 교체로는 셀 수 없다). */
function captureCommitEvents() {
    const events = []
    gameSessionCore.__setNightCommitObserverForTests((event, detail) => events.push({ event, ...detail }))
    return {
        events,
        countOf: (event) => events.filter((e) => e.event === event).length,
        winEvaluations: (source) => events.filter((e) => e.event === 'WIN_EVALUATED' && e.source === source).length,
    }
}

/** 수신자별 night_result_applied 전달 건수를 uuid → 건수로 모은다. */
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

    // 광대 턴은 끝났고 의사 턴이 진행 중이다 — 치료 가능성이 아직 열려 있다.
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')
    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.nightResolution, null)
    assert.equal(Object.hasOwn(session, 'winResult'), false)
    assert.deepEqual(observed.events, [])
    // 기록 저장은 저장소 호출보다 한 단계 앞선 **레코드 조립**에서부터 시작되지 않았다 —
    // 이 통로가 실제 조립에서는 울린다는 양성 대조는 아래 저장 재시도 시험이 함께 본다.
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
    // 의사 턴이 끝났지만 아직 최종 사망은 없다 — 치료 가능성만 닫혔다(A-06).
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'GUARD')
    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.deepEqual(observed.events, [])

    submit(guardUuid, citizenUuid)
    // 경비원 턴까지 끝나도 마찬가지다.
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
    // 경비원은 그 밤의 개인 결과를 그대로 받는다(공통 최종화가 개인 결과 전달도 소유한다).
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

    // 미완료 역할을 수동 판정이 건너뛰지 않는다.
    assert.deepEqual(getResponse(), {
        ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.',
    })
    assert.equal(session.phase, 'NIGHT')
    assert.equal(session.players.get(citizenUuid).alive, true)
    assert.deepEqual(observed.events, [])
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 0)

    // 남은 턴이 정상 진행되면 자동 최종화가 그 밤을 한 번만 확정한다.
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
    // 마녀사냥꾼 턴만 남기고 시계를 만료까지 돌린다.
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'WITCH_HUNTER')
    assert.equal(session.phase, 'NIGHT')
    assert.deepEqual(observed.events, [])

    clock.advance(NIGHT_TURN_DURATION_MS)

    assert.equal(session.phase, 'DAY')
    assert.equal(session.players.get(citizenUuid).alive, false)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 1)
    // 확정된 밤의 턴 시퀀스는 남아 있지 않다.
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
    // 마지막 턴이 끝나기 직전에 모든 연결이 사라진다 — 전달할 상대가 없다는 이유로 이미
    // 시작된 밤의 확정을 생략하면 그 판은 영영 밤에 갇힌다.
    io.sockets.sockets.clear()

    clock.advance(NIGHT_TURN_DURATION_MS)

    assert.equal(session.phase, 'DAY', '수신자가 없어도 밤은 확정되고 낮으로 넘어간다')
    assert.equal(session.players.get(citizenUuid).alive, false)
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
})

/** 비-광대 하나가 더 죽으면 광대 동수로 끝나는 3인 밤(playerCount=3·jokerCount=1). */
function commitLastNightSessionAtNight({ id = 'room-turns-last', dayIndex = 2 } = {}) {
    const players = [makePlayer(`ln-${id}-a`), makePlayer(`ln-${id}-b`), makePlayer(`ln-${id}-c`)]
    const room = makeRoom({ id, players, jokerCount: 1 })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0.999 })
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    ackAllAndRewindToNight(session, dayIndex)
    const jokerUuid = [...session.players.values()].find((p) => p.role === 'JOKER').uuid
    const targetUuid = [...session.players.values()].find((p) => p.role !== 'JOKER').uuid
    return { session, jokerUuid, targetUuid }
}

/** 현재 턴부터 밤이 끝날 때까지 몰아붙인다 — 광대만 대상을 지목하고 나머지는 전원 건너뛴다. */
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

/** 보류된 promise 연쇄(저장 시도 → 성공/실패 처리)를 전부 소진시킨다. */
async function settlePendingWork() {
    for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

test('AC-05(F-25b): 저장이 한 번 실패한 뒤 재시도해도 같은 밤의 사망·경기 기록 조립·보상 평가가 두 번 일어나지 않는다', async () => {
    // 이 시험이 답하는 질문: "저장 실패 뒤의 재시도가 같은 밤의 사망·보상·기록을 두 번 만드는가."
    // 레코드는 **조립 지점**에서 세고(RESULT_RECORD_BUILD_STARTED), 재시도가 쓰는 값이 처음 것과
    // 같은 객체인지까지 본다 — 두 번 조립되면 ended_at·roster·통계 delta가 갈릴 수 있기 때문이다.
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

        // 재시도(최초 실패 → 1초 뒤)를 수동 시계로 깨운다.
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

        // 같은 판의 늦은 종결 훅도 새 레코드를 조립하지 않는다(중복 저장·중복 보상이 없다).
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
    // dayIndex 0이라 WITCH_HUNTER는 아직 활동할 수 없고, 나머지 세 역할은 전원 기권으로 만료된다.
    const { session } = commitFullRoleSessionAtNight({ id: 'f25b-empty-turns', dayIndex: 0 })
    const { io, sockets } = wireSession(session)
    const clock = createManualClock()
    const observed = captureCommitEvents()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    // 세 번째 턴까지는 어떤 확정도 없다.
    clock.advance(NIGHT_TURN_DURATION_MS * 3)
    assert.equal(session.phase, 'NIGHT')
    assert.deepEqual(observed.events, [])

    clock.advance(NIGHT_TURN_DURATION_MS)

    assert.equal(session.phase, 'DAY')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0, '아무도 지목되지 않은 밤이다')
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    for (const count of nightResultDeliveryCounts(sockets).values()) assert.equal(count, 1)
})

// ---------------------------------------------------------------------------
// F-25 — 역할 확정 직후의 내부 연출 계약과 즉시 통과 대기
//
// 이 절이 검사하는 것은 **서버 내부 사실**뿐이다. 새 개인 소켓 메시지·전달 영수증·재생 완료
// ACK는 어느 것도 이번 조각에 없으므로(각각 F-26a/F-26b), 여기서 관측하는 끝점은 소켓 계층의
// 반환값과 run 상태다. 공개 night_turn_started/ended의 이름·키·개수가 그대로라는 것도 함께 본다.
//
// 관측 지점은 **실제 night_turn_ended 방송 중**이다 — fixture의 receiveBroadcast가 현재
// socket.emit에 위임하므로, 그 emit을 감싸면 종료 방송이 나가는 바로 그 동기 구간에 들어간다.
// deliver가 수신자 예외를 삼키므로 관측자는 **기록만** 하고 단언은 전부 바깥에서 한다.
// ---------------------------------------------------------------------------

const {
    buildNightPresentationContract,
    releaseNightPresentationWait,
    isNightPresentationWaitActive,
    NIGHT_TURN_STAGES,
    finalizeNightForSession,
    endNightTurn,
    stopDayPhaseTimer,
} = gameSessionSocketLayer.__testables

/** night_turn_ended가 실제로 나가는 동기 구간에 관측자를 끼워 넣는다(기록 전용). */
function observeNightTurnEnds(sockets, observe) {
    const socket = [...sockets.values()][0]
    const originalEmit = socket.emit.bind(socket)
    socket.emit = (event, payload) => {
        if (event === 'night_turn_ended') observe(payload)
        return originalEmit(event, payload)
    }
}

/** playerCount=4·jokerCount=2 — 한 역할에 생존 행위자가 둘인 구성(다수결 성공/동률 재현용). */
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

    // 각 역할의 제출 구간은 SUBMITTING이고 타이머가 정확히 하나다.
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
    // 대기 중에는 **다음** 역할의 시작 방송이 아직 없다(즉시 통과는 방송 뒤에 일어난다).
    assert.deepEqual(seen.map((entry) => entry.startedCount), [1, 2, 3, 4])
    // 같은 밤 안에서 대기 토큰은 확정 revision과 함께 단조 증가하고 서로 다르다.
    assert.deepEqual(seen.map((entry) => entry.waitRevision), [1, 2, 3, 4])
    assert.equal(new Set(seen.map((entry) => entry.waitId)).size, 4)

    // 즉시 통과 뒤 다음 역할이 곧바로 시작됐고, 마지막 역할 뒤에는 밤이 최종화됐다.
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
            // 이미 연출 대기로 넘어간 턴을 다시 닫으려는 호출은 아무 것도 하지 않는다.
            duplicateEnd: endNightTurn(run, 'JOKER'),
            // 대기 중 제출은 core 호출 전에 끊긴다 — 다음 역할(의사)의 제출도 마찬가지다.
            sameRoleSubmit: submit(jokerUuid, citizenUuid),
            nextRoleSubmit: submit(doctorUuid, citizenUuid),
            resolveResponse: getResponse(),
            finalizeOutcome: finalizeNightForSession(io, session),
            // 이 토큰으로 대기를 닫는 것은 정상 경로 하나뿐이다 — 같은 토큰의 두 번째 호출은 no-op.
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

    // 대기가 닫힌 뒤에는 정상 진행이 그대로 이어지고, 밤은 정확히 한 번 확정된다.
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

    // 첫 계약은 **그 시점의** 사실로 남는다(뒤의 치료가 소급되지 않는다).
    assert.deepEqual(kill.events.map((event) => event.type), ['KILL'])
    assert.equal(kill.recoveryStates[citizenUuid], 'PENDING_RECOVERY')
    // canonical 누적 사건은 두 건 모두 유지된다.
    assert.deepEqual(canonical.get('JOKER').events, [{ type: 'KILL', targetId: citizenUuid }])
    assert.deepEqual(canonical.get('DOCTOR').events, [
        { type: 'KILL', targetId: citizenUuid },
        { type: 'HEAL', targetId: citizenUuid },
    ])
    assert.deepEqual(
        ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'].map((role) => canonical.get(role).recoveryState),
        ['PENDING_RECOVERY', 'RECOVERED', 'RECOVERED', 'RECOVERED'],
    )
    // 대기 구간 어디에서도 최종 사망·승패·확정이 시작되지 않았다.
    for (const role of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        assert.equal(canonical.get(role).alive, true, `${role} 대기 중 대상은 여전히 생존이다`)
        assert.equal(canonical.get(role).phase, 'NIGHT')
        assert.equal(canonical.get(role).nightResolution, null)
        assert.equal(canonical.get(role).commitEvents, 0)
    }

    // 최종 결과: 생존 확정, 사망 0회, 밤 승패 평가 1회, 수신자별 최종 결과 1건.
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
        // 받은 값을 전부 헤집는다.
        handed.events[0].targetId = 'tampered-target'
        handed.events[0].actorUuids.push('intruder')
        handed.events[0].recipients.push({ uuid: 'intruder', membershipId: null, socketId: null, perspectives: ['USER'] })
        handed.events[0].recipients[0].perspectives.push('GHOST')
        handed.recoveryStates[citizenUuid] = 'TAMPERED'
        handed.step.status = 'TAMPERED'
        handed.events.push({ eventId: 'forged' })

        // 같은 확정을 다시 물으면 처음 그대로다(ID도 바뀌지 않는다).
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
    // core의 진행 자료도 그대로다.
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
    // 마녀사냥꾼은 확정 전이라 아직 생존자인 대상을 지목할 수 없다(경비원은 가능하다).
    submit(guardUuid, citizenUuid)

    assert.equal(contracts.get('JOKER').recoveryStates[citizenUuid], 'PENDING_RECOVERY')
    assert.equal(contracts.get('DOCTOR').recoveryStates[citizenUuid], 'DEATH_CANDIDATE', '의사 턴이 끝나면 사망 후보다')
    assert.equal(contracts.get('DOCTOR').healingClosed, true)
    assert.deepEqual(contracts.get('DOCTOR').events, [], '기권한 의사는 사건을 만들지 않는다')
    assert.equal(contracts.get('GUARD').events.length, 1)
    assert.equal(contracts.get('GUARD').events[0].type, 'INVESTIGATE')
    assert.equal(contracts.get('GUARD').events[0].targetId, citizenUuid)

    // 마녀사냥꾼의 확인 대상은 사망자여야 한다 — 아직 확정 전이라 거부된다.
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
    // 소켓 객체·session·Map 같은 가변 참조는 담기지 않는다(식별자만).
    assert.deepEqual(Object.keys(target).sort(), ['membershipId', 'perspectives', 'socketId', 'uuid'])

    // 기권한 세 역할은 사건도 수신 대상도 없지만 완료 revision은 그대로 오른다.
    for (const role of ['DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        assert.deepEqual(contracts.get(role).events, [], `${role}: 기권은 사건을 만들지 않는다`)
    }
    assert.deepEqual(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'].map((r) => contracts.get(r).revision), [1, 2, 3, 4])

    // F-26a: 이 밤에 새로 생기는 개인 메시지는 night_action_success뿐이고, 그 수신자는 유효
    // 제출자·대상자(광대·시민)뿐이다 — 기권한 세 역할은 어떤 관점으로도 받지 않는다.
    const received = new Set()
    for (const socket of sockets.values()) for (const entry of socket.emitted) received.add(entry.event)
    assert.deepEqual([...received].sort(), [
        'night_action_success', 'night_actions_resolved', 'night_result_applied', 'night_turn_ended', 'night_turn_started',
    ])
    for (const [uuid, socket] of sockets) {
        const count = socket.emitted.filter((e) => e.event === 'night_action_success').length
        assert.equal(count, [jokerUuid, citizenUuid].includes(uuid) ? 1 : 0, `${uuid}: 성공 사건 수신 건수`)
    }
    // 공개 턴 payload에는 사건·대상·수신자 정보가 없다.
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
    // 광대가 의사를 지목하고, 의사는 자기 자신을 치료한다(회복 차단이 적용되지 않는 유일한 역할).
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
    // 광대가 경비원을 지목한다 — 의사가 기권하면 경비원의 행동은 그 밤 집계에서 빠진다.
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
    // 이 시험만 registry를 직접 조작하므로 wireSession **전에** 평범한 Map으로 갈아끼운다.
    const registry = new Map([...session.players.keys()].map((uuid) => [uuid, `sock-${uuid}`]))
    gameSessionSocketLayer.setOnlineUsersRegistry(registry)
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    let run = null
    const contracts = new Map()
    observeNightTurnEnds(sockets, (payload) => contracts.set(payload.role, run.wait.contract))

    // 대상자의 연결이 교체된다 — 옛 소켓은 채널에 그대로 남아 있지만 더 이상 canonical이 아니다.
    const replacement = createFakeSocket(citizenUuid, { id: 'sock-citizen-new' })
    replacement.rooms.add(session.channelId)
    replacement.data.activeGameId = session.id
    io.sockets.sockets.set(replacement.id, replacement)
    registry.set(citizenUuid, replacement.id)

    run = startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    // 경비원은 제출 **전에** 채널에서 빠진다 — 유효 행동 근거는 남지만 수신 대상은 아니다.
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

    // 첫 밤: 광대가 시민을 지목하고 나머지는 기권 → 그 시민이 canonical 사망으로 확정된다.
    const firstClock = createManualClock()
    startNightTurnSequence(io, session, { ...firstClock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.players.get(citizenUuid).alive, false)
    stopDayPhaseTimer(session.id)

    // 같은 세션의 다음 밤으로 되돌린다(dayIndex는 이미 올라 있어 마녀사냥꾼이 활동할 수 있다).
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
    // dayIndex 0이라 마녀사냥꾼은 아직 활동할 수 없다(무인 턴) — 나머지 셋은 전원 기권으로 만료된다.
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
    // 세 역할은 전원 기권 만료, 마지막은 무인 턴 — 그래도 밤은 정확히 한 번 확정된다.
    assert.equal(session.phase, 'DAY')
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0)
    assert.equal(observed.winEvaluations('NIGHT'), 1)
    assert.equal(clock.pendingCount(), 0, '밤이 끝나면 밤 타이머가 하나도 남지 않는다')
    assert.equal(isNightPresentationWaitActive(session.id), false)
})

test('AC-06(F-25): 존재하지 않는 직업의 턴도 완료 계약을 남기고 순서를 건너뛰지 않는다', () => {
    // playerCount=3·jokerCount=2 — 특수 직업 중 최소 둘은 이 판에 존재하지 않는다.
    const { session, jokerUuids, citizenUuid } = commitJokerTrioSessionAtNight({ id: 'f25-no-role' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    let run = null
    const contracts = new Map()
    observeNightTurnEnds(sockets, (payload) => contracts.set(payload.role, run.wait.contract))

    // 전원 기권으로 진행시킨다 — 이 시험의 관심은 사망이 아니라 "없는 직업의 턴도 확정된다"이다.
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

    // 이미 닫힌 토큰을 다시 써도 다음 역할이 앞당겨지지 않는다.
    const startedBefore = io.broadcasts.filter((b) => b.event === 'night_turn_started').length
    assert.equal(releaseNightPresentationWait(run, jokerToken), false)
    assert.equal(io.broadcasts.filter((b) => b.event === 'night_turn_started').length, startedBefore)
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR')

    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.phase, 'DAY')

    // 밤이 끝나 정리된 run에는 어떤 토큰도 통하지 않는다(새 밤을 진행시키지 않는다).
    const dayIndexAfter = session.dayIndex
    assert.equal(releaseNightPresentationWait(run, jokerToken), false)
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, dayIndexAfter)
    assert.equal(clock.pendingCount(), 0)
})

// ---------------------------------------------------------------------------
// F-26a — 역할별 성공 사건의 서버 생성·수신자별 payload
//
// F-25의 내부 연출 계약(run.wait.contract)은 이미 사건·수신자를 확정한다. 이 절은 그 계약이
// 실제 night_action_success 개별 emit으로 이어지는지, 그리고 그 payload가 허용 키만 갖는지를
// 검사한다 — wireSession이 실제로 배선한 submit_night_action을 그대로 쓴다.
// ---------------------------------------------------------------------------

test('AC-01(F-26a): 역할별 성공 사건은 능력 사용자·대상자에게만 전달되고 다른 역할·비참가자는 0건이다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac01' })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    // 같은 채널에 남아 있지만 이 판의 참가자는 아닌 소켓(비참가자 음성 대조).
    const outsider = createFakeSocket('f26a-ac01-outsider')
    outsider.rooms.add(session.channelId)
    io.sockets.sockets.set(outsider.id, outsider)

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, doctorUuid) // 광대가 의사를 공격
    submit(doctorUuid, doctorUuid) // 의사가 자기 자신을 치료
    submit(guardUuid, citizenUuid) // 경비원이 시민을 조사
    submit(witchHunterUuid, null) // 마녀사냥꾼 기권 — 사건 없음

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
        // 첫 수신자(행위자)가 성공 사건을 받는 바로 그 순간, 다음 수신자(대상자)를 채널에서 뗀다.
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
    // 밤이 이미 자동 최종화돼 session.dayIndex가 올라갔을 수 있으므로(네 역할이 모두 끝난
    // 밤이라 마지막 제출 직후 확정된다), payload는 **그 사건이 실제로 생성된 밤**의 번호를
    // 담아야 한다 — 확정 후 오른 dayIndex와 비교하지 않는다.
    assert.equal(targetPayload.nightDayIndex, nightDayIndex)
    const serializedTarget = JSON.stringify(targetPayload)
    assert.equal(serializedTarget.includes(guardUuid), false, '조사자 uuid가 담기지 않는다')
    assert.equal(serializedTarget.includes('role'), false, '조사 결과(대상의 실제 역할)가 담기지 않는다')
    assert.equal(citizenSocket.countReceived('night_action_result'), 0, '대상자는 기존 조사 결과 경로도 받지 않는다')

    // 조사자(USER) 쪽 payload에는 targetId가 붙지만, 그것도 조사 결과(role)는 아니다.
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
    // 두 번째 광대는 제출하지 않은 채 제한시간을 넘긴다 — expireNightTurnWithAbstentions가 기권으로 기록한다.
    clock.advance(NIGHT_TURN_DURATION_MS)

    assert.equal(sockets.get(jokerUuids[0]).countReceived('night_action_success'), 1)
    assert.equal(sockets.get(jokerUuids[1]).countReceived('night_action_success'), 0, '시간 만료 기권자도 받지 못한다')
    assert.equal(sockets.get(otherUuids[0]).countReceived('night_action_success'), 1)
})

test('AC-04(F-26a): 사망한 대상자가 연결 중이면 확정 성공 사건을 실제로 수신한다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid, citizenUuid } =
        commitFullRoleSessionAtNight({ id: 'f26a-ac04', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)

    // 첫 밤: 광대가 시민을 지목하고 나머지는 기권 → 그 시민이 canonical 사망으로 확정된다.
    const firstClock = createManualClock()
    startNightTurnSequence(io, session, { ...firstClock, randomFn: () => 0.5 })
    submit(jokerUuid, citizenUuid)
    submit(doctorUuid, null)
    submit(guardUuid, null)
    submit(witchHunterUuid, null)
    assert.equal(session.players.get(citizenUuid).alive, false)
    stopDayPhaseTimer(session.id)

    // 같은 세션의 다음 밤으로 되돌린다(dayIndex는 이미 올라 있어 마녀사냥꾼이 활동할 수 있다).
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

    // citizenSocket은 첫 밤 KILL의 TARGET으로도 이미 한 번 받았으므로, 이 절의 관심사인
    // CONFIRM만 따로 골라 확인한다.
    const confirmEntries = citizenSocket.emitted.filter((e) => e.event === 'night_action_success' && e.payload.type === 'CONFIRM')
    assert.equal(confirmEntries.length, 1, '사망했지만 연결·참여가 유지되는 대상자는 CONFIRM 성공 사건을 받는다')
    assert.deepEqual(confirmEntries[0].payload.perspectives, ['TARGET'])
    assert.deepEqual(Object.keys(confirmEntries[0].payload).sort(), ['eventId', 'gameId', 'nightDayIndex', 'perspectives', 'type'])

    for (const uuid of [doctorUuid, guardUuid]) {
        assert.equal(sockets.get(uuid).countReceived('night_action_success'), 0, `${uuid}: 무관 참가자는 받지 않는다`)
    }
    // jokerUuid는 첫 밤 KILL의 USER라 총 수신은 1(둘째 밤에는 기권했다) — CONFIRM은 없다.
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
    sockets.get(citizenUuid).connected = false // 대상자의 연결이 끊긴 상태

    // 첫 밤 KILL의 TARGET으로 이미 한 번 받은 뒤의 기준선 — 둘째 밤에는 그 위로 CONFIRM이
    // 늘어나지 않아야 한다(연결이 끊겼으므로).
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

// ---------------------------------------------------------------------------
// F-26b · 밤 성공 사건 소비 완료 ACK(acknowledge_night_action_success)
//
// 등록된 실제 리스너(wireSession → registerGameHandlers)를 통해서만 요청한다 — 서버 핸들러를
// 직접 호출하면 등록부 배선이 빠져도 시험이 통과하므로 그 경로를 대체하지 않는다.
// ---------------------------------------------------------------------------

/** 등록된 acknowledge_night_action_success 리스너로 완료 요청을 보내고 ack 응답을 돌려준다. */
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
    // 완료 상태는 여전히 true 하나뿐이다 — 중복 요청이 완료 변경을 반복하지 않는다.
    assert.equal(stored.byEvent.get(payload.eventId).get(jokerUuid).completed, true)
})

test('AC-03/AC-05(F-26b): 광대가 의사를 공격하고 의사가 자신을 치료하면 KILL·HEAL 두 사건이 각각 한 번씩만 완료된다', () => {
    const { session, jokerUuid, doctorUuid, guardUuid, witchHunterUuid } =
        commitFullRoleSessionAtNight({ id: 'f26b-ac03-selfheal', dayIndex: 2 })
    const { io, sockets, submit } = wireSession(session)
    const clock = createManualClock()

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 })
    submit(jokerUuid, doctorUuid)
    submit(doctorUuid, doctorUuid) // 자기 치료
    submit(guardUuid, null)
    submit(witchHunterUuid, null)

    const jokerEvents = sockets.get(jokerUuid).emitted.filter((e) => e.event === 'night_action_success')
    assert.equal(jokerEvents.length, 1)
    // 의사도 광대의 공격 TARGET이라 KILL 사건 하나를 함께 받는다(F-26a AC-04) — 자기 치료
    // 단언은 HEAL 사건 하나로만 좁혀서 본다.
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
    // HEAL은 관점 수(USER·TARGET)만큼 중복 완료되지 않는다 — 같은 요청의 재전달만 duplicate다.
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

    // 형태 오류.
    assert.equal(ackSuccess(sockets, jokerUuid, {}).code, 'INVALID_PAYLOAD')
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, nightDayIndex: -1 }).code, 'INVALID_PAYLOAD')
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, eventId: '' }).code, 'INVALID_PAYLOAD')

    // 이 사건을 전달받지 않은 경비원(비수신자) — citizenUuid는 이 KILL의 TARGET이라 정당한
    // 수신자이므로(F-26a AC-04) 비수신자 사례로 쓸 수 없다.
    assert.equal(ackSuccess(sockets, guardUuid, payload).code, 'NOT_ELIGIBLE')

    // 변조된 사건 ID.
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, eventId: 'tampered-event-id' }).code, 'STALE_EVENT')

    // 다른 게임.
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, gameId: 'game-other' }).code, 'NOT_ELIGIBLE')

    // 옛 소켓 — 재연결로 같은 id의 **다른 객체**가 등록되면, 옛 객체도 이 사건을 실제로 받지
    // 않은 새 객체도 완료할 수 없다(원래 전달받은 바로 그 소켓 객체만 완료할 수 있다).
    const reconnected = createFakeSocket(jokerUuid, { id: sockets.get(jokerUuid).id })
    io.sockets.sockets.set(reconnected.id, reconnected)
    gameSessionSocketLayer.registerGameHandlers(io, reconnected, jokerUuid)
    assert.equal(ackSuccess(sockets, jokerUuid, payload).code, 'NOT_ELIGIBLE', '옛 소켓 객체의 완료 요청이 통과했다')
    const reconnectedAck = countingCallback()
    reconnected.trigger('acknowledge_night_action_success', payload, reconnectedAck.callback)
    assert.equal(reconnectedAck.getResponse().code, 'NOT_ELIGIBLE', '이 사건을 실제로 받지 않은 새 연결이 완료를 통과했다')

    // 위 모든 거부는 완료 기록을 바꾸지 않았다 — 실제 원래 수신자가 있는 세션의 기록은 여전히
    // completed:false다.
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

    // 다음 밤으로 강제 진입한다(F-26a AC-06 시험과 같은 관례 — 네 역할 전원 제출이 이미 자동
    // 최종화를 돌려 dayIndex를 올려 놓았다).
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

// frontend/src/domains/game/ingame/store/ingameStore.js::completeNightSuccess가 실제로 emit하는
// payload 모양은 정확히 {gameId, nightDayIndex, eventId}다(같은 파일의 socket.emit 호출부 참고).
// 아래 두 시험은 그 계약을 서버 쪽에서 지킨다 — 여분 필드 거부와 콜백 생략 허용은 프런트
// 시험(frontend/.../__tests__/nightPrivateResult.test.js)이 검사하는 emit 쪽 모양과 항상 같은
// 세 필드를 가리켜야 한다.

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

    // 콜백을 아예 넘기지 않는다 — 계획 계약(U-01)은 "callback은 선택적이며 함수인 경우만
    // 응답한다"다. 검증·최초 완료 기록은 응답 여부와 무관하게 그대로 일어나야 한다.
    assert.doesNotThrow(() => sockets.get(jokerUuid).trigger('acknowledge_night_action_success', payload))

    const stored = gameSessionSocketLayer.__testables.__getNightSuccessReceiptsForTests(session)
    assert.equal(stored.byEvent.get(payload.eventId).get(jokerUuid).completed, true,
        '콜백 없는 요청도 최초 완료를 기록해야 한다')

    // 같은 사건의 재요청(이번엔 콜백 있음)은 이미 기록된 완료를 duplicate:true로 돌려줘야 한다 —
    // 콜백 생략이 완료 판정 자체를 건너뛴 것이 아님을 확인한다.
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

    // uuid·membershipId처럼 이 요청이 절대 싣지 않는 필드가 하나라도 섞이면 거부한다.
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, uuid: jokerUuid }).code, 'INVALID_PAYLOAD')
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, membershipId: 'mem-x' }).code, 'INVALID_PAYLOAD')
    assert.equal(ackSuccess(sockets, jokerUuid, { ...payload, extra: true }).code, 'INVALID_PAYLOAD')

    // 여분 필드 없는 정상 요청은 그대로 통과한다 — 위 거부가 필드 이름이 아니라 세 필드
    // 자체를 막은 것이 아님을 함께 확인한다.
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

    // 밤이 끝나 DAY n+1로 넘어간 채로도(보관함은 아직 그 밤의 것 그대로) 완료할 수 있다.
    assert.deepEqual(ackSuccess(sockets, jokerUuid, payload), { ok: true, duplicate: false })

    // 이제 보관함은 건드리지 않은 채로 session만 두 밤 더 지난 것처럼 되돌린다 — 보관함
    // 존재 여부만으로는 걸리지 않는, phase/dayIndex 수명 검사 자체를 겨냥한 시험이다(같은
    // eventId를 다시 쓴다 — 이미 완료된 기록이라도 수명 검사가 store 조회보다 먼저 막아야 한다).
    session.phase = 'NIGHT'
    session.dayIndex = payload.nightDayIndex + 2

    const staleAck = ackSuccess(sockets, jokerUuid, payload)
    assert.equal(staleAck.code, 'STALE_EVENT', '수명 밖(두 밤 뒤)의 완료 요청이 통과했다')
})
