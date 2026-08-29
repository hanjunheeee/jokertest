// 채팅 채널 격리(joker-S4-chat-channels)의 소켓 층 계약 테스트.
//
// 짝이 되는 game-core/__tests__/gameSession.chatChannels.test.js가 "누가 어느 채널을 쓸 수
// 있는가"(순수 판정)를 본다면, 이 파일은 "그래서 어느 소켓이 실제로 이벤트를 받았는가"를
// 본다 — AC가 말하는 "소켓으로 수신하지 않는다" · "라우터가 거부한다"는 uuid 목록이 아니라
// emit 기록으로만 확인할 수 있기 때문이다.
//
// game-core도 소켓 계층도 mock하지 않는다. registerGameHandlers로 실제 배선한 뒤
// socket.trigger로 클라이언트가 보내는 이벤트를 그대로 재현하고, 각 소켓의 emitted 기록을
// 센다("전송되지 않았다"는 부재 단언이라 기록이 비어 있음을 확인할 수단이 필요하다).

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSessionSocketLayer = require('../gameSession')
const gameSessionCore = require('../../game-core/gameSession')
const matchmaking = require('../matchmaking')
const { createFakeSocket, createFakeIo, countingCallback } = require('./testHelpers/matchmakingFixtures')

const { resolveChatRecipientSockets, resolveJokerTeammateSockets } = gameSessionSocketLayer.__testables

const DAY_CHAT_EVENT = 'day_chat_message_received'
const DEAD_CHAT_EVENT = 'dead_chat_message_received'
const JOKER_CHAT_EVENT = 'joker_chat_message'
const ALL_CHAT_EVENTS = [DAY_CHAT_EVENT, DEAD_CHAT_EVENT, JOKER_CHAT_EVENT]

/**
 * createFakeSocket(uuid)의 기본 규약(socket.id === `sock-${uuid}`)을 그대로 따르는
 * 기본값 있는 registry다(gameSession.test.js의 동명 헬퍼와 같은 이유·같은 구현).
 * 진짜 Map을 감싼 Proxy이므로 isCurrentSocketForUuid의 `instanceof Map` 검사를 통과한다.
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
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
})
test.afterEach(() => {
    gameSessionCore.__resetStateForTests()
    matchmaking.__resetStateForTests()
    gameSessionSocketLayer.__resetStateForTests()
})

function makePlayer(uuid, nickname = `nick-${uuid}`) {
    return { uuid, nickname, isReady: true }
}

function makeRoom({ id, players, jokerCount }) {
    return { id, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount } }
}

/**
 * 채널 격리용 세션 + 가짜 io/socket 한 벌. 참가자 전원의 소켓이 세션 channel에 들어가 있고
 * registerGameHandlers로 실제 배선까지 끝난 상태로 돌려준다 — 조작된 클라이언트는 UI가 아니라
 * 소켓 이벤트를 직접 쏘므로, 테스트도 핸들러 직접 호출이 아니라 배선을 거쳐야 그 경로가 된다.
 *
 * 채널 라우팅은 생존 여부와 session.phase만 보므로, 밤/낮 판정을 전부 재현하지 않고 그 둘만
 * canonical 상태에 맞춘다(기존 소켓 채팅 테스트의 관례와 동일).
 *
 * @param {object} options - id · phase · uuids · jokerCount · deadPicker(사망시킬 uuid를 고르는 함수)
 */
function createChatSocketFixture({ id, phase = 'DAY', uuids, jokerCount = 1, deadPicker = null }) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const candidate = gameSessionCore.__testables.buildSessionCandidate(room, { randomFn: () => 0 })
    assert.equal(candidate.ok, true, `createChatSocketFixture: 세션 조립 실패(${candidate.reason})`)
    gameSessionCore.commitGameSession(candidate.session)
    const session = candidate.session
    for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id)
    session.phase = phase

    const byTeam = (isJoker) =>
        [...session.players.values()].filter((p) => (p.role === 'JOKER') === isJoker).map((p) => p.uuid)
    const jokerUuids = byTeam(true)
    const otherUuids = byTeam(false)

    const deadUuids = deadPicker ? deadPicker({ jokerUuids, otherUuids }) : []
    for (const uuid of deadUuids) session.players.get(uuid).alive = false

    const sockets = uuids.map((uuid) => {
        const s = createFakeSocket(uuid)
        s.rooms.add(session.channelId)
        s.data.activeGameId = session.id
        return s
    })
    const io = createFakeIo(sockets)
    const socketByUuid = new Map(sockets.map((s) => [s.data.user.uuid, s]))
    for (const s of sockets) gameSessionSocketLayer.registerGameHandlers(io, s, s.data.user.uuid)

    const aliveOf = (list) => list.filter((uuid) => session.players.get(uuid).alive === true)
    return {
        session,
        io,
        sockets,
        socketByUuid,
        jokerUuids,
        otherUuids,
        deadUuids,
        aliveJokerUuids: aliveOf(jokerUuids),
        aliveOtherUuids: aliveOf(otherUuids),
    }
}

