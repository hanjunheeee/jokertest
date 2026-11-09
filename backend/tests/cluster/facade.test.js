// cluster/index.js 입구 시험: 단일 모드(REDIS_URL 없음)가 예전과 같은지, init 전에 붙인 처리기가 이어지는지,
// /health 칸·로그 이름·줄 앞 표시·DB 풀 경고 (Redis 없이 npm test에서 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { Server } = require('socket.io')

const cluster = require('../../cluster')
const { createMemoryHub, quietLog } = require('../../cluster/testing/memoryCluster')
const { readClusterConfig, describePoolWarning } = require('../../config/cluster')
const logFile = require('../../utils/logFile')

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

// 조건이 될 때까지 기다림 (시험 여럿이 같이 돌아 느려도 안 깨지게, 고정 시간 대신)
async function waitFor(check, timeoutMs = 3000) {
    const started = Date.now()
    while (!(await check())) {
        if (Date.now() - started > timeoutMs) throw new Error('waitFor 시간 초과')
        await tick(5)
    }
}

test('MN-089: REDIS_URL 없음 → 단일 모드, 공유 기능은 조용히 꺼지고 내 Node 일은 그대로', async (t) => {
    t.after(() => cluster.close())
    await cluster.init({ env: { SERVER_ID: '' }, log: quietLog })
    assert.equal(cluster.mode(), 'off')
    assert.equal(cluster.state(), 'off')
    assert.equal(cluster.isEnabled(), false)
    assert.equal(cluster.isShared(), false)
    assert.equal(cluster.serverId(), 'main')
    assert.equal(await cluster.bus.publish('ops.reload', { what: 'x' }), false)
    const off = cluster.rpc.register('t.echo', (args) => args)
    t.after(off)
    assert.equal(await cluster.rpc.call('main', 't.echo', 7), 7)
    await assert.rejects(cluster.rpc.call('n2', 't.echo', 7), { code: 'NODE_UNAVAILABLE' })
    assert.deepEqual(await cluster.rpc.callAll('t.echo', 1), { results: [{ node: 'main', ok: true, value: 1 }], partial: false })
    assert.deepEqual(await cluster.directory.locate('mmc:loc:u1'), { available: false, value: null, node: null, alive: false, self: false })
    assert.equal(await cluster.directory.write('mmc:loc:u1', { node: 'main' }, { ttlMs: 1000 }), false)
    const hit = await cluster.counters.hit('rl:t:1', 1000)
    assert.deepEqual([hit.count, hit.shared], [1, false])
    assert.deepEqual(cluster.nodes.list().map((n) => n.id), ['main'])
    assert.equal(cluster.adapterStats(), null)
})

test('MN-089: 단일 모드 fetchSockets는 예전처럼 io.in 전부, partial 없음', async (t) => {
    const server = http.createServer()
    const io = new Server(server)
    t.after(() => io.close())
    await cluster.init({ io, env: {}, log: quietLog })
    t.after(() => cluster.close())
    const result = await cluster.fetchSockets('user:none')
    assert.deepEqual(result, { sockets: [], partial: false })
})

test('init 전에 붙인 버스·RPC 처리기가 init 뒤 Node에도 이어짐 (조각 2·3·4가 require 때 붙여도 됨)', async (t) => {
    const got = []
    const offBus = cluster.bus.on('ops.reload', (msg) => got.push(msg.what))
    const offRpc = cluster.rpc.register('t.who', () => 'me')
    t.after(() => { offBus(); offRpc() })

    const hub = createMemoryHub()
    t.after(() => hub.close())
    await cluster.init({ backend: hub.backend(), env: { SERVER_ID: 'n1' }, log: quietLog })
    t.after(() => cluster.close())
    const n2 = await hub.startNode('n2')
    await n2.nodes.refresh()
    assert.equal(cluster.mode(), 'memory')
    assert.equal(cluster.isShared(), true)
    await n2.bus.publish('ops.reload', { what: 'bannedWords' })
    await waitFor(() => got.length === 1)
    assert.deepEqual(got, ['bannedWords'])
    assert.equal(await n2.rpc.call('n1', 't.who'), 'me')
})

// /health를 처리기 함수로 바로 부름 (DB는 가짜)
async function callHealth(t) {
    const db = require('../../models')
    const original = db.sequelize.query
    db.sequelize.query = async () => [[{ 1: 1 }]]
    t.after(() => { db.sequelize.query = original })
    const handler = require('../../routes/health.routes').stack[0].route.stack[0].handle
    const res = { headers: {}, set(k, v) { this.headers[k] = v }, status(c) { this.statusCode = c; return this }, json(b) { this.body = b } }
    await handler({ headers: {} }, res)
    return res
}

test('MN-131: /health — 단일 서버는 예전 그대로, Node 여러 개면 serverId·redis·draining', async (t) => {
    t.after(() => cluster.close())
    await cluster.init({ env: {}, log: quietLog })
    assert.deepEqual((await callHealth(t)).body, { ok: true })

    await cluster.init({ env: { SERVER_ID: 'solo' }, log: quietLog })
    assert.deepEqual((await callHealth(t)).body, { ok: true, serverId: 'solo', redis: 'off', draining: false })

    const hub = createMemoryHub()
    t.after(() => hub.close())
    await cluster.init({ backend: hub.backend(), env: { SERVER_ID: 'n2' }, log: quietLog })
    cluster.nodes.setDraining(true)
    assert.deepEqual((await callHealth(t)).body, { ok: true, serverId: 'n2', redis: 'up', draining: true })
    hub.setDown(true)
    const down = await callHealth(t)
    assert.equal(down.statusCode, 200)
    assert.equal(down.body.redis, 'down')
})

