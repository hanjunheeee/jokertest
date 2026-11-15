'use strict'

// 진짜 시험 Redis + Node 2~3대에서 죽은 Node 접속 표시 청소·친구 접속 표시·옛 Node OFFLINE 안 덮기·틀린 횟수와 요청 제한 합치기·로그인 잠금을 보는 시험
// 목록 A17-B-183~190 (docs/게임_의도_2026-11-15/시험목록/A17-서버-여러대.md "죽은 Node 접속 표시 정리 · 카운터 (진짜 Redis)"), REDIS_URL_TEST·F01_TEST_DATABASE_URL 없으면 건너뜀
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL
// 이 파일 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const express = require('express')

const migrationRunner = require('../../db/migrationRunner')
const baseline = require('../../db/migrations/0001-legacy-baseline')
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history')
const addSocialAuth = require('../../db/migrations/0005-add-social-auth')
const { MIGRATIONS } = require('../../scripts/migrate-db')
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb')
const db = require('../../models')
const { hashPassword } = require('../../utils/auth/credentials')

const { REDIS_URL_TEST, skipReason, uniquePrefix, cleanupPrefix } = require('./helpers/redisNodes')
const { listenOnFetchablePort, HIGH_PORT_MIN, HIGH_PORT_MAX } = require('../helpers/fetchablePort')
const W = require('./a17-world')

// Node마다 따로 불러 둘 것 (함수 안 늦은 require는 다른 Node 것이 나와서 미리)
const EXTRA = [
    'models', 'routes/user.routes', 'routes/auth.routes', 'middlewares/auth.middleware',
    'socket/connection/presence', 'socket/connection/janitor', 'socket/emitter', 'services/friend/list',
]
const load = () => W.loadBundle({ extra: EXTRA, databaseUrl: TEST_DB_URL || null })
const B = { n1: load(), n2: load(), n3: load() }

// 하트비트 0.2초·죽음 판정 1.5초 (청소 기준 시각 = 지금 - (1.5초 + 0.2초 × 2))
const FAST = { CLUSTER_HEARTBEAT_MS: '200', NODE_DEAD_AFTER_MS: '1500' }

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner })

// DB 없으면 그 시험만 건너뜀 (Redis만 쓰는 시험은 돎)
const noDb = (t) => {
    if (TEST_DB_URL) return false
    t.skip('F01_TEST_DATABASE_URL 없음 — with-lock.sh testdb로 돌림')
    return true
}

test.before(async () => {
    if (!TEST_DB_URL || !REDIS_URL_TEST) return
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema)
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS })
})

test.after(async () => {
    for (const b of Object.values(B)) await b.x.models.sequelize.close().catch(() => {})
    await db.sequelize.close().catch(() => {})
})

// 시험마다 새 사람 (uuid가 달라 시험끼리 안 섞임), password = 진짜 비번 해시로
async function createUser(label, password = null) {
    const uuid = crypto.randomUUID()
    const email = `${label}-${uuid.slice(0, 8)}@example.test`
    await db.User.create({
        uuid,
        password_hash: password ? await hashPassword(password) : 'not-a-real-hash',
        nickname: `${label}${uuid.slice(0, 4)}`.slice(0, 8),
        email,
    })
    return { uuid, email }
}

const presenceOf = async (uuid) => db.OnlinePresence.findOne({ where: { user_id: uuid }, raw: true })

// Node 여럿 켜기 (진짜 Redis, 키 앞머리는 이 시험만), 끝에 키 지움
async function startRedis(t, ids) {
    const prefix = `a17-${uniquePrefix().split(':')[1]}`
    t.after(() => cleanupPrefix(prefix))
    const bundles = Object.fromEntries(ids.map((id) => [id, B[id]]))
    const urls = Object.fromEntries(ids.map((id) => [id, REDIS_URL_TEST]))
    const w = await W.startNodes(t, bundles, { redisUrls: urls, prefix, env: FAST, fixedRandom: false })
    // 시험이 끝난 뒤에도 키가 남지 않게 한 번 더 (Node가 꺼진 뒤)
    t.after(() => cleanupPrefix(prefix))
    return w
}

