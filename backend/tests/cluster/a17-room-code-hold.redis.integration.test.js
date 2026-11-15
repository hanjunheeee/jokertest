'use strict'

// 서버 여러 대 방 코드 잡기 시험 (진짜 시험 Redis + n1·n2 둘 다 진짜 코드, Node마다 Redis 앞 중계 하나)
// 목록 A17-B-127~138 (B-133은 결정 대기라 안 씀), REDIS_URL_TEST 없으면 건너뜀
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const W = require('./a17-world')
const RN = require('./helpers/redisNodes')
const { createRedisProxy } = require('./helpers/redisProxy')

// Node 둘 몫 코드 (Redis 없으면 안 불러옴, 무거워서)
const B = RN.REDIS_URL_TEST ? { n1: W.loadBundle(), n2: W.loadBundle() } : null
const OPTS = { skip: RN.skipReason, timeout: 30000 }

// 진짜 시간 기다리기 (가짜 시계 켠 동안에도 됨: setImmediate는 안 막힘), Redis 쓰기가 끝나길 기다릴 때
async function realWait(ms) {
    const end = performance.now() + ms
    while (performance.now() < end) await new Promise((resolve) => setImmediate(resolve))
}

// 조건이 될 때까지 진짜 시간으로 기다림 (가짜 시계 켠 동안에도 됨)
async function waitUntil(check, timeoutMs = 5000) {
    const end = performance.now() + timeoutMs
    while (!(await check())) {
        if (performance.now() > end) throw new Error('기다림 시간 초과')
        await realWait(20)
    }
}

// n1·n2를 진짜 Redis에 붙임 (Node마다 중계, 키 앞머리는 이 시험만)
async function startPair(t) {
    const prefix = `a17-${crypto.randomUUID().slice(0, 8)}`
    const targetPort = Number(new URL(RN.REDIS_URL_TEST).port || 6379)
    const proxies = { n1: await createRedisProxy({ targetPort }), n2: await createRedisProxy({ targetPort }) }
    const w = await W.startNodes(t, B, {
        redisUrls: { n1: proxies.n1.url, n2: proxies.n2.url }, prefix, env: { CLUSTER_HEARTBEAT_MS: '200' },
    })
    // 정리 고리는 먼저 단 것부터 돎 → Node 끈 뒤에 중계 닫고 키 지움
    t.after(async () => {
        await proxies.n1.close()
        await proxies.n2.close()
        await RN.cleanupPrefix(prefix)
    })
    assert.equal(w.n1.cluster.state(), 'up')
    assert.equal(w.n2.cluster.state(), 'up')
    return { w, proxies, prefix }
}

// 방 코드 뽑기 고정: 6자리 코드 차례대로 (끝 값은 계속), 코드 글자 = utils/roomCode.js 글자 표 자리
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const bytesOf = (code) => Buffer.from([...code].map((c) => CHARS.indexOf(c)))
function fixCodes(t, codes) {
    const original = crypto.randomBytes
    let i = 0
    const m = t.mock.method(crypto, 'randomBytes', (n, cb) => {
        if (n !== 6 || typeof cb === 'function') return original.call(crypto, n, cb)
        const code = codes[Math.min(i, codes.length - 1)]
        i += 1
        return bytesOf(code)
    })
    return () => m.mock.restore()
}

// 고정 코드로 방 만들기 → 답 (만들기 동안만 고정)
async function createWithCodes(t, node, uuid, codes) {
    const restore = fixCodes(t, codes)
    try {
        return await node.createRoom(uuid)
    } finally {
        restore()
    }
}

// 다른 Node 사람이 코드 입장: 옮기라는 답이면 그 Node로 옮겨 다시 → { first, last }
async function joinFollowing(w, from, uuid, code) {
    from.connect(uuid)
    const first = await from.joinByCode(uuid, code)
    let last = first
    const target = first?.payload?.code === 'ROOM_ON_OTHER_NODE' ? w.nodes[first.payload.node] : null
    if (target) {
        from.drop(uuid)
        target.connect(uuid)
        last = await target.joinByCode(uuid, code)
    }
    return { first, last }
}

const key = (w) => w.n2.dirKeys()

// "방 없음" 답 = 아무도 안 쓴 코드를 같은 Node에서 쳤을 때의 답 (목록 B-015~016과 같은 뜻)
async function noRoomAnswer(node, uuid) {
    node.connect(uuid)
    const answer = await node.joinByCode(uuid, 'ZZ9ZZ9')
    return { event: answer?.event, code: answer?.payload?.code, message: answer?.payload?.message }
}

