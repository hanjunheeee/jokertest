'use strict'

// 서버 여러 대 진짜 Redis 시험 — Redis 없음·켤 때 없음·죽음·멈춤·살아남·같은 이름 서버·하트비트 끊김 때 Node가 어떻게 버티는지 겉 결과로 봄
// 목록 A17-B-101~126 (docs/게임_의도_2026-11-15/시험목록/A17-서버-여러대.md "Redis 상태 · 죽음 · 멈춤 · 살아남"), 114~116은 시험 DB도 씀 (주소 없으면 그 셋만 건너뜀)
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const http = require('node:http')
const net = require('node:net')

// a17-world가 맨 위에서 DB 주소를 막음 → 그 뒤에 시험 DB 주소를 다시 넣어야 models가 시험 DB로 감
const W = require('./a17-world')
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL || ''
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const express = require('express')
const RN = require('./helpers/redisNodes')
const { createRedisProxy } = require('./helpers/redisProxy')
const { listenOnFetchablePort } = require('../helpers/fetchablePort')
// /health 경로는 안에서 늦게 require("../cluster")·require("../models")를 부름 → 이 파일 캐시 것이 나옴
// 그래서 /health 시험(101~105)은 이 파일의 cluster를 n1로 켬
const cluster = require('../../cluster')
const models = require('../../models')
const { quietLog } = require('../../cluster/testing/memoryCluster')

const { REDIS_URL_TEST, skipReason, sleep, waitFor, cleanupPrefix, withAdminClient, startRedisNode, connectUser, trackUnhandled } = RN
const targetPort = REDIS_URL_TEST ? Number(new URL(REDIS_URL_TEST).port || 6379) : 0

// Node마다 따로 불러 둔 backend 묶음 (점검·금지어·판 골드·요청 제한·Node 목록은 그 묶음 것을 써야 그 Node 값이 보임)
const EXTRA = [
    'services/ops/maintenance',
    'services/ops/bannedWords',
    'services/ops/gameSettings',
    'middlewares/rateLimit.middleware',
    'services/ops/clusterOps',
]
const B = REDIS_URL_TEST
    ? { n1: W.loadBundle({ extra: EXTRA, databaseUrl: TEST_DB_URL || null }), n2: W.loadBundle({ extra: EXTRA, databaseUrl: TEST_DB_URL || null }) }
    : null

const OPTS = { skip: skipReason, timeout: 30000 }
// 하트비트 0.2초 (진짜 Redis라 30ms는 너무 잦음)
const FAST = { CLUSTER_HEARTBEAT_MS: '200' }

// 내 시험만의 키 앞머리 (같은 Redis를 쓰는 다른 에이전트 키와 안 섞이게, 끝에 지움)
const newPrefix = () => `a17-${crypto.randomUUID().slice(0, 8)}`

// ── 시험 DB (114~116) ──
const migrationRunner = require('../../db/migrationRunner')
const { MIGRATIONS } = require('../../scripts/migrate-db')
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb')
const schema = buildManagedSchema({
    baseline: require('../../db/migrations/0001-legacy-baseline'),
    addRefreshTokenHistory: require('../../db/migrations/0004-add-refresh-token-history'),
    addSocialAuth: require('../../db/migrations/0005-add-social-auth'),
    migrationRunner,
})

test.before(async () => {
    if (!TEST_DB_URL || !REDIS_URL_TEST) return
    await resetManagedSchema(models.sequelize, TEST_DB_URL, schema)
    await migrationRunner.applyMigrations({ sequelize: models.sequelize, migrations: MIGRATIONS })
})

test.after(async () => {
    await models.sequelize.close().catch(() => {})
})

// 시험 DB 주소가 없으면 그 시험만 건너뜀
const noDb = (t) => {
    if (TEST_DB_URL) return false
    t.skip('F01_TEST_DATABASE_URL 없음 — with-lock.sh testdb와 .env.testdb로 돌림')
    return true
}

// ── 판 차리기 ──

// n1·n2를 Node마다 중계 하나씩 두고 켬 (중계를 끊으면 그 Node만 Redis 죽음·멈춤)
async function pair(t, { env = {} } = {}) {
    const prefix = newPrefix()
    const p = { n1: await createRedisProxy({ targetPort }), n2: await createRedisProxy({ targetPort }) }
    const w = await W.startNodes(t, B, { redisUrls: { n1: p.n1.url, n2: p.n2.url }, prefix, env: { ...FAST, ...env } })
    // 정리 고리는 먼저 단 것부터 → Node 끈 뒤 중계 닫고 키 지움
    t.after(async () => {
        await p.n1.close()
        await p.n2.close()
        await cleanupPrefix(prefix)
    })
    return { w, p, prefix }
}

