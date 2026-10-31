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

const NON_ENDED_PHASES = ['ROLE_REVEAL', 'DAY', 'NIGHT', 'TRIBUNAL']

test.beforeEach(() => {
    gameSession.__resetStateForTests()
})
test.afterEach(() => {
    gameSession.__resetStateForTests()
})

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

function routeOf(session, uuid) {
    return resolveGameChatChannel(session, session.players.get(uuid))
}

function rolesOf(session) {
    return [...new Set([...session.players.values()].map((p) => p.role))]
}

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
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [[actor, sentAt]], DEAD: [], JOKER: [] })

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

    session.players.get(actor).alive = false

    assert.deepEqual(commitPrepared(prepared), { ok: false, code: 'NOT_ELIGIBLE' })
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})

test('AC-03: 밤의 사망자(비-JOKER)는 어떤 채널의 수신자도 아니고 발행도 못 한다', () => {
    const { session, deadUuids, jokerUuids } = createChatSessionFixture({
        id: 'room-ac3',
        phase: 'NIGHT',
        uuids: ['ac3a', 'ac3b', 'ac3c', 'ac3d', 'ac3e'],
        deadPicker: ({ otherUuids }) => [otherUuids[0], otherUuids[1]],
    })
    const [deadOne, deadTwo] = deadUuids

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

    const jokerRecipients = getChatRecipientUuids(session, CHAT_CHANNELS.JOKER)
    assert.deepEqual([...jokerRecipients].sort(), [...jokerUuids].sort())
    for (const uuid of deadUuids) assert.equal(jokerRecipients.includes(uuid), false)

    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [])

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

    const recipients = getChatRecipientUuids(session, CHAT_CHANNELS.JOKER)
    assert.deepEqual([...recipients].sort(), [...jokerUuids].sort())
    assert.equal(recipients.includes(deadJoker), true, '사망한 광대는 팀 채널에서 빠지지 않는다')

    const teamMessage = prepareJokerChatMessage(aliveJoker, session.id, '남은 팀원', { now: () => 92_000 })
    assert.equal(teamMessage.ok, true)
    assert.equal(commitJokerChatMessage(session, aliveJoker, teamMessage.sentAt).ok, true)
    assert.equal(getChatRecipientUuids(session, CHAT_CHANNELS.JOKER).includes(deadJoker), true)

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
    assert.deepEqual(prepareGameChatMessage(deadJoker, session.id, '낮의 공개 발언', { now: () => 93_000 }), {
        ok: false,
        code: 'NOT_ELIGIBLE',
    })
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})

test('AC-05: 채널은 canonical 상태에서만 유도된다 — 인자에 채널·발신자를 위조해도 라우팅이 바뀌지 않는다', () => {
    const { session, aliveOtherUuids, aliveJokerUuids } = createChatSessionFixture({
        id: 'room-ac5-route',
        phase: 'DAY',
        uuids: ['ac5ra', 'ac5rb', 'ac5rc', 'ac5rd'],
    })
    const actor = aliveOtherUuids[0]

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

    for (const notAPrepared of [null, undefined, 'prepared', 42, []]) {
        assert.equal(commitGameChatMessage(notAPrepared, { now: () => sentAt }).ok, false)
    }
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})

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

    for (const uuid of session.players.keys()) {
        assert.notEqual(routeOf(session, uuid).channel, CHAT_CHANNELS.DEAD)
    }
    assert.deepEqual(getChatRecipientUuids(session, CHAT_CHANNELS.DEAD), [])
    assert.equal(session.players.get(deadUuid).alive, false)
    for (const channel of [CHAT_CHANNELS.DEAD, null, undefined, '', 'day', 'UNKNOWN', 42]) {
        assert.deepEqual(getChatRecipientUuids(session, channel), [])
    }
    assert.deepEqual(
        tamperPreparedField(session, aliveOtherUuids[0], { channel: CHAT_CHANNELS.DEAD }, { sentAt: 45_000 }),
        { ok: false, code: 'STALE_CHAT_REQUEST' },
    )
    assert.deepEqual(chatRateLimitSnapshot(session), { DAY: [], DEAD: [], JOKER: [] })
})
