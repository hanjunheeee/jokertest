// 채팅 채널 격리(joker-S4-chat-channels)의 도메인 층 계약 테스트.
//
// 이 파일이 보는 것은 "누가 어느 채널로 발행할 수 있고, 그 채널의 canonical 수신자가
// 누구인가" 하나뿐이다 — 채널 판정(resolveGameChatChannel) · 수신자 팬아웃
// (getChatRecipientUuids) · 능력 대조(matchesPreparedGameChatCapability)를 소켓 없이
// 순수 함수 수준에서 고정한다. 소켓으로 실제 이벤트가 나가는지/안 나가는지는 짝이 되는
// socket/__tests__/gameSession.chatIsolation.test.js가 본다.
//
// 기존 gameSession.session.test.js는 각 채팅 함수를 함수 단위로 이미 촘촘히 검증한다.
// 여기서는 그 조각들을 "생존×페이즈×역할" 조합표 하나로 다시 묶어, 채널 격리라는 성질
// 자체가 조합 전체에서 성립하는지를 본다(AC 단위 추적 가능성이 이 파일의 존재 이유다).
//
// ⚠ AC-02 · AC-03 · AC-04는 현재 구현과 어긋난다. 이 파일은 그 어긋남을 산문이 아니라
//   실행 가능한 형태로 고정하고(divergence 섹션), 필요한 규칙 변경은 범위 밖이므로
//   .pluto/expansion-request.json으로 올린다. 자세한 내용은 각 divergence 테스트의 주석 참고.

const test = require('node:test')
const assert = require('node:assert/strict')

const gameSession = require('../gameSession')
const {
    prepareGameChatMessage,
    commitGameChatMessage,
    prepareJokerChatMessage,
    commitJokerChatMessage,
    getChatRecipientUuids,
    commitGameSession,
    CHAT_CHANNELS,
    CHAT_MIN_INTERVAL_MS,
} = gameSession
const { buildSessionCandidate, resolveGameChatChannel, getChatRateLimitMap } = gameSession.__testables

const { makePlayer, makeRoom, chatRateLimitSnapshot, commitPrepared, tamperPrepared, handBuiltPrepared } = require('./gameSession.testUtils')

test.beforeEach(() => {
    gameSession.__resetStateForTests()
})
test.afterEach(() => {
    gameSession.__resetStateForTests()
})

/**
 * 채널 격리 조합표(생존 × phase × 역할)의 단일 조립기. 6개 AC가 같은 축의 조합만 다르게
 * 밟으므로 픽스처를 한 곳에 둔다.
 *
 * randomFn:()=>0 고정 셔플이라 역할 배정이 결정적이지만, 어떤 uuid가 JOKER인지는 위치로
 * 가정하지 않고 언제나 배정 결과에서 직접 찾는다(구성 규칙이 바뀌어도 이 픽스처는 깨지지
 * 않는다). alive 플래그는 커밋 이후에만 손대므로 commitGameSession의 입력 불변식을 건드리지
 * 않는다.
 *
 * @param {object} options - id(방 id) · phase · uuids · jokerCount · deadUuids(사망 처리할 uuid)
 */
function createChatSessionFixture({ id, phase = 'DAY', uuids, jokerCount = 1, deadUuids = [] }) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    assert.equal(candidate.ok, true, `createChatSessionFixture: 세션 조립 실패(${candidate.reason})`)
    commitGameSession(candidate.session)

    const session = candidate.session
    session.phase = phase
    for (const uuid of deadUuids) session.players.get(uuid).alive = false

    const byTeam = (isJoker) =>
        [...session.players.values()].filter((p) => (p.role === 'JOKER') === isJoker).map((p) => p.uuid)
    const jokerUuids = byTeam(true)
    const otherUuids = byTeam(false)
    const aliveOf = (list) => list.filter((uuid) => session.players.get(uuid).alive === true)

    return {
        session,
        jokerUuids,
        otherUuids,
        aliveJokerUuids: aliveOf(jokerUuids),
        aliveOtherUuids: aliveOf(otherUuids),
    }
}

/** 발행 시도의 결과를 { ok, code|channel } 한 줄로 요약한다(조합표 단언용). */
function routeOf(session, uuid) {
    return resolveGameChatChannel(session, session.players.get(uuid))
}

// ---------------------------------------------------------------------------
// AC-01 · 밤 턴 — 생존자는 자기 직업 채널만 쓰고 타 직업 채널을 수신하지 않는다
// ---------------------------------------------------------------------------