test('MN-133: 로그 파일 이름 app-<SERVER_ID>-날짜, 정리 패턴은 두 모양 다 (다른 파일은 안 건드림)', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mn133-'))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    assert.equal(logFile.fileNameFor('2026-11-09', 'n2'), 'app-n2-2026-11-09.log')
    assert.equal(logFile.fileNameFor('2026-11-09', null), 'app-2026-11-09.log')
    assert.equal(logFile.explicitServerId({}), null)
    assert.equal(logFile.explicitServerId({ SERVER_ID: 'bad id!' }), null)
    assert.equal(logFile.explicitServerId({ SERVER_ID: 's1n2' }), 's1n2')
    for (const name of ['app-n1-2026-10-01.log', 'app-2026-10-01.log', 'app-s1-n2-2026-10-02.log', 'app-n1-2026-11-09.log', 'app-n1-x.log', 'note.txt']) {
        fs.writeFileSync(path.join(dir, name), 'x')
    }
    const log = logFile.createLogFile({ dir, retentionDays: 3, now: () => new Date(2026, 10, 9), serverId: 'n1' })
    log.write('hello')
    log.close()
    assert.deepEqual(fs.readdirSync(dir).sort(), ['app-n1-2026-11-09.log', 'app-n1-x.log', 'note.txt'])
    assert.match(fs.readFileSync(path.join(dir, 'app-n1-2026-11-09.log'), 'utf8'), /hello/)
})

test('MN-134: console 줄 앞 [SERVER_ID], 로그 파일 줄에도 들어감', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mn134-'))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    const printed = []
    const target = { log: (...a) => printed.push(a.join(' ')), info() {}, warn: (...a) => printed.push(a.join(' ')), error() {} }
    const log = logFile.createLogFile({ dir, now: () => new Date(2026, 10, 9), serverId: 'n2' })
    const undoTee = logFile.teeConsoleToLogFile(log, target)
    const undoPrefix = logFile.prefixConsoleWithServerId('n2', target)
    target.log('[STARTUP] 성공')
    target.warn('경고')
    undoPrefix()
    undoTee()
    log.close()
    assert.deepEqual(printed, ['[n2] [STARTUP] 성공', '[n2] 경고'])
    const text = fs.readFileSync(path.join(dir, 'app-n2-2026-11-09.log'), 'utf8')
    assert.match(text, /\[INFO\] \[n2\] \[STARTUP\] 성공/)
    assert.match(text, /\[WARN\] \[n2\] 경고/)
})

test('MN-134: 요청 로그(morgan) 줄 앞 [SERVER_ID]는 SERVER_ID 넣었을 때만 (index.js 형식)', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8')
    assert.match(source, /morgan\.token\("server-id"/)
    assert.match(source, /explicitServerId \? "\[:server-id\] " : ""/)
})

test('MN-138: Node 수 × DB 풀 최대가 MySQL 한도 80%를 넘으면 켤 때 경고', () => {
    assert.equal(describePoolWarning({ mode: 'off', poolMax: 100, env: {} }), null)
    assert.equal(describePoolWarning({ mode: 'redis', poolMax: 10, env: { NODE_COUNT: '4' } }), null)
    assert.match(describePoolWarning({ mode: 'redis', poolMax: 10, env: { NODE_COUNT: '16' } }), /160\(Node 16 × 풀 10\).*151/)
    assert.match(describePoolWarning({ mode: 'redis', poolMax: 20, env: {}, cpuCount: 8 }), /Node 8/)
    assert.equal(describePoolWarning({ mode: 'redis', poolMax: 20, env: { NODE_COUNT: '8', DB_MAX_CONNECTIONS: '500' } }), null)
})

test('설정 읽기: 기본값·틀린 값은 기본, REDIS_URL 있으면 redis', () => {
    const off = readClusterConfig({})
    assert.equal(off.mode, 'off')
    assert.equal(off.prefix, 'mmc')
    assert.equal(off.heartbeatMs, 3000)
    assert.equal(off.deadAfterMs, 10000)
    assert.equal(off.rpcTimeoutMs, 1500)
    assert.equal(off.sessionCacheFallbackMs, 0)
    assert.equal(off.serverIdExplicit, false)
    const on = readClusterConfig({ REDIS_URL: 'redis://x', REDIS_KEY_PREFIX: 'e2e:run1', SERVER_ID: 'n2', CLUSTER_RPC_TIMEOUT_MS: 'abc' })
    assert.equal(on.mode, 'redis')
    assert.equal(on.prefix, 'e2e:run1')
    assert.equal(on.serverId, 'n2')
    assert.equal(on.serverIdExplicit, true)
    assert.equal(on.rpcTimeoutMs, 1500)
    assert.equal(readClusterConfig({ REDIS_KEY_PREFIX: 'bad prefix!' }).prefix, 'mmc')
})
