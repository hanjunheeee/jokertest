'use strict'

// 서버 여러 대 사람 위치·접속 이어받기 시험 (진짜 시험 Redis + n1·n2 둘 다 진짜 코드, Node마다 Redis 앞 중계 하나)
// 목록 A17-B-139~149, 접속 이어받기(146~149)는 Node마다 진짜 socket.io 서버 + 화면 대신 socket.io-client, REDIS_URL_TEST 없으면 건너뜀
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const http = require('node:http')
const { Server } = require('socket.io')
const ioClient = require('socket.io-client')

const W = require('./a17-world')
const RN = require('./helpers/redisNodes')
const { createRedisProxy } = require('./helpers/redisProxy')
const fp = require('../helpers/fetchablePort')

// 접속 처리(접속 목록·옛 탭 밀어내기) 파일도 Node마다 따로 불러 둠
const EXTRA = ['socket/connection/presence', 'socket/connection/replace', 'socket/emitter', 'services/presence/status']
const B = RN.REDIS_URL_TEST ? { n1: W.loadBundle({ extra: EXTRA }), n2: W.loadBundle({ extra: EXTRA }) } : null
const OPTS = { skip: RN.skipReason, timeout: 30000 }

// 진짜 시간 기다리기 (가짜 시계 켠 동안에도 됨: setImmediate는 안 막힘)
async function realWait(ms) {
    const end = performance.now() + ms
    while (performance.now() < end) await new Promise((resolve) => setImmediate(resolve))
}

// 조건이 될 때까지 진짜 시간으로 기다림 → 걸린 ms
async function waitUntil(check, timeoutMs = 5000) {
    const start = performance.now()
    while (!(await check())) {
        if (performance.now() - start > timeoutMs) throw new Error('기다림 시간 초과')
        await realWait(20)
    }
    return performance.now() - start
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
    return { w, proxies }
}

const locOf = (w, uuid) => w.n2.readKey(w.n2.dirKeys().loc(uuid))

// 화면이 새로고침 때 하는 것: 새 소켓 → 판 채널 다시 잇기 → 스냅샷 요청 → 답
async function reconnectAndSnapshot(node, uuid, gameId) {
    node.drop(uuid)
    const socket = node.connect(uuid)
    await node.b.gs.resyncSessionRouting(socket, uuid, node.io)
    return node.ask(node.b.G.handleGetSessionSnapshot, uuid, { gameId })
}

// ── 위치 기록 (B-139~143, 값 하나 = 시험 하나) ──

test('A17-B-139 방 입장 → 위치 = 방·그 방 Node', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.n1.connect('b139-h')
    const room = await w.n1.createRoom('b139-h')
    w.n1.connect('b139-p')
    const joined = await w.n1.joinByCode('b139-p', room.room.roomCode)
    assert.equal(joined?.event, 'room_joined')
    await waitUntil(async () => (await locOf(w, 'b139-p')) !== null)
    const loc = await locOf(w, 'b139-p')
    assert.deepEqual({ node: loc.node, kind: loc.kind, id: loc.id }, { node: 'n1', kind: 'room', id: room.room.roomId })
})

test('A17-B-140 방 나감 → 위치 없음', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.n1.connect('b140-h')
    const room = await w.n1.createRoom('b140-h')
    const s = w.n1.connect('b140-p')
    await w.n1.joinByCode('b140-p', room.room.roomCode)
    await waitUntil(async () => (await locOf(w, 'b140-p')) !== null)
    // 화면이 보내는 "방 나가기" 사건 그대로
    w.n1.b.mm.registerMatchmakingHandlers(w.n1.io, s, 'b140-p', { getCurrentSocketId: (u) => w.n1.registry.get(u) ?? null })
    s.trigger('leave_room')
    await waitUntil(async () => (await locOf(w, 'b140-p')) === null)
    assert.equal(await locOf(w, 'b140-p'), null)
})

test('A17-B-141 판 시작 → 위치 = 판·판 Node (5명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b141', n: 5 })
    await waitUntil(async () => (await locOf(w, g.uuids[4]))?.kind === 'game')
    for (const uuid of g.uuids) {
        const loc = await locOf(w, uuid)
        assert.deepEqual({ node: loc?.node, kind: loc?.kind, id: loc?.id }, { node: 'n1', kind: 'game', id: g.gameId }, uuid)
    }
})

test('A17-B-142 산 채로 판 나가기 → 위치 없음 (5명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b142', n: 5 })
    const leaver = W.citizenOf(g)
    await waitUntil(async () => (await locOf(w, leaver))?.kind === 'game')
    const left = await w.n1.leaveGame(leaver, g.gameId)
    assert.equal(left.ok, true, JSON.stringify(left))
    await waitUntil(async () => (await locOf(w, leaver)) === null)
    assert.equal(await locOf(w, leaver), null)
})