// cluster 부품만 있는 Node 둘 (진짜 socket.io + 어댑터), 중계 둘
async function rawPair(t, { env = FAST, withIo = true } = {}) {
    const prefix = newPrefix()
    const p1 = await createRedisProxy({ targetPort })
    const p2 = await createRedisProxy({ targetPort })
    t.after(async () => { await p1.close(); await p2.close(); await cleanupPrefix(prefix) })
    const a = await startRedisNode(t, { url: p1.url, serverId: 'n1', prefix, env, withIo })
    const b = await startRedisNode(t, { url: p2.url, serverId: 'n2', prefix, env, withIo })
    t.after(() => cleanupPrefix(prefix))
    await waitFor(async () => {
        await a.node.nodes.refresh()
        await b.node.nodes.refresh()
        return a.node.nodes.isAlive('n2') && b.node.nodes.isAlive('n1')
    })
    return { prefix, p1, p2, a, b }
}

// 이 파일 캐시 cluster를 n1로 켬 (/health가 보는 것)
async function selfNode(t, { url, prefix, env = {} }) {
    await cluster.init({ env: { REDIS_URL: url, SERVER_ID: 'n1', REDIS_KEY_PREFIX: prefix, ...FAST, ...env }, log: quietLog })
    t.after(() => cluster.close())
}

// /health 서버 (DB SELECT 1은 됨으로 바꿔 끼움) → 부르면 답 본문
async function healthServer(t) {
    t.mock.method(models.sequelize, 'query', async () => [[{ 1: 1 }]])
    const app = express()
    app.use('/health', require('../../routes/health.routes'))
    const server = http.createServer(app)
    const { url } = await listenOnFetchablePort(server)
    t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()) }))
    return async () => {
        const res = await fetch(`${url}/health`)
        return { status: res.status, body: await res.json() }
    }
}

// 상태가 될 때까지 걸린 ms (시간 넘으면 오류)
const timeUntil = (check, timeoutMs = 8000) => waitFor(check, { timeoutMs, stepMs: 20 })
// 시간 안에 안 되면 오류 대신 false (기다림만, 확인은 그 뒤 겉 결과로)
const waitQuiet = (check, timeoutMs = 6000) => waitFor(check, { timeoutMs }).then(() => true, () => false)

// 요청 제한 한 번 통과시켜 봄 → 200(통과) 또는 429
const hitLimiter = (mw) => new Promise((resolve) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json() { resolve(this.statusCode) } }
    Promise.resolve(mw({ ip: '10.17.0.1', headers: {} }, res, () => resolve(200))).catch(() => resolve(-1))
})