test('A17-B-127 두 Node가 같은 코드를 동시에 뽑으면 코드 C 방은 하나', OPTS, async (t) => {
    const { w } = await startPair(t)
    const C = 'QZ7K2M'
    w.n1.connect('b127-a')
    w.n2.connect('b127-b')
    const restore = fixCodes(t, [C])
    let answers
    try {
        answers = await Promise.all([w.n1.createRoom('b127-a'), w.n2.createRoom('b127-b')])
    } finally {
        restore()
    }
    await realWait(200)
    const withC = answers.filter((a) => a.ok && a.room.roomCode === C)
    assert.equal(withC.length, 1, `코드 C 방 수: ${JSON.stringify(answers.map((a) => [a.ok, a.room?.roomCode, a.code]))}`)
    const other = answers.find((a) => a !== withC[0])
    assert.ok(other.ok === false || other.room.roomCode !== C, '다른 쪽도 코드 C')
    assert.equal(await w.n2.readKey(key(w).roomcode(C)), withC[0].room.roomId)
})

test('A17-B-128 판 동안 n2가 같은 코드를 못 잡음 (5명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    const C = 'HQ3W8N'
    const D = 'TR5X9P'
    const restore = fixCodes(t, [C])
    let g
    try {
        g = await W.openGame(w, w.n1, { prefix: 'b128', n: 5 })
    } finally {
        restore()
    }
    assert.equal(g.roomCode, C)
    await realWait(200)
    w.n2.connect('b128-x')
    const made = await createWithCodes(t, w.n2, 'b128-x', [C, D])
    assert.equal(made.ok, true, `방 만들기 실패: ${made.code} ${made.message}`)
    assert.notEqual(made.room.roomCode, C)
})

test('A17-B-129 판 중 n2 사람이 코드로 오면 옮긴 뒤 최종 "이미 시작" (6명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    const g = await W.openGame(w, w.n1, { prefix: 'b129', n: 6 })
    await realWait(200)
    const { first, last } = await joinFollowing(w, w.n2, 'b129-x', g.roomCode)
    assert.equal(first?.payload?.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(first?.payload?.node, 'n1')
    assert.equal(last?.event, 'room_join_failed')
    assert.equal(last?.payload?.code, 'ROOM_ALREADY_STARTED')
    assert.equal(last?.payload?.message, '이미 게임이 시작된 방입니다.')
})

test('A17-B-130 판 끝 뒤 n2 사람이 같은 코드로 옮겨 들어감, 명단에 "준비 안 됨" (7명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b130', n: 7 })
    await W.playToEnd(w, g)
    await realWait(300)
    const { first, last } = await joinFollowing(w, w.n2, 'b130-x', g.roomCode)
    assert.equal(first?.payload?.code, 'ROOM_ON_OTHER_NODE')
    assert.equal(first?.payload?.node, 'n1')
    assert.equal(last?.event, 'room_joined', JSON.stringify(last?.payload))
    assert.equal(last.payload.roomCode, g.roomCode)
    const me = last.payload.players.find((p) => p.uuid === 'b130-x')
    assert.ok(me, '명단에 없음')
    assert.equal(me.isReady, false)
})

test('A17-B-131 판 끝, 180초 동안 0명이면 코드 풀리고 n2가 잡음 (8명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b131', n: 8 })
    await W.playToEnd(w, g)
    await realWait(200)
    w.tick(W.RESULT_SCREEN_MS)
    await waitUntil(async () => (await w.n2.readKey(key(w).roomcode(g.roomCode))) === null)
    w.n2.connect('b131-x')
    const made = await createWithCodes(t, w.n2, 'b131-x', [g.roomCode])
    assert.equal(made.ok, true, `방 만들기 실패: ${made.code} ${made.message}`)
    assert.equal(made.room.roomCode, g.roomCode)
})

test('A17-B-132 판 끝, 한 명 "대기방으로" 남으면 180초 뒤에도 n2가 같은 코드를 못 잡음 (10명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b132', n: 10 })
    await W.playToEnd(w, g)
    const back = await w.n1.returnToRoom(g.uuids[3], g.gameId)
    assert.equal(back.ok, true, `대기방으로 실패: ${back.code}`)
    await realWait(200)
    w.tick(W.RESULT_SCREEN_MS)
    await realWait(300)
    w.n2.connect('b132-x')
    const made = await createWithCodes(t, w.n2, 'b132-x', [g.roomCode, 'TR5X9P'])
    assert.equal(made.ok, true, `방 만들기 실패: ${made.code} ${made.message}`)
    assert.notEqual(made.room.roomCode, g.roomCode)
})

