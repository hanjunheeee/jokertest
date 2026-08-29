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
// 이 슬라이스가 고정하는 규칙 한 줄 요약:
//   발행은 "살아 있는 낮의 참가자"(공개 DAY)와 "살아 있는 각 역할"(밤의 역할 채널)이 할 수 있고,
//   수신은 공개 DAY가 관전 중인 사망자까지 전원, 역할 채널은 같은 역할 생존자만이다.
//   단, 사망한 JOKER는 밤의 JOKER 채널에서 계속 송수신할 수 있다.
//   사망자 전용 채널(CHAT_CHANNELS.DEAD)은 퇴역해 수신자가 언제나 0명이다.

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

/** 어떤 phase에서도 사망자가 공개 채팅을 열 수 없음을 훑을 때 쓰는 phase 목록(ENDED 제외 — 그건 GAME_ALREADY_ENDED가 먼저 막는다). */
const NON_ENDED_PHASES = ['ROLE_REVEAL', 'DAY', 'NIGHT', 'TRIBUNAL']

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
 * @param {object} options - id(방 id) · phase · uuids · jokerCount · deadPicker(사망시킬 uuid를 고르는 함수)
 */
function createChatSessionFixture({ id, phase = 'DAY', uuids, jokerCount = 1, deadPicker = null }) {
    const room = makeRoom({ id, players: uuids.map((uuid) => makePlayer(uuid)), jokerCount })
    const candidate = buildSessionCandidate(room, { randomFn: () => 0 })
    assert.equal(candidate.ok, true, `createChatSessionFixture: 세션 조립 실패(${candidate.reason})`)
    commitGameSession(candidate.session)

    const session = candidate.session
    session.phase = phase

    const byTeam = (isJoker) =>
        [...session.players.values()].filter((p) => (p.role === 'JOKER') === isJoker).map((p) => p.uuid)
    const jokerUuids = byTeam(true)
    const otherUuids = byTeam(false)

    const deadUuids = deadPicker ? deadPicker({ jokerUuids, otherUuids }) : []
    for (const uuid of deadUuids) session.players.get(uuid).alive = false

    const aliveOf = (list) => list.filter((uuid) => session.players.get(uuid).alive === true)
    return {
        session,
        jokerUuids,
        otherUuids,
        deadUuids,
        aliveJokerUuids: aliveOf(jokerUuids),
        aliveOtherUuids: aliveOf(otherUuids),
    }
}

/** 발행 시도의 결과를 { ok, code|channel } 한 줄로 요약한다(조합표 단언용). */
function routeOf(session, uuid) {
    return resolveGameChatChannel(session, session.players.get(uuid))
}

/** 세션에 실제로 배정된 역할 집합(AC-01의 "각 직업"을 배정 결과에서 직접 읽는다). */
function rolesOf(session) {
    return [...new Set([...session.players.values()].map((p) => p.role))]
}

// ---------------------------------------------------------------------------
// AC-01 · 밤 턴 — 생존자는 자기 직업 채널만 쓰고 타 직업 채널을 수신하지 않는다
// ---------------------------------------------------------------------------

test('AC-01: 모든 게임 역할은 같은 이름의 밤 채널을 갖고 DEAD는 수신자가 없는 퇴역 채널이다', () => {
    assert.deepEqual(Object.keys(CHAT_CHANNELS).sort(), [
        'CITIZEN', 'DAY', 'DEAD', 'DOCTOR', 'GUARD', 'JOKER', 'WITCH_HUNTER',
    ])

    const { session } = createChatSessionFixture({
        id: 'room-ac1-consts',
        phase: 'NIGHT',
        uuids: ['ac1ca', 'ac1cb', 'ac1cc', 'ac1cd'],
        deadPicker: ({ otherUuids }) => [otherUuids[0]],
    })
    // DEAD는 상수로만 남아 있다 — 사망자가 있어도 수신자가 0명이라 어떤 메시지도 나를 수 없다.
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [])
})

