'use strict'

// 서버 여러 대 — 접속 길잡이 시험: 사람의 방·판이 어느 Node에 있는지 보고 WRONG_NODE로 보낼지 그냥 받을지 (n1·n2 둘 다 진짜 코드, 메모리 Redis)
// 목록 A17-B-001~012, 돌리기: cd backend && node --env-file=.env.test --test --test-timeout=60000 --test-force-exit tests/cluster/a17-node-routing.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const crypto = require('node:crypto')
const { Server } = require('socket.io')
const ioClient = require('socket.io-client')

const W = require('./a17-world')
const { listenOnFetchablePort } = require('../helpers/fetchablePort')

// B-007 진짜 소켓 서버에 쓰는 접속 상태·옛 탭 밀기 파일도 Node마다 따로 불러 둠
const EXTRA = ['socket/connection/presence', 'services/presence/status', 'socket/emitter', 'socket/connection/replace']
const B = { n1: W.loadBundle({ extra: EXTRA }), n2: W.loadBundle({ extra: EXTRA }) }
// 같은 이름으로 다시 켠 n2 (B-006) — 부팅 값이 새로 생김
const N2_RESTARTED = W.loadBundle()

// 이 Node에 대기방 하나 만들고 방장 uuid 돌려줌
async function roomOn(w, node, uuid, overrides = {}) {
    node.connect(uuid)
    const created = await node.createRoom(uuid, overrides)
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code}`)
    await w.settle()
    return created
}

const expectWrongNode = (err, node) => {
    assert.ok(err, '받아 버림 (보내야 함)')
    assert.equal(err.message, 'WRONG_NODE')
    assert.deepEqual(err.data, { node })
}

test('A17-B-001 n2 대기방에 있는 사람이 n1로 접속하면 WRONG_NODE, data.node = n2', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    await roomOn(w, w.n2, 'b001-host')
    expectWrongNode(await w.n1.route('b001-host'), 'n2')
})

test('A17-B-002 n2 판(5명)의 산 사람이 n1로 접속하면 WRONG_NODE, data.node = n2', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    w.useFakeClock()
    const g = await W.openGame(w, w.n2, { prefix: 'b002', n: 5 })
    const alive = W.citizenOf(g)
    assert.equal(w.n2.session(g.gameId).players.get(alive).alive, true)
    expectWrongNode(await w.n1.route(alive), 'n2')
})

test('A17-B-003 n1 대기방 사람이 n1로 접속하면 그냥 받음', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    await roomOn(w, w.n1, 'b003-host')
    assert.equal(await w.n1.route('b003-host'), null)
})

test('A17-B-004 방·판이 없는 로비 사람은 n1·n2 어디로 붙어도 받음', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    assert.equal(await w.n1.route('b004-lobby'), null)
    assert.equal(await w.n2.route('b004-lobby'), null)
})

test('A17-B-005 위치 기록이 죽은 n2를 가리키면 n1이 받고 그 기록을 지움', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    await roomOn(w, w.n2, 'b005-host')
    const key = w.n1.dirKeys().loc('b005-host')
    assert.equal((await w.n1.readKey(key))?.node, 'n2', '준비: 위치 기록이 n2여야 함')
    await w.kill('n2')
    assert.equal(await w.n1.route('b005-host'), null)
    assert.equal(await w.n1.readKey(key), null, '죽은 Node 위치 기록이 남음')
})

test('A17-B-006 같은 이름으로 다시 켠 n2의 옛 부팅 위치 기록은 안 믿고 n1이 받음', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    await roomOn(w, w.n2, 'b006-host')
    const oldBoot = w.n2.cluster.bootEpoch()
    const oldLoc = await w.n1.readKey(w.n1.dirKeys().loc('b006-host'))
    assert.equal(oldLoc?.bootEpoch, oldBoot)
    // n2 꺼짐 → 같은 이름 n2를 새 부팅으로 켬
    await w.kill('n2')
    const nb = N2_RESTARTED
    await nb.cluster.init({
        backend: w.hub.backend(), env: { SERVER_ID: 'n2', ...W.BASE_ENV, REDIS_URL: 'memory://' },
        bootEpoch: nb.mm.__getBootEpochForTests(), log: nb.mem.quietLog,
    })
    t.after(() => nb.cluster.close())
    await w.refresh()
    await nb.cluster.nodes.refresh()
    assert.equal(w.n1.cluster.nodes.isAlive('n2'), true, '준비: 새 n2가 살아 있어야 함')
    assert.notEqual(nb.cluster.bootEpoch(), oldBoot)
    // 옛 부팅 값 그대로 남은 위치 기록 (켤 때 정리가 못 지운 경우)
    await w.n1.cluster.directory.write(w.n1.dirKeys().loc('b006-host'), oldLoc, { ttlMs: 60_000 })
    assert.equal(await w.n1.route('b006-host'), null)
})

// ── B-007: 진짜 socket.io 서버 두 대 (접속 상태·옛 탭 밀기 진짜 코드) ──

// Node 하나에 진짜 소켓 서버: 인증 대신 auth 값으로 사람 정함 → 길잡이 → 접속 상태 처리 (socket.js 연결 처리 중 이 시험에 걸리는 것만)
async function startSocketServer(t, node) {
    const presence = node.b.x['socket/connection/presence']
    const emitter = node.b.x['socket/emitter']
    const replace = node.b.x['socket/connection/replace']
    const server = http.createServer()
    const io = new Server(server, { transports: ['websocket'] })
    emitter.setIo(io)
    replace.startReplaceSync()
    const state = { connections: 0 }
    io.use((socket, next) => {
        socket.data.user = { uuid: socket.handshake.auth.uuid, sessionId: socket.handshake.auth.sessionId }
        next()
    })
    io.use(node.b.routing.nodeRouting)
    io.on('connection', (socket) => {
        state.connections += 1
        const { uuid } = socket.data.user
        emitter.joinUserChannel(socket, uuid)
        presence.handleConnection(io, socket, uuid).catch(() => {})
        socket.on('disconnect', () => { presence.handleDisconnect(io, socket, uuid).catch(() => {}) })
    })
    // 직업 고정 때문에 Math.random이 0이라 포트는 crypto로 고름
    const { port } = await listenOnFetchablePort(server, { pickPort: () => 49152 + crypto.randomInt(16384) })
    t.after(async () => {
        await new Promise((resolve) => io.close(() => resolve()))
        emitter.onlineUsers.clear()
        replace.__resetReplaceForTests()
    })
    return { io, port, state }
}

// 진짜 클라이언트 붙이기 → { socket, received, error } (거절이면 error)
async function dial(t, port, auth) {
    const socket = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], auth, reconnection: false })
    const received = []
    socket.onAny((event, payload) => received.push({ event, payload }))
    t.after(() => socket.close())
    const error = await Promise.race([
        new Promise((resolve) => socket.once('connect', () => resolve(null))),
        new Promise((resolve) => socket.once('connect_error', resolve)),
        new Promise((resolve) => setTimeout(() => resolve(new Error('접속 시간 초과')), 5000).unref()),
    ])
    return { socket, received, error }
}

test('A17-B-007 n2 판 사람의 두 번째 탭이 n1로 와 WRONG_NODE → n2 첫 탭 그대로, 친구에게 OFFLINE 알림 없음', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    // 접속 상태 저장(DB)은 아무것도 안 함, 친구 목록은 정해 줌 (p ↔ f)
    for (const node of [w.n1, w.n2]) {
        const status = node.b.x['services/presence/status']
        t.mock.method(status, 'setPresence', async () => {})
        t.mock.method(status, 'getAcceptedFriendUuids', async (uuid) => (uuid === 'b007-0' ? ['b007-friend'] : ['b007-0']))
    }
    const s1 = await startSocketServer(t, w.n1)
    const s2 = await startSocketServer(t, w.n2)
    // n2에 5명 판 (p = b007-0)
    const g = await W.openGame(w, w.n2, { prefix: 'b007', n: 5 })
    const p = g.uuids[0]
    // 첫 탭·친구 탭은 n2, 친구는 n1에도 하나 (어느 Node에서 알림이 가도 보이게)
    const tab1 = await dial(t, s2.port, { uuid: p, sessionId: 'sess-p' })
    assert.equal(tab1.error, null, `첫 탭 접속 실패: ${tab1.error?.message}`)
    const friendOn2 = await dial(t, s2.port, { uuid: 'b007-friend', sessionId: 'sess-f' })
    assert.equal(friendOn2.error, null)
    await W.settle()
    const before1 = s1.state.connections
    // 두 번째 탭이 n1로 옴
    const tab2 = await dial(t, s1.port, { uuid: p, sessionId: 'sess-p' })
    assert.ok(tab2.error, '두 번째 탭이 n1에 붙어 버림')
    assert.equal(tab2.error.message, 'WRONG_NODE')
    assert.deepEqual(tab2.error.data, { node: 'n2' })
    // 끊김 알림이 퍼질 시간 (OFFLINE 미루기 0초 + 버스 한 차례)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await W.settle()
    assert.equal(s1.state.connections, before1, 'n1 연결 처리기까지 감')
    assert.equal(tab1.socket.connected, true, 'n2 첫 탭이 끊김')
    assert.equal(tab1.received.filter((e) => e.event === 'force_disconnect').length, 0, '첫 탭이 밀려남')
    const offline = friendOn2.received.filter((e) => e.event === 'friend_status_change' && e.payload?.uuid === p && e.payload?.status === 'OFFLINE')
    assert.equal(offline.length, 0, '친구가 OFFLINE 알림을 받음')
})

test('A17-B-008 Redis가 죽은 동안은 위치 기록이 n2여도 n1이 받음', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    await roomOn(w, w.n2, 'b008-host')
    assert.equal((await w.n1.readKey(w.n1.dirKeys().loc('b008-host')))?.node, 'n2', '준비: 위치 기록 n2')
    w.hub.setDown(true)
    assert.equal(await w.n1.route('b008-host'), null)
})

test('A17-B-009 Redis 없음(1대)이면 예전 그대로: 접속 거절 없음, 방 만들기·입장 전부 이 Node', { timeout: 30000 }, async (t) => {
    const b = B.n1
    // 이 시험만 묶음 n1을 단일 모드로 켬 (REDIS_URL 없음)
    b.mm.__resetStateForTests()
    b.loc.__stopLocationSyncForTests()
    b.mf.installFakeMatchmakingDeps(b.mm)
    b.desertion.__setRepositoryForTests(W.createDesertionDb())
    await b.cluster.init({ env: {}, log: b.mem.quietLog })
    b.loc.startLocationSync()
    t.after(async () => {
        await b.cluster.close()
        b.mm.__resetStateForTests()
        b.loc.__stopLocationSyncForTests()
        b.desertion.__setRepositoryForTests(null)
    })
    const registry = new Map()
    b.mm.setOnlineUsersRegistry(registry)
    const host = b.mf.createFakeSocket('b009-host')
    const guest = b.mf.createFakeSocket('b009-guest')
    const io = b.mf.createFakeIo([host, guest])
    registry.set('b009-host', host.id)
    registry.set('b009-guest', guest.id)
    const created = await b.mf.callAsPromise(b.MM.handleCreateRoom, io, host, 'b009-host', { accessType: 'code', maxPlayers: 5, jokerCount: 1, ...W.TIMES })
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code}`)
    assert.equal(created.node, undefined, '다른 Node로 보내는 답이 섞임')
    await b.MM.handleJoinRoomByCode(io, guest, 'b009-guest', created.room.roomCode)
    await W.settle()
    assert.deepEqual(guest.emitted.filter((e) => e.event === 'room_joined' || e.event === 'room_join_failed').map((e) => e.event), ['room_joined'])
    const route = (uuid) => new Promise((resolve) => b.routing.nodeRouting({ data: { user: { uuid } }, handshake: { query: { node: 'n2' } } }, (err) => resolve(err ?? null)))
    assert.equal(await route('b009-host'), null)
    assert.equal(await route('b009-guest'), null)
})

