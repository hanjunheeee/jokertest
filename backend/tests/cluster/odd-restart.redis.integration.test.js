// 서버 다시 켜짐 이상한 순서 시험 (진짜 Redis): 같은 이름 두 대가 같은 순간 켜짐, 판 도중 강제 종료 뒤 같은 이름으로 다시 켜짐
// 같은 SERVER_ID 막기·옛 부팅 키 정리·다른 Node가 덮은 키 지키기·꺼진 사이 RPC가 바로 끝나는지 봄 (REDIS_URL_TEST 없으면 건너뜀)
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

const {
    REDIS_URL_TEST, skipReason, uniquePrefix, waitFor,
    startRedisNode, cleanupPrefix,
} = require('./helpers/redisNodes')
const { createRedisProxy } = require('./helpers/redisProxy')

const targetPort = REDIS_URL_TEST ? Number(new URL(REDIS_URL_TEST).port || 6379) : 0
// 하트비트 0.2초·죽음 판정 3초 (같은 이름 검사는 하트비트+0.5초 기다림, 판정 수명 안에 다시 켜기)
const FAST = { CLUSTER_HEARTBEAT_MS: '200', NODE_DEAD_AFTER_MS: '3000', CLUSTER_CONNECT_WAIT_MS: '400' }

// 강제 종료 흉내 (SIGKILL): 하트비트 hash·디렉터리 키를 안 지우고 Redis 연결만 끊음
async function killHard(started) {
    await started.backend.close()
    await waitFor(() => started.node.state() === 'down')
}

// 판 도중 n2가 쓴 키 묶음 (판 = Node 이름 글자, 사람 위치·방 = node+bootEpoch 객체)
async function writeGameKeys(n2, { gameId, roomId, stay, moved }) {
    const k = n2.directory.keys
    const owner = { node: 'n2', bootEpoch: n2.bootEpoch }
    const ttlMs = 60000
    assert.equal(await n2.directory.write(k.game(gameId), 'n2', { ttlMs }), true)
    assert.equal(await n2.directory.write(k.room(roomId), { ...owner, code: 'ODD1', instanceId: roomId }, { ttlMs }), true)
    assert.equal(await n2.directory.write(k.loc(stay), { ...owner, roomId, gameId }, { ttlMs }), true)
    assert.equal(await n2.directory.write(k.loc(moved), { ...owner, roomId, gameId }, { ttlMs }), true)
}

// [겹침: 같은 이름 두 대 + 같은 순간 켜기]
test('같은 SERVER_ID 두 대를 같은 순간 켜면 → 하나만 켜지고 다른 하나는 DUPLICATE_SERVER_ID', { skip: skipReason, timeout: 30000 }, async (t) => {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    const results = await Promise.allSettled([
        startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'dup', prefix, env: FAST, withIo: false }),
        startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'dup', prefix, env: FAST, withIo: false }),
    ])
    // 정리 고리는 먼저 단 것부터 돎 → Node를 끈 뒤에 한 번 더 지움
    t.after(() => cleanupPrefix(prefix))
    const rejected = results.filter((r) => r.status === 'rejected')
    assert.equal(rejected.length, 1, `켜진 수 ${results.length - rejected.length} (둘 다 켜지면 한 이름 RPC 채널·하트비트를 둘이 나눠 씀)`)
    assert.equal(rejected[0].reason?.code, 'DUPLICATE_SERVER_ID')
})