// 이 파일 전용 중계: 공용 중계(redisProxy)는 양쪽을 같이 멈춰서 "Redis는 처리했는데 답만 사라짐"을 못 만듦
// swallow() = 보내는 것은 Redis로, Redis 답만 버림 / cut() = 붙은 연결 다 끊음 / restore() = 다시 정상
async function createAnswerLossProxy(port) {
    let mode = 'ok'
    const pairs = new Set()
    const server = net.createServer((client) => {
        if (mode === 'dead') { client.destroy(); return }
        const upstream = net.connect(port, '127.0.0.1')
        const one = { client, upstream }
        pairs.add(one)
        const drop = () => { pairs.delete(one); client.destroy(); upstream.destroy() }
        for (const side of [client, upstream]) { side.on('error', drop); side.on('close', drop) }
        client.on('data', (chunk) => upstream.write(chunk))
        upstream.on('data', (chunk) => { if (mode === 'ok') client.write(chunk) })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return {
        url: `redis://127.0.0.1:${server.address().port}`,
        swallow() { mode = 'swallow' },
        cut() { for (const { client, upstream } of pairs) { client.destroy(); upstream.destroy() } pairs.clear() },
        restore() { mode = 'ok' },
        async close() {
            mode = 'dead'
            this.cut()
            await new Promise((resolve) => server.close(() => resolve()))
        },
    }
}

// 끊고 바로 다시 받음 → down 본 뒤 다시 up까지
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

// 판 끝 공개 줄 (그 사람이 받은 알림 중 winResult 든 것) → Map(uuid → goldReward)
function revealGold(node, uuid) {
    const event = node.sock(uuid).received.find((e) => e.payload?.winResult)
    return event ? new Map(event.payload.winResult.reveals.map((r) => [r.uuid, r.goldReward])) : null
}

// ── Redis 없음 · 켜기 · 죽음 · 멈춤 · 살아남 (/health) ──

test('A17-B-101 Redis 없음(1대) = 예전 그대로: /health { ok }만, 방 만들기·입장·판 정상 (5명 판)', OPTS, async (t) => {
    const health = await healthServer(t)
    assert.deepEqual((await health()).body, { ok: true })

    const prefix = newPrefix()
    const w = await W.startNodes(t, { n1: B.n1 }, { redisUrls: { n1: REDIS_URL_TEST }, prefix, env: FAST })
    t.after(() => cleanupPrefix(prefix))
    // REDIS_URL 없이 다시 켬 = 단일 모드
    await B.n1.cluster.init({ env: {}, bootEpoch: B.n1.mm.__getBootEpochForTests(), log: quietLog })
    assert.equal(B.n1.cluster.mode(), 'off')
    assert.equal(await w.n1.route('b101-0'), null, '접속 거절이 생김')
    const g = await W.openGame(w, w.n1, { prefix: 'b101', n: 5 })
    for (const uuid of g.uuids) {
        assert.ok(w.n1.received(uuid, 'game_started').some((p) => p.gameId === g.gameId), `${uuid} 판 시작 못 받음`)
    }
})

test('A17-B-102 켤 때 Redis가 없어도 서버는 켜짐: /health redis down → 살아나면 up', OPTS, async (t) => {
    const health = await healthServer(t)
    const prefix = newPrefix()
    const proxy = await createRedisProxy({ targetPort })
    t.after(async () => { await proxy.close(); await cleanupPrefix(prefix) })
    proxy.kill()
    await selfNode(t, { url: proxy.url, prefix })
    const first = await health()
    assert.equal(first.status, 200)
    assert.equal(first.body.ok, true)
    assert.equal(first.body.serverId, 'n1')
    assert.equal(first.body.redis, 'down')
    proxy.restore()
    await timeUntil(async () => (await health()).body.redis === 'up', 10000)
    assert.equal((await health()).body.redis, 'up')
})

test('A17-B-103 도는 중 Redis가 죽으면 2초 안에 /health redis down', OPTS, async (t) => {
    const health = await healthServer(t)
    const prefix = newPrefix()
    const proxy = await createRedisProxy({ targetPort })
    t.after(async () => { await proxy.close(); await cleanupPrefix(prefix) })
    await selfNode(t, { url: proxy.url, prefix })
    await timeUntil(async () => (await health()).body.redis === 'up')
    proxy.kill()
    const ms = await timeUntil(async () => (await health()).body.redis === 'down', 6000)
    assert.ok(ms <= 2000, `down까지 ${ms}ms`)
})

test('A17-B-104 Redis가 멈추면 5초 안에 /health redis down', OPTS, async (t) => {
    const health = await healthServer(t)
    const prefix = newPrefix()
    const proxy = await createRedisProxy({ targetPort })
    t.after(async () => { proxy.restore(); await proxy.close(); await cleanupPrefix(prefix) })
    await selfNode(t, { url: proxy.url, prefix })
    await timeUntil(async () => (await health()).body.redis === 'up')
    proxy.freeze()
    const ms = await timeUntil(async () => (await health()).body.redis === 'down', 10000)
    assert.ok(ms <= 5000, `down까지 ${ms}ms`)
})

test('A17-B-105 죽었던 Redis가 풀리면 2초 안에 다시 up', OPTS, async (t) => {
    const health = await healthServer(t)
    const prefix = newPrefix()
    const proxy = await createRedisProxy({ targetPort })
    t.after(async () => { await proxy.close(); await cleanupPrefix(prefix) })
    await selfNode(t, { url: proxy.url, prefix })
    await timeUntil(async () => (await health()).body.redis === 'up')
    proxy.kill()
    await timeUntil(async () => (await health()).body.redis === 'down')
    proxy.restore()
    const ms = await timeUntil(async () => (await health()).body.redis === 'up', 8000)
    assert.ok(ms <= 2000, `up까지 ${ms}ms`)
})

// ── 죽음·멈춤 동안 대체 동작 ──

test('A17-B-106 Redis가 멈춘 동안 같은 Node 판은 계속 돌아 끝까지 감 (5명 판)', OPTS, async (t) => {
    const { w, p } = await pair(t)
    // 판 타이머가 가짜 시계를 따르게 판 열기 전에 켬
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix: 'b106', n: 5 })
    p.n1.freeze()
    try {
        await W.playToEnd(w, g)
        for (const uuid of g.uuids) {
            assert.ok(w.n1.received(uuid, 'game_phase_changed').length > 0, `${uuid} 단계 알림 없음`)
            assert.ok(revealGold(w.n1, uuid), `${uuid} 판 끝 알림 없음`)
        }
    } finally {
        t.mock.timers.reset()
        p.n1.restore()
    }
})

