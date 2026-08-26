const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const { createFakeSocket, createFakeIo, countingCallback } = require('./testHelpers/matchmakingFixtures')

const { handleSubmitNightAction, handleResolveNight } = gameSessionSocketLayer.__testables
const { buildSessionCandidate } = gameSessionCore.__testables

/**
 * production 진입점(submit_night_action의 실제 등록된 소켓 핸들러)을 통해 JOKER→DOCTOR→GUARD→
 * WITCH_HUNTER canonical 순차 진행이 실제로 동작하는지 검증한다. registerGameHandlers와 동일하게
 * handleSubmitNightAction에 { io }를 함께 넘겨 호출한다는 점이 backend/socket/__tests__/
 * gameSession.test.js의 기존 submit_night_action 절(io 없이 ack만 검증)과 다르다 — 이 파일은
 * 방송·자동 판정까지 실제로 배선된 경로를 구동한다.
 */

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
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
})
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
})

function makePlayer(uuid, nickname = `nick-${uuid}`) {
    return { uuid, nickname, isReady: true }
}

/** CUSTOM 역할 구성 room. 지정하지 않은 역할은 0명이고 나머지 인원은 CITIZEN이 된다. */
function makeCustomRoom({ id, players, roleCounts, maxPlayers = 10 }) {
    const counts = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts }
    return {
        id,
        players: new Map(players.map((p) => [p.uuid, p])),
        settings: {
            maxPlayers,
            jokerCount: counts.JOKER,
            roleCompositionMode: 'custom',
            roleCounts: counts,
        },
    }
}

/** 참가자 전원의 canonical 역할 확인을 거쳐 그 밤(NIGHT) 상태로 직접 되돌린다(기존
 * ackAllAndRewindToFirstNight 헬퍼와 동일한 계약 — 공유 테스트 헬퍼 파일을 새로 추가할 수 없는
 * 허용 파일 목록 제약상 이 파일에도 동일하게 둔다). */
function ackAllAndRewindToNight(session, { dayIndex = 1 } = {}) {
    for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    session.phase = 'NIGHT'
    session.dayIndex = dayIndex
    session.nightActions = new Map()
    session.nightResolution = null
    session.dayVotes = new Map()
    session.dayVoteResolution = null
    session.tribunal = null
}

/** 세션 참가자 전원의 fake socket을 channel에 join된 상태로 만들고 fake io에 등록한다. */
function wireSockets(session) {
    const sockets = new Map()
    for (const uuid of session.players.keys()) {
        const socket = createFakeSocket(uuid)
        socket.rooms.add(session.channelId)
        sockets.set(uuid, socket)
    }
    const io = createFakeIo([...sockets.values()])
    return { sockets, io }
}

function commitCustom(room, opts = { randomFn: () => 0 }) {
    const candidate = buildSessionCandidate(room, opts)
    gameSessionCore.commitGameSession(candidate.session)
    return candidate.session
}

function byRole(session, role) {
    return [...session.players.values()].find((p) => p.role === role)?.uuid
}

/** 실제 등록된 핸들러를 통해 제출하고 ack 응답을 돌려준다. */
function submit(io, sockets, uuid, session, targetId) {
    const { callback, getResponse } = countingCallback()
    handleSubmitNightAction(sockets.get(uuid), uuid, { gameId: session.id, targetId }, callback, { io })
    return getResponse()
}

// ---------------------------------------------------------------------------
// custom JOKER+DOCTOR: JOKER 제출은 client의 resolve_night 없이 DOCTOR로 턴을 넘긴다
// ---------------------------------------------------------------------------