// 함수 안에서 늦게 require하는 곳(cluster·emitter)이 그 Node 것을 보게 잠깐 바꿔 끼움 (a17-world에 올릴 것)
const LAZY = { cluster: 'cluster/index.js', 'socket/emitter': 'socket/emitter.js' }
async function asNode(node, fn) {
    const saved = []
    for (const [name, rel] of Object.entries(LAZY)) {
        const file = path.join(W.BACKEND, rel)
        saved.push([file, require.cache[file]])
        const exportsOf = name === 'cluster' ? node.b.cluster : node.b.x[name]
        require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsOf, children: [], paths: [] }
    }
    try {
        return await fn()
    } finally {
        for (const [file, mod] of saved) {
            if (mod) require.cache[file] = mod
            else delete require.cache[file]
        }
    }
}

// 그 Node에 사람 접속 (진짜 접속 처리: 접속 표시 DB 줄·친구 알림·conn 기록)
async function connectOn(node, uuid) {
    const socket = node.connect(uuid)
    socket.data.user.sessionId = `s-${node.id}`
    node.b.x['socket/emitter'].setIo(node.io)
    await asNode(node, () => node.b.x['socket/connection/presence'].handleConnection(node.io, socket, uuid))
    await W.settle()
    return socket
}

// 그 Node가 보는 내 친구 목록에서 그 친구 상태
async function friendStatusOn(node, me, friend) {
    node.b.x['socket/emitter'].setIo(node.io)
    const list = await asNode(node, () => node.b.x['services/friend/list'].getFriendList(me))
    return list.find((f) => f.id === friend)?.status ?? null
}

// 경로 하나의 처리기 줄 (로그인 확인은 빼고 가짜 로그인으로), lastOk면 맨 끝을 200 답으로
function routeHandlers(b, routerName, method, routePath, { lastOk = false } = {}) {
    const layer = b.x[routerName].stack.find((l) => l.route?.path === routePath && l.route.methods[method])
    assert.ok(layer, `${routerName} ${method} ${routePath} 경로 없음`)
    const verifyToken = b.x['middlewares/auth.middleware'].verifyToken
    const handlers = layer.route.stack.map((l) => l.handle).filter((h) => h !== verifyToken)
    if (lastOk) handlers[handlers.length - 1] = (req, res) => res.status(200).json({ ok: true })
    return handlers
}

// Node 하나 HTTP 앱 (x-user = 로그인한 사람) → 보내기 함수
async function startApp(t, method, routePath, handlers) {
    const app = express()
    app.use(express.json())
    app.use((req, res, next) => { req.user = { uuid: req.headers['x-user'], sessionId: 's-1' }; next() })
    app[method](routePath, ...handlers)
    app.use((err, req, res, next) => res.status(err.status ?? 500).json({ code: err.code ?? 'ERR', message: err.message }))
    const server = http.createServer(app)
    const { url } = await listenOnFetchablePort(server, { pickPort: () => HIGH_PORT_MIN + crypto.randomInt(HIGH_PORT_MAX - HIGH_PORT_MIN + 1) })
    t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) }))
    return async ({ user = null, body = {} } = {}) => {
        const res = await fetch(`${url}${routePath}`, {
            method: method.toUpperCase(),
            headers: { 'content-type': 'application/json', connection: 'close', ...(user ? { 'x-user': user } : {}) },
            body: JSON.stringify(body),
        })
        return { status: res.status, body: await res.json().catch(() => null) }
    }
}

