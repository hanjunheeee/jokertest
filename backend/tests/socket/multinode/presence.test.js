// 접속 상태 시험 (MN-067·068·069·070·071·077·119), OFFLINE 미루기·조건부 OFFLINE·친구 목록 생존 확인·청소 담당
// 메모리 Redis 위 n1(이 프로세스)·n2, DB는 저장소·모델 함수를 바꿔 끼워 흉내
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')
const { cluster, waitFor, tick, startTwoNodes, quietLog } = require('./setup')
const emitter = require('../../../socket/emitter')
const replace = require('../../../socket/connection/replace')
const presence = require('../../../socket/connection/presence')
const janitor = require('../../../socket/connection/janitor')
const presenceService = require('../../../services/presence/status')
const onlinePresenceRepository = require('../../../repositories/presence/onlinePresence')
const friendService = require('../../../services/friend')
const friendshipRepository = require('../../../repositories/friend/friendship')
const blockRepository = require('../../../repositories/friend/block')
const economyService = require('../../../services/economy')
const matchmaking = require('../../../socket/matchmaking')
const db = require('../../../models')

function makeSocket(id) {
    return { id, connected: true, data: { user: { sessionId: 's' } }, emit() {}, disconnect() { this.connected = false }, join() {} }
}

// 친구 상태 알림을 모으는 가짜 io
function recordingIo(sockets = []) {
    const sent = []
    return {
        sent,
        sockets: { sockets: new Map(sockets.map((s) => [s.id, s])) },
        to: (channel) => ({ emit: (event, payload) => sent.push({ channel, event, payload }) }),
    }
}

function fakePresence(t) {
    const writes = []
    t.mock.method(presenceService, 'setPresence', async (uuid, status) => { writes.push([uuid, status]) })
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => ['f1', 'f2'])
    t.mock.method(matchmaking, 'resyncRoomChannelOnReconnect', async () => {})
    t.after(() => { emitter.onlineUsers.clear(); emitter.setIo(null); replace.__resetReplaceForTests() })
    return writes
}

const offlineSent = (io) => io.sent.filter((m) => m.payload?.status === 'OFFLINE')

test('MN-067: 로비 → 방 Node 이동 때 친구에게 OFFLINE 깜빡임 없음 (다른 Node conn 살아 있음)', async (t) => {
    const { n2 } = await startTwoNodes(t)
    fakePresence(t)
    const sock = makeSocket('lobby-sock')
    const io = recordingIo([sock])
    emitter.setIo(io)
    await presence.handleConnection(io, sock, 'mover')
    // 화면이 n2로 옮겨 붙음 → n2가 conn을 씀
    await n2.directory.write(n2.directory.keys.conn('mover'), { node: 'n2', bootEpoch: n2.bootEpoch, socketId: 'x', seq: 5 }, { ttlMs: 60000 })
    await presence.handleDisconnect(io, sock, 'mover')
    assert.deepEqual(offlineSent(io), [])
    // 묶어 보냄: ONLINE 한 번에 친구 채널 둘
    assert.deepEqual(io.sent, [{ channel: ['user:f1', 'user:f2'], event: 'friend_status_change', payload: { uuid: 'mover', status: 'ONLINE' } }])
})

test('MN-067: 진짜로 나감(어디에도 없음) → 미룬 뒤 OFFLINE 보냄, 미루는 사이 같은 Node 재접속이면 안 보냄', async (t) => {
    await startTwoNodes(t)
    fakePresence(t)
    const a = makeSocket('a')
    const io = recordingIo([a])
    emitter.setIo(io)
    await presence.handleConnection(io, a, 'gone')
    const started = Date.now()
    await presence.handleDisconnect(io, a, 'gone')
    assert.ok(Date.now() - started >= 25, '미루기 30ms')
    assert.equal(offlineSent(io).length, 1)

    const b = makeSocket('b')
    const c = makeSocket('c')
    io.sockets.sockets.set(b.id, b); io.sockets.sockets.set(c.id, c)
    await presence.handleConnection(io, b, 'blink')
    const leaving = presence.handleDisconnect(io, b, 'blink')
    await presence.handleConnection(io, c, 'blink')
    await leaving
    assert.equal(offlineSent(io).filter((m) => m.payload.uuid === 'blink').length, 0)
})