/** 그 소켓이 그 이벤트를 받은 횟수. */
function deliveredCount(socket, event) {
    return socket.emitted.filter((e) => e.event === event).length
}

/** 그 소켓이 받은 모든 채팅 이벤트의 건수 합(부재 단언 — "아무것도 받지 않았다"용). */
function totalChatDeliveries(socket) {
    return ALL_CHAT_EVENTS.reduce((sum, event) => sum + deliveredCount(socket, event), 0)
}

/** 클라이언트가 그 이벤트를 쏜 것과 동일하게 배선된 핸들러를 구동하고 ack 응답을 돌려준다. */
function emitFromClient(socket, event, payload) {
    const { callback, getResponse, getCalls } = countingCallback()
    socket.trigger(event, payload, callback)
    assert.equal(getCalls(), 1, `${event}는 ack를 정확히 한 번 호출해야 한다`)
    return getResponse()
}

// ---------------------------------------------------------------------------
// AC-01 · 밤 턴 — 생존자는 자기 직업 채널만 쓰고, 타 직업 채널을 소켓으로 수신하지 않는다
// ---------------------------------------------------------------------------

test('AC-01: 밤에 생존 JOKER의 메시지는 JOKER 소켓에만 정확히 1건씩 가고 비-JOKER 소켓은 어떤 채팅 이벤트도 받지 않는다', () => {
    const { session, io, socketByUuid, jokerUuids, otherUuids } = createChatSocketFixture({
        id: 'room-ci-ac1',
        phase: 'NIGHT',
        uuids: ['ci1a', 'ci1b', 'ci1c', 'ci1d', 'ci1e'],
        jokerCount: 2,
    })
    assert.equal(jokerUuids.length, 2)
    const [sender, teammate] = jokerUuids

    const response = emitFromClient(socketByUuid.get(sender), 'submit_joker_chat_message', {
        gameId: session.id,
        text: '오늘 밤 대상',
    })

    assert.deepEqual(response, { ok: true })
    assert.equal(deliveredCount(socketByUuid.get(sender), JOKER_CHAT_EVENT), 1, '발신자도 자기 채널을 받는다')
    assert.equal(deliveredCount(socketByUuid.get(teammate), JOKER_CHAT_EVENT), 1)
    for (const uuid of otherUuids) {
        assert.equal(totalChatDeliveries(socketByUuid.get(uuid)), 0, `${uuid}는 타 직업 채널을 소켓으로 받지 않는다`)
    }
    // 개별 소켓 emit만 쓴다 — room/전역 브로드캐스트로 새어나가는 경로가 없다.
    assert.equal(io.broadcasts.length, 0)
    for (const s of socketByUuid.values()) assert.equal(s.emitted.every((e) => e.broadcastTo === undefined), true)
})

test('AC-01: 밤에는 생존자 누구도 공개 채팅을 발행할 수 없고(INVALID_PHASE) 아무 소켓도 이벤트를 받지 않는다', () => {
    const { session, socketByUuid, jokerUuids, otherUuids } = createChatSocketFixture({
        id: 'room-ci-ac1-day',
        phase: 'NIGHT',
        uuids: ['ci1fa', 'ci1fb', 'ci1fc', 'ci1fd', 'ci1fe'],
        jokerCount: 2,
    })

    for (const uuid of [...jokerUuids, ...otherUuids]) {
        assert.deepEqual(
            emitFromClient(socketByUuid.get(uuid), 'submit_game_chat_message', { gameId: session.id, text: '밤 공개 발언' }),
            { ok: false, code: 'INVALID_PHASE', message: '요청을 처리할 수 없습니다.' },
            `${uuid}의 밤 공개 발행은 라우터가 거부한다`,
        )
    }
    for (const s of socketByUuid.values()) assert.equal(totalChatDeliveries(s), 0)
    assert.equal(session.dayChatRateLimit.size, 0)
    assert.equal(session.deadChatRateLimit.size, 0)
})