test('custom JOKER+DOCTOR: JOKER 제출은 client의 resolve_night 없이 DOCTOR로 턴을 넘긴다', () => {
    const room = makeCustomRoom({
        id: 'jd-room',
        players: [makePlayer('jd-joker'), makePlayer('jd-doctor')],
        roleCounts: { JOKER: 1, DOCTOR: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')

    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'JOKER')

    const response = submit(io, sockets, jokerUuid, session, doctorUuid)

    assert.deepEqual(response, { ok: true })
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'DOCTOR')
    assert.equal(session.nightResolution, null) // DOCTOR가 아직 남아있으므로 판정은 일어나지 않았다.

    const turnChanged = sockets.get(doctorUuid).emitted.find((e) => e.event === 'night_turn_changed')
    assert.ok(turnChanged, 'DOCTOR에게 night_turn_changed가 방송되어야 한다')
    assert.deepEqual(turnChanged.payload, { gameId: session.id, phase: 'NIGHT', dayIndex: 1, nightTurnRole: 'DOCTOR' })
    // JOKER 본인에게도 같은 방송이 정확히 한 번 간다(참가자 전체 방송).
    assert.equal(sockets.get(jokerUuid).emitted.filter((e) => e.event === 'night_turn_changed').length, 1)
})

// ---------------------------------------------------------------------------
// 전체 canonical 순서 + 최종 역할 자동 판정(exactly once) + night_result_applied + DAY 전이
// ---------------------------------------------------------------------------

test('전체 canonical 순서: JOKER→DOCTOR→GUARD→WITCH_HUNTER(SKIP) 제출이 끝나면 client resolve_night 없이 정확히 한 번 자동 판정되어 DAY로 전이한다', () => {
    const room = makeCustomRoom({
        id: 'full-order-room',
        players: ['fo-joker', 'fo-doctor', 'fo-guard', 'fo-witch', 'fo-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')
    const guardUuid = byRole(session, 'GUARD')
    const witchHunterUuid = byRole(session, 'WITCH_HUNTER')
    const citizenUuid = byRole(session, 'CITIZEN')
    // WITCH_HUNTER는 조사할 시신이 하나라도 있어야 턴이 열린다 — rewind는 alive를 되돌리지
    // 않으므로 반드시 rewind 다음에 세워야 한다. 시신을 CITIZEN으로 두면 밤 행동이 있는 역할의
    // 배우가 전원 생존한 상태로 남아, 이 테스트가 검증하는 canonical 순서(4개 역할 전부가 실제로
    // 턴을 받는다)가 온전히 관측된다. 시신이 밤 행동 역할 보유자인 판본은 아래 '시신이 밤 행동
    // 역할 보유자' 테스트가 따로 다룬다.
    session.players.get(citizenUuid).alive = false

    assert.deepEqual(submit(io, sockets, jokerUuid, session, null), { ok: true }) // SKIP
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'DOCTOR')

    assert.deepEqual(submit(io, sockets, doctorUuid, session, doctorUuid), { ok: true })
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'GUARD')

    // GUARD의 조사 대상은 생존자 여부와 무관하지만, 시신이 된 CITIZEN 대신 DOCTOR를 골라
    // 이 테스트가 검증하는 순차 진행이 GUARD 대상 규칙과 얽히지 않게 둔다.
    assert.deepEqual(submit(io, sockets, guardUuid, session, doctorUuid), { ok: true })
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'WITCH_HUNTER')
    assert.equal(session.phase, 'NIGHT')

    // WITCH_HUNTER의 SKIP(null)도 "제출 완료"로 취급되어(요구사항: SKIP은 그 배우를 완료시킨다)
    // 더 넘길 역할이 없으므로 곧장 authoritative 판정이 자동으로 일어난다.
    assert.deepEqual(submit(io, sockets, witchHunterUuid, session, null), { ok: true })

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 2)
    assert.notEqual(session.nightResolution, null)

    // 참가자 전원이 night_actions_resolved/night_result_applied를 정확히 1건씩만 받는다(자동
    // 판정이 정확히 한 번만 일어났다는 증거). GUARD 제출이 완료되며 WITCH_HUNTER의 턴이 열렸다는
    // night_turn_changed도 참가자 전원에게 정확히 1건씩만 간다 — WITCH_HUNTER 본인의 SKIP
    // 제출은 더 넘길 역할이 없어 곧장 자동 판정으로 이어질 뿐, 그 제출 자체가 또 다른
    // night_turn_changed를 만들지는 않는다(그래서 정확히 1건이지 0건도 2건도 아니다).
    for (const [, socket] of sockets) {
        assert.equal(socket.emitted.filter((e) => e.event === 'night_actions_resolved').length, 1)
        assert.equal(socket.emitted.filter((e) => e.event === 'night_result_applied').length, 1)
        assert.equal(
            socket.emitted.filter((e) => e.event === 'night_turn_changed' && e.payload.nightTurnRole === 'WITCH_HUNTER').length,
            1,
        )
    }
})