test('AC-01: 채널 상수는 DAY/DEAD/JOKER 셋뿐이다 — "직업 전용 채널"은 JOKER 하나가 전부다', () => {
    // 이 단언이 깨지면 AC-01의 "각 직업 채널"이 더 이상 JOKER 하나를 뜻하지 않는다는 뜻이고,
    // 아래 밤 격리 테스트들의 전제(A-01)가 통째로 다시 정의돼야 한다.
    assert.deepEqual(Object.keys(CHAT_CHANNELS).sort(), ['DAY', 'DEAD', 'JOKER'])
    assert.deepEqual(CHAT_CHANNELS, { DAY: 'DAY', DEAD: 'DEAD', JOKER: 'JOKER' })
})

test('AC-01: 밤에는 생존자 누구도 공개 채팅으로 발행할 수 없다(JOKER 포함 전원 INVALID_PHASE)', () => {
    const { session, jokerUuids, otherUuids } = createChatSessionFixture({
        id: 'room-ac1-publish',
        phase: 'NIGHT',
        uuids: ['ac1a', 'ac1b', 'ac1c', 'ac1d', 'ac1e'],
        jokerCount: 2,
    })

    for (const uuid of [...jokerUuids, ...otherUuids]) {
        assert.deepEqual(routeOf(session, uuid), { ok: false, code: 'INVALID_PHASE' }, `${uuid}는 밤에 공개 채널을 못 연다`)
        assert.deepEqual(prepareGameChatMessage(uuid, session.id, '밤 공개 발언', { now: () => 1000 }), {
            ok: false,
            code: 'INVALID_PHASE',
        })
    }
    // 거부된 준비는 어떤 채널의 rate limit도 소비하지 않는다.
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})

test('AC-01: 밤에 생존 JOKER는 JOKER 채널만 쓸 수 있고, 비-JOKER 생존자는 그 채널을 열 수도 받을 수도 없다', () => {
    const { session, jokerUuids, otherUuids } = createChatSessionFixture({
        id: 'room-ac1-joker',
        phase: 'NIGHT',
        uuids: ['ac1fa', 'ac1fb', 'ac1fc', 'ac1fd', 'ac1fe'],
        jokerCount: 2,
    })
    assert.equal(jokerUuids.length, 2, '이 픽스처는 JOKER 2명을 전제한다')

    // 발행: JOKER만 통과한다.
    for (const uuid of jokerUuids) {
        assert.equal(prepareJokerChatMessage(uuid, session.id, '팀 대화', { now: () => 1000 }).ok, true)
    }
    for (const uuid of otherUuids) {
        assert.deepEqual(prepareJokerChatMessage(uuid, session.id, '끼어들기', { now: () => 1000 }), {
            ok: false,
            code: 'NOT_ELIGIBLE',
        })
    }

    // 수신: JOKER 채널 수신자 집합에 비-JOKER는 한 명도 없다.
    const jokerRecipients = getChatRecipientUuids(session, CHAT_CHANNELS.JOKER)
    assert.deepEqual([...jokerRecipients].sort(), [...jokerUuids].sort())
    for (const uuid of otherUuids) {
        assert.equal(jokerRecipients.includes(uuid), false, `${uuid}는 JOKER 채널을 수신하지 않는다`)
    }

    // 밤에는 DEAD 채널도 비어 있다(사망자가 없으므로) — 어느 생존자도 타 채널로 새지 않는다.
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [])
})

test('AC-01: 밤의 세 채널 수신자 집합은 서로 겹치지 않는다(사망자·생존 JOKER·생존 비-JOKER 혼재)', () => {
    const uuids = ['ac1ga', 'ac1gb', 'ac1gc', 'ac1gd', 'ac1ge']
    const seed = createChatSessionFixture({ id: 'room-ac1-disjoint', phase: 'NIGHT', uuids, jokerCount: 2 })
    // JOKER 한 명과 비-JOKER 한 명을 사망 처리해 세 축이 모두 채워진 조합을 만든다.
    const deadJoker = seed.jokerUuids[0]
    const deadOther = seed.otherUuids[0]
    seed.session.players.get(deadJoker).alive = false
    seed.session.players.get(deadOther).alive = false
    const { session } = seed

    const day = getChatRecipientUuids(session, CHAT_CHANNELS.DAY)
    const dead = getChatRecipientUuids(session, CHAT_CHANNELS.DEAD)
    const joker = getChatRecipientUuids(session, CHAT_CHANNELS.JOKER)

    assert.deepEqual([...dead].sort(), [deadJoker, deadOther].sort())
    assert.equal(day.includes(deadJoker), false)
    assert.equal(day.includes(deadOther), false)
    // JOKER 채널은 DAY(생존자)의 진부분집합이고 DEAD와는 완전히 분리돼 있다.
    for (const uuid of joker) assert.equal(day.includes(uuid), true)
    for (const uuid of joker) assert.equal(dead.includes(uuid), false)
    assert.equal(day.length + dead.length, session.players.size, 'DAY와 DEAD는 참가자 전원을 정확히 한 번씩 나눠 갖는다')
})