test('A17-B-143 결과 화면에서 로비로 → 위치 없음 (5명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b143', n: 5 })
    await W.playToEnd(w, g)
    const who = g.uuids[2]
    await realWait(200)
    assert.notEqual(await locOf(w, who), null, '결과 화면 동안 위치가 이미 없음')
    const lobby = await w.n1.enterLobby(who)
    assert.equal(lobby.ok, true)
    await waitUntil(async () => (await locOf(w, who)) === null)
    assert.equal(await locOf(w, who), null)
})

// ── 다시 붙기 ──

test('A17-B-144 판 중 힌트 없이 n2로 붙으면 판 Node(n1)로 보내고, n1에서 판 상태 받음 (6명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b144', n: 6 })
    const who = g.uuids[3]
    await waitUntil(async () => (await locOf(w, who))?.kind === 'game')
    const err = await w.n2.route(who)
    assert.equal(err?.message, 'WRONG_NODE')
    assert.deepEqual(err?.data, { node: 'n1' })
    const snap = await reconnectAndSnapshot(w.n1, who, g.gameId)
    assert.equal(snap.ok, true, JSON.stringify(snap))
    assert.equal(snap.gameId, g.gameId)
    assert.equal(snap.phase, w.n1.session(g.gameId).phase)
})

test('A17-B-145 끊긴 사람이 20초 뒤 n2를 거쳐 n1로 돌아오면 산 채로 이어서, 탈락 없음 (7명 판)', OPTS, async (t) => {
    const { w } = await startPair(t)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b145', n: 7 })
    const who = W.citizenOf(g)
    await waitUntil(async () => (await locOf(w, who))?.kind === 'game')
    await w.n1.disconnect(who)
    w.tick(20_000)
    const err = await w.n2.route(who)
    assert.equal(err?.message, 'WRONG_NODE')
    assert.deepEqual(err?.data, { node: 'n1' })
    const snap = await reconnectAndSnapshot(w.n1, who, g.gameId)
    assert.equal(snap.ok, true, JSON.stringify(snap))
    // 끊긴 때부터 60초가 넘게 지나도 탈락 안 함
    w.tick(45_000)
    const again = await w.n1.ask(w.n1.b.G.handleGetSessionSnapshot, who, { gameId: g.gameId })
    assert.equal(again.ok, true, JSON.stringify(again))
    const me = again.players.find((p) => p.uuid === who)
    assert.equal(me?.isAlive, true)
    assert.equal(me?.isParticipating, true)
    assert.equal(me?.isConnected, true)
    const other = g.uuids.find((u) => u !== who)
    const eliminated = w.n1.received(other, 'player_eliminated').filter((p) => JSON.stringify(p).includes(who))
    assert.equal(eliminated.length, 0, '다른 사람이 탈락 알림을 받음')
})

// ── 접속 이어받기 (B-146~149): Node마다 진짜 socket.io 서버 ──

// Node 하나에 진짜 socket.io 서버: 접속 = 접속 목록·옛 탭 밀어내기(presence.handleConnection), 끊김 = handleDisconnect
// 로그인 검사는 빼고 auth 값을 그대로 사람으로 씀, 접속 상태 DB 쓰기·친구 목록 읽기는 아무것도 안 하는 함수로
async function startSocketServer(t, node) {
    const presence = node.b.x['socket/connection/presence']
    const replace = node.b.x['socket/connection/replace']
    const emitter = node.b.x['socket/emitter']
    const status = node.b.x['services/presence/status']
    t.mock.method(status, 'setPresence', async () => {})
    t.mock.method(status, 'getAcceptedFriendUuids', async () => [])
    const server = http.createServer()
    const io = new Server(server, { transports: ['websocket'] })
    emitter.setIo(io)
    replace.startReplaceSync()
    io.use((socket, next) => {
        const { uuid, sessionId } = socket.handshake.auth ?? {}
        socket.data.user = { uuid, sessionId }
        next()
    })
    io.on('connection', (socket) => {
        const { uuid } = socket.data.user
        emitter.joinUserChannel(socket, uuid)
        presence.handleConnection(io, socket, uuid).catch(() => {})
        socket.on('disconnect', () => { presence.handleDisconnect(io, socket, uuid).catch(() => {}) })
    })
    // 판 시험 때문에 Math.random이 0으로 고정돼 있어 포트는 crypto로 고름 (안 그러면 늘 같은 포트)
    const { url } = await fp.listenOnFetchablePort(server, { pickPort: () => fp.HIGH_PORT_MIN + crypto.randomInt(fp.HIGH_PORT_MAX - fp.HIGH_PORT_MIN) })
    t.after(async () => {
        await new Promise((resolve) => io.close(() => resolve()))
        emitter.setIo(null)
        emitter.onlineUsers.clear()
        replace.__resetReplaceForTests()
    })
    return { url, io }
}