// [겹침: 판 도중 강제 종료 + 그사이 다른 Node가 키를 덮음 + 같은 이름 다시 켜기 + 그사이 RPC]
test('판 도중 n2 강제 종료 → 꺼진 사이 RPC는 바로 실패, 같은 이름으로 다시 켜면 옛 부팅 키만 지우고 n1이 덮은 위치는 그대로', { skip: skipReason, timeout: 30000 }, async (t) => {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    const a = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n1', prefix, env: FAST, withIo: false })
    const b = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST, withIo: false, bootEpoch: crypto.randomUUID() })
    b.node.rpc.register('odd.ping', () => 'old')
    await a.node.nodes.refresh()
    const ids = { gameId: crypto.randomUUID(), roomId: crypto.randomUUID(), stay: crypto.randomUUID(), moved: crypto.randomUUID() }
    await writeGameKeys(b.node, ids)
    const k = a.node.directory.keys

    await killHard(b)
    // 그사이 moved 사람은 n1으로 옮김 (n1이 위치를 덮음)
    assert.equal(await a.node.directory.write(k.loc(ids.moved), { node: 'n1', bootEpoch: a.node.bootEpoch }, { ttlMs: 60000 }), true)
    // 꺼진 n2에 묻기: 받을 구독자 0 → 시간 초과(1.5초) 기다리지 않고 바로
    const askedAt = Date.now()
    await assert.rejects(a.node.rpc.call('n2', 'odd.ping'), { code: 'NODE_UNAVAILABLE' })
    assert.ok(Date.now() - askedAt < 1000, `꺼진 Node RPC가 ${Date.now() - askedAt}ms 걸림`)

    const b2 = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST, withIo: false, bootEpoch: crypto.randomUUID() })
    t.after(() => cleanupPrefix(prefix))
    b2.node.rpc.register('odd.ping', () => 'new')
    await waitFor(async () => {
        await a.node.nodes.refresh()
        return a.node.nodes.list().some((n) => n.id === 'n2' && n.bootEpoch === b2.node.bootEpoch)
    })

    // 옛 부팅이 쓴 판·방·위치는 지워짐, n1이 덮은 위치는 그대로
    assert.equal((await a.node.directory.read(k.game(ids.gameId))).value, null)
    assert.equal((await a.node.directory.read(k.room(ids.roomId))).value, null)
    assert.equal((await a.node.directory.read(k.loc(ids.stay))).value, null)
    assert.equal((await a.node.directory.read(k.loc(ids.moved))).value?.node, 'n1')
    assert.equal(await a.node.rpc.call('n2', 'odd.ping'), 'new')
})

// [겹침: 판 도중 강제 종료 + 다시 켤 때 Redis 끊김(켤 때 정리 못 함) + 살아남]
test('판 도중 n2 강제 종료 → Redis 끊긴 채 같은 이름으로 다시 켬 → Redis 붙은 뒤 n1은 옛 판을 "살아 있음"으로 안 봄', { skip: skipReason, timeout: 30000 }, async (t) => {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    const a = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n1', prefix, env: FAST, withIo: false })
    const b = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST, withIo: false, bootEpoch: crypto.randomUUID() })
    const ids = { gameId: crypto.randomUUID(), roomId: crypto.randomUUID(), stay: crypto.randomUUID(), moved: crypto.randomUUID() }
    await writeGameKeys(b.node, ids)
    const k = a.node.directory.keys
    await killHard(b)

    // 새 n2: 켤 때 Redis에 못 붙음 → down으로 켜짐 (켤 때 정리·같은 이름 검사를 못 함)
    const proxy = await createRedisProxy({ targetPort })
    t.after(() => proxy.close())
    proxy.kill()
    const b2 = await startRedisNode(t, { url: proxy.url, serverId: 'n2', prefix, env: FAST, withIo: false, bootEpoch: crypto.randomUUID() })
    t.after(() => cleanupPrefix(prefix))
    assert.equal(b2.node.state(), 'down')
    proxy.restore()
    await waitFor(() => b2.node.state() === 'up', { timeoutMs: 8000 })
    await waitFor(async () => {
        await a.node.nodes.refresh()
        return a.node.nodes.list().some((n) => n.id === 'n2' && n.bootEpoch === b2.node.bootEpoch)
    })

    // 옛 부팅 판 키: 지워졌거나, 남았어도 n1이 살아 있다고 보면 안 됨 (새 n2에는 그 판이 없음)
    const game = await a.node.directory.locate(k.game(ids.gameId))
    assert.equal(game.value === null || game.alive === false, true,
        `옛 부팅 판 키 값 ${JSON.stringify(game.value)}·alive ${game.alive} (새 n2에 없는 판을 살아 있다고 봄)`)
    // 위치·방은 bootEpoch가 달라 살아 있지 않음 (이건 지금도 맞아야 함)
    assert.equal((await a.node.directory.locate(k.room(ids.roomId))).alive, false)
    assert.equal((await a.node.directory.locate(k.loc(ids.stay))).alive, false)
})