test('AC-01: 밤에는 생존자 누구도 공개 채팅으로 발행할 수 없다(모든 직업이 INVALID_PHASE)', () => {
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

test('AC-01: 밤의 모든 생존자는 자기 역할 채널로 발행하고 같은 역할 생존자만 수신한다', () => {
    const { session } = createChatSessionFixture({
        id: 'room-ac1-joker',
        phase: 'NIGHT',
        uuids: ['ac1fa', 'ac1fb', 'ac1fc', 'ac1fd', 'ac1fe', 'ac1ff', 'ac1fg', 'ac1fh', 'ac1fi', 'ac1fj'],
        jokerCount: 1,
    })
    assert.deepEqual(rolesOf(session).sort(), ['CITIZEN', 'DOCTOR', 'GUARD', 'JOKER', 'WITCH_HUNTER'])

    for (const player of session.players.values()) {
        const prepared = prepareJokerChatMessage(player.uuid, session.id, '역할 대화', { now: () => 1000 })
        assert.equal(prepared.ok, true, `${player.role} 생존자는 밤 채팅을 보낼 수 있다`)
        assert.equal(prepared.channel, player.role)

        const expected = [...session.players.values()]
            .filter((candidate) => candidate.alive === true && candidate.role === player.role)
            .map((candidate) => candidate.uuid)
            .sort()
        assert.deepEqual(getChatRecipientUuids(session, player.role).sort(), expected)
    }
})

test('AC-01: 역할 채널들은 서로 겹치지 않고, 사망 비-JOKER만 자기 역할 채널에서 빠진다', () => {
    const uuids = ['ac1ga', 'ac1gb', 'ac1gc', 'ac1gd', 'ac1ge']
    const { session, jokerUuids, otherUuids } = createChatSessionFixture({
        id: 'room-ac1-sets',
        phase: 'NIGHT',
        uuids,
        jokerCount: 2,
        // JOKER 한 명과 다른 직업 한 명을 사망 처리해 네 축(생존/사망 × JOKER/비JOKER)을 다 채운다.
        deadPicker: ({ jokerUuids: jokers, otherUuids: others }) => [jokers[0], others[0]],
    })

    const seen = new Set()
    for (const role of rolesOf(session)) {
        const recipients = getChatRecipientUuids(session, role)
        for (const uuid of recipients) {
            assert.equal(seen.has(uuid), false, `${uuid}가 두 역할 채널에 동시에 포함되면 안 된다`)
            seen.add(uuid)
            assert.equal(session.players.get(uuid).role, role)
        }
    }
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.JOKER).sort(), jokerUuids.sort())
    assert.equal(seen.has(otherUuids[0]), false, '사망한 비-JOKER는 밤 채널 수신자에서 제외된다')
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [])
})

// ---------------------------------------------------------------------------
// AC-06 · 낮 턴 — 생존 플레이어는 DAY 채널에 메시지를 보낼 수 있다
// ---------------------------------------------------------------------------

test('AC-06: 낮의 생존자는 DAY 채널로 발행하고 커밋까지 성공하며 참가자 전원이 수신자다', () => {
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

    // 발신자를 포함한 참가자 전원이 canonical 수신자다("보낼 수 있다"에는 도달한다는 뜻이 포함된다).
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
// AC-02 · 낮 턴 — 사망자는 DAY 메시지를 수신·열람하지만 발행은 거부된다
// ---------------------------------------------------------------------------

test('AC-02: 낮의 사망자는 DAY 채널 수신자에 남아 생존자의 메시지를 그대로 받는다', () => {
    const { session, otherUuids, jokerUuids, deadUuids } = createChatSessionFixture({
        id: 'room-ac2-receive',
        phase: 'DAY',
        uuids: ['ac2a', 'ac2b', 'ac2c', 'ac2d'],
        deadPicker: ({ otherUuids: others }) => [others[0]],
    })
    const [deadUuid] = deadUuids
    const sender = otherUuids[1]

    const recipients = getChatRecipientUuids(session, CHAT_CHANNELS.DAY)
    assert.equal(recipients.includes(deadUuid), true, '사망자는 DAY 채널의 수신자다')
    assert.deepEqual([...recipients].sort(), [...otherUuids, ...jokerUuids].sort(), 'DAY 수신자는 참가자 전원이다')

    // 그리고 생존자의 발행이 실제로 그 채널로 확정된다 — 사망자가 열람할 메시지가 존재한다.
    const committed = commitPrepared(
        prepareGameChatMessage(sender, session.id, '낮 발언', { now: () => 70_000, idFn: () => 'msg-ac2r' }),
    )
    assert.equal(committed.ok, true)
    assert.equal(committed.channel, CHAT_CHANNELS.DAY)
    assert.equal(getChatRecipientUuids(session, committed.channel).includes(deadUuid), true)
})

test('AC-02: 낮의 사망자가 발행을 시도하면 서버가 거부하고(NOT_ELIGIBLE) 어떤 Map도 소비되지 않는다', () => {
    const { session, deadUuids } = createChatSessionFixture({
        id: 'room-ac2-publish',
        phase: 'DAY',
        uuids: ['ac2pa', 'ac2pb', 'ac2pc', 'ac2pd'],
        deadPicker: ({ otherUuids }) => [otherUuids[0]],
    })
    const [deadUuid] = deadUuids

    assert.deepEqual(routeOf(session, deadUuid), { ok: false, code: 'NOT_ELIGIBLE' })
    assert.deepEqual(prepareGameChatMessage(deadUuid, session.id, '사망자의 낮 발언', { now: () => 70_000 }), {
        ok: false,
        code: 'NOT_ELIGIBLE',
    })
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })

    // 밤의 팀 채널도 열리지 않는다(이 사망자는 JOKER 진영이 아니다) — 낮에는 어떤 발신 경로도 없다.
    assert.deepEqual(prepareJokerChatMessage(deadUuid, session.id, '우회 시도', { now: () => 70_000 }), {
        ok: false,
        code: 'INVALID_PHASE',
    })
})

