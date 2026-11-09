// 진짜 Redis 통합 시험: 한 프로세스에 Node 2개(socket.io 서버 2개 + 진짜 어댑터) — 버스·RPC·계정 채널 전달,
// Redis 죽음·멈춤·비움·OOM 때 대체 동작 (위험 2번 실측 확인), npm run test:with-redis로 돎 (REDIS_URL_TEST 없으면 건너뜀)
const test = require('node:test')
const assert = require('node:assert/strict')

const {
    REDIS_URL_TEST, skipReason, sleep, uniquePrefix, waitFor,
    startRedisNode, connectUser, trackUnhandled, cleanupPrefix, withAdminClient,
} = require('./helpers/redisNodes')
const { createRedisProxy } = require('./helpers/redisProxy')

const targetPort = REDIS_URL_TEST ? Number(new URL(REDIS_URL_TEST).port || 6379) : 0
const FAST = { CLUSTER_HEARTBEAT_MS: '200', NODE_DEAD_AFTER_MS: '1000' }

// Node 둘 (같은 앞머리), via: 'direct' 또는 중계(죽음·멈춤 흉내용)
async function pair(t, { env = {}, proxy = null } = {}) {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    const url = proxy ? proxy.url : REDIS_URL_TEST
    const a = await startRedisNode(t, { url, serverId: 'n1', prefix, env })
    const b = await startRedisNode(t, { url, serverId: 'n2', prefix, env })
    await a.node.nodes.refresh()
    await b.node.nodes.refresh()
    return { prefix, a, b }
}

async function withProxy(t) {
    const proxy = await createRedisProxy({ targetPort })
    t.after(() => proxy.close())
    return proxy
}

test('Node 2개: 버스·RPC·callAll이 진짜 Redis로 오감', { skip: skipReason }, async (t) => {
    const { a, b } = await pair(t)
    const got = []
    b.node.bus.on('ops.reload', (msg) => got.push(msg))
    b.node.rpc.register('t.add', ({ x, y }) => x + y)
    a.node.rpc.register('t.add', ({ x, y }) => x + y + 100)
    assert.equal(await a.node.bus.publish('ops.reload', { what: 'maintenance' }), true)
    await waitFor(() => got.length === 1)
    assert.equal(got[0].from, 'n1')
    assert.equal(got[0].what, 'maintenance')
    assert.equal(await a.node.rpc.call('n2', 't.add', { x: 1, y: 2 }), 3)
    await assert.rejects(a.node.rpc.call('n9', 't.add', {}), { code: 'NODE_UNAVAILABLE' })
    const all = await a.node.rpc.callAll('t.add', { x: 1, y: 1 })
    assert.equal(all.partial, false)
    assert.deepEqual(all.results.map((r) => r.value).sort((p, q) => p - q), [2, 102])
})

test('어댑터: n2에서 보낸 계정 채널 알림이 n1 사람에게 감 + fetchSockets 전 Node', { skip: skipReason }, async (t) => {
    const { a, b } = await pair(t)
    const user = await connectUser(t, a.port, 'u-1')
    b.io.to('user:u-1').emit('notification_created', { id: 1 })
    await waitFor(() => user.received.length === 1)
    assert.deepEqual(user.received[0], { event: 'notification_created', payload: { id: 1 } })
    const fetched = await b.node.fetchSockets('user:u-1')
    assert.equal(fetched.partial, false)
    assert.equal(fetched.sockets.length, 1)
    // io.local은 Redis를 안 탐 → 다른 Node 사람은 못 받음, 어댑터 publish 수도 안 늘어남
    const before = b.node.adapterStats().published
    b.io.local.to('user:u-1').emit('local_only', {})
    await sleep(150)
    assert.equal(user.received.length, 1)
    assert.equal(b.node.adapterStats().published, before)
})

test('MN-117: 옛·새 버전 섞임 — 모르는 type·다른 v는 무시, 아는 type의 새 칸은 그냥 받음', { skip: skipReason }, async (t) => {
    const { prefix, b } = await pair(t)
    const got = []
    b.node.bus.on('ops.reload', (msg) => got.push(msg.what))
    await withAdminClient(async (client) => {
        const channel = `${prefix}:bus:v1`
        await client.publish(channel, JSON.stringify({ v: 1, type: 'future.thing', from: 'n9', at: Date.now() }))
        await client.publish(channel, JSON.stringify({ v: 2, type: 'ops.reload', from: 'n9', at: Date.now(), what: 'v2' }))
        await client.publish(channel, 'garbage{')
        await client.publish(channel, JSON.stringify({ v: 1, type: 'ops.reload', from: 'n9', at: Date.now(), what: 'ok', extra: { new: true } }))
    })
    await waitFor(() => got.length >= 1)
    await sleep(100)
    assert.deepEqual(got, ['ok'])
})

