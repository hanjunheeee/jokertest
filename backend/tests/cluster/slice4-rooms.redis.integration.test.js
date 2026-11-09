// 조각 4 진짜 Redis 통합 시험: 방·판 채널 방송과 공개 방 목록이 어댑터로 Redis를 안 탐(publish 0), 목록 스냅샷은 진짜 버스로 오감
// MN-021·086 (+ 080 진짜 버스), npm run test:with-redis로 돎 (REDIS_URL_TEST 없으면 건너뜀)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { Server } = require('socket.io')
const ioClient = require('socket.io-client')

const { REDIS_URL_TEST, skipReason, sleep, uniquePrefix, waitFor, startRedisNode, cleanupPrefix } = require('./helpers/redisNodes')
const cluster = require('../../cluster')
const { quietLog } = require('../../cluster/testing/memoryCluster')
const matchmaking = require('../../socket/matchmaking')
const { emitToChannel } = require('../../socket/channelMembership')
const { emitPublicRoomList, flushPublicRoomList } = require('../../socket/matchmaking/room/view')
const roomListSync = require('../../socket/matchmaking/cluster/roomListSync')

const FAST = { CLUSTER_HEARTBEAT_MS: '200', NODE_DEAD_AFTER_MS: '1000' }

// n1 = 이 프로세스 cluster(진짜 Redis + 어댑터) + socket.io 서버 (접속 때 auth.room 채널에 넣음)
async function startSelfNode(t, prefix) {
    const server = http.createServer()
    const io = new Server(server, { transports: ['websocket'] })
    io.on('connection', (socket) => { if (socket.handshake.auth?.room) socket.join(socket.handshake.auth.room) })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    await cluster.init({ io, env: { REDIS_URL: REDIS_URL_TEST, SERVER_ID: 'n1', REDIS_KEY_PREFIX: prefix, ...FAST }, bootEpoch: matchmaking.__getBootEpochForTests(), log: quietLog })
    t.after(async () => {
        roomListSync.__resetRoomListSyncForTests()
        matchmaking.__resetStateForTests()
        await new Promise((resolve) => io.close(() => resolve()))
        await cluster.close()
    })
    return { io, port: server.address().port }
}

// 사용자 소켓 (auth.room 채널) → { socket, received }
async function connect(t, port, { uuid, room }) {
    const socket = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], auth: { uuid, room }, reconnection: false })
    const received = []
    socket.onAny((event, payload) => received.push({ event, payload }))
    t.after(() => socket.close())
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
    await sleep(30)
    return { socket, received }
}

// n1·n2 + 사용자: n1에 a1·a2(room-1), n2에 b1(room-1 같은 이름 채널)
async function setup(t) {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    const self = await startSelfNode(t, prefix)
    const n2 = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST })
    await n2.node.nodes.refresh()
    await cluster.nodes.refresh()
    const a1 = await connect(t, self.port, { uuid: 'a1', room: 'room-1' })
    const a2 = await connect(t, self.port, { uuid: 'a2', room: 'room-1' })
    const b1 = await connect(t, n2.port, { uuid: 'b1' })
    n2.io.in('user:b1').socketsJoin('room-1')
    await sleep(30)
    return { self, n2, a1, a2, b1 }
}

const count = (user, event) => user.received.filter((e) => e.event === event).length

test('MN-021: 방·판 채널 방송(emitToChannel)은 어댑터 publish 0, 다른 Node 같은 채널 사람은 못 받음', { skip: skipReason }, async (t) => {
    const { self, a1, a2, b1 } = await setup(t)
    assert.equal(cluster.state(), 'up')
    const before = cluster.adapterStats().published

    emitToChannel(self.io, 'room-1', 'day_phase_changed', { round: 1 })
    const a1Server = [...self.io.sockets.sockets.values()].find((s) => s.handshake.auth.uuid === 'a1')
    emitToChannel(self.io, 'room-1', 'player_joined_room', { who: 'a1' }, { senderSocket: a1Server })
    emitToChannel(self.io, 'room-1', 'game_chat', { text: 'x' }, { exceptSocketIds: [a1Server.id] })
    await waitFor(() => count(a2, 'game_chat') === 1)
    await sleep(150)

    assert.equal(cluster.adapterStats().published - before, 0)
    assert.equal(count(a1, 'day_phase_changed'), 1)
    assert.equal(count(a2, 'day_phase_changed'), 1)
    assert.equal(count(a1, 'player_joined_room'), 0)
    assert.equal(count(a2, 'player_joined_room'), 1)
    assert.equal(count(a1, 'game_chat'), 0)
    assert.equal(b1.received.length, 0)

    // 견줌: 어댑터로 보내면 publish가 늘고 n2 사람도 받음 (재는 방법이 맞는지)
    self.io.to('room-1').emit('control', {})
    await waitFor(() => count(b1, 'control') === 1)
    assert.equal(cluster.adapterStats().published - before, 1)
})

test('MN-086: 공개 방 목록은 io.local (publish 0·n2 사람에게 안 감), 스냅샷은 진짜 버스로 n2에 감', { skip: skipReason }, async (t) => {
    const { self, n2, a1, b1 } = await setup(t)
    const got = []
    n2.node.bus.on(cluster.BUS_TYPES.ROOMS_SNAPSHOT, (msg) => got.push(msg))
    matchmaking.__seedRoomForTests({
        id: 'room-open', instanceId: 'inst', code: 'OPENAB', hostUuid: 'a1', accessType: 'open', title: 't',
        players: new Map([['a1', { uuid: 'a1', nickname: 'a1', isReady: false }]]), settings: { maxPlayers: 8, jokerCount: 2 },
    })
    const before = cluster.adapterStats().published

    emitPublicRoomList(self.io)
    flushPublicRoomList(self.io)
    await waitFor(() => count(a1, 'public_rooms_updated') >= 1 && got.length >= 1)
    await sleep(150)

    assert.equal(cluster.adapterStats().published - before, 0)
    assert.equal(count(b1, 'public_rooms_updated'), 0)
    assert.deepEqual(got.at(-1).rooms.map((r) => [r.id, r.node]), [['room-open', 'n1']])
})

test('MN-080(진짜 버스): n2 스냅샷이 오면 n1 사람에게 합친 목록이 한 번 감', { skip: skipReason }, async (t) => {
    const { self, n2, a1 } = await setup(t)
    roomListSync.bindRoomListIo(self.io)
    await n2.node.bus.publish(cluster.BUS_TYPES.ROOMS_SNAPSHOT, {
        node: 'n2', bootEpoch: n2.node.bootEpoch, at: Date.now(),
        rooms: [{ id: 'far', current: 1, max: 8, title: 'far', accessType: 'open', status: 'waiting' }],
    })
    await waitFor(() => count(a1, 'public_rooms_updated') === 1)
    const rooms = a1.received.find((e) => e.event === 'public_rooms_updated').payload.rooms
    assert.deepEqual(rooms.map((r) => [r.id, r.node]), [['far', 'n2']])
})