// ---------------------------------------------------------------------------
// AC-06 · 낮 턴 — 생존자는 DAY 채널에 메시지를 보낼 수 있다
// ---------------------------------------------------------------------------

test('AC-06: 낮의 생존자는 DAY 채널로 발행하고 커밋까지 성공하며 생존자 전원이 수신자다', () => {
    const { session, aliveOtherUuids, aliveJokerUuids } = createChatSessionFixture({
        id: 'room-ac6-send',
        phase: 'DAY',
        uuids: ['ac6a', 'ac6b', 'ac6c', 'ac6d'],
    })
    const actor = aliveOtherUuids[0]
    const sentAt = 10_000

    const prepared = prepareGameChatMessage(actor, session.id, '  안녕하세요  ', {
        now: () => sentAt,
        idFn: () => 'msg-ac6',
    })

    assert.equal(prepared.ok, true)
    assert.equal(prepared.channel, CHAT_CHANNELS.DAY)
    // 준비만으로는 어떤 Map도 바뀌지 않는다(발행 확정은 commit의 일이다).
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })

    const committed = commitPrepared(prepared)

    assert.equal(committed.ok, true)
    assert.equal(committed.channel, CHAT_CHANNELS.DAY)
    assert.deepEqual(committed.message, {
        gameId: session.id,
        messageId: 'msg-ac6',
        senderUuid: actor,
        nickname: session.players.get(actor).nickname,
        text: '안녕하세요',
        sentAt,
        dayIndex: session.dayIndex,
    })
    // 유도된 채널의 Map만 갱신된다.
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [[actor, sentAt]], DEAD: [], JOKER: [] })

    // 발신자를 포함한 생존자 전원이 canonical 수신자다("보낼 수 있다"에는 도달한다는 뜻이 포함된다).
    const recipients = getChatRecipientUuids(session, CHAT_CHANNELS.DAY)
    assert.deepEqual([...recipients].sort(), [...aliveOtherUuids, ...aliveJokerUuids].sort())
    assert.equal(recipients.includes(actor), true)
})

test('AC-06: rate limit은 정상 1회 발행을 막지 않는다 — 간격 미만의 두 번째만 거부된다', () => {
    const { session, aliveOtherUuids } = createChatSessionFixture({
        id: 'room-ac6-rate',
        phase: 'DAY',
        uuids: ['ac6ra', 'ac6rb', 'ac6rc'],
    })
    const actor = aliveOtherUuids[0]
    const first = 50_000

    assert.equal(commitPrepared(prepareGameChatMessage(actor, session.id, '첫 발언', { now: () => first })).ok, true)
    assert.equal(getChatRateLimitMap(session, CHAT_CHANNELS.DAY).get(actor), first)

    // 간격 직전(-1ms)은 거부, 정확히 간격만큼 지나면 다시 통과한다.
    assert.deepEqual(
        prepareGameChatMessage(actor, session.id, '너무 빠른 발언', { now: () => first + CHAT_MIN_INTERVAL_MS - 1 }),
        { ok: false, code: 'RATE_LIMITED' },
    )
    const later = prepareGameChatMessage(actor, session.id, '충분히 기다린 발언', {
        now: () => first + CHAT_MIN_INTERVAL_MS,
    })
    assert.equal(later.ok, true)
    assert.equal(later.channel, CHAT_CHANNELS.DAY)
})

// ---------------------------------------------------------------------------
// AC-05 · 조작된 클라이언트 — 권한 없는 채널의 구독·발행은 거부된다
// ---------------------------------------------------------------------------