test('A17-B-107 Redis가 죽은 동안 방 방송 50번 → 처리 안 된 거절 0, 내 Node 사람은 50번 다 받음', OPTS, async (t) => {
    const unhandled = trackUnhandled(t)
    const { p1, a } = await rawPair(t)
    const u1 = await connectUser(t, a.port, 'b107-a')
    const u2 = await connectUser(t, a.port, 'b107-b')
    a.io.in('user:b107-a').socketsJoin('room-b107')
    a.io.in('user:b107-b').socketsJoin('room-b107')
    await sleep(100)
    p1.kill()
    await waitFor(() => a.node.state() === 'down')
    for (let i = 0; i < 50; i += 1) a.io.to('room-b107').emit('b107_ping', i)
    const count = (user) => user.received.filter((r) => r.event === 'b107_ping').length
    await waitFor(() => count(u1) === 50 && count(u2) === 50)
    await sleep(300)
    assert.equal(count(u1), 50)
    assert.equal(count(u2), 50)
    assert.deepEqual(unhandled, [])
})

test('A17-B-108 Redis 죽음·멈춤 각각: 강제 끊기 대상 찾기가 1초 안에 끝나고 내 Node 것만 + partial', OPTS, async (t) => {
    const { p1, a, b } = await rawPair(t)
    await connectUser(t, a.port, 'b108-u')
    await connectUser(t, b.port, 'b108-u')
    const both = await a.node.fetchSockets('user:b108-u')
    assert.equal(both.sockets.length, 2, '살아 있을 땐 두 Node 소켓이 다 보여야 함')
    assert.equal(both.partial, false)

    for (const how of ['kill', 'freeze']) {
        p1[how]()
        await waitFor(() => a.node.state() === 'down', { timeoutMs: 10000 })
        const started = Date.now()
        const found = await a.node.fetchSockets('user:b108-u')
        const ms = Date.now() - started
        assert.ok(ms < 1000, `${how}: 찾기 ${ms}ms`)
        assert.equal(found.sockets.length, 1, `${how}: 내 Node 것만이어야 함`)
        assert.equal(found.partial, true, `${how}: partial 아님`)
        p1.restore()
        await waitFor(() => a.node.state() === 'up', { timeoutMs: 10000 })
    }
})

test('A17-B-109 Redis가 죽은 동안 방 만들기 됨', OPTS, async (t) => {
    const { w, p } = await pair(t)
    p.n1.kill()
    await waitFor(() => w.n1.cluster.state() === 'down')
    w.n1.connect('b109-h')
    const created = await w.n1.createRoom('b109-h')
    assert.equal(created.ok, true, `방 만들기 거절: ${created.code} ${created.message}`)
})

test('A17-B-110 Redis가 죽은 동안 다른 Node 방 코드 입장 → 잠시 후 다시 (CLUSTER_UNAVAILABLE)', OPTS, async (t) => {
    const { w, p } = await pair(t)
    w.n2.connect('b110-h')
    const created = await w.n2.createRoom('b110-h')
    assert.equal(created.ok, true)
    const k = w.n1.dirKeys()
    await waitFor(async () => (await w.n1.readKey(k.roomcode(created.room.roomCode))) === created.room.roomId)
    p.n1.kill()
    await waitFor(() => w.n1.cluster.state() === 'down')
    w.n1.connect('b110-j')
    const joined = await w.n1.joinByCode('b110-j', created.room.roomCode)
    assert.equal(joined?.event, 'room_join_failed')
    assert.equal(joined.payload.code, 'CLUSTER_UNAVAILABLE')
    assert.equal(joined.payload.message, '지금은 방 위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.')
})

test('A17-B-111 Redis가 죽은 동안 요청 제한은 Node 메모리: n1은 한도 넘어 막히고 n2는 따로 셈', OPTS, async (t) => {
    const { w, p } = await pair(t)
    const make = (b) => b.x['middlewares/rateLimit.middleware'].createRateLimiter({
        windowMs: 60_000, max: 3, name: 'a17-b111', keyOf: (req) => `ip:${req.ip}`,
    })
    const lim1 = make(B.n1)
    const lim2 = make(B.n2)
    p.n1.kill()
    p.n2.kill()
    await waitFor(() => w.n1.cluster.state() === 'down' && w.n2.cluster.state() === 'down')
    const n1Results = []
    for (let i = 0; i < 4; i += 1) n1Results.push(await hitLimiter(lim1))
    assert.deepEqual(n1Results, [200, 200, 200, 429])
    assert.equal(await hitLimiter(lim2), 200, 'n2가 n1 셈을 같이 봄')
})

test('A17-B-112 Redis가 죽은 동안 길잡이 안 함: n2 방 사람이 n1로 접속 → 접속됨', OPTS, async (t) => {
    const { w, p } = await pair(t)
    w.n2.connect('b112-u')
    const created = await w.n2.createRoom('b112-u')
    assert.equal(created.ok, true)
    const k = w.n1.dirKeys()
    await waitFor(async () => (await w.n1.readKey(k.loc('b112-u')))?.node === 'n2')
    const before = await w.n1.route('b112-u')
    assert.equal(before?.message, 'WRONG_NODE', 'Redis 살아 있을 땐 n2로 보내야 함')
    p.n1.kill()
    await waitFor(() => w.n1.cluster.state() === 'down')
    assert.equal(await w.n1.route('b112-u'), null)
})

