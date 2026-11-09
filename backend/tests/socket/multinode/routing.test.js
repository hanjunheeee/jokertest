// Node 길잡이 시험 (MN-007·008·009·075·098·108·109·114), 접속 때 loc를 보고 WRONG_NODE로 보낼지 받을지
// 메모리 Redis 위 n1(이 프로세스)·n2, MN-009는 진짜 socket.io 서버·클라이언트로
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { Server } = require('socket.io')
const { io: connectClient } = require('socket.io-client')
const { cluster, waitFor, startTwoNodes, readKey, quietLog } = require('./setup')
const { nodeRouting, chooseNode } = require('../../../socket/connection/nodeRouting')

const keys = () => cluster.directory.keys()
const fakeSocket = (uuid, query = {}) => ({ data: { user: { uuid } }, handshake: { query } })
const locOf = (node, bootEpoch, extra = {}) => ({ node, bootEpoch, kind: 'game', id: 'g1', ...extra })

// 미들웨어 한 번 돌리고 next에 넘어온 값
const runRouting = (socket) => new Promise((resolve) => nodeRouting(socket, (err) => resolve(err ?? null)))

test('MN-007: 판이 살아 있는 다른 Node에 있으면 WRONG_NODE + data.node (힌트 없이 새로고침)', async (t) => {
    const { n2 } = await startTwoNodes(t)
    await n2.directory.write(keys().loc('u1'), locOf('n2', n2.bootEpoch), { ttlMs: 60000 })
    const err = await runRouting(fakeSocket('u1'))
    assert.equal(err.message, 'WRONG_NODE')
    assert.deepEqual(err.data, { node: 'n2' })
    assert.match(err.data.node, /^[A-Za-z0-9_-]{1,32}$/)
})

test('MN-008: 판 Node로 다시 붙음(loc가 나) → 받음, loc 그대로', async (t) => {
    const { n2 } = await startTwoNodes(t)
    const value = locOf('n1', cluster.bootEpoch())
    await cluster.directory.write(keys().loc('u1'), value, { ttlMs: 60000 })
    assert.equal(await runRouting(fakeSocket('u1', { node: 'n1' })), null)
    assert.deepEqual(await readKey(n2, keys().loc('u1')), value)
})

test('loc 없음(로비) → 받음, 화면이 못 따라가는 Node 이름이면 보내지 않고 받음', async (t) => {
    const { n2 } = await startTwoNodes(t)
    assert.equal(await runRouting(fakeSocket('lobby')), null)
    await n2.directory.write(keys().loc('odd'), { node: 'n2', kind: 'room', id: 'r' }, { ttlMs: 60000 })
    assert.equal(await chooseNode(fakeSocket('odd')), 'n2')
    // 점이 든 이름(SERVER_ID로는 됨, 화면 모양은 아님)
    await n2.directory.write(keys().loc('dotted'), { node: 's1.n2', kind: 'room', id: 'r' }, { ttlMs: 60000 })
    assert.equal(await chooseNode(fakeSocket('dotted')), null)
})

test('MN-075: 같은 SERVER_ID 재시작(bootEpoch 다름) → 옛 loc 안 믿고 지운 뒤 받음', async (t) => {
    const { n2 } = await startTwoNodes(t)
    await n2.directory.write(keys().loc('u1'), locOf('n1', 'old-boot'), { ttlMs: 60000 })
    assert.equal(await runRouting(fakeSocket('u1')), null)
    assert.equal(await readKey(n2, keys().loc('u1')), null)
})

test('MN-108·109: 판 Node가 죽음 → 힌트가 있어도 loc 안 믿고 지운 뒤 받음 (로비로)', async (t) => {
    const { n2 } = await startTwoNodes(t)
    await n2.directory.write(keys().loc('u1'), locOf('n2', n2.bootEpoch), { ttlMs: 60000 })
    await n2.close()
    await waitFor(async () => { await cluster.nodes.refresh(); return !cluster.nodes.isAlive('n2') })
    assert.equal(await runRouting(fakeSocket('u1', { node: 'n2' })), null)
    assert.equal((await cluster.directory.read(keys().loc('u1'))).value, null)
})