test('단일 모드: OFFLINE 바로·친구 채널마다 따로 (지금과 같음)', async (t) => {
    await cluster.init({ env: {}, log: quietLog })
    t.after(() => cluster.close())
    const writes = fakePresence(t)
    const s = makeSocket('solo')
    const io = recordingIo([s])
    await presence.handleConnection(io, s, 'solo')
    await presence.handleDisconnect(io, s, 'solo')
    assert.deepEqual(io.sent.map((m) => [m.channel, m.payload.status]), [
        ['user:f1', 'ONLINE'], ['user:f2', 'ONLINE'], ['user:f1', 'OFFLINE'], ['user:f2', 'OFFLINE'],
    ])
    assert.deepEqual(writes, [['solo', 'ONLINE'], ['solo', 'OFFLINE']])
})

test('MN-068: Node 여러 개면 OFFLINE은 조건부(이 서버 줄·이름 없는 줄만), 단일 모드는 예전 upsert', async (t) => {
    const calls = []
    t.mock.method(db.OnlinePresence, 'update', async (values, options) => { calls.push({ values, options }); return [0] })
    t.mock.method(db.OnlinePresence, 'upsert', async (values) => { calls.push({ upsert: values }); return [values] })

    await presenceService.setPresence('u1', 'OFFLINE')
    assert.equal(calls[0].upsert.status, 'OFFLINE')

    await startTwoNodes(t)
    await presenceService.setPresence('u1', 'OFFLINE')
    await presenceService.setPresence('u1', 'ONLINE')
    const conditional = calls[1]
    assert.equal(conditional.values.status, 'OFFLINE')
    assert.equal(conditional.options.where.user_id, 'u1')
    const or = conditional.options.where[db.Sequelize.Op.or]
    assert.deepEqual(or, [{ server_id: 'main' }, { server_id: null }])
    // ONLINE은 그대로 upsert (새 Node가 줄을 가져감)
    assert.equal(calls[2].upsert.status, 'ONLINE')
})

test('MN-069: Node 여러 개에서도 같은 Node 빠른 재접속은 ONLINE이 마지막 (저장 줄 순서 그대로)', async (t) => {
    await startTwoNodes(t)
    const pending = []
    const writes = []
    t.mock.method(presenceService, 'setPresence', (uuid, status) =>
        new Promise((resolve) => pending.push(() => { writes.push(status); resolve() })))
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => [])
    t.mock.method(matchmaking, 'resyncRoomChannelOnReconnect', async () => {})
    t.after(() => { emitter.onlineUsers.clear(); replace.__resetReplaceForTests() })
    const first = makeSocket('f1s')
    const second = makeSocket('f2s')
    const io = recordingIo([first, second])
    const c1 = presence.handleConnection(io, first, 'quick')
    await waitFor(() => pending.length > 0)
    pending.shift()()
    await c1
    const d1 = presence.handleDisconnect(io, first, 'quick')
    const c2 = presence.handleConnection(io, second, 'quick')
    for (let i = 0; i < 20; i += 1) {
        await tick(2)
        const last = pending.pop()
        if (last) last()
    }
    await Promise.all([d1, c2])
    assert.equal(writes.at(-1), 'ONLINE', writes.join(','))
})

// 친구 하나 목록 흉내 (접속 줄은 넘긴 것)
function fakeFriendList(t, presenceRow) {
    t.mock.method(friendshipRepository, 'findFriendship', async (me) => [{
        requester_id: me, receiver_id: 'fr',
        Friend1: { uuid: me, nickname: '나', profile_image_url: null },
        Friend2: { uuid: 'fr', nickname: '친구', profile_image_url: null },
    }])
    t.mock.method(blockRepository, 'findBlockedCounterpartUuids', async () => [])
    t.mock.method(blockRepository, 'findFavoriteFriendIds', async () => [])
    t.mock.method(onlinePresenceRepository, 'findOnlinePresences', async () => [presenceRow])
    t.mock.method(economyService, 'getPublicProfileLoadouts', async () => ({}))
    emitter.setIo({ to: () => ({ emit() {} }) })
    t.after(() => emitter.setIo(null))
}

test('MN-070: 친구 목록에서 다른 Node(살아 있음) 접속자는 ONLINE', async (t) => {
    await startTwoNodes(t)
    fakeFriendList(t, { user_id: 'fr', status: 'ONLINE', server_id: 'n2' })
    const [friend] = await friendService.getFriendList('me')
    assert.equal(friend.status, 'ONLINE')
})