test('A17-B-113 Redis가 살아나면 죽은 동안 만든 방 위치를 다시 씀 → n1 코드 입장이 n2로 옮기라는 답', OPTS, async (t) => {
    const { w, p } = await pair(t)
    p.n2.kill()
    await waitFor(() => w.n2.cluster.state() === 'down')
    w.n2.connect('b113-h')
    const created = await w.n2.createRoom('b113-h')
    assert.equal(created.ok, true)
    p.n2.restore()
    await waitFor(() => w.n2.cluster.state() === 'up', { timeoutMs: 10000 })
    const k = w.n1.dirKeys()
    await waitQuiet(async () => (await w.n1.readKey(k.roomcode(created.room.roomCode))) === created.room.roomId)
    w.n1.connect('b113-j')
    const joined = await w.n1.joinByCode('b113-j', created.room.roomCode)
    assert.equal(joined?.payload?.code, 'ROOM_ON_OTHER_NODE', JSON.stringify(joined))
    assert.equal(joined.payload.node, 'n2')
})

// ── 살아나면 다시 읽기 (DB 값이 down 동안 바뀜) ──

test('A17-B-114 살아나면 다시 읽기: 점검 — down 동안 DB에서 점검 켬 → 살아난 뒤 안전망 기다림 없이 n2 방 만들기 거절', OPTS, async (t) => {
    if (noDb(t)) return
    const maint = B.n2.x['services/ops/maintenance']
    const off = () => models.MaintenanceState.upsert({ id: 1, is_enabled: false, message: null })
    await off()
    t.after(async () => {
        await off()
        for (const b of [B.n1, B.n2]) b.x['services/ops/maintenance'].__setStateForTests({})
    })
    const { w, p } = await pair(t)
    await maint.reloadMaintenance()
    p.n2.kill()
    await waitFor(() => w.n2.cluster.state() === 'down')
    await models.MaintenanceState.upsert({ id: 1, is_enabled: true, message: 'a17 점검' })
    p.n2.restore()
    await waitFor(() => w.n2.cluster.state() === 'up', { timeoutMs: 10000 })
    // 안전망(60초)보다 훨씬 짧게만 기다림
    await waitQuiet(() => maint.getMaintenanceState().active === true, 5000)
    const s = w.n2.connect('b114-h')
    B.n2.mm.registerMatchmakingHandlers(w.n2.io, s, 'b114-h')
    const answer = await new Promise((resolve) => s.trigger('create_room', { accessType: 'code', maxPlayers: 5, jokerCount: 1, ...W.TIMES }, resolve))
    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'MAINTENANCE')
})

test('A17-B-115 살아나면 다시 읽기: 금지어 — down 동안 DB에 새 금지어 → 살아난 뒤 n2 판 채팅에서 가려짐 (5명 판)', OPTS, async (t) => {
    if (noDb(t)) return
    const words = B.n2.x['services/ops/bannedWords']
    const WORD = 'a17금칙'
    t.after(async () => {
        await models.BannedWord.destroy({ where: { word: WORD } })
        for (const b of [B.n1, B.n2]) b.x['services/ops/bannedWords'].__setWordsForTests([])
    })
    const { w, p } = await pair(t)
    await words.reloadBannedWords()
    p.n2.kill()
    await waitFor(() => w.n2.cluster.state() === 'down')
    await models.BannedWord.create({ word: WORD, is_active: true })
    p.n2.restore()
    await waitFor(() => w.n2.cluster.state() === 'up', { timeoutMs: 10000 })
    await waitQuiet(() => words.getBannedWordCount() > 0, 5000)
    const g = await W.openGame(w, w.n2, { prefix: 'b115', n: 5 })
    B.n2.gf.toDay(w.n2.session(g.gameId))
    const speaker = W.citizenOf(g)
    const reply = await w.n2.ask(B.n2.G.handleSubmitGameChatMessage, speaker, { gameId: g.gameId, text: `x ${WORD} y` })
    assert.equal(reply.ok, true, `채팅 거절: ${reply.code}`)
    for (const uuid of g.uuids) {
        const texts = w.n2.received(uuid, 'day_chat_message_received').map((m) => m.text)
        assert.deepEqual(texts, ['x ***** y'], uuid)
    }
})

