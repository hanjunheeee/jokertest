// Node 여러 개 기반 단위 시험: 메모리 받침(memoryCluster)으로 버스·RPC·하트비트·디렉터리·카운터 약속 확인
// Redis 없이 npm test에서 돎 (진짜 Redis 시험은 redis.integration.test.js)
const test = require('node:test')
const assert = require('node:assert/strict')

const { createMemoryHub } = require('../../cluster/testing/memoryCluster')
const { parseMessage } = require('../../cluster/bus')

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

// 조건이 될 때까지 기다림 (시험 여럿이 같이 돌아 느려도 안 깨지게, 고정 시간 대신)
async function waitFor(check, timeoutMs = 3000) {
    const started = Date.now()
    while (!(await check())) {
        if (Date.now() - started > timeoutMs) throw new Error('waitFor 시간 초과')
        await tick(5)
    }
}

async function twoNodes(t, env = {}) {
    const hub = createMemoryHub()
    t.after(() => hub.close())
    const n1 = await hub.startNode('n1', { env })
    const n2 = await hub.startNode('n2', { env })
    await n1.nodes.refresh()
    await n2.nodes.refresh()
    return { hub, n1, n2 }
}

test('MN-056: 틀린 모양·다른 v·모르는 type·내가 보낸 것은 무시', async (t) => {
    assert.equal(parseMessage('not json', 'n1'), null)
    assert.equal(parseMessage(JSON.stringify([1]), 'n1'), null)
    assert.equal(parseMessage(JSON.stringify({ v: 2, type: 'ops.reload', from: 'n2', at: 1 }), 'n1'), null)
    assert.equal(parseMessage(JSON.stringify({ v: 1, type: 'ops.reload', from: 'n1', at: 1 }), 'n1'), null)
    assert.equal(parseMessage(JSON.stringify({ v: 1, type: '', from: 'n2', at: 1 }), 'n1'), null)
    assert.equal(parseMessage(JSON.stringify({ v: 1, type: 'ops.reload', from: 'n2' }), 'n1'), null)
    assert.equal(parseMessage('x'.repeat(600 * 1024), 'n1'), null)
    assert.equal(parseMessage(JSON.stringify({ v: 1, type: 'ops.reload', from: 'n2', at: 1 }), 'n1').type, 'ops.reload')

    const { n1, n2 } = await twoNodes(t)
    const got = []
    n2.bus.on('ops.reload', (msg) => got.push(msg))
    n1.bus.on('ops.reload', () => got.push('self'))
    // 처리기 없는 type은 조용히 버림, 처리기가 던져도 다른 처리기는 돎
    n2.bus.on('ops.reload', () => { throw new Error('boom') })
    assert.equal(await n1.bus.publish('future.type', { a: 1 }), true)
    assert.equal(await n1.bus.publish('ops.reload', { what: 'maintenance', from: 'fake', v: 9 }), true)
    await waitFor(() => got.length >= 1)
    await tick(30)
    assert.equal(got.length, 1)
    assert.deepEqual({ ...got[0], at: 0 }, { v: 1, type: 'ops.reload', from: 'n1', at: 0, what: 'maintenance' })
})

test('MN-132: RPC 오류 모양 — 시간 초과·모르는 메서드·없는 Node·처리기 오류', async (t) => {
    const { n1, n2 } = await twoNodes(t)
    n2.rpc.register('slow', () => new Promise(() => {}))
    n2.rpc.register('fail', () => { throw Object.assign(new Error('secret inside'), { code: 'ROOM_FULL' }) })
    n2.rpc.register('ok', (args, ctx) => ({ args, from: ctx.from }))

    assert.deepEqual(await n1.rpc.call('n2', 'ok', { a: 1 }), { args: { a: 1 }, from: 'n1' })
    await assert.rejects(n1.rpc.call('n2', 'slow', null, { timeoutMs: 30 }), { code: 'RPC_TIMEOUT', node: 'n2', method: 'slow' })
    await assert.rejects(n1.rpc.call('n2', 'nope'), { code: 'RPC_UNKNOWN_METHOD', node: 'n2' })
    await assert.rejects(n1.rpc.call('n9', 'ok'), { code: 'NODE_UNAVAILABLE', node: 'n9' })
    const failed = await n1.rpc.call('n2', 'fail').catch((error) => error)
    assert.equal(failed.code, 'RPC_FAILED')
    assert.equal(failed.remoteCode, 'ROOM_FULL')
    assert.ok(!failed.message.includes('secret inside'))
    // 나 자신은 Redis 없이 바로
    n1.rpc.register('ok', () => 'local')
    assert.equal(await n1.rpc.call('n1', 'ok'), 'local')
})