test('AC-01: 밤에 실제로 수신자가 있는 채널은 JOKER 하나뿐이고 DEAD 소켓 집합은 언제나 비어 있다', () => {
    const { session, io, socketByUuid, jokerUuids } = createChatSocketFixture({
        id: 'room-ci-ac1-sets',
        phase: 'NIGHT',
        uuids: ['ci1ga', 'ci1gb', 'ci1gc', 'ci1gd', 'ci1ge'],
        jokerCount: 2,
        deadPicker: ({ otherUuids: others }) => [others[0]],
    })
    const idsOf = (sockets) => sockets.map((s) => s.id).sort()

    const jokerSockets = resolveJokerTeammateSockets(io, session)
    const daySockets = resolveChatRecipientSockets(io, session, gameSessionCore.CHAT_CHANNELS.DAY)
    const deadSockets = resolveChatRecipientSockets(io, session, gameSessionCore.CHAT_CHANNELS.DEAD)

    assert.deepEqual(idsOf(jokerSockets), idsOf(jokerUuids.map((u) => socketByUuid.get(u))))
    assert.deepEqual(deadSockets, [], '퇴역한 DEAD 채널에는 사망자가 있어도 수신 소켓이 없다')
    // JOKER 소켓 집합은 참가자 전체 집합(DAY)의 부분집합이다 — 다른 직업으로 새지 않는다.
    const dayIds = new Set(idsOf(daySockets))
    for (const s of jokerSockets) assert.equal(dayIds.has(s.id), true)
    assert.equal(daySockets.length, session.players.size, 'DAY 채널은 관전 중인 사망자까지 참가자 전원이다')
})

// ---------------------------------------------------------------------------
// AC-06 · 낮 턴 — 생존 플레이어는 DAY 채널에 메시지를 보낼 수 있다
// ---------------------------------------------------------------------------

test('AC-06: 낮의 생존자가 보낸 DAY 메시지는 참가자 소켓 전원(발신자 포함)에게 정확히 1건씩 간다', () => {
    const { session, io, socketByUuid, jokerUuids, otherUuids } = createChatSocketFixture({
        id: 'room-ci-ac6',
        phase: 'DAY',
        uuids: ['ci6a', 'ci6b', 'ci6c', 'ci6d'],
    })
    const sender = otherUuids[0]

    const response = emitFromClient(socketByUuid.get(sender), 'submit_game_chat_message', {
        gameId: session.id,
        text: '  낮 발언  ',
    })

    assert.deepEqual(response, { ok: true })
    for (const uuid of [...jokerUuids, ...otherUuids]) {
        assert.equal(deliveredCount(socketByUuid.get(uuid), DAY_CHAT_EVENT), 1, `${uuid}는 정확히 1건 받는다`)
        assert.equal(deliveredCount(socketByUuid.get(uuid), DEAD_CHAT_EVENT), 0)
        assert.equal(deliveredCount(socketByUuid.get(uuid), JOKER_CHAT_EVENT), 0)
    }
    const [payload] = socketByUuid.get(otherUuids[1]).emitted.filter((e) => e.event === DAY_CHAT_EVENT).map((e) => e.payload)
    assert.equal(payload.senderUuid, sender)
    assert.equal(payload.text, '낮 발언', 'sanitize된 canonical 텍스트가 나간다')
    assert.equal(payload.gameId, session.id)
    assert.deepEqual([...session.dayChatRateLimit.keys()], [sender])
    assert.equal(io.broadcasts.length, 0)
})

// ---------------------------------------------------------------------------
// AC-02 · 낮 턴 — 사망자는 DAY 메시지를 소켓으로 받지만 발행은 라우터가 거부한다
// ---------------------------------------------------------------------------