test('A17-B-116 살아나면 다시 읽기: 판 골드 — down 동안 DB 값 2 → 살아난 뒤 n2 판 끝 goldReward 2 (5명 판)', OPTS, async (t) => {
    if (noDb(t)) return
    const gold = B.n2.x['services/ops/gameSettings']
    const setGold = (v) => models.sequelize.query("UPDATE game_settings SET value_int = :v WHERE `key` = 'GAME_GOLD_REWARD'", { replacements: { v } })
    await setGold(1)
    t.after(async () => {
        await setGold(1)
        for (const b of [B.n1, B.n2]) b.x['services/ops/gameSettings'].__setGoldRewardForTests(1)
    })
    const { w, p } = await pair(t)
    await gold.reloadGameSettings()
    p.n2.kill()
    await waitFor(() => w.n2.cluster.state() === 'down')
    await setGold(2)
    p.n2.restore()
    await waitFor(() => w.n2.cluster.state() === 'up', { timeoutMs: 10000 })
    await waitQuiet(() => gold.getGameSettingsState().goldReward === 2, 5000)
    // 판 타이머가 가짜 시계를 따르게 판 열기 전에 켬 (다시 읽기는 진짜 시계로 끝난 뒤)
    w.useFakeClock()
    let g
    try {
        g = await W.openGame(w, w.n2, { prefix: 'b116', n: 5 })
        await W.playToEnd(w, g)
    } finally {
        t.mock.timers.reset()
    }
    const reveal = revealGold(w.n2, g.host)
    assert.ok(reveal, '판 끝 공개 줄 없음')
    for (const uuid of g.uuids) assert.equal(reveal.get(uuid), 2, uuid)
})

// ── 살아남 · 비움 ──

test('A17-B-117 Redis가 살아나면 공개 방 목록이 다시 합쳐짐: 죽은 동안 생긴 n2 공개 방이 n1 목록에', OPTS, async (t) => {
    const { w, p } = await pair(t)
    for (const b of [B.n1, B.n2]) b.roomListSync.__setRoomListTimingForTests({ tickMs: 100 })
    t.after(() => { for (const b of [B.n1, B.n2]) b.roomListSync.__setRoomListTimingForTests({ tickMs: 1000, publishEvery: 5, deadGraceMs: 4000 }) })
    // 사람이 붙을 때처럼 목록 io 묶기 (주기 일 시작)
    B.n1.roomListSync.bindRoomListIo(w.n1.io)
    B.n2.roomListSync.bindRoomListIo(w.n2.io)
    p.n2.kill()
    await waitFor(() => w.n2.cluster.state() === 'down')
    w.n2.connect('b117-h')
    const created = await w.n2.createRoom('b117-h', { accessType: 'open' })
    assert.equal(created.ok, true)
    p.n2.restore()
    await waitFor(() => w.n2.cluster.state() === 'up', { timeoutMs: 10000 })
    const has = async () => (await w.n1.publicRooms()).rooms.some((r) => r.id === created.room.roomId)
    await waitQuiet(has, 6000)
    const rooms = (await w.n1.publicRooms()).rooms
    const row = rooms.find((r) => r.id === created.room.roomId)
    assert.ok(row, 'n1 목록에 n2 방 없음')
    assert.equal(row.node, 'n2')
})

test('A17-B-118 Redis 키를 다 비워도 다시 맞춘 뒤 길잡이가 돌아옴 → n1 코드 입장이 n2로', OPTS, async (t) => {
    const { w, prefix } = await pair(t)
    w.n2.connect('b118-h')
    const created = await w.n2.createRoom('b118-h')
    assert.equal(created.ok, true)
    const k = w.n1.dirKeys()
    await waitFor(async () => (await w.n1.readKey(k.roomcode(created.room.roomCode))) === created.room.roomId)
    // Redis 재시작(빈 데이터) 흉내: 내 앞머리 키 전부 지움
    await cleanupPrefix(prefix)
    assert.equal(await w.n1.readKey(k.roomcode(created.room.roomCode)), null)
    await waitQuiet(async () => {
        await w.n1.cluster.nodes.refresh()
        return w.n1.cluster.nodes.isAlive('n2') && (await w.n1.readKey(k.roomcode(created.room.roomCode))) === created.room.roomId
    }, 8000)
    w.n1.connect('b118-j')
    const joined = await w.n1.joinByCode('b118-j', created.room.roomCode)
    assert.equal(joined?.payload?.code, 'ROOM_ON_OTHER_NODE', JSON.stringify(joined))
    assert.equal(joined.payload.node, 'n2')
})

// ── 늦음 · 쓰기 실패 · 답 잃음 ──

test('A17-B-119 Redis가 늦으면 서버끼리 묻기가 1.5초쯤에 RPC_TIMEOUT으로 끝남 (멈추지 않음)', OPTS, async (t) => {
    const { p2, a, b } = await rawPair(t, { withIo: false })
    b.node.rpc.register('a17.ping', () => 'pong')
    assert.equal(await a.node.rpc.call('n2', 'a17.ping'), 'pong')
    p2.freeze()
    t.after(() => p2.restore())
    const started = Date.now()
    const outcome = await a.node.rpc.call('n2', 'a17.ping').then((v) => ({ ok: true, v }), (e) => ({ ok: false, code: e.code }))
    const ms = Date.now() - started
    assert.deepEqual(outcome, { ok: false, code: 'RPC_TIMEOUT' })
    assert.ok(ms >= 1300 && ms <= 2500, `끝나기까지 ${ms}ms`)
})