test('RPC callAll: 전 Node 답 합침, down이면 내 Node만 + partial', async (t) => {
    const { hub, n1, n2 } = await twoNodes(t)
    n1.rpc.register('who', () => 'n1')
    n2.rpc.register('who', () => 'n2')
    const all = await n1.rpc.callAll('who')
    assert.equal(all.partial, false)
    assert.deepEqual(all.results.map((r) => r.value).sort(), ['n1', 'n2'])

    hub.setDown(true)
    const down = await n1.rpc.callAll('who')
    assert.equal(down.partial, true)
    assert.deepEqual(down.results, [{ node: 'n1', ok: true, value: 'n1' }])
    await assert.rejects(n1.rpc.call('n2', 'who'), { code: 'CLUSTER_UNAVAILABLE' })
})

test('down이 되면 기다리던 RPC가 시간 초과 전에 바로 끝남', async (t) => {
    const { hub, n1, n2 } = await twoNodes(t)
    n2.rpc.register('slow', () => new Promise(() => {}))
    const started = Date.now()
    const pending = n1.rpc.call('n2', 'slow', null, { timeoutMs: 5000 })
    await tick()
    hub.setDown(true)
    await assert.rejects(pending, { code: 'CLUSTER_UNAVAILABLE' })
    assert.ok(Date.now() - started < 1000)
})

test('디렉터리: 쓰기·주인 찾기·CAS 지우기·NX·down이면 available:false', async (t) => {
    const { hub, n1, n2 } = await twoNodes(t)
    const key = n1.directory.keys.loc('u1')
    assert.equal(key, 'mmc:loc:u1')
    assert.equal(await n1.directory.write(key, { node: 'n1', bootEpoch: n1.bootEpoch, kind: 'room', id: 'r1' }, { ttlMs: 60000 }), true)
    const found = await n2.directory.locate(key)
    assert.deepEqual({ ...found, value: found.value.id }, { available: true, value: 'r1', node: 'n1', alive: true, self: false })
    // 남이 지우려 하면 안 지워짐 (CAS)
    assert.equal(await n2.directory.removeIfOwned(key), false)
    // 같은 이름 다른 부팅 값은 살아 있다고 안 봄
    await n1.directory.write(key, { node: 'n1', bootEpoch: 'old-boot' }, { ttlMs: 60000 })
    assert.equal((await n2.directory.locate(key)).alive, false)
    await n1.directory.write(key, { node: 'n1', bootEpoch: n1.bootEpoch }, { ttlMs: 60000 })
    assert.equal(await n1.directory.removeIfOwned(key), true)
    assert.deepEqual(await n2.directory.read(key), { available: true, value: null })

    const code = n1.directory.keys.roomcode('ABCD')
    assert.equal(await n1.directory.write(code, 'room-1', { ttlMs: 60000, nx: true }), true)
    assert.equal(await n2.directory.write(code, 'room-2', { ttlMs: 60000, nx: true }), false)
    assert.equal(await n2.directory.removeIfValue(code, 'room-2'), false)
    assert.equal(await n1.directory.removeIfValue(code, 'room-1'), true)
    // game:<id> = 글자 node
    await n2.directory.write(n2.directory.keys.game('g1'), 'n2', { ttlMs: 60000 })
    assert.equal((await n1.directory.locate(n1.directory.keys.game('g1'))).node, 'n2')
    assert.equal(await n1.directory.nextSeq(n1.directory.keys.connseq('u1')), 1)
    assert.equal(await n2.directory.nextSeq(n2.directory.keys.connseq('u1')), 2)

    hub.setDown(true)
    assert.deepEqual(await n1.directory.locate(key), { available: false, value: null, node: null, alive: false, self: false })
    assert.equal(await n1.directory.write(key, { node: 'n1' }, { ttlMs: 1000 }), false)
    assert.equal(await n1.directory.nextSeq(n1.directory.keys.connseq('u1')), null)
})

