// 노드 넘는 옛 탭 밀어내기 시험 (MN-063·064·065·066·072), conn.replaced 순번이 작은 소켓만 끊는지
// 메모리 Redis 위 n1(이 프로세스)·n2, n1 소켓은 가짜 소켓, n2 접속은 n2의 순번·버스로 흉내
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')
const { cluster, waitFor, startTwoNodes, readKey } = require('./setup')
const emitter = require('../../../socket/emitter')
const replace = require('../../../socket/connection/replace')
const presence = require('../../../socket/connection/presence')
const presenceService = require('../../../services/presence/status')
const matchmaking = require('../../../socket/matchmaking')

const keys = () => cluster.directory.keys()

function makeSocket(id, sessionId) {
    return {
        id,
        connected: true,
        data: { user: { uuid: 'x', sessionId } },
        emitted: [],
        disconnects: 0,
        rooms: new Set(),
        emit(event, payload) { this.emitted.push({ event, payload }) },
        disconnect() { this.disconnects += 1; this.connected = false },
        join() {},
    }
}

// 가짜 io에 소켓 넣고, 접속 목록·기억은 시험 끝에 비움
function setupLocal(t, sockets) {
    const io = { sockets: { sockets: new Map(sockets.map((s) => [s.id, s])) }, to: () => ({ emit() {} }) }
    emitter.setIo(io)
    replace.startReplaceSync()
    t.after(() => {
        emitter.setIo(null)
        emitter.onlineUsers.clear()
        replace.__resetReplaceForTests()
    })
    return io
}

// n2에서 새로 붙은 것 흉내: 순번 받고 conn 쓰고 알림
async function connectOnN2(n2, uuid, { socketId = 'n2-sock', sessionId = 'sess-b' } = {}) {
    const seq = await n2.directory.nextSeq(n2.directory.keys.connseq(uuid), 60000)
    const value = { node: 'n2', bootEpoch: n2.bootEpoch, socketId, seq, sessionId }
    await n2.directory.write(n2.directory.keys.conn(uuid), value, { ttlMs: 60000 })
    await n2.bus.publish('conn.replaced', { uuid, node: 'n2', socketId, seq, sessionId })
    return value
}

test('MN-063: 같은 세션 새 탭이 다른 Node로 → 옛 탭 REPLACED_BY_SAME_SESSION, 접속 목록에서 빠짐', async (t) => {
    const { n2 } = await startTwoNodes(t)
    const old = makeSocket('n1-sock', 'sess-a')
    setupLocal(t, [old])
    emitter.onlineUsers.set('u1', old.id)
    await replace.announceConnection(old, 'u1')
    assert.equal(old.data.connSeq, 1)
    assert.equal((await readKey(n2, keys().conn('u1'))).socketId, 'n1-sock')

    await connectOnN2(n2, 'u1', { sessionId: 'sess-a' })
    await waitFor(() => old.disconnects === 1)
    assert.equal(old.emitted[0].event, 'force_disconnect')
    assert.equal(old.emitted[0].payload.code, 'REPLACED_BY_SAME_SESSION')
    assert.equal(old.data.forcedLogout, true)
    assert.equal(emitter.onlineUsers.has('u1'), false)
    // conn은 n2 것 그대로
    assert.equal((await readKey(n2, keys().conn('u1'))).node, 'n2')
})

test('MN-064: 다른 기기 새 로그인이 다른 Node로 → REPLACED_BY_OTHER_LOGIN', async (t) => {
    const { n2 } = await startTwoNodes(t)
    const old = makeSocket('n1-sock', 'sess-a')
    setupLocal(t, [old])
    emitter.onlineUsers.set('u2', old.id)
    await replace.announceConnection(old, 'u2')
    await connectOnN2(n2, 'u2', { sessionId: 'sess-other' })
    await waitFor(() => old.disconnects === 1)
    assert.equal(old.emitted[0].payload.code, 'REPLACED_BY_OTHER_LOGIN')
})