test('A17-B-120 Redis 쓰기 실패(메모리 가득)도 죽음처럼: 쓰기 부른 쪽은 대체 동작, 두 번 실패면 down', OPTS, async (t) => {
    const { w } = await pair(t)
    // 시험 Redis 메모리 한도를 잠깐 아주 작게 (redis 잠금 쥔 동안만, 끝에 원래 값으로)
    const [, oldMax] = await withAdminClient((c) => c.config('GET', 'maxmemory'))
    const [, oldPolicy] = await withAdminClient((c) => c.config('GET', 'maxmemory-policy'))
    const putBack = () => withAdminClient(async (c) => {
        await c.config('SET', 'maxmemory', oldMax)
        await c.config('SET', 'maxmemory-policy', oldPolicy)
    })
    t.after(putBack)
    await withAdminClient(async (c) => {
        await c.config('SET', 'maxmemory-policy', 'noeviction')
        await c.config('SET', 'maxmemory', '1')
    })
    // 셋 다 본 뒤 한꺼번에 확인 (앞의 것이 틀려도 down 판정까지 봄)
    let hit
    let created
    let stateAfter
    try {
        // down 판정 전(쓰기만 실패하는 동안) 쓰기 부르기
        hit = await w.n1.cluster.counters.hit('rl:a17-b120', 60_000)
        w.n1.connect('b120-h')
        created = await w.n1.createRoom('b120-h')
        await waitQuiet(() => w.n1.cluster.state() === 'down', 8000)
        stateAfter = w.n1.cluster.state()
    } finally {
        await putBack()
    }
    assert.equal(stateAfter, 'down', '쓰기 실패가 두 번 넘었는데 down 아님')
    assert.equal(hit.shared, false, '쓰기 실패인데 Redis로 셌다고 함')
    assert.equal(created.ok, true, `쓰기 실패 동안 방 만들기 거절: ${JSON.stringify(created)}`)
    await waitQuiet(() => w.n1.cluster.state() === 'up', 8000)
    assert.equal(w.n1.cluster.state(), 'up', '메모리 풀린 뒤 다시 up 안 됨')
})

// 답만 잃는 중계로 n1, n2는 Redis 바로
async function answerLossPair(t) {
    const prefix = newPrefix()
    const proxy = await createAnswerLossProxy(targetPort)
    t.after(async () => { await proxy.close(); await cleanupPrefix(prefix) })
    const a = await startRedisNode(t, { url: proxy.url, serverId: 'n1', prefix, env: FAST, withIo: false })
    const b = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST, withIo: false })
    t.after(() => cleanupPrefix(prefix))
    await waitFor(async () => {
        await a.node.nodes.refresh()
        return a.node.nodes.isAlive('n2')
    })
    return { prefix, proxy, a, b }
}

test('A17-B-121 답만 잃고 끊긴 순간 보낸 물음 → 받는 쪽 처리는 한 번, 부른 쪽은 CLUSTER_UNAVAILABLE', OPTS, async (t) => {
    const unhandled = trackUnhandled(t)
    const { proxy, a, b } = await answerLossPair(t)
    let calls = 0
    b.node.rpc.register('a17.count', () => { calls += 1; return calls })
    b.node.rpc.register('a17.ping', () => 'pong')
    assert.equal(await a.node.rpc.call('n2', 'a17.ping'), 'pong')
    proxy.swallow()
    const pending = a.node.rpc.call('n2', 'a17.count', {}).then((v) => ({ ok: true, v }), (e) => ({ ok: false, code: e.code }))
    await waitFor(() => calls === 1)
    await blip(proxy, a.node)
    const outcome = await pending
    // 다시 보낸 물음이 있었다면 이 ping보다 먼저 n2에 닿음
    await waitFor(async () => (await a.node.rpc.call('n2', 'a17.ping').catch(() => null)) === 'pong')
    assert.equal(calls, 1, `n2 처리기 ${calls}번 돎`)
    assert.deepEqual(outcome, { ok: false, code: 'CLUSTER_UNAVAILABLE' })
    assert.deepEqual(unhandled, [])
})

test('A17-B-122 답만 잃고 끊긴 순간 센 요청 제한 → 다시 붙은 뒤 Redis 값 1', OPTS, async (t) => {
    const { prefix, proxy, a } = await answerLossPair(t)
    const key = 'rl:a17-b122'
    proxy.swallow()
    const pending = a.node.counters.hit(key, 60_000)
    await waitFor(async () => (await withAdminClient((c) => c.get(`${prefix}:${key}`))) === '1')
    await blip(proxy, a.node)
    await pending
    const after = await a.node.counters.peek(key)
    assert.equal(after.shared, true)
    assert.equal(after.count, 1)
})

