// 조각 2 진짜 Redis 통합 시험: 이 프로세스 cluster(n1) + 따로 도는 n2를 같은 Redis에 붙여 캐시 지우기·reload·카운터·live를 확인
// MN-047·035·057·058·060·062·129, npm run test:with-redis로 돎 (REDIS_URL_TEST 없으면 건너뜀)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const { REDIS_URL_TEST, skipReason, uniquePrefix, waitFor, startRedisNode, cleanupPrefix } = require('./helpers/redisNodes')
const { createRedisProxy } = require('./helpers/redisProxy')
const { quietLog } = require('../../cluster/testing/memoryCluster')
const cluster = require('../../cluster')
const sessionLifecycle = require('../../services/auth/sessionLifecycle')
const sessionCheck = require('../../socket/connection/sessionCheck')
const maintenance = require('../../services/ops/maintenance')
const liveService = require('../../services/ops/live')
const { createRateLimiter } = require('../../middlewares/rateLimit.middleware')

const FAST = { CLUSTER_HEARTBEAT_MS: '200', NODE_DEAD_AFTER_MS: '1000' }

// n1 = 이 프로세스 cluster (url은 바로 또는 중계), n2 = 진짜 Redis Node
async function realPair(t, { url = REDIS_URL_TEST } = {}) {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    await cluster.init({ env: { REDIS_URL: url, SERVER_ID: 'n1', REDIS_KEY_PREFIX: prefix, ...FAST }, log: quietLog })
    t.after(() => cluster.close())
    const { node: n2 } = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST, withIo: false })
    await waitFor(async () => { await cluster.nodes.refresh(); return cluster.nodes.isAlive('n2') })
    await n2.nodes.refresh()
    return { prefix, n2 }
}

const fakeSocket = (uuid) => ({ data: { user: { uuid, sessionId: 's' } }, emit() {}, disconnect() {} })

test('MN-047: 진짜 Redis — n2 로그아웃 방송 → n1 다음 사건이 DB 다시 봄', { skip: skipReason }, async (t) => {
    const { n2 } = await realPair(t)
    let calls = 0
    t.mock.method(sessionLifecycle, 'resolveSession', async () => { calls += 1; return { ok: false, message: '끝' } })
    const socket = fakeSocket('ri-47')
    sessionCheck.markChecked(socket, Date.now() - 1)
    assert.equal((await sessionCheck.checkForEvent(socket)).ok, true)
    assert.equal(await n2.bus.publish('auth.revoked', { uuid: 'ri-47' }), true)
    await waitFor(() => sessionCheck.__testables.revokedAt.has('ri-47'))
    assert.equal((await sessionCheck.checkForEvent(socket)).ok, false)
    assert.equal(calls, 1)
})

test('MN-035: 진짜 Redis — n2가 reload 방송 → n1이 점검 다시 읽음', { skip: skipReason }, async (t) => {
    const { n2 } = await realPair(t)
    let reloads = 0
    t.mock.method(maintenance, 'reloadMaintenance', async () => { reloads += 1 })
    await n2.bus.publish('ops.reload', { what: 'maintenance' })
    await waitFor(() => reloads === 1)
})

test('MN-060·062: 진짜 Redis — 요청 제한·틀린 횟수가 Node끼리 합쳐짐', { skip: skipReason }, async (t) => {
    const { n2 } = await realPair(t)
    await n2.counters.hit('rl:60000:2:ip:9.9.9.9', 60000)
    const limiter = createRateLimiter({ windowMs: 60000, max: 2, keyOf: (req) => `ip:${req.ip}` })
    const run = async () => {
        let status = 'next'
        const res = { status(code) { status = code; return this }, json() { return this } }
        await limiter({ ip: '9.9.9.9' }, res, () => {})
        return status
    }
    assert.equal(await run(), 'next')
    assert.equal(await run(), 429)
    const counted = await cluster.counters.hit('wrong:pw:ri-60', 60000)
    assert.deepEqual([counted.count, counted.shared], [1, true])
    assert.equal((await n2.counters.peek('wrong:pw:ri-60')).count, 1)
})

test('MN-129: 진짜 Redis — /internal/live가 두 Node 합침', { skip: skipReason }, async (t) => {
    const { n2 } = await realPair(t)
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 1, rooms: [], games: [] }))
    n2.rpc.register('ops.liveSummary', () => ({ onlineCount: 4, rooms: [{ roomId: 'r' }], games: [] }))
    const merged = await liveService.getClusterLiveSummary()
    assert.deepEqual([merged.onlineCount, merged.roomCount, merged.partial], [5, 1, false])
    assert.equal(merged.rooms[0].node, 'n2')
})

test('MN-057·058: 진짜 Redis 죽음 → 캐시 끔, 살아남 → 그 전 통과 안 믿음', { skip: skipReason }, async (t) => {
    const targetPort = Number(new URL(REDIS_URL_TEST).port || 6379)
    const proxy = await createRedisProxy({ targetPort })
    t.after(() => proxy.close())
    await realPair(t, { url: proxy.url })
    let calls = 0
    t.mock.method(sessionLifecycle, 'resolveSession', async () => { calls += 1; return { ok: true } })
    const socket = fakeSocket('ri-57')
    sessionCheck.markChecked(socket, Date.now() - 1)
    await sessionCheck.checkForEvent(socket)
    assert.equal(calls, 0)
    proxy.kill()
    await waitFor(() => cluster.state() === 'down', { timeoutMs: 5000 })
    await sessionCheck.checkForEvent(socket)
    await sessionCheck.checkForEvent(socket)
    assert.equal(calls, 2)
    proxy.restore()
    await waitFor(() => cluster.state() === 'up', { timeoutMs: 8000 })
    const before = calls
    await new Promise((resolve) => setTimeout(resolve, 5))
    await sessionCheck.checkForEvent(socket)
    await sessionCheck.checkForEvent(socket)
    assert.equal(calls, before + 1)
})
