// Redis 잠깐 끊김 이상한 순서 시험 (진짜 Redis): 보낸 명령이 Redis에선 처리됐는데 답만 못 받고 끊긴 순간, 다시 붙은 뒤 두 번 처리되는지
// 중계로 "답만 삼키기·보낸 것 붙잡기·끊고 바로 다시 받기"를 만들어 RPC·카운터·어댑터 알림·버스 알림이 한 번만 가는지 봄 (REDIS_URL_TEST 없으면 건너뜀)
const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')

const {
    REDIS_URL_TEST, skipReason, uniquePrefix, waitFor,
    startRedisNode, connectUser, trackUnhandled, cleanupPrefix, withAdminClient,
} = require('./helpers/redisNodes')

const targetPort = REDIS_URL_TEST ? Number(new URL(REDIS_URL_TEST).port || 6379) : 0

// 이 파일 전용 중계: 공용 중계(redisProxy)는 양쪽을 같이 멈춰서 "Redis는 처리했는데 답만 사라짐"을 못 만듦
// - swallow(): 보내는 쪽은 Redis로 그대로, Redis 답·밀어주기만 버림 (처리 뒤 답 잃음)
// - hold(): 보내는 쪽을 중계에 붙잡아 둠 (Redis가 아직 못 받음), cut 하면 붙잡은 것도 사라짐
// - cut(): 붙은 연결 전부 끊음 / restore(): 다시 정상 (끊은 뒤 바로 부르면 다시 붙기 첫 시도가 성공함)
async function createCutProxy(port) {
    let mode = 'ok'
    const pairs = new Set()
    const server = net.createServer((client) => {
        if (mode === 'dead') { client.destroy(); return }
        const upstream = net.connect(port, '127.0.0.1')
        const pair = { client, upstream, held: [] }
        pairs.add(pair)
        const drop = () => { pairs.delete(pair); client.destroy(); upstream.destroy() }
        for (const side of [client, upstream]) { side.on('error', drop); side.on('close', drop) }
        client.on('data', (chunk) => { if (mode === 'hold') pair.held.push(chunk); else upstream.write(chunk) })
        upstream.on('data', (chunk) => { if (mode === 'ok') client.write(chunk) })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return {
        url: `redis://127.0.0.1:${server.address().port}`,
        swallow() { mode = 'swallow' },
        hold() { mode = 'hold' },
        heldText: () => [...pairs].map((p) => Buffer.concat(p.held).toString('utf8')).join(''),
        cut() {
            for (const { client, upstream } of pairs) { client.destroy(); upstream.destroy() }
            pairs.clear()
        },
        restore() { mode = 'ok' },
        async close() {
            mode = 'dead'
            this.cut()
            await new Promise((resolve) => server.close(() => resolve()))
        },
    }
}

// n1은 내 중계로, n2는 Redis 바로 (끊김은 n1 쪽만)
async function pairWithCut(t, { withIo = false } = {}) {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    const proxy = await createCutProxy(targetPort)
    t.after(() => proxy.close())
    const a = await startRedisNode(t, { url: proxy.url, serverId: 'n1', prefix, withIo })
    const b = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, withIo })
    // 정리 고리는 먼저 단 것부터 돎 → Node를 끈 뒤에 한 번 더 지움 (끄기 전 하트비트가 다시 쓴 키)
    t.after(() => cleanupPrefix(prefix))
    await a.node.nodes.refresh()
    await b.node.nodes.refresh()
    return { prefix, proxy, a, b }
}

// 끊고 바로 다시 받음 → n1이 down 됐다가 다시 up 될 때까지 기다림
// (끊김 사건은 다음 차례에 와서 바로 보면 아직 up일 수 있음 → down을 본 뒤의 up만 셈)
async function blip(proxy, node) {
    let sawDown = false
    const off = node.onStateChange((next) => { if (next === 'down') sawDown = true })
    try {
        proxy.cut()
        proxy.restore()
        await waitFor(() => sawDown && node.state() === 'up', { timeoutMs: 8000 })
    } finally {
        off()
    }
}