test('AC-05: 채널은 canonical 상태에서만 유도된다 — 인자에 채널·발신자를 위조해도 라우팅이 바뀌지 않는다', () => {
    const { session, aliveOtherUuids, aliveJokerUuids } = createChatSessionFixture({
        id: 'room-ac5-route',
        phase: 'DAY',
        uuids: ['ac5ra', 'ac5rb', 'ac5rc', 'ac5rd'],
    })
    const actor = aliveOtherUuids[0]

    // prepareGameChatMessage의 인자에는 채널 자리가 아예 없다 — 넘길 수 있는 것은
    // (uuid, gameId, text, {now, idFn})뿐이고, 옵션 객체에 무엇을 더 실어도 무시된다.
    const prepared = prepareGameChatMessage(actor, session.id, '위조 시도', {
        now: () => 20_000,
        idFn: () => 'msg-ac5r',
        channel: CHAT_CHANNELS.JOKER,
        senderUuid: aliveJokerUuids[0],
        nickname: '위조된 닉네임',
        alive: false,
    })

    assert.equal(prepared.ok, true)
    assert.equal(prepared.channel, CHAT_CHANNELS.DAY, '위조된 channel 옵션은 라우팅의 입력이 아니다')
    assert.equal(prepared.actorUuid, actor)
    assert.equal(prepared.nickname, session.players.get(actor).nickname)
    assert.equal(prepared.message.senderUuid, actor)
    assert.equal(commitPrepared(prepared).channel, CHAT_CHANNELS.DAY)
    assert.deepEqual(chatRateLimitSnapshot(session).JOKER, [], 'JOKER 채널은 손대지지 않는다')
})

test('AC-05: prepare를 거치지 않고 손으로 조립한 능력은 모든 값이 canonical해도 거부된다', () => {
    const { session, aliveOtherUuids } = createChatSessionFixture({
        id: 'room-ac5-forged',
        phase: 'DAY',
        uuids: ['ac5fa', 'ac5fb', 'ac5fc'],
    })
    const actor = aliveOtherUuids[0]
    const sentAt = 30_000

    const forged = handBuiltPrepared({
        session,
        channel: CHAT_CHANNELS.DAY,
        actorUuid: actor,
        nickname: session.players.get(actor).nickname,
        text: '손으로 만든 요청',
        sentAt,
        dayIndex: session.dayIndex,
    })

    assert.deepEqual(commitGameChatMessage(forged, { now: () => sentAt }), { ok: false, code: 'STALE_CHAT_REQUEST' })
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })

    // 능력 조회는 참조로만 이뤄지므로, prepared 자리에 객체가 아닌 값을 넣어도 조용히 거부된다.
    for (const notAPrepared of [null, undefined, 'prepared', 42, []]) {
        assert.equal(commitGameChatMessage(notAPrepared, { now: () => sentAt }).ok, false)
    }
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})

/**
 * 발급된 prepared의 필드를 정확히 하나만 바꾼 사본을 만들어 commit에 넣는다(AC-05).
 * matchesPreparedGameChatCapability가 대조하는 필드를 테이블로 순회하기 위한 헬퍼다 —
 * 매번 새로 prepare해야 하므로(능력은 객체 신원에 매달린다) prepare 자체도 여기서 한다.
 */
function tamperPreparedField(session, actorUuid, patch, { sentAt = 40_000, messageId = 'msg-tamper' } = {}) {
    const prepared = prepareGameChatMessage(actorUuid, session.id, '원문', {
        now: () => sentAt,
        idFn: () => messageId,
    })
    assert.equal(prepared.ok, true, 'tamperPreparedField: 변조 전 준비는 성공해야 한다')
    return commitPrepared(tamperPrepared(prepared, patch), { now: sentAt })
}