test('MN-071: 친구 목록에서 죽은 Node 줄은 OFFLINE, 내 Node 줄인데 목록에 없으면 OFFLINE, Redis down이면 줄을 믿음', async (t) => {
    const { hub, n2 } = await startTwoNodes(t)
    fakeFriendList(t, { user_id: 'fr', status: 'ONLINE', server_id: 'n3' })
    assert.equal((await friendService.getFriendList('me'))[0].status, 'OFFLINE')

    onlinePresenceRepository.findOnlinePresences.mock.mockImplementation(async () => [{ user_id: 'fr', status: 'ONLINE', server_id: 'n1' }])
    assert.equal((await friendService.getFriendList('me'))[0].status, 'OFFLINE')

    onlinePresenceRepository.findOnlinePresences.mock.mockImplementation(async () => [{ user_id: 'fr', status: 'ONLINE', server_id: 'n2' }])
    await n2.close()
    await waitFor(async () => { await cluster.nodes.refresh(); return !cluster.nodes.isAlive('n2') })
    assert.equal((await friendService.getFriendList('me'))[0].status, 'OFFLINE')

    hub.setDown(true)
    assert.equal((await friendService.getFriendList('me'))[0].status, 'ONLINE')
})

test('MN-077: 청소 담당은 잠금 잡은 하나만, 살아 있는 Node 목록·기준 시각으로 죽은 Node 줄 OFFLINE', async (t) => {
    const { n2 } = await startTwoNodes(t)
    const calls = []
    t.mock.method(onlinePresenceRepository, 'markOfflineOnDeadServers', async (alive, cutoff) => { calls.push({ alive, cutoff }); return 3 })
    const now = Date.now()
    assert.deepEqual(await janitor.runJanitorOnce({ now }), { ran: true, changed: 3 })
    assert.deepEqual(calls[0].alive.sort(), ['n1', 'n2'])
    assert.equal(calls[0].cutoff.getTime(), now - (150 + 30 * 2))
    // 잠금이 내 것이면 다음 차례도 돎
    assert.equal((await janitor.runJanitorOnce()).ran, true)
    // 잠금을 n2가 잡고 있으면 안 돎
    await n2.directory.write(n2.directory.keys.lock('janitor'), 'n2', { ttlMs: 60000 })
    assert.deepEqual(await janitor.runJanitorOnce(), { ran: false, changed: 0 })
    assert.equal(calls.length, 2)
})

test('MN-077: 단일 모드·Redis down이면 청소 안 함', async (t) => {
    const calls = []
    t.mock.method(onlinePresenceRepository, 'markOfflineOnDeadServers', async () => { calls.push(1); return 0 })
    assert.equal((await janitor.runJanitorOnce()).ran, false)
    const { hub } = await startTwoNodes(t)
    hub.setDown(true)
    assert.equal((await janitor.runJanitorOnce()).ran, false)
    assert.equal(calls.length, 0)
})

test('MN-077: 죽은 Node 줄 정리 질의 모양 (NOT IN 살아 있는 Node, ONLINE만, 기준 시각 전)', async (t) => {
    const calls = []
    t.mock.method(db.OnlinePresence, 'update', async (values, options) => { calls.push({ values, options }); return [2] })
    const { Op } = db.Sequelize
    const cutoff = new Date(1000)
    assert.equal(await onlinePresenceRepository.markOfflineOnDeadServers(['n1', 'n2'], cutoff), 2)
    assert.equal(await onlinePresenceRepository.markOfflineOnDeadServers([], cutoff), 0)
    assert.equal(calls.length, 1)
    const { where } = calls[0].options
    assert.deepEqual(calls[0].values, { status: 'OFFLINE' })
    assert.deepEqual(where.server_id, { [Op.notIn]: ['n1', 'n2'] })
    assert.deepEqual(where.status, { [Op.ne]: 'OFFLINE' })
    assert.deepEqual(where.last_active_at, { [Op.lt]: cutoff })
})

test('MN-119: 재시작 때 자기 서버 이름 줄만 OFFLINE으로 되돌림', async (t) => {
    const calls = []
    t.mock.method(db.OnlinePresence, 'update', async (values, options) => { calls.push(options.where); return [1] })
    const bootAt = new Date(5_000_000)
    await presenceService.resetPresencesOnBoot(bootAt, 'n2')
    const { Op } = db.Sequelize
    const branches = calls[0][Op.or]
    assert.deepEqual(branches[0], { server_id: 'n2', last_active_at: { [Op.lt]: bootAt } })
    assert.equal(branches[1].server_id, null)
    assert.equal(branches.length, 2)
})