// 화면 탭 하나 붙이기 → { socket, received, closed() }
async function openTab(t, url, uuid, sessionId) {
    const socket = ioClient(url, { transports: ['websocket'], auth: { uuid, sessionId }, reconnection: false, forceNew: true })
    const received = []
    let disconnected = false
    socket.onAny((event, payload) => received.push({ event, payload }))
    socket.on('disconnect', () => { disconnected = true })
    t.after(() => socket.close())
    await Promise.race([
        new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('접속 시간 초과')), 5000).unref()),
    ])
    return { socket, received, id: socket.id, isClosed: () => disconnected }
}

const connOf = (w, uuid) => w.n2.readKey(w.n2.dirKeys().conn(uuid))

test('A17-B-146 같은 세션 새 탭이 n2로 붙으면 n1 옛 탭이 REPLACED_BY_SAME_SESSION으로 끊김', OPTS, async (t) => {
    const { w } = await startPair(t)
    const s1 = await startSocketServer(t, w.n1)
    const s2 = await startSocketServer(t, w.n2)
    const old = await openTab(t, s1.url, 'b146-u', 'sess-1')
    await waitUntil(async () => (await connOf(w, 'b146-u'))?.node === 'n1')
    const fresh = await openTab(t, s2.url, 'b146-u', 'sess-1')
    await waitUntil(() => old.isClosed())
    const kicked = old.received.find((e) => e.event === 'force_disconnect')
    assert.equal(kicked?.payload?.code, 'REPLACED_BY_SAME_SESSION')
    assert.equal(fresh.isClosed(), false)
})

test('A17-B-147 같은 계정이 n1·n2에 거의 동시 접속 → 남은 소켓 1개, 둘 다 끊기지는 않음', OPTS, async (t) => {
    const { w } = await startPair(t)
    const s1 = await startSocketServer(t, w.n1)
    const s2 = await startSocketServer(t, w.n2)
    const [a, b] = await Promise.all([openTab(t, s1.url, 'b147-u', 'sess-a'), openTab(t, s2.url, 'b147-u', 'sess-b')])
    await waitUntil(() => a.isClosed() || b.isClosed())
    // 늦게 오는 밀어내기까지 기다림
    await realWait(1_000)
    const alive = [a, b].filter((tab) => !tab.isClosed())
    assert.equal(alive.length, 1, `남은 소켓 ${alive.length}개`)
})

test('A17-B-148 n1만 Redis 끊긴 사이 n2로 붙은 같은 계정 → 살아난 뒤 3초 안에 n1 옛 탭 밀림', OPTS, async (t) => {
    const { w, proxies } = await startPair(t)
    const s1 = await startSocketServer(t, w.n1)
    const s2 = await startSocketServer(t, w.n2)
    const old = await openTab(t, s1.url, 'b148-u', 'sess-1')
    await waitUntil(async () => (await connOf(w, 'b148-u'))?.node === 'n1')
    proxies.n1.kill()
    await waitUntil(() => w.n1.cluster.state() === 'down')
    const fresh = await openTab(t, s2.url, 'b148-u', 'sess-2')
    await waitUntil(async () => (await connOf(w, 'b148-u'))?.node === 'n2')
    await realWait(300)
    assert.equal(old.isClosed(), false, 'Redis 끊긴 동안 벌써 밀림 (흉내가 안 됨)')
    proxies.n1.restore()
    await waitUntil(() => w.n1.cluster.state() === 'up', 8000)
    const took = await waitUntil(() => old.isClosed(), 3000)
    assert.ok(took <= 3000, `${Math.round(took)}ms 걸림`)
    assert.equal(fresh.isClosed(), false)
})

test('A17-B-149 n1 탭 → n2 새 탭으로 바뀐 뒤 n1 옛 탭 끊김 처리 → conn 값은 n2 소켓 그대로', OPTS, async (t) => {
    const { w } = await startPair(t)
    const s1 = await startSocketServer(t, w.n1)
    const s2 = await startSocketServer(t, w.n2)
    const old = await openTab(t, s1.url, 'b149-u', 'sess-1')
    await waitUntil(async () => (await connOf(w, 'b149-u'))?.node === 'n1')
    const fresh = await openTab(t, s2.url, 'b149-u', 'sess-2')
    await waitUntil(() => old.isClosed())
    // 옛 탭 끊김 처리(n1)가 끝날 시간
    await realWait(500)
    const conn = await connOf(w, 'b149-u')
    assert.equal(conn?.node, 'n2')
    assert.equal(conn?.socketId, fresh.id)
})