test('AC-02: 낮의 사망자 소켓도 생존자의 DAY 메시지를 정확히 1건 받는다(관전 열람)', () => {
    const { session, socketByUuid, otherUuids, jokerUuids, deadUuids } = createChatSocketFixture({
        id: 'room-ci-ac2-receive',
        phase: 'DAY',
        uuids: ['ci2a', 'ci2b', 'ci2c', 'ci2d'],
        deadPicker: ({ otherUuids: others }) => [others[0]],
    })
    const [deadUuid] = deadUuids
    const aliveSender = otherUuids[1]

    const response = emitFromClient(socketByUuid.get(aliveSender), 'submit_game_chat_message', {
        gameId: session.id,
        text: '낮 발언',
    })

    assert.deepEqual(response, { ok: true })
    for (const uuid of [...otherUuids, ...jokerUuids]) {
        assert.equal(deliveredCount(socketByUuid.get(uuid), DAY_CHAT_EVENT), 1, `${uuid}는 DAY 메시지를 1건 받는다`)
    }
    // 사망자가 받은 payload는 생존자가 받은 것과 완전히 같은 canonical 메시지다(열람 가능).
    const [deadPayload] = socketByUuid.get(deadUuid).emitted.filter((e) => e.event === DAY_CHAT_EVENT).map((e) => e.payload)
    const [alivePayload] = socketByUuid.get(jokerUuids[0]).emitted.filter((e) => e.event === DAY_CHAT_EVENT).map((e) => e.payload)
    assert.deepEqual(deadPayload, alivePayload)
    assert.equal(deadPayload.senderUuid, aliveSender)
    // 사망자 전용 채널로 중복 전송되지 않는다.
    for (const s of socketByUuid.values()) assert.equal(deliveredCount(s, DEAD_CHAT_EVENT), 0)
})