test('MN-090: 켤 때 Redis 없음 → 그래도 켜짐(down)·로그 한 줄, 살아나면 up', { skip: skipReason }, async (t) => {
    const proxy = await withProxy(t)
    proxy.kill()
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    const warnings = []
    const log = { log() {}, info() {}, error() {}, warn: (m) => warnings.push(String(m)) }
    const started = Date.now()
    const { node } = await startRedisNode(t, { url: proxy.url, serverId: 'n1', prefix, env: { CLUSTER_CONNECT_WAIT_MS: '800' }, log, withIo: false })
    assert.ok(Date.now() - started < 3000)
    assert.equal(node.state(), 'down')
    assert.equal(warnings.filter((m) => m.includes('켤 때 Redis 연결 안 됨')).length, 1)
    assert.equal(await node.bus.publish('ops.reload', {}), false)
    proxy.restore()
    await waitFor(() => node.state() === 'up', { timeoutMs: 8000 })
})

// 죽음(kill)·멈춤(freeze) 공통: down 판정 시간, 그동안 방송·fetchSockets·처리 안 된 거절
for (const how of ['kill', 'freeze']) {
    test(`MN-091~094 (${how}): down 판정, 내 Node 전송 그대로, 처리 안 된 거절 0, fetchSockets 바로 로컬`, { skip: skipReason, timeout: 30000 }, async (t) => {
        const unhandled = trackUnhandled(t)
        const proxy = await withProxy(t)
        const { a, b } = await pair(t, { proxy })
        const user = await connectUser(t, a.port, 'u-1')
        b.io.to('user:u-1').emit('cross', 0)
        await waitFor(() => user.received.length === 1)

        const cutAt = Date.now()
        proxy[how]()
        // 판정 전 틈: 어댑터가 publish를 시도해도 거절은 처리됨
        for (let i = 0; i < 20; i += 1) a.io.to('user:u-1').emit('gap', i)
        await waitFor(() => a.node.state() === 'down', { timeoutMs: 6000 })
        const downMs = Date.now() - cutAt
        if (how === 'kill') assert.ok(downMs < 2000, `kill → down ${downMs}ms`)
        else assert.ok(downMs < 5000, `freeze → down ${downMs}ms`)

        for (let i = 0; i < 50; i += 1) a.io.to('user:u-1').emit('local', i)
        await waitFor(() => user.received.filter((r) => r.event === 'local').length === 50)
        assert.equal(user.received.filter((r) => r.event === 'gap').length, 20)
        const fetchStarted = Date.now()
        const fetched = await a.node.fetchSockets('user:u-1')
        assert.ok(Date.now() - fetchStarted < 100)
        assert.equal(fetched.partial, true)
        assert.equal(fetched.sockets.length, 1)
        assert.ok(a.node.adapterStats().forcedLocal >= 50)
        assert.equal(await a.node.bus.publish('ops.reload', {}), false)
        assert.deepEqual(await a.node.directory.read('x'), { available: false, value: null })

        await sleep(1500)
        assert.deepEqual(unhandled, [])
        proxy.restore()
        await waitFor(() => a.node.state() === 'up' && b.node.state() === 'up', { timeoutMs: 8000 })
        await waitFor(async () => {
            b.io.to('user:u-1').emit('after', 1)
            await sleep(100)
            return user.received.some((r) => r.event === 'after')
        })
        assert.deepEqual(unhandled, [])
    })
}