test('AC-05: 능력 대조가 보는 15개 필드를 하나씩 흔들면 전부 STALE_CHAT_REQUEST로 거부되고 Map은 끝까지 불변이다', () => {
    const { session, aliveOtherUuids } = createChatSessionFixture({
        id: 'room-ac5-fields',
        phase: 'DAY',
        uuids: ['ac5ta', 'ac5tb', 'ac5tc'],
    })
    const actor = aliveOtherUuids[0]
    const other = aliveOtherUuids[1]
    const baseSentAt = 40_000

    // matchesPreparedGameChatCapability가 대조하는 전부: 최상위 8개 + message 7개.
    const patches = {
        'ok': { ok: false },
        'session': { session: { id: session.id, players: session.players } },
        'channel': { channel: CHAT_CHANNELS.DEAD },
        'actorUuid': { actorUuid: other },
        'nickname': { nickname: '변조된 닉네임' },
        'sanitizedText': { sanitizedText: '변조된 본문' },
        'sentAt': { sentAt: baseSentAt + 1 },
        'dayIndex': { dayIndex: session.dayIndex + 1 },
        'message.gameId': { message: { gameId: 'other-game' } },
        'message.messageId': { message: { messageId: 'forged-id' } },
        'message.senderUuid': { message: { senderUuid: other } },
        'message.nickname': { message: { nickname: '변조된 닉네임' } },
        'message.text': { message: { text: '변조된 본문' } },
        'message.sentAt': { message: { sentAt: baseSentAt + 1 } },
        'message.dayIndex': { message: { dayIndex: session.dayIndex + 1 } },
        'message(객체 아님)': { message: null },
    }

    for (const [label, patch] of Object.entries(patches)) {
        assert.deepEqual(
            tamperPreparedField(session, actor, patch, { sentAt: baseSentAt }),
            { ok: false, code: 'STALE_CHAT_REQUEST' },
            `${label}를 변조한 요청은 거부돼야 한다`,
        )
        assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] }, `${label} 변조 후에도 Map은 불변이다`)
    }

    // 양성 대조: 변조하지 않은 같은 모양의 요청은 정상적으로 커밋된다.
    const clean = prepareGameChatMessage(actor, session.id, '원문', { now: () => baseSentAt, idFn: () => 'msg-clean' })
    assert.equal(commitPrepared(clean).ok, true)
    assert.deepEqual(chatRateLimitSnapshot(session).DAY, [[actor, baseSentAt]])
})

test('AC-05: 비-JOKER는 JOKER 채널을 열 수 없고, 그 거부는 어떤 Map도 소비하지 않는다', () => {
    const { session, otherUuids } = createChatSessionFixture({
        id: 'room-ac5-joker',
        phase: 'NIGHT',
        uuids: ['ac5ja', 'ac5jb', 'ac5jc', 'ac5jd'],
    })

    for (const uuid of otherUuids) {
        assert.deepEqual(prepareJokerChatMessage(uuid, session.id, '권한 없는 발행', { now: () => 60_000 }), {
            ok: false,
            code: 'NOT_ELIGIBLE',
        })
    }
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})

// ---------------------------------------------------------------------------
// AC-02 · AC-03 · AC-04 — 현재 구현과 어긋나는 지점(divergence)
//
// 아래 세 테스트는 AC를 만족시키지 못한다. AC가 요구하는 규칙과 현재 구현이 실제로 무엇을
// 하는지를 나란히 고정해, 규칙 변경이 필요하다는 근거를 실행 가능한 형태로 남긴다.
// 규칙 자체(DEAD_CHAT_PHASES · JOKER 채널의 생존 요건)를 바꾸는 일은 이 슬라이스의 범위
// 밖이라 .pluto/expansion-request.json으로 올렸다.
// ---------------------------------------------------------------------------

test('[divergence AC-02] 낮의 사망자는 DAY 메시지를 수신하지 못하고, 발행은 거부 대신 DEAD 채널로 재라우팅된다', () => {
    const uuids = ['ac2a', 'ac2b', 'ac2c', 'ac2d']
    const seed = createChatSessionFixture({ id: 'room-ac2', phase: 'DAY', uuids })
    const deadUuid = seed.otherUuids[0]
    seed.session.players.get(deadUuid).alive = false
    const { session } = seed

    // AC-02 전반("DAY 채널 메시지를 수신·열람할 수 있다")과 어긋난다 — DAY 팬아웃은 생존자만이다.
    const dayRecipients = getChatRecipientUuids(session, CHAT_CHANNELS.DAY)
    assert.equal(dayRecipients.includes(deadUuid), false, '현재 구현: 사망자는 DAY 수신자가 아니다')

    // AC-02 후반("발행은 서버에서 거부된다")과도 어긋난다 — 거부가 아니라 DEAD 채널로 성공한다.
    const prepared = prepareGameChatMessage(deadUuid, session.id, '사망자의 낮 발언', {
        now: () => 70_000,
        idFn: () => 'msg-ac2',
    })
    assert.equal(prepared.ok, true, '현재 구현: 사망자의 낮 발행은 거부되지 않는다')
    assert.equal(prepared.channel, CHAT_CHANNELS.DEAD, '현재 구현: DAY가 아니라 DEAD로 재라우팅된다')
    assert.equal(commitPrepared(prepared).ok, true)
    assert.deepEqual(chatRateLimitSnapshot(session).DEAD, [[deadUuid, 70_000]])
    assert.deepEqual(chatRateLimitSnapshot(session).DAY, [], 'DAY 채널은 사망자에게 열리지 않는다')

    // 다만 "사망자가 DAY 채널로는 발행할 수 없다"는 좁은 의미는 성립한다 —
    // resolveGameChatChannel은 사망자에게 절대 DAY를 돌려주지 않는다.
    assert.notEqual(routeOf(session, deadUuid).channel, CHAT_CHANNELS.DAY)
})