test('loc 지우기는 CAS: 확인 사이에 새로 쓴 값은 안 지움', async (t) => {
    await startTwoNodes(t)
    const key = keys().loc('u1')
    await cluster.directory.write(key, locOf('ghost', 'e1'), { ttlMs: 60000 })
    const fresh = locOf('n1', cluster.bootEpoch(), { id: 'g-new' })
    // 길잡이가 읽은 뒤 내 Node가 새 값을 씀
    const realLocate = cluster.directory.locate
    t.mock.method(cluster.directory, 'locate', async (k) => {
        const found = await realLocate(k)
        await cluster.directory.write(key, fresh, { ttlMs: 60000 })
        return found
    })
    assert.equal(await runRouting(fakeSocket('u1')), null)
    assert.deepEqual((await cluster.directory.read(key)).value, fresh)
})

test('MN-098: Redis down 동안 길잡이 안 함 (loc가 다른 Node여도 받음)', async (t) => {
    const { hub, n2 } = await startTwoNodes(t)
    await n2.directory.write(keys().loc('u1'), locOf('n2', n2.bootEpoch), { ttlMs: 60000 })
    hub.setDown(true)
    assert.equal(cluster.isShared(), false)
    assert.equal(await runRouting(fakeSocket('u1')), null)
})

test('단일 모드: 늘 받음 (지금과 같음)', async (t) => {
    await cluster.init({ env: {}, log: quietLog })
    t.after(() => cluster.close())
    assert.equal(await runRouting(fakeSocket('u1')), null)
    assert.equal(await runRouting({ data: {} }), null)
})

test('MN-114: draining Node → loc 없는 로비 접속은 덜 바쁜 다른 Node로, 나를 찍어 온 접속·판 사람은 받음', async (t) => {
    const { n2 } = await startTwoNodes(t)
    cluster.nodes.setDraining(true)
    t.after(() => cluster.nodes.setDraining(false))
    assert.equal(await chooseNode(fakeSocket('lobby')), 'n2')
    assert.equal(await chooseNode(fakeSocket('joiner', { node: 'n1' })), null)
    await cluster.directory.write(keys().loc('player'), locOf('n1', cluster.bootEpoch()), { ttlMs: 60000 })
    assert.equal(await chooseNode(fakeSocket('player')), null)
    // 다른 Node도 draining이면 보낼 곳 없음 → 받음
    n2.nodes.setDraining(true)
    await waitFor(async () => { await cluster.nodes.refresh(); return cluster.nodes.list().find((n) => n.id === 'n2')?.draining })
    assert.equal(await chooseNode(fakeSocket('lobby')), null)
})

test('MN-009: 잘못된 Node 접속 → connect_error WRONG_NODE(data.node), connection 처리기 안 붙음', async (t) => {
    const { n2 } = await startTwoNodes(t)
    await n2.directory.write(keys().loc('u9'), locOf('n2', n2.bootEpoch), { ttlMs: 60000 })
    const server = http.createServer()
    const io = new Server(server, { transports: ['websocket'] })
    let connected = 0
    io.use((socket, next) => { socket.data.user = { uuid: socket.handshake.auth.uuid }; next() })
    io.use(nodeRouting)
    io.on('connection', () => { connected += 1 })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise((resolve) => io.close(() => resolve())))
    const client = connectClient(`http://127.0.0.1:${server.address().port}`, {
        transports: ['websocket'], auth: { uuid: 'u9' }, reconnection: false,
    })
    t.after(() => client.close())
    const err = await new Promise((resolve) => client.on('connect_error', resolve))
    assert.equal(err.message, 'WRONG_NODE')
    assert.deepEqual(err.data, { node: 'n2' })
    assert.equal(connected, 0)
})