test('MN-065: 두 Node에 거의 동시 접속 → 순번 큰 쪽 하나만 남음 (둘 다 끊기지 않음)', async (t) => {
    const { n2 } = await startTwoNodes(t)
    // (가) n2가 먼저 순번 1, n1이 순번 2 → n1 남음, n2 알림은 무시, conn은 n1
    const mine = makeSocket('n1-a', 's1')
    setupLocal(t, [mine])
    emitter.onlineUsers.set('race', mine.id)
    const n2Seq = await n2.directory.nextSeq(n2.directory.keys.connseq('race'), 60000)
    await replace.announceConnection(mine, 'race')
    assert.equal(mine.data.connSeq, n2Seq + 1)
    // n2가 늦게 conn을 덮고 알림
    await n2.directory.write(n2.directory.keys.conn('race'), { node: 'n2', socketId: 'n2-a', seq: n2Seq, sessionId: 's2' }, { ttlMs: 60000 })
    await n2.bus.publish('conn.replaced', { uuid: 'race', node: 'n2', socketId: 'n2-a', seq: n2Seq, sessionId: 's2' })
    await waitFor(async () => (await readKey(n2, keys().conn('race')))?.node === 'n1')
    assert.equal(mine.disconnects, 0)

    // (나) n1이 순번 받는 중에 더 큰 순번 알림이 먼저 옴 → n1이 스스로 물러남, 알림 안 보냄
    const late = makeSocket('n1-b', 's1')
    emitter.getIo().sockets.sockets.set(late.id, late)
    emitter.onlineUsers.set('race2', late.id)
    const realNextSeq = cluster.directory.nextSeq
    t.mock.method(cluster.directory, 'nextSeq', async (key, ttl) => {
        const seq = await realNextSeq(key, ttl)
        replace.onConnReplaced({ uuid: 'race2', node: 'n2', socketId: 'n2-b', seq: seq + 1, sessionId: 's9' })
        return seq
    })
    await replace.announceConnection(late, 'race2')
    assert.equal(late.disconnects, 1)
    assert.equal(late.emitted[0].payload.code, 'REPLACED_BY_OTHER_LOGIN')
    assert.equal(await readKey(n2, keys().conn('race2')), null)
})

test('MN-066: 다른 Node에 밀려 끊긴 옛 탭의 끊김 처리는 OFFLINE을 안 씀', async (t) => {
    const { n2 } = await startTwoNodes(t)
    const writes = []
    t.mock.method(presenceService, 'setPresence', async (uuid, status) => { writes.push(status) })
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => [])
    t.mock.method(matchmaking, 'resyncRoomChannelOnReconnect', async () => {})
    const old = makeSocket('n1-sock', 'sess-a')
    const io = setupLocal(t, [old])
    await presence.handleConnection(io, old, 'u3')
    assert.deepEqual(writes, ['ONLINE'])
    await connectOnN2(n2, 'u3')
    await waitFor(() => old.disconnects === 1)
    await presence.handleDisconnect(io, old, 'u3')
    assert.deepEqual(writes, ['ONLINE'])
})

test('MN-072: conn은 내 소켓 값일 때만 지움 (같은 Node 새 소켓·다른 Node 값은 그대로)', async (t) => {
    const { n2 } = await startTwoNodes(t)
    const first = makeSocket('s-first', 'sa')
    const second = makeSocket('s-second', 'sa')
    setupLocal(t, [first, second])
    emitter.onlineUsers.set('u4', first.id)
    await replace.announceConnection(first, 'u4')
    // 같은 Node 새 탭이 이어받음
    emitter.onlineUsers.set('u4', second.id)
    await replace.announceConnection(second, 'u4')
    assert.equal(await replace.forgetConnection(first, 'u4'), false)
    assert.equal((await readKey(n2, keys().conn('u4'))).socketId, 's-second')
    // 다른 Node가 덮은 뒤 내 소켓 끊김 → 안 지움
    await n2.directory.write(n2.directory.keys.conn('u4'), { node: 'n2', socketId: 'z', seq: 99 }, { ttlMs: 60000 })
    assert.equal(await replace.forgetConnection(second, 'u4'), false)
    assert.equal((await readKey(n2, keys().conn('u4'))).node, 'n2')
    // 내 값 그대로면 지움
    const third = makeSocket('s-third', 'sa')
    emitter.getIo().sockets.sockets.set(third.id, third)
    emitter.onlineUsers.set('u5', third.id)
    await replace.announceConnection(third, 'u5')
    assert.equal(await replace.forgetConnection(third, 'u5'), true)
    assert.equal(await readKey(n2, keys().conn('u5')), null)
})

test('단일 모드: announce·forget은 아무것도 안 함, 알림 받아도 안 끊음', async (t) => {
    await cluster.init({ env: {}, log: require('./setup').quietLog })
    t.after(() => cluster.close())
    const s = makeSocket('solo', 'a')
    setupLocal(t, [s])
    emitter.onlineUsers.set('solo-u', s.id)
    await replace.announceConnection(s, 'solo-u')
    assert.equal(s.data.connSeq, undefined)
    assert.equal(await replace.forgetConnection(s, 'solo-u'), false)
    assert.equal(s.disconnects, 0)
})