test('AC-02: 낮의 사망자가 발행을 시도하면 소켓 라우터가 거부하고 아무 소켓도 이벤트를 받지 않는다', () => {
    const { session, socketByUuid, deadUuids } = createChatSocketFixture({
        id: 'room-ci-ac2-publish',
        phase: 'DAY',
        uuids: ['ci2pa', 'ci2pb', 'ci2pc', 'ci2pd'],
        deadPicker: ({ otherUuids: others }) => [others[0]],
    })
    const [deadUuid] = deadUuids

    const response = emitFromClient(socketByUuid.get(deadUuid), 'submit_game_chat_message', {
        gameId: session.id,
        text: '사망자 발언',
    })

    assert.deepEqual(response, { ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' })
    for (const s of socketByUuid.values()) assert.equal(totalChatDeliveries(s), 0)
    assert.equal(session.dayChatRateLimit.size, 0)
    assert.equal(session.deadChatRateLimit.size, 0)
})

// ---------------------------------------------------------------------------
// AC-03 · 밤 턴 — 사망 플레이어(광대 제외)에게 채팅 이벤트가 전송되지 않는다
// ---------------------------------------------------------------------------

test('AC-03: 밤에 사망한 비-JOKER 소켓은 어떤 채팅 이벤트도 받지 못하고 발행도 거부된다', () => {
    const { session, io, socketByUuid, jokerUuids, deadUuids, aliveOtherUuids } = createChatSocketFixture({
        id: 'room-ci-ac3',
        phase: 'NIGHT',
        uuids: ['ci3a', 'ci3b', 'ci3c', 'ci3d', 'ci3e'],
        jokerCount: 2,
        deadPicker: ({ otherUuids: others }) => [others[0], others[1]],
    })
    const [deadOne, deadTwo] = deadUuids

    // (1) 사망자 본인의 발행 시도는 라우터가 거부한다 — 공개도, 팀 채널도.
    for (const uuid of deadUuids) {
        assert.deepEqual(
            emitFromClient(socketByUuid.get(uuid), 'submit_game_chat_message', { gameId: session.id, text: '밤의 사망자 대화' }),
            { ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' },
        )
        assert.deepEqual(
            emitFromClient(socketByUuid.get(uuid), 'submit_joker_chat_message', { gameId: session.id, text: '팀 대화 흉내' }),
            { ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' },
        )
    }

    // (2) 그 밤에 실제로 오가는 유일한 대화(JOKER 팀 채널)도 사망자 소켓에는 닿지 않는다.
    assert.deepEqual(
        emitFromClient(socketByUuid.get(jokerUuids[0]), 'submit_joker_chat_message', { gameId: session.id, text: '팀 대화' }),
        { ok: true },
    )
    assert.equal(deliveredCount(socketByUuid.get(deadOne), JOKER_CHAT_EVENT), 0)
    assert.equal(deliveredCount(socketByUuid.get(deadTwo), JOKER_CHAT_EVENT), 0)

    // (3) 결과적으로 사망자 소켓의 채팅 이벤트 총합이 0이다("전송되지 않는다"의 직접 단언).
    for (const uuid of deadUuids) {
        assert.equal(totalChatDeliveries(socketByUuid.get(uuid)), 0, `${uuid}는 밤 동안 어떤 채팅 이벤트도 받지 않는다`)
    }
    // 생존한 비-JOKER도 남의 팀 채널을 받지 않는다(격리는 사망 축과 진영 축 모두에서 유지된다).
    for (const uuid of aliveOtherUuids) assert.equal(totalChatDeliveries(socketByUuid.get(uuid)), 0)
    assert.deepEqual(resolveChatRecipientSockets(io, session, gameSessionCore.CHAT_CHANNELS.DEAD), [])
    assert.equal(session.deadChatRateLimit.size, 0)
})

// ---------------------------------------------------------------------------
// AC-04 · 밤 턴 — 사망한 광대는 JOKER 채널에서 송수신할 수 있다
// ---------------------------------------------------------------------------

test('AC-04: 밤에 사망한 광대는 JOKER 채널로 보내고, 그 메시지는 팀 소켓 전원(본인 포함)에게 간다', () => {
    const { session, io, socketByUuid, jokerUuids, otherUuids, deadUuids } = createChatSocketFixture({
        id: 'room-ci-ac4-send',
        phase: 'NIGHT',
        uuids: ['ci4a', 'ci4b', 'ci4c', 'ci4d', 'ci4e'],
        jokerCount: 2,
        deadPicker: ({ jokerUuids: jokers }) => [jokers[0]],
    })
    const [deadJoker] = deadUuids
    const aliveJoker = jokerUuids.find((uuid) => uuid !== deadJoker)

    // 사망 이후에도 팀 소켓 집합은 그대로다(수신 자격이 유지된다).
    assert.deepEqual(
        resolveJokerTeammateSockets(io, session).map((s) => s.id).sort(),
        [socketByUuid.get(deadJoker).id, socketByUuid.get(aliveJoker).id].sort(),
    )

    const response = emitFromClient(socketByUuid.get(deadJoker), 'submit_joker_chat_message', {
        gameId: session.id,
        text: '죽어서도 팀 대화',
    })

    assert.deepEqual(response, { ok: true }, '사망한 광대의 JOKER 발행은 거부되지 않는다')
    assert.equal(deliveredCount(socketByUuid.get(deadJoker), JOKER_CHAT_EVENT), 1, '발신자 본인도 받는다')
    assert.equal(deliveredCount(socketByUuid.get(aliveJoker), JOKER_CHAT_EVENT), 1)
    const [payload] = socketByUuid.get(aliveJoker).emitted.filter((e) => e.event === JOKER_CHAT_EVENT).map((e) => e.payload)
    assert.equal(payload.senderUuid, deadJoker)
    assert.equal(payload.text, '죽어서도 팀 대화')
    // 팀 밖으로는 새지 않는다.
    for (const uuid of otherUuids) assert.equal(totalChatDeliveries(socketByUuid.get(uuid)), 0)
    assert.deepEqual([...session.jokerChatRateLimit.keys()], [deadJoker])
    assert.equal(io.broadcasts.length, 0)
})

test('AC-04: 살아있는 팀원이 보낸 밤 메시지도 사망한 광대의 소켓에 도착한다', () => {
    const { session, socketByUuid, jokerUuids, otherUuids, deadUuids } = createChatSocketFixture({
        id: 'room-ci-ac4-receive',
        phase: 'NIGHT',
        uuids: ['ci4ra', 'ci4rb', 'ci4rc', 'ci4rd', 'ci4re'],
        jokerCount: 2,
        deadPicker: ({ jokerUuids: jokers }) => [jokers[0]],
    })
    const [deadJoker] = deadUuids
    const aliveJoker = jokerUuids.find((uuid) => uuid !== deadJoker)

    assert.deepEqual(
        emitFromClient(socketByUuid.get(aliveJoker), 'submit_joker_chat_message', { gameId: session.id, text: '남은 팀원' }),
        { ok: true },
    )

    assert.equal(deliveredCount(socketByUuid.get(deadJoker), JOKER_CHAT_EVENT), 1, '사망한 광대가 팀 메시지를 수신한다')
    assert.equal(deliveredCount(socketByUuid.get(aliveJoker), JOKER_CHAT_EVENT), 1)
    const [payload] = socketByUuid.get(deadJoker).emitted.filter((e) => e.event === JOKER_CHAT_EVENT).map((e) => e.payload)
    assert.equal(payload.senderUuid, aliveJoker)
    assert.equal(payload.gameId, session.id)
    for (const uuid of otherUuids) assert.equal(totalChatDeliveries(socketByUuid.get(uuid)), 0)
})

// ---------------------------------------------------------------------------
// AC-05 · 조작된 클라이언트 — 권한 없는 채널의 구독·발행을 소켓 라우터가 거부한다
// ---------------------------------------------------------------------------

test('AC-05: 클라이언트가 채널을 고를 수 있는 이벤트 자체가 없다 — 배선된 이벤트는 고정 목록뿐이다', () => {
    const { socketByUuid, otherUuids } = createChatSocketFixture({
        id: 'room-ci-ac5-wiring',
        phase: 'DAY',
        uuids: ['ci5wa', 'ci5wb', 'ci5wc'],
    })
    const socket = socketByUuid.get(otherUuids[0])

    // registerGameHandlers가 실제로 다는 이벤트 전부. 채널을 인자로 받는 이벤트는 하나도 없다.
    for (const event of [
        'acknowledge_role_reveal',
        'ready_for_day_vote',
        'submit_night_action',
        'submit_joker_chat_message',
        'submit_game_chat_message',
        'resolve_night',
        'cast_day_vote',
        'resolve_day_vote',
        'cast_tribunal_vote',
        'resolve_tribunal_vote',
        'leave_game_session',
        'get_session_snapshot',
    ]) {
        assert.equal(socket.listenerCount(event), 1, `${event}는 정확히 한 번 배선된다`)
    }
    // 채널 구독을 클라이언트가 요청할 수 있는 통로는 존재하지 않는다 — 채널 소속은 서버가
    // canonical 상태(생존 여부·phase·진영)에서만 유도한다.
    for (const event of [
        'subscribe_chat_channel',
        'join_chat_channel',
        'chat_subscribe',
        'set_chat_channel',
        'submit_dead_chat_message',
        'submit_day_chat_message',
    ]) {
        assert.equal(socket.listenerCount(event), 0, `${event}는 배선돼 있지 않아야 한다`)
    }
})

test('AC-05: payload에 채널·발신자·닉네임을 위조해 쏴도 라우팅과 전달 대상이 canonical 상태만 따른다', () => {
    const { session, socketByUuid, jokerUuids, otherUuids } = createChatSocketFixture({
        id: 'room-ci-ac5-forge',
        phase: 'DAY',
        uuids: ['ci5fa', 'ci5fb', 'ci5fc', 'ci5fd'],
        deadPicker: ({ otherUuids: others }) => [others[others.length - 1]],
    })
    const sender = otherUuids[0]

    const response = emitFromClient(socketByUuid.get(sender), 'submit_game_chat_message', {
        gameId: session.id,
        text: '위조 시도',
        // 조작된 클라이언트가 얹은 필드들 — 핸들러는 gameId·text 외에는 읽지 않는다.
        channel: 'JOKER',
        senderUuid: jokerUuids[0],
        nickname: '위조된 닉네임',
        alive: false,
        dayIndex: 999,
        messageId: 'forged-message-id',
        sentAt: 1,
    })

    assert.deepEqual(response, { ok: true })
    // JOKER 채널로도 DEAD 채널로도 새지 않는다 — 유도된 채널은 언제나 DAY 하나뿐이다.
    for (const s of socketByUuid.values()) {
        assert.equal(deliveredCount(s, JOKER_CHAT_EVENT), 0)
        assert.equal(deliveredCount(s, DEAD_CHAT_EVENT), 0)
        assert.equal(deliveredCount(s, DAY_CHAT_EVENT), 1)
    }
    const [payload] = socketByUuid.get(jokerUuids[0]).emitted.filter((e) => e.event === DAY_CHAT_EVENT).map((e) => e.payload)
    assert.equal(payload.senderUuid, sender, '위조된 senderUuid는 무시된다')
    assert.equal(payload.nickname, session.players.get(sender).nickname)
    assert.equal(payload.dayIndex, session.dayIndex)
    assert.notEqual(payload.messageId, 'forged-message-id')
    assert.notEqual(payload.sentAt, 1)
    assert.equal(session.jokerChatRateLimit.size, 0)
    assert.equal(session.deadChatRateLimit.size, 0)
})

test('AC-05: 비-JOKER 생존자가 JOKER 채널로 발행을 시도하면 라우터가 거부하고 아무 소켓도 받지 않는다', () => {
    const { session, socketByUuid, otherUuids } = createChatSocketFixture({
        id: 'room-ci-ac5-joker',
        phase: 'NIGHT',
        uuids: ['ci5ja', 'ci5jb', 'ci5jc', 'ci5jd'],
    })

    for (const uuid of otherUuids) {
        assert.deepEqual(
            emitFromClient(socketByUuid.get(uuid), 'submit_joker_chat_message', { gameId: session.id, text: '끼어들기' }),
            { ok: false, code: 'NOT_ELIGIBLE', message: '요청을 처리할 수 없습니다.' },
        )
    }
    for (const s of socketByUuid.values()) assert.equal(totalChatDeliveries(s), 0)
    assert.equal(session.jokerChatRateLimit.size, 0)
})

test('AC-05: 다른 세션의 gameId로 발행을 시도하면 거부되고 그 세션 소켓에도 전달되지 않는다', () => {
    const a = createChatSocketFixture({ id: 'room-ci-ac5-xa', phase: 'DAY', uuids: ['ci5xa1', 'ci5xa2', 'ci5xa3'] })
    const b = createChatSocketFixture({ id: 'room-ci-ac5-xb', phase: 'DAY', uuids: ['ci5xb1', 'ci5xb2', 'ci5xb3'] })
    const sender = a.otherUuids[0]

    const response = emitFromClient(a.socketByUuid.get(sender), 'submit_game_chat_message', {
        gameId: b.session.id,
        text: '남의 세션으로',
    })

    assert.deepEqual(response, { ok: false, code: 'STALE_SESSION_MISMATCH', message: '요청을 처리할 수 없습니다.' })
    for (const s of [...a.sockets, ...b.sockets]) assert.equal(totalChatDeliveries(s), 0)
    assert.equal(a.session.dayChatRateLimit.size, 0)
    assert.equal(b.session.dayChatRateLimit.size, 0)
})

test('AC-05: registry의 canonical 소켓이 아닌 연결에서 쏘면 STALE_SOCKET으로 거부된다', () => {
    const { session, io, socketByUuid, otherUuids } = createChatSocketFixture({
        id: 'room-ci-ac5-stale',
        phase: 'DAY',
        uuids: ['ci5sa', 'ci5sb', 'ci5sc'],
    })
    const impersonated = otherUuids[0]
    // 같은 uuid를 주장하지만 registry가 가리키는 canonical 소켓이 아닌 두 번째 연결.
    const staleSocket = createFakeSocket(impersonated, { id: 'sock-stale-ci5' })
    staleSocket.rooms.add(session.channelId)
    io.sockets.sockets.set(staleSocket.id, staleSocket)
    gameSessionSocketLayer.registerGameHandlers(io, staleSocket, impersonated)

    const response = emitFromClient(staleSocket, 'submit_game_chat_message', { gameId: session.id, text: '가로채기' })

    assert.deepEqual(response, { ok: false, code: 'STALE_SOCKET', message: '요청을 처리할 수 없습니다.' })
    for (const s of [...socketByUuid.values(), staleSocket]) assert.equal(totalChatDeliveries(s), 0)
    assert.equal(session.dayChatRateLimit.size, 0)
})