// 죽은 Node 청소를 맨 먼저 (DB를 비운 직후라 다른 시험 접속 줄이 안 섞임)
// 진짜 시간 3.2초 기다림 + Node 3대 끄기(5초 남짓)라 이 시험만 시간 제한 60초
test('A17-B-183 죽은 Node가 남긴 접속 중 표시를 하나만 OFFLINE으로 고침: n2 강제 종료(ONLINE 3줄) → 청소 뒤 3줄 OFFLINE, n1·n3 동시에 돌아도 고친 Node 하나', { skip: skipReason, timeout: 60000 }, async (t) => {
    if (noDb(t)) return
    const w = await startRedis(t, ['n1', 'n2', 'n3'])
    const users = [await createUser('j183a'), await createUser('j183b'), await createUser('j183c')]
    for (const u of users) await connectOn(w.n2, u.uuid)
    for (const u of users) assert.deepEqual([(await presenceOf(u.uuid))?.status, (await presenceOf(u.uuid))?.server_id], ['ONLINE', 'n2'])
    // 강제 종료: 끊김 처리 없이 Node만 사라짐 (접속 줄은 ONLINE 그대로)
    await w.kill('n2')
    // 막 붙은 줄을 안 지우는 기준 시각(죽음 판정 + 하트비트 2번 = 1.9초)이 지날 때까지, DB 시각은 초 단위로 반올림돼 1초 더 기다림
    await new Promise((resolve) => setTimeout(resolve, 3_200))
    await w.refresh()
    const runs = await Promise.all([
        w.n1.b.x['socket/connection/janitor'].runJanitorOnce(),
        w.n3.b.x['socket/connection/janitor'].runJanitorOnce(),
    ])
    assert.equal(runs.filter((r) => r.ran).length, 1, `청소한 Node 수: ${JSON.stringify(runs)}`)
    assert.equal(runs.reduce((sum, r) => sum + r.changed, 0), 3)
    for (const u of users) assert.equal((await presenceOf(u.uuid)).status, 'OFFLINE', u.uuid)
})

// 나(n1 접속)와 친구 A, 친구 관계 한 줄
async function friendPair(label) {
    const me = await createUser(`${label}m`)
    const friend = await createUser(`${label}f`)
    await db.Friendship.create({ requester_id: me.uuid, receiver_id: friend.uuid, status: 'ACCEPTED' })
    return { me: me.uuid, friend: friend.uuid }
}

test('A17-B-184 친구 목록에 다른 Node 접속자가 ONLINE: 친구 A n2 접속 → n1 친구 목록 A ONLINE', { skip: skipReason, timeout: 30000 }, async (t) => {
    if (noDb(t)) return
    const w = await startRedis(t, ['n1', 'n2'])
    const { me, friend } = await friendPair('j184')
    await connectOn(w.n1, me)
    await connectOn(w.n2, friend)
    assert.equal(await friendStatusOn(w.n1, me, friend), 'ONLINE')
})

test('A17-B-185 친구 목록에 죽은 Node 줄 친구는 OFFLINE: A n2 접속 → n2 강제 종료 → n1 친구 목록 A OFFLINE', { skip: skipReason, timeout: 30000 }, async (t) => {
    if (noDb(t)) return
    const w = await startRedis(t, ['n1', 'n2'])
    const { me, friend } = await friendPair('j185')
    await connectOn(w.n1, me)
    await connectOn(w.n2, friend)
    await w.kill('n2')
    assert.equal((await presenceOf(friend)).status, 'ONLINE', '접속 줄은 ONLINE으로 남음 (청소 전)')
    assert.equal(await friendStatusOn(w.n1, me, friend), 'OFFLINE')
})

test('A17-B-186 옛 Node의 OFFLINE 쓰기가 새 Node ONLINE을 안 덮음: A n1 → n2로 옮김 → n1 끊김 처리 늦게 → 접속 줄 ONLINE·n2', { skip: skipReason, timeout: 30000 }, async (t) => {
    if (noDb(t)) return
    const w = await startRedis(t, ['n1', 'n2'])
    const a = await createUser('j186')
    const oldSocket = await connectOn(w.n1, a.uuid)
    await connectOn(w.n2, a.uuid)
    assert.equal((await presenceOf(a.uuid)).server_id, 'n2')
    // n1 옛 탭 끊김 처리가 늦게 옴
    oldSocket.connected = false
    await asNode(w.n1, () => w.n1.b.x['socket/connection/presence'].handleDisconnect(w.n1.io, oldSocket, a.uuid))
    await W.settle()
    const row = await presenceOf(a.uuid)
    assert.deepEqual([row.status, row.server_id], ['ONLINE', 'n2'])
})