test('MN-103: Redis가 비면(재시작) 두 Node 다 다시 맞추기, 하트비트·디렉터리 다시 씀', { skip: skipReason }, async (t) => {
    const { prefix, a, b } = await pair(t, { env: FAST })
    const runs = { n1: 0, n2: 0 }
    a.node.onResync(async () => {
        runs.n1 += 1
        await a.node.directory.write(a.node.directory.keys.loc('u-1'), { node: 'n1', bootEpoch: a.node.bootEpoch }, { ttlMs: 60000 })
    })
    b.node.onResync(() => { runs.n2 += 1 })
    await sleep(300)
    await cleanupPrefix(prefix)
    await waitFor(() => runs.n1 === 1 && runs.n2 === 1, { timeoutMs: 5000 })
    await waitFor(async () => (await b.node.directory.locate(b.node.directory.keys.loc('u-1'))).alive)
    await sleep(600)
    assert.deepEqual(runs, { n1: 1, n2: 1 })
    assert.deepEqual(b.node.nodes.ids().sort(), ['n1', 'n2'])
})

test('MN-104: Redis 0.8초 멈춤 → RPC는 시간 초과로 깔끔히 끝나고 뒤에는 다시 됨', { skip: skipReason }, async (t) => {
    const unhandled = trackUnhandled(t)
    const proxy = await withProxy(t)
    const { a, b } = await pair(t, { proxy, env: { CLUSTER_RPC_TIMEOUT_MS: '300' } })
    b.node.rpc.register('t.ping', () => 'pong')
    assert.equal(await a.node.rpc.call('n2', 't.ping'), 'pong')
    proxy.freeze()
    const started = Date.now()
    const failed = await a.node.rpc.call('n2', 't.ping').catch((error) => error)
    assert.ok(['RPC_TIMEOUT', 'CLUSTER_UNAVAILABLE'].includes(failed.code), failed.code)
    assert.ok(Date.now() - started < 1500)
    await sleep(Math.max(0, 800 - (Date.now() - started)))
    proxy.restore()
    await waitFor(() => a.node.state() === 'up')
    await waitFor(async () => (await a.node.rpc.call('n2', 't.ping').catch(() => null)) === 'pong')
    await sleep(300)
    assert.deepEqual(unhandled, [])
})

test('MN-106: Redis OOM 쓰기 실패 → down처럼 대체 동작 (디렉터리 false·카운터 메모리), 풀리면 up', { skip: skipReason, timeout: 30000 }, async (t) => {
    const unhandled = trackUnhandled(t)
    const { a } = await pair(t)
    const saved = await withAdminClient(async (c) => ({
        maxmemory: (await c.config('GET', 'maxmemory'))[1],
        policy: (await c.config('GET', 'maxmemory-policy'))[1],
    }))
    const restore = () => withAdminClient(async (c) => {
        await c.config('SET', 'maxmemory', saved.maxmemory)
        await c.config('SET', 'maxmemory-policy', saved.policy)
    })
    t.after(restore)
    await withAdminClient(async (c) => {
        await c.config('SET', 'maxmemory-policy', 'noeviction')
        await c.config('SET', 'maxmemory', '1')
    })
    assert.equal(await a.node.directory.write('x:oom', { node: 'n1' }, { ttlMs: 1000 }), false)
    assert.equal((await a.node.counters.hit('rl:oom:1', 1000)).shared, false)
    await waitFor(() => a.node.state() === 'down', { timeoutMs: 6000 })
    await restore()
    await waitFor(() => a.node.state() === 'up', { timeoutMs: 6000 })
    assert.equal((await a.node.counters.hit('rl:oom:2', 1000)).shared, true)
    assert.deepEqual(unhandled, [])
})

test('MN-112: 하트비트가 멈춘 Node는 수명 지나면 죽음', { skip: skipReason }, async (t) => {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    const proxy = await withProxy(t)
    const a = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n1', prefix, env: FAST, withIo: false })
    const b = await startRedisNode(t, { url: proxy.url, serverId: 'n2', prefix, env: FAST, withIo: false })
    await waitFor(() => a.node.nodes.isAlive('n2', b.node.bootEpoch))
    proxy.freeze()
    const ms = await waitFor(() => !a.node.nodes.isAlive('n2'), { timeoutMs: 5000 })
    assert.ok(ms >= 500, `너무 빨리 죽음 판정 ${ms}ms`)
})

test('MN-118: 같은 SERVER_ID가 살아 있으면 두 번째 켜기 거부', { skip: skipReason }, async (t) => {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n1', prefix, env: FAST, withIo: false })
    await sleep(250)
    await assert.rejects(
        startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n1', prefix, env: FAST, withIo: false }),
        { code: 'DUPLICATE_SERVER_ID' },
    )
})