test('AC-02: 준비된 뒤 사망이 확정되면 commit이 다시 거부한다 — 발행 권한을 잃은 요청은 커밋되지 않는다', () => {
    const { session, aliveOtherUuids } = createChatSessionFixture({
        id: 'room-ac2-commit',
        phase: 'DAY',
        uuids: ['ac2ca', 'ac2cb', 'ac2cc'],
    })
    const actor = aliveOtherUuids[0]
    const prepared = prepareGameChatMessage(actor, session.id, '준비는 살아서', { now: () => 71_000 })
    assert.equal(prepared.channel, CHAT_CHANNELS.DAY)

    session.players.get(actor).alive = false // prepare~commit 사이의 사망

    assert.deepEqual(commitPrepared(prepared), { ok: false, code: 'NOT_ELIGIBLE' })
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})

// ---------------------------------------------------------------------------
// AC-03 · 밤 턴 — 사망자(광대 제외)에게는 어떤 채팅 이벤트도 가지 않는다
// ---------------------------------------------------------------------------

test('AC-03: 밤의 사망자(비-JOKER)는 어떤 채널의 수신자도 아니고 발행도 못 한다', () => {
    const { session, deadUuids, jokerUuids } = createChatSessionFixture({
        id: 'room-ac3',
        phase: 'NIGHT',
        uuids: ['ac3a', 'ac3b', 'ac3c', 'ac3d', 'ac3e'],
        deadPicker: ({ otherUuids }) => [otherUuids[0], otherUuids[1]],
    })
    const [deadOne, deadTwo] = deadUuids

    // (1) 발행 경로가 없다 — 공개 채팅은 사망으로, 팀 채널은 진영으로 막힌다.
    for (const uuid of deadUuids) {
        assert.deepEqual(routeOf(session, uuid), { ok: false, code: 'NOT_ELIGIBLE' })
        assert.deepEqual(prepareGameChatMessage(uuid, session.id, '밤의 사망자 대화', { now: () => 80_000 }), {
            ok: false,
            code: 'NOT_ELIGIBLE',
        })
        assert.deepEqual(prepareJokerChatMessage(uuid, session.id, '팀 대화 흉내', { now: () => 80_000 }), {
            ok: false,
            code: 'NOT_ELIGIBLE',
        })
    }

    // (2) 밤에 메시지를 나를 수 있는 유일한 채널(JOKER)의 수신자가 아니다.
    const jokerRecipients = getChatRecipientUuids(session, CHAT_CHANNELS.JOKER)
    assert.deepEqual([...jokerRecipients].sort(), [...jokerUuids].sort())
    for (const uuid of deadUuids) assert.equal(jokerRecipients.includes(uuid), false)

    // (3) 사망자끼리 열리던 전용 채널은 남아 있지 않다 — 수신자가 0명이다.
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [])

    // (4) DAY 채널에는 이름이 남지만, 밤에는 그 채널로 발행할 수 있는 사람이 아무도 없어
    //     실제로 전달될 메시지가 생기지 않는다.
    const dayRecipients = getChatRecipientUuids(session, CHAT_CHANNELS.DAY)
    assert.equal(dayRecipients.includes(deadOne), true)
    assert.equal(dayRecipients.includes(deadTwo), true)
    for (const uuid of session.players.keys()) {
        assert.equal(routeOf(session, uuid).ok, false, `${uuid}는 밤에 DAY 채널을 열 수 없다`)
    }
})