test('A17-B-010 비우는 중(drain) n1에 힌트 없는 새 로비 접속 → 덜 바쁜 n2로 WRONG_NODE', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    w.n1.cluster.nodes.setDraining(true)
    expectWrongNode(await w.n1.route('b010-lobby'), 'n2')
})

test('A17-B-011 비우는 중이라도 n1을 찍어 온 접속(?node=n1)은 받음', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    w.n1.cluster.nodes.setDraining(true)
    assert.equal(await w.n1.route('b011-joiner', { node: 'n1' }), null)
})

test('A17-B-012 n1·n2 둘 다 비우는 중이면 갈 곳이 없어 n1이 받음', { timeout: 30000 }, async (t) => {
    const w = await W.startNodes(t, B)
    w.n1.cluster.nodes.setDraining(true)
    w.n2.cluster.nodes.setDraining(true)
    // n1이 n2의 비우는 중 표시를 볼 때까지 (하트비트 한 번)
    for (let i = 0; i < 100; i += 1) {
        await w.refresh()
        if (w.n1.cluster.nodes.list().find((n) => n.id === 'n2')?.draining) break
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(w.n1.cluster.nodes.list().find((n) => n.id === 'n2')?.draining, true, '준비: n2 비우는 중 표시')
    assert.equal(await w.n1.route('b012-lobby'), null)
})