// [겹침: 동시 요청 + Redis 끊김 + 다시 붙은 뒤 다시 보냄]
test('Redis 답만 잃고 끊긴 순간 보낸 RPC → 다시 붙은 뒤에도 n2 처리기는 한 번만 돎 (부른 쪽 결과와 상관없이 두 번 처리 없음)', { skip: skipReason, timeout: 30000 }, async (t) => {
    const unhandled = trackUnhandled(t)
    const { proxy, a, b } = await pairWithCut(t)
    let calls = 0
    b.node.rpc.register('odd.count', () => { calls += 1; return calls })
    b.node.rpc.register('odd.ping', () => 'pong')
    assert.equal(await a.node.rpc.call('n2', 'odd.ping'), 'pong')

    proxy.swallow()
    const pending = a.node.rpc.call('n2', 'odd.count', {}).then((v) => ({ ok: true, v }), (e) => ({ ok: false, code: e.code }))
    // Redis가 받아 n2가 처리함 (답은 n1에 못 옴)
    await waitFor(() => calls === 1)
    await blip(proxy, a.node)
    const outcome = await pending

    // 같은 연결 순서: 다시 보낸 요청이 있었다면 이 ping보다 먼저 n2에 닿음
    await waitFor(async () => (await a.node.rpc.call('n2', 'odd.ping').catch(() => null)) === 'pong')
    assert.equal(calls, 1, `n2 처리기 ${calls}번 돎 (부른 쪽 결과 ${JSON.stringify(outcome)})`)
    assert.deepEqual(unhandled, [])
})

// [겹침: Redis 끊김 + 다시 붙은 뒤 다시 보냄 → 요청 제한 두 번 셈]
test('Redis 답만 잃고 끊긴 순간 한 번 센 요청 제한 → 다시 붙은 뒤 Redis 값은 1 (두 번 안 셈)', { skip: skipReason, timeout: 30000 }, async (t) => {
    const { prefix, proxy, a } = await pairWithCut(t)
    const key = 'rl:odd:blip'
    const readRaw = () => withAdminClient((c) => c.get(`${prefix}:${key}`))

    proxy.swallow()
    const pending = a.node.counters.hit(key, 60000)
    await waitFor(async () => (await readRaw()) === '1')
    await blip(proxy, a.node)
    const first = await pending

    // 다시 보낸 INCR이 있었다면 이 peek보다 먼저 처리됨
    const after = await a.node.counters.peek(key)
    assert.equal(after.shared, true)
    assert.equal(after.count, 1, `한 번 셌는데 Redis 값 ${after.count} (그때 받은 답 ${JSON.stringify(first)})`)
})

// [겹침: 다른 서버 사람에게 보내는 알림 + Redis 끊김 + 다시 보냄]
test('Redis 답만 잃고 끊긴 순간 n1이 보낸 계정 채널 알림 → n2에 붙은 사람은 한 번만 받음', { skip: skipReason, timeout: 30000 }, async (t) => {
    const unhandled = trackUnhandled(t)
    const { proxy, a, b } = await pairWithCut(t, { withIo: true })
    const user = await connectUser(t, b.port, 'u-odd')
    const count = (event) => user.received.filter((r) => r.event === event).length
    // 길 확인: n1 → n2 사람
    await waitFor(async () => {
        a.io.to('user:u-odd').emit('warm', 1)
        await new Promise((r) => setTimeout(r, 50))
        return count('warm') > 0
    })

    proxy.swallow()
    a.io.to('user:u-odd').emit('note', { id: 1 })
    // Redis가 publish를 처리해 n2 사람이 받음 (n1은 답 못 받음)
    await waitFor(() => count('note') === 1)
    await blip(proxy, a.node)

    // 다시 보낸 publish가 있었다면 표시 알림보다 먼저 감 (어댑터 보내기 연결이 다시 붙을 때까지 되풀이)
    await waitFor(async () => {
        a.io.to('user:u-odd').emit('mark', 1)
        await new Promise((r) => setTimeout(r, 50))
        return count('mark') > 0
    })
    assert.equal(count('note'), 1, `알림 하나를 ${count('note')}번 받음`)
    assert.deepEqual(unhandled, [])
})

// [겹침: Redis 멈춤(보낸 것이 아직 안 닿음) + 끊김 + 다시 붙음 → 사라짐·두 번 둘 다 없어야 함]
test('Redis에 닿기 전 붙잡힌 버스 알림이 끊김과 겹침 → n2는 많아야 한 번 받고, 보냈다(true)면 꼭 받음', { skip: skipReason, timeout: 30000 }, async (t) => {
    const unhandled = trackUnhandled(t)
    const { proxy, a, b } = await pairWithCut(t)
    const got = []
    b.node.bus.on('odd.note', (msg) => got.push(msg.n))
    b.node.rpc.register('odd.ping', () => 'pong')

    proxy.hold()
    const sent = a.node.bus.publish('odd.note', { n: 1 })
    await waitFor(() => proxy.heldText().includes('odd.note'))
    await blip(proxy, a.node)
    const ok = await sent

    await waitFor(async () => (await a.node.rpc.call('n2', 'odd.ping').catch(() => null)) === 'pong')
    assert.ok(got.length <= 1, `알림 하나를 ${got.length}번 받음`)
    if (ok) assert.equal(got.length, 1, 'publish가 true인데 n2가 못 받음 (사라짐)')
    assert.deepEqual(unhandled, [])
})