test('AC-03: 사망자의 공개 채팅 발행은 ENDED를 뺀 모든 phase에서 거부된다(밤만의 예외가 아니다)', () => {
    for (const phase of NON_ENDED_PHASES) {
        gameSession.__resetStateForTests()
        const { session, deadUuids } = createChatSessionFixture({
            id: `room-ac3-${phase}`,
            phase,
            uuids: ['ac3pa', 'ac3pb', 'ac3pc'],
            deadPicker: ({ otherUuids }) => [otherUuids[0]],
        })
        const [deadUuid] = deadUuids

        assert.deepEqual(routeOf(session, deadUuid), { ok: false, code: 'NOT_ELIGIBLE' }, `${phase}에서도 거부된다`)
        assert.deepEqual(prepareGameChatMessage(deadUuid, session.id, '어느 단계든', { now: () => 1000 }), {
            ok: false,
            code: 'NOT_ELIGIBLE',
        })
        assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
    }
})

// ---------------------------------------------------------------------------
// AC-04 · 밤 턴 — 사망한 광대는 JOKER 채널에서 송수신할 수 있다
// ---------------------------------------------------------------------------

test('AC-04: 밤에 사망한 광대는 JOKER 채널로 송신할 수 있고 커밋까지 성공한다', () => {
    const { session, jokerUuids, deadUuids } = createChatSessionFixture({
        id: 'room-ac4-send',
        phase: 'NIGHT',
        uuids: ['ac4a', 'ac4b', 'ac4c', 'ac4d', 'ac4e'],
        jokerCount: 2,
        deadPicker: ({ jokerUuids: jokers }) => [jokers[0]],
    })
    const [deadJoker] = deadUuids
    assert.equal(session.players.get(deadJoker).alive, false)
    assert.equal(jokerUuids.includes(deadJoker), true)

    const prepared = prepareJokerChatMessage(deadJoker, session.id, '죽어서도 팀 대화', { now: () => 90_000 })

    assert.equal(prepared.ok, true, '사망한 광대의 JOKER 발행은 거부되지 않는다')
    assert.equal(prepared.actorUuid, deadJoker)
    assert.equal(prepared.sentAt, 90_000)
    // 준비만으로는 Map이 바뀌지 않고, commit에서만 확정된다.
    assert.deepEqual(chatRateLimitSnapshot(session).JOKER, [])
    assert.deepEqual(commitJokerChatMessage(session, deadJoker, prepared.sentAt), { ok: true })
    assert.deepEqual(chatRateLimitSnapshot(session).JOKER, [[deadJoker, 90_000]])
})

test('AC-04: 사망한 광대는 JOKER 채널의 수신자로 남고, 살아있는 팀원의 메시지도 그에게 간다', () => {
    const { session, jokerUuids, otherUuids, deadUuids } = createChatSessionFixture({
        id: 'room-ac4-receive',
        phase: 'NIGHT',
        uuids: ['ac4ra', 'ac4rb', 'ac4rc', 'ac4rd', 'ac4re'],
        jokerCount: 2,
        deadPicker: ({ jokerUuids: jokers }) => [jokers[0]],
    })
    const [deadJoker] = deadUuids
    const aliveJoker = jokerUuids.find((uuid) => uuid !== deadJoker)

    // 사망 이후에도 JOKER 채널 수신자 집합은 팀 전원 그대로다.
    const recipients = getChatRecipientUuids(session, CHAT_CHANNELS.JOKER)
    assert.deepEqual([...recipients].sort(), [...jokerUuids].sort())
    assert.equal(recipients.includes(deadJoker), true, '사망한 광대는 팀 채널에서 빠지지 않는다')

    // 살아있는 팀원이 보내도 같은 수신자 집합이다 — 사망한 광대가 그 메시지를 받는다.
    const teamMessage = prepareJokerChatMessage(aliveJoker, session.id, '남은 팀원', { now: () => 92_000 })
    assert.equal(teamMessage.ok, true)
    assert.equal(commitJokerChatMessage(session, aliveJoker, teamMessage.sentAt).ok, true)
    assert.equal(getChatRecipientUuids(session, CHAT_CHANNELS.JOKER).includes(deadJoker), true)

    // 다른 직업에게는 여전히 새지 않는다 — 열린 것은 "사망" 축이지 "진영" 축이 아니다.
    for (const uuid of otherUuids) assert.equal(recipients.includes(uuid), false)
    assert.deepEqual(chatRateLimitSnapshot(session).JOKER, [[aliveJoker, 92_000]])
})