// ---------------------------------------------------------------------------
// no-corpse witch skip: 조사할 시신이 없는 밤의 WITCH_HUNTER는 canonical 순서에서 건너뛴다
// ---------------------------------------------------------------------------

test('no-corpse witch skip: 첫 밤(dayIndex 0)에는 아직 시신이 없어 WITCH_HUNTER가 canonical 순서에서 건너뛰어지고 GUARD 제출로 곧장 자동 판정된다', () => {
    const room = makeCustomRoom({
        id: 'witch-skip-room',
        players: ['ws-joker', 'ws-doctor', 'ws-guard', 'ws-witch', 'ws-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 0 }) // 첫 밤 — 아직 아무도 죽지 않아 조사할 시신이 없다
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')
    const guardUuid = byRole(session, 'GUARD')
    const citizenUuid = byRole(session, 'CITIZEN')

    submit(io, sockets, jokerUuid, session, null)
    submit(io, sockets, doctorUuid, session, doctorUuid)
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'GUARD')

    submit(io, sockets, guardUuid, session, citizenUuid)

    // WITCH_HUNTER를 향한 어떤 턴도 열리지 않고 곧장 판정·DAY 전이가 일어난다.
    assert.equal(session.phase, 'DAY')
    for (const [, socket] of sockets) {
        assert.equal(socket.emitted.filter((e) => e.event === 'night_result_applied').length, 1)
        assert.equal(socket.emitted.some((e) => e.event === 'night_turn_changed' && e.payload.nightTurnRole === 'WITCH_HUNTER'), false)
    }
})

// 위 테스트가 "첫 밤이라서"가 아니라 "시신이 없어서" 건너뛴다는 것을 못 박는 dayIndex 1 판본이다.
test('no-corpse witch skip: dayIndex 1이어도 사망자가 한 명도 없으면 WITCH_HUNTER 턴은 열리지 않는다', () => {
    const room = makeCustomRoom({
        id: 'witch-skip-day1-room',
        players: ['wd-joker', 'wd-doctor', 'wd-guard', 'wd-witch', 'wd-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')
    const guardUuid = byRole(session, 'GUARD')
    const citizenUuid = byRole(session, 'CITIZEN')

    submit(io, sockets, jokerUuid, session, null)
    submit(io, sockets, doctorUuid, session, doctorUuid)
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'GUARD')

    submit(io, sockets, guardUuid, session, citizenUuid)

    assert.equal(session.phase, 'DAY')
    for (const [, socket] of sockets) {
        assert.equal(socket.emitted.filter((e) => e.event === 'night_result_applied').length, 1)
        assert.equal(socket.emitted.some((e) => e.event === 'night_turn_changed' && e.payload.nightTurnRole === 'WITCH_HUNTER'), false)
    }
})

// dayIndex 하한 제한이 제거됐다는 production 경로 증거 — 첫 밤이라도 시신만 있으면 턴이 열린다.
test('corpse present: dayIndex 0이어도 사망자가 있으면 GUARD 다음에 WITCH_HUNTER 턴이 정상적으로 열린다', () => {
    const room = makeCustomRoom({
        id: 'witch-day0-corpse-room',
        players: ['wc-joker', 'wc-doctor', 'wc-guard', 'wc-witch', 'wc-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 0 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')
    const guardUuid = byRole(session, 'GUARD')
    const witchHunterUuid = byRole(session, 'WITCH_HUNTER')
    const citizenUuid = byRole(session, 'CITIZEN')
    session.players.get(citizenUuid).alive = false

    submit(io, sockets, jokerUuid, session, null)
    submit(io, sockets, doctorUuid, session, doctorUuid)
    submit(io, sockets, guardUuid, session, doctorUuid)

    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'WITCH_HUNTER')
    assert.equal(session.phase, 'NIGHT')
    for (const [, socket] of sockets) {
        assert.equal(
            socket.emitted.filter((e) => e.event === 'night_turn_changed' && e.payload.nightTurnRole === 'WITCH_HUNTER').length,
            1,
        )
    }
    // 시신을 지목한 제출은 그대로 성공하고 그 값이 canonical하게 저장된다.
    assert.deepEqual(submit(io, sockets, witchHunterUuid, session, citizenUuid), { ok: true })
    assert.equal(session.nightActions.get(witchHunterUuid), citizenUuid)
})

// ---------------------------------------------------------------------------
// WITCH_HUNTER가 생존자를 지목하면 production 경로에서 거부되고 턴도 그대로다
// ---------------------------------------------------------------------------

test('WITCH_HUNTER 생존자 지목: production 경로에서 INVALID_TARGET으로 거부되고 nightActions·턴이 모두 그대로다', () => {
    const room = makeCustomRoom({
        id: 'witch-alive-target-room',
        players: ['wa-joker', 'wa-doctor', 'wa-guard', 'wa-witch', 'wa-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')
    const guardUuid = byRole(session, 'GUARD')
    const witchHunterUuid = byRole(session, 'WITCH_HUNTER')
    const citizenUuid = byRole(session, 'CITIZEN')
    session.players.get(citizenUuid).alive = false

    submit(io, sockets, jokerUuid, session, null)
    submit(io, sockets, doctorUuid, session, doctorUuid)
    submit(io, sockets, guardUuid, session, doctorUuid)
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'WITCH_HUNTER')
    const before = new Map(session.nightActions)

    const rejected = submit(io, sockets, witchHunterUuid, session, doctorUuid) // DOCTOR는 살아있다

    assert.deepEqual(rejected, { ok: false, code: 'INVALID_TARGET', message: '요청을 처리할 수 없습니다.' })
    assert.deepEqual(session.nightActions, before)
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'WITCH_HUNTER')
    assert.equal(session.phase, 'NIGHT')
})

// ---------------------------------------------------------------------------
// 시신이 밤 행동 역할 보유자인 밤: WH의 시신 지목이 판정까지 트리거한다(교착 회귀 방지)
// ---------------------------------------------------------------------------

// 이 슬라이스가 고친 교착의 production 재현이다 — 5인·제2일 밤·사망자 1명이고, 그 사망자가
// 밤 행동이 있는 역할(DOCTOR)의 보유자다. 죽은 DOCTOR는 computeCurrentNightTurnRole이 턴을
// 주지 않고 checkNightTurnGate가 ACTOR_NOT_ALIVE로 막으므로 영원히 제출할 수 없는데,
// getEligibleNightActorUuids가 생존을 필터하지 않던 시절에는 prepareNightResolution이 그
// 제출을 계속 기다려 ACTIONS_PENDING을 반환했다. WH가 canonical 순서의 마지막 역할이고 그
// 자동 판정 호출의 callback이 no-op이라, 플레이어에게는 "WH가 시신을 지목한 순간 밤이 끝나지
// 않는다"로만 관측됐다. 아래 5번 단언이 그 지점이며, 수정 전에는 phase가 NIGHT에 머문다.
test('시신이 밤 행동 역할 보유자인 밤: WITCH_HUNTER의 시신 지목이 소켓 진입점에서 저장되고 그대로 자동 판정까지 트리거한다', () => {
    const room = makeCustomRoom({
        id: 'dead-actor-room',
        players: ['da-joker', 'da-doctor', 'da-guard', 'da-witch', 'da-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')
    const guardUuid = byRole(session, 'GUARD')
    const witchHunterUuid = byRole(session, 'WITCH_HUNTER')
    const citizenUuid = byRole(session, 'CITIZEN')
    // 시신이 CITIZEN이 아니라 DOCTOR라는 점이 이 테스트의 전부다.
    session.players.get(doctorUuid).alive = false

    // 1. 죽은 DOCTOR는 턴을 받지 못하고 곧장 GUARD로 넘어간다.
    assert.deepEqual(submit(io, sockets, jokerUuid, session, null), { ok: true }) // SKIP
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'GUARD')

    // 2. GUARD는 SKIP한다 — 그래야 이 밤의 개인 결과가 WITCH_HUNTER 것 하나뿐이 되어
    //    아래 7번이 "WH 본인만 받는다"를 모호함 없이 단언할 수 있다.
    assert.deepEqual(submit(io, sockets, guardUuid, session, null), { ok: true })
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'WITCH_HUNTER')
    assert.equal(session.phase, 'NIGHT')

    // 3. 생존자 지목은 이 밤에도 그대로 거부되고 아무 것도 바꾸지 않는다.
    const before = new Map(session.nightActions)
    const rejected = submit(io, sockets, witchHunterUuid, session, citizenUuid) // CITIZEN은 살아있다
    assert.deepEqual(rejected, { ok: false, code: 'INVALID_TARGET', message: '요청을 처리할 수 없습니다.' })
    assert.deepEqual(session.nightActions, before)
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'WITCH_HUNTER')
    assert.equal(session.phase, 'NIGHT')

    // 4. 시신 지목은 소켓 진입점을 통과해 canonical하게 저장된다.
    assert.deepEqual(submit(io, sockets, witchHunterUuid, session, doctorUuid), { ok: true })
    assert.equal(session.nightActions.get(witchHunterUuid), doctorUuid)

    // 5. 그리고 그 마지막 제출이 client resolve_night 없이 밤 판정까지 그대로 트리거한다.
    //    생존 JOKER 1명 < 비JOKER 3명이고 JOKER가 SKIP했으므로 희생자도 승리도 없다 → DAY 전이.
    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 2)
    assert.notEqual(session.nightResolution, null)

    // 6. 참가자 전원(죽은 DOCTOR 포함 — 공개 이벤트는 생존으로 필터하지 않는다)이 정확히 1건씩.
    for (const [, socket] of sockets) {
        assert.equal(socket.emitted.filter((e) => e.event === 'night_actions_resolved').length, 1)
        assert.equal(socket.emitted.filter((e) => e.event === 'night_result_applied').length, 1)
    }

    // 7. 개인 결과는 WITCH_HUNTER 본인에게만, 그 시신의 역할을 담아서 간다.
    const privateEvents = sockets.get(witchHunterUuid).emitted.filter((e) => e.event === 'night_action_result')
    assert.equal(privateEvents.length, 1)
    assert.deepEqual(privateEvents[0].payload, {
        gameId: session.id,
        dayIndex: 1, // 판정된 밤의 dayIndex이지, DAY 전이 이후의 값이 아니다.
        actionType: 'CONFIRM',
        targetId: doctorUuid,
        role: 'DOCTOR',
    })
    for (const [uuid, socket] of sockets) {
        if (uuid === witchHunterUuid) continue
        assert.equal(socket.emitted.some((e) => e.event === 'night_action_result'), false)
    }
})

// ---------------------------------------------------------------------------
// 제2일 밤 개인 결과: GUARD·WITCH_HUNTER 각자에게만, 판정된 밤의 dayIndex를 달고 간다
// ---------------------------------------------------------------------------

// 위 테스트들이 첫 밤(dayIndex 1)만 다루므로, 개인 결과 계약이 밤이 거듭돼도 그대로인지를
// 제2일 밤(dayIndex 2)에서 GUARD·WITCH_HUNTER 동시에 못 박는다. 특히 payload의 dayIndex가
// 판정된 밤의 값(2)이지 DAY 전이 이후의 값(3)이 아니라는 점이 중요하다 — 프런트
// (useInGameResolveNight)의 stale 폐기 기준이 이 계약 위에 서 있어서, 두 값을 혼동하면
// 둘째 밤부터 개인 결과가 화면에 뜨지 않는다.
test('제2일 밤 개인 결과: GUARD의 조사와 WITCH_HUNTER의 확인이 각자 uuid의 소켓에만, 판정된 밤의 dayIndex로 전송된다', () => {
    const room = makeCustomRoom({
        id: 'day2-private-room',
        players: ['d2-joker', 'd2-doctor', 'd2-guard', 'd2-witch', 'd2-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 2 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')
    const guardUuid = byRole(session, 'GUARD')
    const witchHunterUuid = byRole(session, 'WITCH_HUNTER')
    const citizenUuid = byRole(session, 'CITIZEN')
    // 지난 낮에 CITIZEN이 죽어 있는 밤이다 — 그래야 WITCH_HUNTER의 턴이 열린다(새 규칙).
    session.players.get(citizenUuid).alive = false

    assert.deepEqual(submit(io, sockets, jokerUuid, session, null), { ok: true }) // SKIP — 희생자 없음
    assert.deepEqual(submit(io, sockets, doctorUuid, session, doctorUuid), { ok: true })
    assert.deepEqual(submit(io, sockets, guardUuid, session, jokerUuid), { ok: true })
    // WITCH_HUNTER가 마지막 역할이므로 이 제출이 그대로 자동 판정을 트리거한다.
    assert.deepEqual(submit(io, sockets, witchHunterUuid, session, citizenUuid), { ok: true })

    assert.equal(session.phase, 'DAY')
    assert.equal(session.dayIndex, 3)

    // GUARD 본인에게만, 그 밤의 dayIndex(2)를 달고 정확히 1건.
    const guardEvents = sockets.get(guardUuid).emitted.filter((e) => e.event === 'night_action_result')
    assert.equal(guardEvents.length, 1)
    assert.deepEqual(guardEvents[0].payload, {
        gameId: session.id,
        dayIndex: 2, // 판정된 밤의 값이지, DAY 전이 이후의 값(3)이 아니다.
        actionType: 'INVESTIGATE',
        targetId: jokerUuid,
        team: 'JOKER',
    })

    // WITCH_HUNTER 본인에게만, 같은 밤의 dayIndex를 달고 정확히 1건.
    const witchEvents = sockets.get(witchHunterUuid).emitted.filter((e) => e.event === 'night_action_result')
    assert.equal(witchEvents.length, 1)
    assert.deepEqual(witchEvents[0].payload, {
        gameId: session.id,
        dayIndex: 2,
        actionType: 'CONFIRM',
        targetId: citizenUuid,
        role: 'CITIZEN',
    })

    // 그 외 참가자에게는 개인 결과가 한 건도 새지 않는다(비밀 격리).
    for (const uuid of [jokerUuid, doctorUuid, citizenUuid]) {
        assert.equal(sockets.get(uuid).emitted.some((e) => e.event === 'night_action_result'), false)
    }

    // 공개 방송은 전원에게 정확히 1건씩(자동 판정이 한 번만 일어났다는 증거).
    for (const [, socket] of sockets) {
        assert.equal(socket.emitted.filter((e) => e.event === 'night_actions_resolved').length, 1)
        assert.equal(socket.emitted.filter((e) => e.event === 'night_result_applied').length, 1)
    }
})

// ---------------------------------------------------------------------------
// zero actor auto-skip: GUARD가 아예 없으면 DOCTOR 다음은 곧장 WITCH_HUNTER다
// ---------------------------------------------------------------------------

test('zero actor auto-skip: GUARD가 존재하지 않으면 DOCTOR 제출 다음은 GUARD를 건너뛰고 곧장 WITCH_HUNTER로 넘어간다', () => {
    const room = makeCustomRoom({
        id: 'zero-actor-room',
        players: ['za-joker', 'za-doctor', 'za-witch', 'za-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')
    const witchHunterUuid = byRole(session, 'WITCH_HUNTER')
    // WITCH_HUNTER 턴이 열리려면 조사할 시신이 있어야 한다 — CITIZEN 한 명을 그 시신으로 둔다
    // (GUARD 부재로 건너뛴다는 이 테스트의 원래 검증 의도와는 무관한 사전 조건이다).
    session.players.get(byRole(session, 'CITIZEN')).alive = false

    submit(io, sockets, jokerUuid, session, null)
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'DOCTOR')

    submit(io, sockets, doctorUuid, session, doctorUuid)

    // GUARD를 향한 night_turn_changed는 존재하지 않고, 곧장 WITCH_HUNTER로 넘어간다. witchHunterUuid는
    // 참가자 전체 방송 대상이라 이전(JOKER→DOCTOR) 턴 전환의 night_turn_changed도 이미 받은 상태이므로,
    // 이번에 열린 WITCH_HUNTER 턴을 향한 것만 명시적으로 찾는다(가장 최근 이벤트가 아니라
    // nightTurnRole로 골라야 순서에 의존하지 않는다).
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'WITCH_HUNTER')
    const turnChanged = sockets.get(witchHunterUuid).emitted.find((e) => e.event === 'night_turn_changed' && e.payload.nightTurnRole === 'WITCH_HUNTER')
    assert.ok(turnChanged)
    assert.equal(turnChanged.payload.nightTurnRole, 'WITCH_HUNTER')
    assert.equal([...sockets.values()].some((s) => s.emitted.some((e) => e.event === 'night_turn_changed' && e.payload.nightTurnRole === 'GUARD')), false)
})

// ---------------------------------------------------------------------------
// multiple actors of one role must all submit
// ---------------------------------------------------------------------------

test('multiple actors 대기: JOKER 2명 중 1명만 제출하면 턴이 넘어가지 않고, 나머지 1명까지 제출해야 DOCTOR로 넘어간다', () => {
    const room = makeCustomRoom({
        id: 'multi-actor-room',
        players: ['ma-j1', 'ma-j2', 'ma-doctor', 'ma-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 2, DOCTOR: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuids = [...session.players.values()].filter((p) => p.role === 'JOKER').map((p) => p.uuid)
    const doctorUuid = byRole(session, 'DOCTOR')
    const citizenUuid = byRole(session, 'CITIZEN')

    submit(io, sockets, jokerUuids[0], session, citizenUuid)
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'JOKER') // 두 번째 JOKER가 아직 남음
    assert.equal(sockets.get(jokerUuids[0]).emitted.some((e) => e.event === 'night_turn_changed'), false)

    submit(io, sockets, jokerUuids[1], session, null) // SKIP도 "제출 완료"다.
    assert.equal(gameSessionCore.computeCurrentNightTurnRole(session), 'DOCTOR')
    const turnChanged = sockets.get(doctorUuid).emitted.find((e) => e.event === 'night_turn_changed')
    assert.ok(turnChanged)
    assert.equal(turnChanged.payload.nightTurnRole, 'DOCTOR')
})

// ---------------------------------------------------------------------------
// stale/wrong-role/dead/non-current 제출은 거부되고 상태를 바꾸지 않는다
// ---------------------------------------------------------------------------

test('stale/wrong-role/dead 제출은 거부되고 session.nightActions를 전혀 바꾸지 않는다', () => {
    const room = makeCustomRoom({
        id: 'reject-room',
        players: ['rj-joker', 'rj-doctor', 'rj-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')
    const citizenUuid = byRole(session, 'CITIZEN')
    const before = new Map(session.nightActions)

    // wrong-role/non-current: DOCTOR가 JOKER보다 먼저 제출.
    const wrongRole = submit(io, sockets, doctorUuid, session, citizenUuid)
    assert.equal(wrongRole.ok, false)
    assert.equal(wrongRole.code, 'NIGHT_TURN_ROLE_MISMATCH')
    assert.deepEqual(session.nightActions, before)

    // stale: 존재하지 않는 gameId.
    const stale = submit(io, sockets, jokerUuid, { id: 'not-the-real-game-id' }, citizenUuid)
    assert.equal(stale.ok, false)
    assert.equal(stale.code, 'STALE_SESSION_MISMATCH')
    assert.deepEqual(session.nightActions, before)

    // dead: JOKER 본인이 사망 상태에서 제출.
    session.players.get(jokerUuid).alive = false
    const dead = submit(io, sockets, jokerUuid, session, citizenUuid)
    assert.deepEqual(dead, { ok: false, code: 'ACTOR_NOT_ALIVE', message: '요청을 처리할 수 없습니다.' })
    assert.deepEqual(session.nightActions, before)
})

// ---------------------------------------------------------------------------
// 이르게 도착한 client resolve_night는 ACTIONS_PENDING으로 남는다
// ---------------------------------------------------------------------------

test('이르게 도착한 client resolve_night는 canonical 순서가 끝나지 않았으면 ACTIONS_PENDING으로 거부되고 아무 것도 바꾸지 않는다', () => {
    const room = makeCustomRoom({
        id: 'early-resolve-room',
        players: ['er-joker', 'er-doctor', 'er-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')

    const { callback, getResponse } = countingCallback()
    handleResolveNight(createFakeIo([]), sockets.get(jokerUuid), jokerUuid, { gameId: session.id }, callback)

    assert.deepEqual(getResponse(), { ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.' })
    assert.equal(session.nightResolution, null)
    assert.equal(session.phase, 'NIGHT')
})

// ---------------------------------------------------------------------------
// public payload secrecy
// ---------------------------------------------------------------------------

test('night_turn_changed 공개 payload는 gameId/phase/dayIndex/nightTurnRole 4개 키만 담고, 참가자 uuid·target map·역할 목록·개인 결과는 없다', () => {
    const room = makeCustomRoom({
        id: 'secrecy-room',
        players: ['sc-joker', 'sc-doctor'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1, DOCTOR: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const doctorUuid = byRole(session, 'DOCTOR')

    submit(io, sockets, jokerUuid, session, doctorUuid)

    const turnChanged = sockets.get(doctorUuid).emitted.find((e) => e.event === 'night_turn_changed')
    assert.ok(turnChanged)
    assert.deepEqual(Object.keys(turnChanged.payload).sort(), ['dayIndex', 'gameId', 'nightTurnRole', 'phase'])
    assert.equal(typeof turnChanged.payload.nightTurnRole, 'string')
})

// ---------------------------------------------------------------------------
// ENDED exact transition: 마지막 역할 제출로 승리 조건이 확정되면 ENDED로 전이한다
// ---------------------------------------------------------------------------

test('ENDED exact transition: JOKER만 존재하는 밤에서 마지막 생존자를 암살하면 client resolve_night 없이 곧장 ENDED로 전이한다', () => {
    const room = makeCustomRoom({
        id: 'ended-room',
        players: ['en-joker', 'en-citizen'].map((uuid) => makePlayer(uuid)),
        roleCounts: { JOKER: 1 },
    })
    const session = commitCustom(room)
    ackAllAndRewindToNight(session, { dayIndex: 1 })
    const { sockets, io } = wireSockets(session)
    const jokerUuid = byRole(session, 'JOKER')
    const citizenUuid = byRole(session, 'CITIZEN')

    assert.deepEqual(submit(io, sockets, jokerUuid, session, citizenUuid), { ok: true })

    assert.equal(session.phase, 'ENDED')
    assert.deepEqual(session.winResult, { winner: 'JOKER' })
    for (const [, socket] of sockets) {
        assert.equal(socket.emitted.filter((e) => e.event === 'night_result_applied').length, 1)
    }
})