test('[divergence AC-03] 밤에도 사망자끼리 DEAD 채널이 열려 있어 사망자에게 채팅 이벤트가 전달된다', () => {
    const uuids = ['ac3a', 'ac3b', 'ac3c', 'ac3d', 'ac3e']
    const seed = createChatSessionFixture({ id: 'room-ac3', phase: 'NIGHT', uuids })
    const [deadOne, deadTwo] = seed.otherUuids
    seed.session.players.get(deadOne).alive = false
    seed.session.players.get(deadTwo).alive = false
    const { session } = seed

    // AC-03("밤 턴에서 사망 플레이어에게 채팅 이벤트가 전송되지 않는다")과 정면으로 어긋난다.
    // 계획서의 전제 A-02는 DEAD_CHAT_PHASES에 'NIGHT'이 없다고 봤지만 실제로는 포함돼 있다.
    assert.deepEqual(routeOf(session, deadOne), { ok: true, channel: CHAT_CHANNELS.DEAD })

    const prepared = prepareGameChatMessage(deadOne, session.id, '밤의 사망자 대화', {
        now: () => 80_000,
        idFn: () => 'msg-ac3',
    })
    assert.equal(prepared.ok, true, '현재 구현: 밤의 사망자 발행은 성공한다')
    assert.equal(commitPrepared(prepared).ok, true)

    // 그리고 그 메시지는 사망자 전원에게 간다 — "전송되지 않는다"가 아니다.
    assert.deepEqual([...getChatRecipientUuids(session, CHAT_CHANNELS.DEAD)].sort(), [deadOne, deadTwo].sort())
})

test('[divergence AC-04] 밤에 사망한 광대는 JOKER 채널에서 송신도 수신도 하지 못한다', () => {
    const uuids = ['ac4a', 'ac4b', 'ac4c', 'ac4d', 'ac4e']
    const seed = createChatSessionFixture({ id: 'room-ac4', phase: 'NIGHT', uuids, jokerCount: 2 })
    const [deadJoker, aliveJoker] = seed.jokerUuids
    const { session } = seed

    // 살아있는 동안에는 송수신 양쪽이 성립한다(양성 대조).
    assert.deepEqual([...getChatRecipientUuids(session, CHAT_CHANNELS.JOKER)].sort(), [deadJoker, aliveJoker].sort())
    assert.equal(prepareJokerChatMessage(deadJoker, session.id, '살아있는 광대', { now: () => 90_000 }).ok, true)

    session.players.get(deadJoker).alive = false

    // AC-04("사망한 광대는 JOKER 채널에서 메시지를 송수신할 수 있다")와 정면으로 어긋난다.
    assert.deepEqual(
        prepareJokerChatMessage(deadJoker, session.id, '죽은 광대', { now: () => 91_000 }),
        { ok: false, code: 'NOT_ELIGIBLE' },
        '현재 구현: 사망한 광대는 JOKER 채널로 송신할 수 없다',
    )
    assert.deepEqual(
        getChatRecipientUuids(session, CHAT_CHANNELS.JOKER),
        [aliveJoker],
        '현재 구현: 사망한 광대는 JOKER 채널 수신자에서 빠진다',
    )

    // 살아있는 팀원의 발행은 그대로 성립하므로, 빠지는 것은 사망한 광대 한 명뿐이다.
    const teamMessage = prepareJokerChatMessage(aliveJoker, session.id, '남은 팀원', { now: () => 92_000 })
    assert.equal(teamMessage.ok, true)
    assert.equal(commitJokerChatMessage(session, aliveJoker, teamMessage.sentAt).ok, true)
    assert.deepEqual(chatRateLimitSnapshot(session).JOKER, [[aliveJoker, 92_000]])
})