test('디렉터리: 켤 때 옛 부팅이 쓴 키만 지움 (남이 덮은 값은 그대로)', async (t) => {
    const hub = createMemoryHub()
    t.after(() => hub.close())
    const old = await hub.startNode('n1', { bootEpoch: 'boot-1' })
    const other = await hub.startNode('n2')
    await old.directory.write('mmc:loc:a', { node: 'n1', bootEpoch: 'boot-1' }, { ttlMs: 60000 })
    await old.directory.write('mmc:loc:b', { node: 'n1', bootEpoch: 'boot-1' }, { ttlMs: 60000 })
    await other.directory.write('mmc:loc:b', { node: 'n2', bootEpoch: other.bootEpoch }, { ttlMs: 60000 })
    await old.close()
    await hub.startNode('n1', { bootEpoch: 'boot-2' })
    assert.equal((await other.directory.read('mmc:loc:a')).value, null)
    assert.equal((await other.directory.read('mmc:loc:b')).value.node, 'n2')
})

test('카운터: Node끼리 합쳐 셈, down이면 메모리(shared:false), reset', async (t) => {
    const { hub, n1, n2 } = await twoNodes(t)
    const first = await n1.counters.hit('rl:login:1.2.3.4', 60000)
    assert.equal(first.count, 1)
    assert.equal(first.shared, true)
    assert.ok(first.ttlMs > 59000 && first.ttlMs <= 60000)
    assert.equal((await n2.counters.hit('rl:login:1.2.3.4', 60000)).count, 2)
    assert.equal((await n1.counters.peek('rl:login:1.2.3.4')).count, 2)
    assert.equal(await n1.counters.reset('rl:login:1.2.3.4'), true)
    assert.equal((await n2.counters.peek('rl:login:1.2.3.4')).count, 0)
    hub.setDown(true)
    const local = await n1.counters.hit('wrong:pw:u1', 60000)
    assert.deepEqual([local.count, local.shared], [1, false])
    assert.equal((await n1.counters.hit('wrong:pw:u1', 60000)).count, 2)
    assert.equal((await n2.counters.hit('wrong:pw:u1', 60000)).count, 1)
})

test('MN-112: 하트비트가 끊긴 Node는 죽음 판정 (수명 지나면 목록에서 빠짐)', async (t) => {
    const env = { CLUSTER_HEARTBEAT_MS: '40', NODE_DEAD_AFTER_MS: '120' }
    const hub = createMemoryHub()
    t.after(() => hub.close())
    const n1 = await hub.startNode('n1', { env })
    const n2 = await hub.startNode('n2', { env })
    await waitFor(() => n1.nodes.isAlive('n2'))
    assert.equal(n1.nodes.isAlive('n2', n2.bootEpoch), true)
    assert.equal(n1.nodes.isAlive('n2', 'other-boot'), false)
    assert.deepEqual(n1.nodes.list().map((n) => n.id), ['n1', 'n2'])
    // 멈춘 프로세스 흉내: n3 하트비트를 한 번만 쓰고 더 안 씀 → 수명(120ms) 지나면 n1이 죽음으로 봄
    await hub.backend().ops.heartbeat('mmc:node:n3', 'mmc:nodes', 'n3', { bootEpoch: 'b3', lastSeen: Date.now() }, 120)
    await waitFor(() => n1.nodes.isAlive('n3'))
    await waitFor(() => !n1.nodes.isAlive('n3'))
    assert.deepEqual(await hub.backend().ops.smembers('mmc:nodes').then((ids) => ids.sort()), ['n1', 'n2'])
    // 깔끔히 끈 Node는 hash를 바로 지움
    await n2.close()
    await waitFor(() => n1.nodes.ids().length === 1)
    assert.deepEqual(n1.nodes.ids(), ['n1'])
})