test('A17-B-187 현재 비번 틀린 횟수 합침 (진짜 Redis): n1 3번 + n2 2번 → 6번째 429', { skip: skipReason, timeout: 30000 }, async (t) => {
    if (noDb(t)) return
    const w = await startRedis(t, ['n1', 'n2'])
    const a = await createUser('j187', 'Right-pass-1!')
    const send = {}
    for (const id of ['n1', 'n2']) send[id] = await startApp(t, 'patch', '/me/password', routeHandlers(w[id].b, 'routes/user.routes', 'patch', '/me/password'))
    const change = (id, currentPassword) => send[id]({ user: a.uuid, body: { currentPassword, newPassword: 'Newpass-77!x' } })
    for (let i = 0; i < 3; i += 1) assert.equal((await change('n1', 'Wrong-pass-9!')).status, 400, `n1 ${i + 1}번째`)
    for (let i = 0; i < 2; i += 1) assert.equal((await change('n2', 'Wrong-pass-9!')).status, 400, `n2 ${i + 1}번째`)
    const sixth = await change('n2', 'Right-pass-1!')
    assert.equal(sixth.status, 429)
    assert.match(sixth.body.message, /^현재 비밀번호를 여러 번 잘못 입력했습니다/)
})

test('A17-B-188 가입 인증번호 요청 제한 합침 (진짜 Redis): 같은 ip 시간 한도 30을 n1·n2 절반씩 → 31번째 429', { skip: skipReason, timeout: 30000 }, async (t) => {
    const w = await startRedis(t, ['n1', 'n2'])
    const send = {}
    for (const id of ['n1', 'n2']) {
        send[id] = await startApp(t, 'post', '/signup/email-code', routeHandlers(w[id].b, 'routes/auth.routes', 'post', '/signup/email-code', { lastOk: true }))
    }
    // 주소는 매번 다르게 (주소 제한 말고 ip 제한만 걸리게)
    const ask = (id, i) => send[id]({ body: { email: `j188-${i}@example.test` } })
    for (let i = 0; i < 30; i += 1) assert.equal((await ask(i < 15 ? 'n1' : 'n2', i)).status, 200, `${i + 1}번째`)
    const over = await ask('n1', 30)
    assert.equal(over.status, 429)
    assert.equal(over.body.code, 'RATE_LIMITED')
})

test('A17-B-189 코드 입장 시도 합침 (진짜 Redis): n1 10번 + n2 10번 → 21번째 거절', { skip: skipReason, timeout: 30000 }, async (t) => {
    const w = await startRedis(t, ['n1', 'n2'])
    w.n1.connect('j189')
    w.n2.connect('j189')
    for (const id of ['n1', 'n2']) {
        for (let i = 0; i < 10; i += 1) {
            const r = await w[id].joinByCode('j189', 'ZZZZZZ')
            assert.match(r?.payload?.message ?? '', /방이 없습니다/, `${id} ${i + 1}번째: ${JSON.stringify(r)}`)
        }
    }
    const r21 = await w.n1.joinByCode('j189', 'ZZZZZZ')
    assert.equal(r21?.event, 'room_join_failed')
    assert.equal(r21.payload.code, 'TOO_MANY_JOIN_ATTEMPTS')
})

test('A17-B-190 로그인 비번 틀린 횟수는 Node가 달라도 5번에 잠김: n1 3번 + n2 2번 → 5번째 423, 6번째 맞는 비번(n1)도 423', { skip: skipReason, timeout: 30000 }, async (t) => {
    if (noDb(t)) return
    const w = await startRedis(t, ['n1', 'n2'])
    const a = await createUser('j190', 'Right-pass-1!')
    const send = {}
    for (const id of ['n1', 'n2']) send[id] = await startApp(t, 'post', '/login', routeHandlers(w[id].b, 'routes/auth.routes', 'post', '/login'))
    const login = (id, password) => send[id]({ body: { email: a.email, password } })
    for (let i = 0; i < 3; i += 1) assert.equal((await login('n1', 'Wrong-pass-9!')).status, 401, `n1 ${i + 1}번째`)
    assert.equal((await login('n2', 'Wrong-pass-9!')).status, 401, 'n2 1번째 (4번째)')
    const fifth = await login('n2', 'Wrong-pass-9!')
    assert.equal(fifth.status, 423)
    assert.equal(fifth.body.message, '비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.')
    const sixth = await login('n1', 'Right-pass-1!')
    assert.equal(sixth.status, 423)
})