test('AC-04: 사망한 광대의 팀 채널도 NIGHT 전용이다 — 낮에는 INVALID_PHASE로 막힌다', () => {
    const { session, deadUuids } = createChatSessionFixture({
        id: 'room-ac4-phase',
        phase: 'DAY',
        uuids: ['ac4pa', 'ac4pb', 'ac4pc', 'ac4pd'],
        deadPicker: ({ jokerUuids }) => [jokerUuids[0]],
    })
    const [deadJoker] = deadUuids

    assert.deepEqual(prepareJokerChatMessage(deadJoker, session.id, '낮의 팀 대화', { now: () => 93_000 }), {
        ok: false,
        code: 'INVALID_PHASE',
    })
    // 낮에도 공개 채널로는 발행하지 못한다(사망자이므로) — 열린 것은 밤의 팀 채널 하나뿐이다.
    assert.deepEqual(prepareGameChatMessage(deadJoker, session.id, '낮의 공개 발언', { now: () => 93_000 }), {
        ok: false,
        code: 'NOT_ELIGIBLE',
    })
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
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

test('AC-05: 능력 대조가 보는 필드를 하나씩 흔들면 전부 STALE_CHAT_REQUEST로 거부되고 Map은 끝까지 불변이다', () => {
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

test('AC-05: 비-JOKER가 JOKER 채널을 주장해도 서버는 canonical 자기 역할 채널만 유도한다', () => {
    const { session, otherUuids } = createChatSessionFixture({
        id: 'room-ac5-joker',
        phase: 'NIGHT',
        uuids: ['ac5ja', 'ac5jb', 'ac5jc', 'ac5jd'],
    })

    for (const uuid of otherUuids) {
        const actor = session.players.get(uuid)
        const prepared = prepareJokerChatMessage(uuid, session.id, 'canonical 발행', {
            now: () => 60_000,
            channel: CHAT_CHANNELS.JOKER,
        })
        assert.equal(prepared.ok, true)
        assert.equal(prepared.channel, actor.role)
        assert.equal(getChatRecipientUuids(session, CHAT_CHANNELS.JOKER).includes(uuid), false)
    }
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})

test('AC-05: 퇴역한 DEAD 채널은 어떤 조작으로도 되살릴 수 없다 — 라우팅에도 팬아웃에도 나타나지 않는다', () => {
    const { session, deadUuids, aliveOtherUuids } = createChatSessionFixture({
        id: 'room-ac5-dead',
        phase: 'DAY',
        uuids: ['ac5da', 'ac5db', 'ac5dc', 'ac5dd'],
        deadPicker: ({ otherUuids }) => [otherUuids[0]],
    })
    const [deadUuid] = deadUuids

    // (1) 살아있든 죽었든 어떤 참가자도 DEAD 채널로 라우팅되지 않는다.
    for (const uuid of session.players.keys()) {
        assert.notEqual(routeOf(session, uuid).channel, CHAT_CHANNELS.DEAD)
    }
    // (2) 사망자가 있어도 DEAD 채널의 수신자는 0명이다(fail-closed — 소켓 계층의 발신자 포함
    //     검사가 반드시 실패한다).
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [])
    assert.equal(session.players.get(deadUuid).alive, false)
    // (3) 알 수 없는 채널과 똑같이 다뤄진다.
    for (const channel of [CHAT_CHANNELS.DEAD, null, undefined, '', 'day', 'UNKNOWN', 42]) {
        assert.deepEqual(getChatRecipientUuids(session, channel), [])
    }
    // (4) DEAD 채널을 주장하는 능력은 대조에서 걸린다.
    assert.deepEqual(
        tamperPreparedField(session, aliveOtherUuids[0], { channel: CHAT_CHANNELS.DEAD }, { sentAt: 45_000 }),
        { ok: false, code: 'STALE_CHAT_REQUEST' },
    )
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})