test('하트비트 hash 모양 (4-2장) + draining 표시', async (t) => {
    const hub = createMemoryHub()
    t.after(() => hub.close())
    const n1 = await hub.startNode('n1', { statsProvider: () => ({ games: 3, rooms: 2, online: 9, loopP95: 4.5 }) })
    n1.nodes.setDraining(true)
    const ops = hub.backend().ops
    await waitFor(async () => (await ops.hgetall('mmc:node:n1')).draining === '1')
    const hash = await ops.hgetall('mmc:node:n1')
    assert.deepEqual(Object.keys(hash).sort(), ['bootEpoch', 'draining', 'games', 'lastSeen', 'loopP95', 'online', 'rooms', 'startedAt', 'version'])
    assert.equal(hash.draining, '1')
    assert.equal(hash.games, '3')
    assert.equal(n1.nodes.isDraining(), true)
})

test('MN-118: 같은 SERVER_ID가 살아 있으면 두 번째 켜기 거부, 죽은 흔적이면 이어받음', async (t) => {
    const env = { CLUSTER_HEARTBEAT_MS: '30', NODE_DEAD_AFTER_MS: '5000' }
    const hub = createMemoryHub()
    t.after(() => hub.close())
    await hub.startNode('n1', { env })
    await waitFor(async () => Boolean((await hub.backend().ops.hgetall('mmc:node:n1')).bootEpoch))
    await tick(40)
    await assert.rejects(hub.startNode('n1', { env }), { code: 'DUPLICATE_SERVER_ID' })
    // 옛 프로세스가 죽어 하트비트가 멈춘 흔적(hash는 아직 수명 안)이면 기다린 뒤 이어받음
    const ops = hub.backend().ops
    await ops.heartbeat('mmc:node:n3', 'mmc:nodes', 'n3', { bootEpoch: 'dead-boot', lastSeen: 1 }, 5000)
    const n3 = await hub.startNode('n3', { env })
    assert.equal(n3.state(), 'up')
})

test('MN-103: Redis가 비면(재시작) 하트비트가 알아채고 다시 맞추기 처리기를 부름', async (t) => {
    const env = { CLUSTER_HEARTBEAT_MS: '30' }
    const hub = createMemoryHub()
    t.after(() => hub.close())
    const n1 = await hub.startNode('n1', { env })
    const n2 = await hub.startNode('n2', { env })
    let n1Runs = 0
    let n2Runs = 0
    n1.onResync(() => { n1Runs += 1 })
    n2.onResync(() => { n2Runs += 1 })
    await waitFor(() => n1.nodes.isAlive('n2'))
    hub.flush()
    await waitFor(() => n1Runs === 1 && n2Runs === 1)
    await tick(600)
    assert.equal(n1Runs, 1)
    assert.equal(n2Runs, 1)
})

test('down → up이면 다시 맞추기, 처음 켤 때는 안 부름', async (t) => {
    const { hub, n1 } = await twoNodes(t)
    const states = []
    let runs = 0
    n1.onStateChange((next) => states.push(next))
    n1.onResync(() => { runs += 1 })
    hub.setDown(true)
    hub.setDown(false)
    await waitFor(() => runs === 1)
    await tick(600)
    assert.deepEqual(states, ['down', 'up'])
    assert.equal(runs, 1)
})