// ── 같은 이름 서버 · 강제 종료 뒤 다시 켬 · 하트비트 끊김 ──

test('A17-B-123 같은 이름 서버 둘을 같은 순간 켜면 하나만 켜지고 다른 하나는 DUPLICATE_SERVER_ID', OPTS, async (t) => {
    const prefix = newPrefix()
    t.after(() => cleanupPrefix(prefix))
    const results = await Promise.allSettled([
        startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'dup', prefix, env: FAST, withIo: false }),
        startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'dup', prefix, env: FAST, withIo: false }),
    ])
    t.after(() => cleanupPrefix(prefix))
    const rejected = results.filter((r) => r.status === 'rejected')
    assert.equal(results.length - rejected.length, 1, '켜진 수')
    assert.equal(rejected[0]?.reason?.code, 'DUPLICATE_SERVER_ID')
})

test('A17-B-124 같은 이름 서버를 차례로 켜도 두 번째는 DUPLICATE_SERVER_ID로 시작 안 함', OPTS, async (t) => {
    const prefix = newPrefix()
    t.after(() => cleanupPrefix(prefix))
    await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST, withIo: false })
    await sleep(500)
    const second = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST, withIo: false })
        .then(() => ({ ok: true }), (e) => ({ ok: false, code: e.code }))
    t.after(() => cleanupPrefix(prefix))
    assert.deepEqual(second, { ok: false, code: 'DUPLICATE_SERVER_ID' })
})

test('A17-B-125 강제로 꺼진 n2를 Redis 끊긴 채 같은 이름으로 다시 켜도 옛 판을 산 것으로 안 봄 → "이미 끝난 게임" (5명 판)', OPTS, async (t) => {
    const { w, p, prefix } = await pair(t)
    const g = await W.openGame(w, w.n2, { prefix: 'b125', n: 5 })
    const k = w.n1.dirKeys()
    await waitFor(async () => (await w.n1.readKey(k.startedcode(g.roomCode)))?.gameId === g.gameId)
    // 강제 종료: 연결만 끊김 (하트비트·키 안 지움)
    p.n2.kill()
    await waitFor(() => B.n2.cluster.state() === 'down')
    await B.n2.cluster.close()
    // 같은 이름 새 프로세스 = 새 부팅 값, Redis 끊긴 채 켬
    const fresh = W.loadBundle()
    const p3 = await createRedisProxy({ targetPort })
    p3.kill()
    t.after(async () => { await fresh.cluster.close().catch(() => {}); await p3.close(); await cleanupPrefix(prefix) })
    await fresh.cluster.init({
        env: { REDIS_URL: p3.url, SERVER_ID: 'n2', REDIS_KEY_PREFIX: prefix, ...W.BASE_ENV, ...FAST },
        bootEpoch: fresh.mm.__getBootEpochForTests(), log: quietLog,
    })
    assert.equal(fresh.cluster.state(), 'down')
    p3.restore()
    await waitFor(() => fresh.cluster.state() === 'up', { timeoutMs: 15000 })
    await w.n1.cluster.nodes.refresh()
    w.n1.connect('b125-x')
    const joined = await w.n1.joinByCode('b125-x', g.roomCode)
    assert.equal(joined?.event, 'room_join_failed', JSON.stringify(joined))
    assert.equal(joined.payload.code, 'SESSION_ENDED', JSON.stringify(joined.payload))
    assert.equal(joined.payload.message, '이미 끝난 게임의 방입니다.')
})

test('A17-B-126 살아 있음 표시(하트비트)가 끊긴 Node는 10초쯤 뒤 죽은 것으로 봄', OPTS, async (t) => {
    // 죽음 판정은 기본값 10초 그대로 (하트비트만 0.5초)
    const { p2, a } = await rawPair(t, { env: { CLUSTER_HEARTBEAT_MS: '500' }, withIo: false })
    p2.freeze()
    t.after(() => p2.restore())
    const started = Date.now()
    await sleep(5000)
    await a.node.nodes.refresh()
    assert.equal(a.node.nodes.isAlive('n2'), true, '5초 만에 죽은 것으로 봄')
    await waitFor(async () => {
        await a.node.nodes.refresh()
        return !a.node.nodes.isAlive('n2')
    }, { timeoutMs: 12000, stepMs: 200 })
    const ms = Date.now() - started
    assert.ok(ms >= 8000 && ms <= 13000, `죽음으로 보기까지 ${ms}ms`)
    const row = a.node.nodes.list().find((n) => n.id === 'n2')
    assert.ok(!row || row.alive === false, `목록에 n2가 산 것으로 남음: ${JSON.stringify(row)}`)
})