test('A17-B-134 방을 지우면 코드 키도 지워져 n1 코드 입장은 "방 없음"', OPTS, async (t) => {
    const { w } = await startPair(t)
    const host = w.n2.connect('b134-h')
    const made = await w.n2.createRoom('b134-h')
    assert.equal(made.ok, true)
    await realWait(200)
    assert.equal(await w.n1.readKey(key(w).roomcode(made.room.roomCode)), made.room.roomId)
    const deleted = await new Promise((resolve) => w.n2.b.MM.handleDeleteRoom(w.n2.io, 'b134-h', { socket: host, callback: resolve }))
    assert.equal(deleted?.ok, true, JSON.stringify(deleted))
    await waitUntil(async () => (await w.n1.readKey(key(w).roomcode(made.room.roomCode))) === null)
    assert.equal(await w.n1.readKey(key(w).room(made.room.roomId)), null)
    w.n1.connect('b134-x')
    const join = await w.n1.joinByCode('b134-x', made.room.roomCode)
    assert.deepEqual({ event: join?.event, code: join?.payload?.code, message: join?.payload?.message }, await noRoomAnswer(w.n1, 'b134-y'))
})

test('A17-B-135 다른 Node(n2)에서 시작된 방 코드를 n1 사람이 치면 최종 "이미 시작" (5명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    const g = await W.openGame(w, w.n2, { prefix: 'b135', n: 5 })
    await realWait(200)
    const { last } = await joinFollowing(w, w.n1, 'b135-x', g.roomCode)
    assert.equal(last?.event, 'room_join_failed')
    assert.equal(last?.payload?.code, 'ROOM_ALREADY_STARTED')
})

test('A17-B-136 위치가 n1 → n2로 바뀐 뒤 n1이 늦게 지워도 loc 값은 n2 그대로', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.n1.connect('b136-h')
    const room = await w.n1.createRoom('b136-h')
    assert.equal(room.ok, true)
    w.n1.connect('b136-p')
    const joined = await w.n1.joinByCode('b136-p', room.room.roomCode)
    assert.equal(joined?.event, 'room_joined')
    await waitUntil(async () => (await w.n2.readKey(key(w).loc('b136-p')))?.node === 'n1')
    // 같은 사람이 n2에 붙어 방을 만듦 → 위치 n2
    w.n2.connect('b136-p')
    const other = await w.n2.createRoom('b136-p')
    assert.equal(other.ok, true, `n2 방 만들기 실패: ${other.code} ${other.message}`)
    await waitUntil(async () => (await w.n1.readKey(key(w).loc('b136-p')))?.node === 'n2')
    // n1이 늦게 옛 자리를 지움 (로비 입장 정리)
    const lobby = await w.n1.enterLobby('b136-p')
    assert.equal(lobby.ok, true)
    await realWait(300)
    const loc = await w.n1.readKey(key(w).loc('b136-p'))
    assert.equal(loc?.node, 'n2')
})

test('A17-B-137 강제 종료된 n2 방 코드를 n1에서 치면 "방 없음", 방 키 정리', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.n2.connect('b137-h')
    const made = await w.n2.createRoom('b137-h')
    assert.equal(made.ok, true)
    await realWait(200)
    assert.equal(await w.n1.readKey(key(w).roomcode(made.room.roomCode)), made.room.roomId)
    await w.kill('n2')
    assert.equal(w.n1.cluster.nodes.isAlive('n2'), false)
    w.n1.connect('b137-x')
    const join = await w.n1.joinByCode('b137-x', made.room.roomCode)
    assert.deepEqual({ event: join?.event, code: join?.payload?.code, message: join?.payload?.message }, await noRoomAnswer(w.n1, 'b137-y'))
    await waitUntil(async () => (await w.n1.readKey(key(w).roomcode(made.room.roomCode))) === null)
    assert.equal(await w.n1.readKey(key(w).room(made.room.roomId)), null)
})

test('A17-B-138 비우는 중 n1의 판 끝 → 코드 놓아 n2가 같은 코드를 잡음 (6명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b138', n: 6 })
    w.n1.cluster.nodes.setDraining(true)
    await W.playToEnd(w, g)
    await waitUntil(async () => (await w.n2.readKey(key(w).roomcode(g.roomCode))) === null)
    w.n2.connect('b138-x')
    const made = await createWithCodes(t, w.n2, 'b138-x', [g.roomCode])
    const started = await w.n2.readKey(key(w).startedcode(g.roomCode))
    assert.equal(made.ok, true, `방 만들기 실패: ${made.message} (시작 표시 startedcode = ${JSON.stringify(started)})`)
    assert.equal(made.room.roomCode, g.roomCode)
})
