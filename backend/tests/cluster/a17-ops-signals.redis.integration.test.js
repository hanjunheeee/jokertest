'use strict'

// 서버 여러 대 운영 신호 시험(진짜 Redis) — 점검·금지어 다시 읽기, 공지, 강제 끊기·탈퇴·로그아웃·비번 바꾸기 끊김, 서버 꺼짐 안내, Node 비우기, Node 목록·지금 상황·/health
// 목록 A17-B-159~182·191 (docs/게임_의도_2026-11-15/시험목록/A17-서버-여러대.md "운영 신호 · Node 비우기"), 159~175·191은 시험 DB도 씀 (주소 없으면 그 번호만 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL || ''
// 모델이 읽는 주소: 시험 DB (없으면 닿지 않는 곳), 꼭 아래 require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'
// 토큰·내부 열쇠는 이 시험 안에서만 쓰는 값 (진짜 값 아님)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a17-ops-signals-test-only-jwt-secret-0123456789'
const INTERNAL_KEY = 'a17-ops-signals-test-only-internal-key-0123456789'
process.env.INTERNAL_API_KEY = INTERNAL_KEY

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const Module = require('node:module')
const express = require('express')
const cookieParser = require('cookie-parser')
const ioClient = require('socket.io-client')

const { REDIS_URL_TEST, waitFor, cleanupPrefix } = require('./helpers/redisNodes')
const { createRedisProxy } = require('./helpers/redisProxy')
const { listenOnFetchablePort } = require('../helpers/fetchablePort')
const W = require('./a17-world')

// 가짜 시계를 켜도 진짜로 기다릴 수 있게 처음 setTimeout을 잡아 둠
const realSetTimeout = setTimeout
const realSleep = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms))

const noRedis = REDIS_URL_TEST ? false : 'REDIS_URL_TEST 없음 (with-lock.sh redis로 돌림)'
const noRedisOrDb = noRedis || (TEST_DB_URL ? false : 'F01_TEST_DATABASE_URL 없음 (with-lock.sh testdb도 같이)')
const REDIS_PORT = REDIS_URL_TEST ? Number(new URL(REDIS_URL_TEST).port || 6379) : 0

// ── Node마다 backend 코드 따로 불러 두기 (늦게 require하는 곳도 그 Node 것이 나오게) ──
// a17-world.loadBundle은 불러온 뒤 캐시를 되돌려서, 함수 안에서 늦게 require하는 곳(공지·/health·금지어 DB)이 다른 묶음 것을 집음
// → 묶음마다 모듈 표를 따로 두고, 묶음 모듈이 require하면 그 표에서 찾게 Module._load를 감쌈 (이 파일 안에서만)
const BACKEND = W.BACKEND
const isBackendFile = (file) => typeof file === 'string' && file.startsWith(BACKEND + path.sep) && !file.includes(`${path.sep}node_modules${path.sep}`)
const owners = new WeakMap()
const originalLoad = Module._load

// 묶음 표를 require 캐시에 잠깐 넣고 fn → 새로 불린 backend 모듈은 그 묶음 표에 넣음, 끝나면 원래 캐시로
function withBundleCache(map, fn) {
    const saved = new Map()
    for (const key of Object.keys(require.cache)) {
        if (!isBackendFile(key)) continue
        saved.set(key, require.cache[key])
        delete require.cache[key]
    }
    for (const [key, mod] of map) require.cache[key] = mod
    try {
        return fn()
    } finally {
        for (const key of Object.keys(require.cache)) {
            if (!isBackendFile(key)) continue
            const mod = require.cache[key]
            if (!map.has(key)) { map.set(key, mod); owners.set(mod, map) }
            delete require.cache[key]
        }
        for (const [key, mod] of saved) require.cache[key] = mod
    }
}

Module._load = function a17BundleLoad(request, parent, isMain) {
    const map = parent ? owners.get(parent) : null
    if (!map) return originalLoad.apply(this, arguments)
    let filename
    try { filename = Module._resolveFilename(request, parent, isMain) } catch { return originalLoad.apply(this, arguments) }
    if (!isBackendFile(filename)) return originalLoad.apply(this, arguments)
    const hit = map.get(filename)
    if (hit) return hit.exports
    return withBundleCache(map, () => originalLoad.call(this, request, parent, isMain))
}
test.after(() => { Module._load = originalLoad })

// Node 하나 몫 묶음 (서버 하나를 켜는 데 필요한 것 전부)
function loadOpsBundle() {
    const map = new Map()
    return withBundleCache(map, () => {
        const r = (rel) => require(path.join(BACKEND, rel))
        const gf = r('tests/audit-2026-11-09/gameFixtures')
        // gameFixtures가 DB 주소를 막아 둠 → 시험 DB로 다시
        process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'
        const mm = r('socket/matchmaking')
        const gs = r('socket/gameSession')
        return {
            gf, mm, gs, MM: mm.__testables, G: gs.__testables,
            mf: r('tests/helpers/matchmakingFixtures'),
            models: r('models'),
            cluster: r('cluster'),
            byId: r('game-core/queries/byId'),
            matchState: r('socket/matchmaking/core/state'),
            gameState: r('game-core/core/registry/state'),
            desertion: r('services/game/desertion'),
            loc: r('socket/connection/locationSync'),
            roomDirectory: r('socket/matchmaking/cluster/roomDirectory'),
            roomListSync: r('socket/matchmaking/cluster/roomListSync'),
            entryLimits: r('socket/matchmaking/join/entryLimits'),
            returnRoom: r('socket/matchmaking/room/returnRoom'),
            lobbyEntry: r('socket/matchmaking/room/lobbyEntry'),
            e2eHooks: r('socket/e2e/gameHooks'),
            socketMain: r('socket/socket'),
            emitter: r('socket/emitter'),
            maintenance: r('services/ops/maintenance'),
            bannedWords: r('services/ops/bannedWords'),
            reloadSync: r('services/ops/reloadSync'),
            serverStats: r('utils/serverStats'),
            lifecycle: r('utils/processLifecycle'),
            sessionLifecycle: r('services/auth/sessionLifecycle'),
            sessionIssue: r('services/auth/account/session'),
            withdraw: r('services/auth/account/withdraw'),
            password: r('services/auth/account/password'),
            credentials: r('utils/auth/credentials'),
            healthRouter: r('routes/health.routes'),
            internalRoutes: r('routes/internal.routes'),
            authRouter: r('routes/auth.routes'),
            userRouter: r('routes/user.routes'),
            errors: r('middlewares/errorHandler.middleware'),
        }
    })
}

const BUNDLES = REDIS_URL_TEST ? { n1: loadOpsBundle(), n2: loadOpsBundle() } : {}
const extraBundles = []
test.after(async () => {
    for (const b of [...Object.values(BUNDLES), ...extraBundles]) await b.models.sequelize.close().catch(() => {})
})

// ── 시험 DB (파일 처음 한 번 비우고 마이그레이션 끝까지) ──
let schemaReady = null
async function ensureSchema() {
    if (!TEST_DB_URL) return
    if (!schemaReady) {
        schemaReady = (async () => {
            const migrationRunner = require('../../db/migrationRunner')
            const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb')
            const { MIGRATIONS } = require('../../scripts/migrate-db')
            const schema = buildManagedSchema({
                baseline: require('../../db/migrations/0001-legacy-baseline'),
                addRefreshTokenHistory: require('../../db/migrations/0004-add-refresh-token-history'),
                addSocialAuth: require('../../db/migrations/0005-add-social-auth'),
                migrationRunner,
            })
            const { sequelize } = BUNDLES.n1.models
            await resetManagedSchema(sequelize, TEST_DB_URL, schema)
            await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS })
        })()
    }
    await schemaReady
}

// ── Node 켜기: 묶음 하나 = socket.io 서버 + express(/health·/auth·/user·/internal) + Redis 중계 하나 ──

const FAST_ENV = { CLUSTER_HEARTBEAT_MS: '200', NODE_DEAD_AFTER_MS: '3000', PRESENCE_OFFLINE_DELAY_MS: '0' }

// 묶음 장부 비우기 + DB 안 가게 할 곳 끼우기 (판 결과·낮 표·업적·탈주 기록, 대기방 닉네임)
function resetBundle(b) {
    b.gf.resetCore()
    b.mm.__resetStateForTests()
    b.gs.__resetStateForTests()
    b.roomDirectory.__resetRoomDirectoryForTests()
    b.roomListSync.__resetRoomListSyncForTests()
    b.entryLimits.__resetEntryLimitsForTests()
    b.desertion.__resetForTests()
    b.e2eHooks.clearRolePresets?.()
    b.mf.installFakeMatchmakingDeps(b.mm)
    b.G.__setRecordVoteParticipationForTests(async () => {})
    b.G.__setEvaluateAchievementsForTests(async () => {})
    b.G.__setGameResultPersistForTests(async () => ({ ok: true }))
    b.desertion.__setRepositoryForTests(W.createDesertionDb())
    b.maintenance.__setStateForTests({ enabled: false })
    b.bannedWords.__setWordsForTests([])
    b.withdraw.__resetWithdrawAttemptsForTests()
    b.password.__resetWrongPasswordAttemptsForTests()
    // 장부 비우기가 접속 목록을 새 Map으로 바꿈 → 실제 서버처럼 emitter 접속 목록으로 다시 (socket.js가 불러올 때 하는 것)
    b.gs.setOnlineUsersRegistry(b.emitter.onlineUsers)
    b.mm.setOnlineUsersRegistry(b.emitter.onlineUsers)
}

// express 앱: 실제 서버와 같은 경로만 붙임
function buildApp(b) {
    const app = express()
    app.use(express.json())
    app.use(cookieParser())
    app.use('/health', b.healthRouter)
    app.use('/auth', b.authRouter)
    app.use('/user', b.userRouter)
    app.use('/internal', b.internalRoutes.createInternalRouter({ env: { ...process.env, INTERNAL_API_KEY: INTERNAL_KEY } }))
    app.use(b.errors.notFoundHandler)
    app.use(b.errors.globalErrorHandler)
    return app
}

// Node 하나 켜기 → 손잡이 (끄기는 t.after)
async function startNode(t, b, { id, prefix, env = {} }) {
    resetBundle(b)
    const proxy = await createRedisProxy({ targetPort: REDIS_PORT })
    const server = http.createServer(buildApp(b))
    const { url } = await listenOnFetchablePort(server)
    const io = b.socketMain.initSocket(server, { corsOrigin: '*', allowRequest: (req, cb) => cb(null, true) })
    const stats = () => b.serverStats.collectHeartbeatStats({
        sources: { onlineUsers: b.emitter.onlineUsers, gameSessions: b.gameState.gameSessions, gameRooms: b.matchState.gameRooms },
    })
    await b.cluster.init({
        io,
        env: { REDIS_URL: proxy.url, SERVER_ID: id, REDIS_KEY_PREFIX: prefix, ...FAST_ENV, ...env },
        bootEpoch: b.mm.__getBootEpochForTests(),
        statsProvider: stats,
        log: { log() {}, info() {}, warn() {}, error() {} },
    })
    const node = {
        id, b, url, io, proxy, server, closed: false,
        // 끄기: 소켓·http 닫고 Redis 연결 닫음 (하트비트 지움)
        async close() {
            if (node.closed) return
            node.closed = true
            await Promise.race([new Promise((resolve) => io.close(() => resolve())), realSleep(2000)])
            await b.cluster.close().catch(() => {})
            await proxy.close().catch(() => {})
        },
        // HTTP 한 번 → { status, body }
        async http(method, route, { body, token, internal = false } = {}) {
            const headers = { 'content-type': 'application/json' }
            if (token) headers.cookie = `accessToken=${token}`
            if (internal) headers['x-internal-key'] = INTERNAL_KEY
            const res = await fetch(`${url}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
            const text = await res.text()
            let parsed
            try { parsed = JSON.parse(text) } catch { parsed = text }
            return { status: res.status, body: parsed }
        },
    }
    t.after(() => node.close())
    return node
}

// n1·n2 켜기 → { n1, n2, prefix }, 끝에 Redis 키 지움
async function startOpsNodes(t, { env = {}, nodeEnv = {}, ids = ['n1', 'n2'] } = {}) {
    const prefix = `a17-${crypto.randomUUID().slice(0, 8)}`
    const nodes = { prefix }
    for (const id of ids) nodes[id] = await startNode(t, BUNDLES[id], { id, prefix, env: { ...env, ...(nodeEnv[id] ?? {}) } })
    // 정리 고리는 단 차례대로 돎 → Node 끈 뒤 키 지우기
    t.after(() => cleanupPrefix(prefix))
    await seeEachOther(ids.map((id) => nodes[id]))
    return nodes
}

// 모든 Node가 서로를 살아 있다고 볼 때까지
async function seeEachOther(list) {
    await waitFor(async () => {
        for (const n of list) await n.b.cluster.nodes.refresh().catch(() => {})
        return list.every((n) => list.every((o) => n.b.cluster.nodes.list().some((x) => x.id === o.id)))
    }, { timeoutMs: 8000 })
}

// ── 사람·세션·소켓 ──

let userSeq = 0
// 시험 DB에 사람 하나 (비번 있음) → { uuid, password }
async function createDbUser(b, label = 'u') {
    userSeq += 1
    const uuid = crypto.randomUUID()
    const password = `Pw-${uuid.slice(0, 8)}!a1`
    await b.models.User.create({
        uuid,
        password_hash: await b.credentials.hashPassword(password),
        nickname: `${label}${userSeq}${uuid.slice(0, 3)}`.slice(0, 8),
        email: `${label}-${uuid}@example.test`,
    })
    return { uuid, password }
}

// 진짜 세션 한 줄 + access 토큰 (로그인과 같은 함수)
async function issueToken(b, uuid) {
    const user = await b.models.User.findOne({ where: { uuid } })
    const { token } = await b.sessionIssue.issueSessionForUser(user, { rememberMe: false }, { ip: '127.0.0.1' })
    return token
}

// DB 없이 붙는 토큰: 세션 확인을 늘 통과로 바꿔 끼움 (Redis만 쓰는 번호)
function stubAuth(t, nodes) {
    for (const n of nodes) t.mock.method(n.b.sessionLifecycle, 'resolveSession', async () => ({ ok: true }))
}
const stubToken = (b, uuid) => b.credentials.generateToken({ uuid, role: 'USER', sessionId: crypto.randomUUID() })

// 진짜 소켓으로 붙기 → { socket, received, first(event), closed }
async function connectClient(t, node, token) {
    const socket = ioClient(node.url, {
        transports: ['websocket'], reconnection: false, extraHeaders: { cookie: `accessToken=${token}` },
    })
    const received = []
    socket.onAny((event, payload) => received.push({ event, payload }))
    let closedResolve
    const closed = new Promise((resolve) => { closedResolve = resolve })
    socket.on('disconnect', (reason) => closedResolve(reason))
    t.after(() => socket.close())
    await Promise.race([
        new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) }),
        realSleep(5000).then(() => { throw new Error('소켓 접속 시간 초과') }),
    ])
    // 접속 처리(접속 줄·채널·Redis 접속 기록) 끝날 때까지
    await realSleep(150)
    return { socket, received, closed, events: () => received.map((e) => e.event) }
}

// 답 기다리는 사건 (2초 안 답 없으면 null)
async function emitAck(client, event, payload) {
    try {
        return await client.socket.timeout(2000).emitWithAck(event, payload)
    } catch {
        return null
    }
}

// 정한 시간 안에 끝나는지 (끝나면 걸린 ms, 아니면 null)
async function within(promise, ms) {
    const started = Date.now()
    const done = await Promise.race([promise.then(() => true), realSleep(ms).then(() => false)])
    return done ? Date.now() - started : null
}

// ── 가짜 소켓 쪽 (대기방·판 핸들러를 사건 이름으로 부름: 점검 거절은 사건 등록 자리에 있음) ──

// 이 Node 가짜 사람 붙이기: 사건 등록까지 한 소켓, 접속 목록은 실제 서버와 같은 emitter 목록
function fakeNodeFor(node, t) {
    const { b } = node
    const io = b.mf.createFakeIo([])
    const sockets = new Map()
    let seq = 0
    const fake = {
        id: node.id, b, io, sockets,
        connect(uuid) {
            seq += 1
            const s = b.mf.createFakeSocket(uuid, { id: `${node.id}-fake-${uuid}-${seq}` })
            io.sockets.sockets.set(s.id, s)
            b.emitter.onlineUsers.set(uuid, s.id)
            sockets.set(uuid, s)
            b.mm.registerMatchmakingHandlers(io, s, uuid, { getCurrentSocketId: (u) => b.emitter.onlineUsers.get(u) ?? null })
            return s
        },
        sock: (uuid) => sockets.get(uuid),
        received: (uuid, event) => (sockets.get(uuid)?.received ?? []).filter((e) => e.event === event).map((e) => e.payload),
        // 사건 이름으로 부르기 (답 함수 있음) → 답
        emit: (uuid, event, payload) => new Promise((resolve) => sockets.get(uuid).trigger(event, payload, resolve)),
        // a17-world openGame이 쓰는 이름들
        ask: (handler, uuid, payload) => b.mf.callAsPromise(handler, io, sockets.get(uuid), uuid, payload),
        createRoom: (uuid, overrides = {}) => fake.emit(uuid, 'create_room', { accessType: 'code', maxPlayers: 5, jokerCount: 1, ...W.TIMES, ...overrides }),
        async joinByCode(uuid, code) {
            const s = sockets.get(uuid)
            const before = s.emitted.length
            s.trigger('join_room_by_code', { roomCode: code })
            await settle()
            const tail = s.emitted.slice(before).filter((e) => e.event === 'room_joined' || e.event === 'room_join_failed')
            return tail.at(-1) ?? null
        },
        setReady: (uuid, room, ready = true) => fake.emit(uuid, 'set_ready', b.mf.readyPayload(room, ready)),
        start: (uuid, room) => fake.emit(uuid, 'start_game', b.mf.startPayload(room)),
        returnToRoom: (uuid, gameId) => fake.emit(uuid, 'return_to_room', { gameId }),
        session: (gameId) => b.byId.getSessionById(gameId),
    }
    t.after(() => { for (const uuid of sockets.keys()) b.emitter.onlineUsers.delete(uuid) })
    return fake
}

// 같은 차례 일 + Redis 왕복 (가짜 시계여도 진짜로 조금 기다림)
async function settle() {
    await W.settle()
    await realSleep(30)
    await W.settle()
}

// a17-world openGame·playToEnd에 넘길 세상 (가짜 시계 켠 뒤)
function gameWorld(t) {
    return {
        settle,
        advanceUntil(node, gameId, done, limitMs = 900_000) {
            for (let spent = 0; spent <= limitMs; spent += 1_000) {
                const session = node.session(gameId)
                if (!session || done(session)) return session
                t.mock.timers.tick(1_000)
            }
            throw new Error(`판이 ${limitMs}ms 안에 원하는 상태가 안 됨`)
        },
    }
}

// 5명 대기방 (전원 준비) → { uuids, host, room }
async function readyRoom(fake, prefix, n = 5) {
    const uuids = Array.from({ length: n }, (_, i) => `${prefix}-${i}`)
    for (const uuid of uuids) fake.connect(uuid)
    const created = await fake.createRoom(uuids[0], { maxPlayers: n })
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code} ${created.message}`)
    for (const uuid of uuids.slice(1)) {
        const joined = await fake.joinByCode(uuid, created.room.roomCode)
        assert.equal(joined?.event, 'room_joined', `${uuid} 입장 실패: ${JSON.stringify(joined?.payload)}`)
    }
    for (const uuid of uuids) {
        const r = await fake.setReady(uuid, created.room)
        assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`)
    }
    return { uuids, host: uuids[0], room: created.room }
}

// 점검 한 줄 켜기·끄기 (DB)
async function setMaintenanceRow(b, enabled) {
    await b.models.MaintenanceState.upsert({ id: 1, is_enabled: enabled, message: null, starts_at: null, ends_at: null, updated_at: new Date() })
}

// ── 점검·금지어 다시 읽기 ──

test('A17-B-159 점검 켜고 n1에서 다시 읽기 → n2 방 만들기 거절', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    t.after(() => setMaintenanceRow(n1.b, false))
    await setMaintenanceRow(n1.b, true)
    const reload = await n1.http('POST', '/internal/maintenance/reload', { internal: true })
    assert.equal(reload.status, 200)
    await realSleep(300)
    const f2 = fakeNodeFor(n2, t)
    f2.connect('b159-host')
    const answer = await f2.createRoom('b159-host')
    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'MAINTENANCE')
})

test('A17-B-160 점검 다시 읽기 뒤 n2 방장 판 시작도 거절 (5명 대기방)', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    t.after(() => setMaintenanceRow(n1.b, false))
    const f2 = fakeNodeFor(n2, t)
    const { host, room } = await readyRoom(f2, 'b160', 5)
    await setMaintenanceRow(n1.b, true)
    const reload = await n1.http('POST', '/internal/maintenance/reload', { internal: true })
    assert.equal(reload.status, 200)
    await realSleep(300)
    const answer = await f2.start(host, room)
    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'MAINTENANCE')
    assert.equal(f2.received(host, 'game_started').length, 0)
})

test('A17-B-161 알림을 놓친 n2도 안전망 간격 안에 점검 반영', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    t.after(() => setMaintenanceRow(n1.b, false))
    // 안전망 간격을 짧게 (OPS_RELOAD_INTERVAL_MS 자리), 끝나면 기본으로
    const net = n2.b.reloadSync.__testables
    net.stopSafetyNet()
    net.startSafetyNet(300)
    t.after(() => { net.stopSafetyNet(); net.startSafetyNet() })
    await setMaintenanceRow(n1.b, true)
    // n1만 다시 읽고 알림은 안 보냄 (알림을 놓친 것과 같음)
    await n1.b.maintenance.reloadMaintenance()
    await realSleep(1000)
    const f2 = fakeNodeFor(n2, t)
    f2.connect('b161-host')
    const answer = await f2.createRoom('b161-host')
    assert.equal(answer.ok, false)
    assert.equal(answer.code, 'MAINTENANCE')
})

test('A17-B-162 새 금지어를 n1에서 다시 읽으면 n2 판 채팅에서도 가려짐 (6명 판)', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const word = `금지${crypto.randomUUID().slice(0, 4)}`
    const row = await n1.b.models.BannedWord.create({ word, is_active: true })
    t.after(() => row.destroy())
    const reload = await n1.http('POST', '/internal/banned-words/reload', { internal: true })
    assert.equal(reload.status, 200)
    await realSleep(300)
    // n2 판 (가짜 소켓, 직업 고정) 첫 낮
    const session = n2.b.gf.startGame({ id: 'b162', n: 6 })
    n2.b.gf.toDay(session)
    const world = n2.b.gf.socketWorld(n2.b.gs, session)
    const [speaker, listener] = [...session.players.keys()]
    const reply = await n2.b.gf.call(n2.b.G.handleSubmitGameChatMessage, world.io, world.sock(speaker), speaker, { gameId: session.id, text: `안녕 ${word} 끝` })
    assert.equal(reply.ok, true, `채팅 거절: ${reply.code}`)
    const texts = world.sock(listener).received.map((e) => e.payload?.text ?? e.payload?.message?.text).filter((x) => typeof x === 'string')
    assert.ok(texts.length > 0, '판 사람이 채팅을 못 받음')
    assert.equal(texts.at(-1), `안녕 ${'*'.repeat(word.length)} 끝`)
})

test('A17-B-163 금지어 든 닉네임 바꾸기는 n1·n2 어디로 가도 같은 거절', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const word = `욕${crypto.randomUUID().slice(0, 3)}`
    const row = await n1.b.models.BannedWord.create({ word, is_active: true })
    t.after(() => row.destroy())
    const reload = await n1.http('POST', '/internal/banned-words/reload', { internal: true })
    assert.equal(reload.status, 200)
    await realSleep(300)
    const user = await createDbUser(n1.b, 'nk')
    const token = await issueToken(n1.b, user.uuid)
    const nickname = `a${word}`
    const fromN1 = await n1.http('PATCH', '/user/me/nickname', { token, body: { nickname } })
    const fromN2 = await n2.http('PATCH', '/user/me/nickname', { token, body: { nickname } })
    assert.ok(fromN1.status >= 400 && fromN1.status < 500, `n1이 거절 안 함: ${fromN1.status}`)
    assert.deepEqual(fromN2, fromN1)
    const saved = await n1.b.models.User.findOne({ where: { uuid: user.uuid }, raw: true })
    assert.notEqual(saved.nickname, nickname)
})

// ── 공지 ──

test('A17-B-164 공지(접속자)가 n1·n2 접속자 둘 다에게 감', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const a = await createDbUser(n1.b, 'an')
    const b = await createDbUser(n1.b, 'an')
    const ca = await connectClient(t, n1, await issueToken(n1.b, a.uuid))
    const cb = await connectClient(t, n2, await issueToken(n1.b, b.uuid))
    const announcementId = `a17-164-${crypto.randomUUID().slice(0, 8)}`
    const res = await n1.http('POST', '/internal/announcements', {
        internal: true, body: { announcementId, title: '공지', body: '서버 두 대 공지', target: 'online' },
    })
    assert.equal(res.status, 200)
    const gotIt = (c) => c.received.some((e) => e.payload?.notification?.target?.announcementId === announcementId)
    await waitFor(() => gotIt(ca) && gotIt(cb), { timeoutMs: 3000 }).catch(() => {})
    assert.equal(gotIt(ca), true, 'n1 사람이 공지를 못 받음')
    assert.equal(gotIt(cb), true, 'n2 사람이 공지를 못 받음')
})

test('A17-B-165 죽은 Node 접속 줄 사람은 공지 대상에서 빠짐', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t, { env: { NODE_DEAD_AFTER_MS: '1500' } })
    const a = await createDbUser(n1.b, 'dd')
    const b = await createDbUser(n1.b, 'dd')
    await connectClient(t, n1, await issueToken(n1.b, a.uuid))
    await connectClient(t, n2, await issueToken(n1.b, b.uuid))
    await waitFor(async () => (await n1.b.models.OnlinePresence.count({ where: { user_id: b.uuid, status: 'ONLINE' } })) === 1, { timeoutMs: 3000 })
    // n2 강제 종료 흉내: Redis 연결만 끊김 (접속 줄 ONLINE 그대로, 하트비트 멈춤)
    n2.proxy.kill()
    await waitFor(async () => { await n1.b.cluster.nodes.refresh(); return !n1.b.cluster.nodes.isAlive('n2') }, { timeoutMs: 8000 })
    const announcementId = `a17-165-${crypto.randomUUID().slice(0, 8)}`
    const res = await n1.http('POST', '/internal/announcements', {
        internal: true, body: { announcementId, title: '공지', body: '죽은 Node 빼기', target: 'online' },
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.recipientCount, 1, `대상 수: ${JSON.stringify(res.body)}`)
    const toB = await n1.b.models.Notification.count({ where: { user_id: b.uuid } })
    assert.equal(toB, 0, 'n2 사람에게 공지가 저장됨')
})

// ── 강제 끊기·탈퇴 ──

test('A17-B-166 n2 사람 강제 끊기를 n1이 받아도 끊김, 끊은 수 1', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const u = await createDbUser(n1.b, 'fd')
    const c = await connectClient(t, n2, await issueToken(n1.b, u.uuid))
    const res = await n1.http('POST', `/internal/users/${u.uuid}/disconnect`, { internal: true })
    assert.equal(res.status, 200)
    assert.equal(res.body.disconnected, 1)
    assert.notEqual(await within(c.closed, 3000), null, 'n2 소켓이 안 끊김')
})

test('A17-B-167 강제 끊기 중 Redis 죽음 → n1 사람만 끊기고 답 partial:true', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const u = await createDbUser(n1.b, 'pk')
    const token = await issueToken(n1.b, u.uuid)
    const onN1 = await connectClient(t, n1, token)
    // n1 Redis 죽음 → 같은 사람이 n2에도 붙음 (n1이 밀어내기 알림을 못 받아 둘 다 붙어 있음)
    n1.proxy.kill()
    await waitFor(() => n1.b.cluster.state() === 'down', { timeoutMs: 5000 })
    const onN2 = await connectClient(t, n2, token)
    const res = await n1.http('POST', `/internal/users/${u.uuid}/disconnect`, { internal: true })
    assert.equal(res.status, 200)
    assert.equal(res.body.partial, true)
    assert.equal(res.body.disconnected, 1)
    assert.notEqual(await within(onN1.closed, 2000), null, 'n1 소켓이 안 끊김')
    assert.equal(onN2.socket.connected, true, 'n2 소켓까지 끊김')
    assert.equal(onN2.received.some((e) => e.event === 'force_disconnect' && e.payload?.code === 'ADMIN_DISCONNECT'), false)
})

// n1이 n2 사람을 끊은 첫 안내 code (5번 되풀이, 사람마다 새로)
const REASON_CASES = [
    { no: '168', code: 'ACCOUNT_BANNED', label: '정지', prepare: (b, uuid) => b.models.UserBan.create({ user_id: uuid, reason: '시험', is_permanent: true, start_at: null, end_at: null }) },
    { no: '169', code: 'ACCOUNT_INACTIVE', label: '비활성', prepare: (b, uuid) => b.models.User.update({ status: 'SUSPENDED' }, { where: { uuid } }) },
    { no: '170', code: 'ADMIN_DISCONNECT', label: '관리자 끊기', prepare: async () => {} },
]

for (const one of REASON_CASES) {
    test(`A17-B-${one.no} n1이 끊은 n2 사람의 첫 안내가 끊은 까닭(${one.label}) × 5번`, { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
        await ensureSchema()
        const { n1, n2 } = await startOpsNodes(t)
        for (let round = 1; round <= 5; round += 1) {
            const u = await createDbUser(n1.b, 'rs')
            const c = await connectClient(t, n2, await issueToken(n1.b, u.uuid))
            await one.prepare(n1.b, u.uuid)
            const res = await n1.http('POST', `/internal/users/${u.uuid}/disconnect`, { internal: true })
            assert.equal(res.status, 200, `${round}번째 답: ${JSON.stringify(res.body)}`)
            assert.notEqual(await within(c.closed, 3000), null, `${round}번째 n2 소켓 안 끊김`)
            const first = c.received.find((e) => e.event === 'force_disconnect')
            assert.equal(first?.payload?.code, one.code, `${round}번째 첫 안내: ${JSON.stringify(first?.payload)}`)
        }
    })
}

test('A17-B-171 n1에서 탈퇴한 n2 사람의 첫 안내가 탈퇴 × 5번', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    for (let round = 1; round <= 5; round += 1) {
        const u = await createDbUser(n1.b, 'wd')
        const token = await issueToken(n1.b, u.uuid)
        const c = await connectClient(t, n2, token)
        const res = await n1.http('POST', '/user/me/withdraw', { token, body: { password: u.password } })
        assert.ok(res.status < 300, `${round}번째 탈퇴 답: ${res.status} ${JSON.stringify(res.body)}`)
        assert.notEqual(await within(c.closed, 3000), null, `${round}번째 n2 소켓 안 끊김`)
        const first = c.received.find((e) => e.event === 'force_disconnect')
        assert.equal(first?.payload?.code, 'ACCOUNT_WITHDRAWN', `${round}번째 첫 안내: ${JSON.stringify(first?.payload)}`)
    }
})

// ── 로그아웃·비번 바꾸기·세션 확인 ──

test('A17-B-172 n1 로그아웃 → 1초 안 n2 소켓 다음 사건 거절 (5초 주기 안 기다림)', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const u = await createDbUser(n1.b, 'lo')
    const token = await issueToken(n1.b, u.uuid)
    const c = await connectClient(t, n2, token)
    // 통과 결과를 잠깐 저장해 둔 상태로 만듦
    const before = await emitAck(c, 'get_current_room', {})
    assert.notEqual(before?.code, 'SESSION_EXPIRED')
    const out = await n1.http('POST', '/auth/logout', { token })
    assert.equal(out.status, 200)
    await realSleep(300)
    // 1초 안 (로그아웃 0.3초 뒤) 보낸 사건: 받아 주면 안 됨 → 거절 답이거나, 그전에 세션 만료로 이미 끊김
    const after = c.socket.connected ? await emitAck(c, 'get_current_room', {}) : null
    const expired = c.received.find((e) => e.event === 'force_disconnect')
    if (after) {
        assert.equal(after.ok, false, `사건을 받아 줌: ${JSON.stringify(after)}`)
        assert.equal(after.code, 'SESSION_EXPIRED')
    } else {
        assert.equal(c.socket.connected, false, '답도 없고 끊기지도 않음')
        assert.equal(expired?.payload?.code, 'SESSION_EXPIRED', `끊긴 까닭: ${JSON.stringify(expired?.payload)}`)
    }
})

test('A17-B-173 n1에서 비번 바꾸면 n2 다른 기기 소켓이 1초 안 끊김', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const u = await createDbUser(n1.b, 'pw')
    const deviceB = await issueToken(n1.b, u.uuid)
    const c = await connectClient(t, n2, deviceB)
    const res = await n1.http('PATCH', '/user/me/password', {
        token: deviceB, body: { currentPassword: u.password, newPassword: `New-${u.password}`, confirmPassword: `New-${u.password}` },
    })
    assert.ok(res.status < 300, `비번 바꾸기 답: ${res.status} ${JSON.stringify(res.body)}`)
    assert.notEqual(await within(c.closed, 1000), null, 'n2 소켓이 1초 안 안 끊김')
})

// 새 기기 소켓이 붙기 전에 n1이 끊김 방송을 받아 바로 다시 확인해도 "세션 만료"가 아니라 다른 로그인 안내 (결정 MN-064, 브라우저 A17-H-028)
test('A17-B-191 기기1 n1 접속 → 기기2 로그인이 n2로 (소켓 아직 안 붙음) → 기기1 첫 안내가 다른 로그인 안내', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const u = await createDbUser(n1.b, 'rl')
    const c = await connectClient(t, n1, await issueToken(n1.b, u.uuid))
    const { email } = await n1.b.models.User.findOne({ where: { uuid: u.uuid }, raw: true })
    const res = await n2.http('POST', '/auth/login', { body: { email, password: u.password } })
    assert.equal(res.status, 200, `기기2 로그인 답: ${res.status} ${JSON.stringify(res.body)}`)
    assert.notEqual(await within(c.closed, 3000), null, 'n1 기기1 소켓이 3초 안 안 끊김')
    const first = c.received.find((e) => e.event === 'force_disconnect')
    assert.deepEqual(first?.payload, {
        code: 'REPLACED_BY_OTHER_LOGIN',
        message: '다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.',
    })
})

test('A17-B-174 Redis 죽은 동안은 세션 확인을 사건마다 DB로 (저장해 둔 통과 안 씀)', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const u = await createDbUser(n1.b, 'cd')
    const c = await connectClient(t, n2, await issueToken(n1.b, u.uuid))
    const ok = await emitAck(c, 'get_current_room', {})
    assert.notEqual(ok?.code, 'SESSION_EXPIRED')
    n1.proxy.kill()
    n2.proxy.kill()
    await waitFor(() => n2.b.cluster.state() === 'down', { timeoutMs: 5000 })
    // DB에서 세션 내림 (끊김 알림은 Redis가 죽어 못 감)
    await n1.b.models.UserSession.update({ is_online: false }, { where: { user_id: u.uuid } })
    const after = await emitAck(c, 'get_current_room', {})
    assert.equal(after?.ok, false, `거절 안 됨: ${JSON.stringify(after)}`)
    assert.equal(after?.code, 'SESSION_EXPIRED')
})

test('A17-B-175 Redis 살아난 뒤 그 전 통과는 안 믿음 (죽은 동안 다른 Node 로그아웃)', { skip: noRedisOrDb, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    const u = await createDbUser(n1.b, 'rv')
    const token = await issueToken(n1.b, u.uuid)
    const c = await connectClient(t, n2, token)
    const ok = await emitAck(c, 'get_current_room', {})
    assert.notEqual(ok?.code, 'SESSION_EXPIRED')
    n2.proxy.kill()
    await waitFor(() => n2.b.cluster.state() === 'down', { timeoutMs: 5000 })
    const out = await n1.http('POST', '/auth/logout', { token })
    assert.equal(out.status, 200)
    n2.proxy.restore()
    await waitFor(() => n2.b.cluster.state() === 'up', { timeoutMs: 8000 })
    const after = await emitAck(c, 'get_current_room', {})
    assert.equal(after?.ok, false, `거절 안 됨: ${JSON.stringify(after)}`)
    assert.equal(after?.code, 'SESSION_EXPIRED')
})

// ── 서버 꺼짐 안내·Node 비우기·Node 목록·지금 상황·/health (Redis만, 세션 확인은 늘 통과로) ──

test('A17-B-176 서버 꺼짐 안내는 꺼지는 Node 사람만', { skip: noRedis, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t)
    stubAuth(t, [n1, n2])
    const a = await connectClient(t, n1, stubToken(n1.b, crypto.randomUUID()))
    const b = await connectClient(t, n2, stubToken(n2.b, crypto.randomUUID()))
    const shutdown = n1.b.lifecycle.createShutdown({
        server: n1.server, io: n1.io, graceMs: 100, exit: () => {}, log: { warn() {}, error() {} },
        markDraining: () => n1.b.cluster.nodes.setDraining(true), closeCluster: () => n1.b.cluster.close(),
    })
    await shutdown('시험', 0)
    n1.closed = true
    await n1.proxy.close()
    await realSleep(300)
    assert.equal(a.received.filter((e) => e.event === 'server_shutdown').length, 1, 'n1 사람이 안내를 못 받음')
    assert.equal(b.received.filter((e) => e.event === 'server_shutdown').length, 0, 'n2 사람도 안내를 받음')
})

test('A17-B-177 n1 비우기 → n1 로비 사람 방 만들기는 n2로, n1 판은 단계 그대로 넘어감 (5명 판)', { skip: noRedis, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1 } = await startOpsNodes(t)
    // n1 판 (가짜 소켓, 직업 고정), 역할 확인을 짧게 걸어 둠
    const session = n1.b.gf.startGame({ id: 'b177', n: 5 })
    const world = n1.b.gf.socketWorld(n1.b.gs, session)
    const drain = await n1.http('POST', '/internal/nodes/n1/drain', { internal: true, body: {} })
    assert.equal(drain.status, 200)
    assert.equal(drain.body.draining, true)
    await realSleep(400)
    await n1.b.cluster.nodes.refresh()
    n1.b.G.ensureRoleRevealTimer(world.io, session, { durationMs: 200 })
    const f1 = fakeNodeFor(n1, t)
    f1.connect('b177-lobby')
    const answer = await f1.createRoom('b177-lobby')
    assert.deepEqual(
        { ok: answer.ok, code: answer.code, node: answer.node, message: answer.message },
        { ok: false, code: 'ROOM_ON_OTHER_NODE', node: 'n2', message: '다른 서버로 옮겨 방을 만듭니다.' },
    )
    const [someone] = session.players.keys()
    await waitFor(() => world.received(someone, 'game_phase_changed').some((e) => e.payload?.phase === 'DAY'), { timeoutMs: 3000 })
        .catch(() => {})
    assert.equal(world.received(someone, 'game_phase_changed').some((e) => e.payload?.phase === 'DAY'), true, 'n1 판이 낮으로 안 넘어감')
    n1.b.G.stopRoleRevealTimer?.(session.id)
})

test('A17-B-178 비우는 중 판 끝 → "대기방으로" 거절 NODE_DRAINING (6명 판)', { skip: noRedis, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1 } = await startOpsNodes(t)
    t.mock.method(Math, 'random', () => 0)
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
    t.after(() => t.mock.timers.reset())
    const f1 = fakeNodeFor(n1, t)
    const w = gameWorld(t)
    const g = await W.openGame(w, f1, { prefix: 'b178', n: 6 })
    // 판 도중 비우기 켬 (내부 경로 drain이 이 Node에 하는 것과 같은 함수, 가짜 시계 중이라 HTTP 대신)
    n1.b.cluster.nodes.setDraining(true)
    await W.playToEnd(w, g)
    const answer = await f1.returnToRoom(g.uuids[1], g.gameId)
    t.mock.timers.reset()
    assert.deepEqual(
        { ok: answer.ok, code: answer.code, message: answer.message },
        { ok: false, code: 'NODE_DRAINING', message: '서버 점검 준비 중이라 대기방으로 돌아갈 수 없습니다.' },
    )
})

test('A17-B-179 비우던 Node를 끄고 새로 켜면 비우기 꺼진 채 시작', { skip: noRedis, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, prefix } = await startOpsNodes(t)
    const drain = await n1.http('POST', '/internal/nodes/n1/drain', { internal: true, body: {} })
    assert.equal(drain.body.draining, true)
    await n1.close()
    // 같은 이름으로 새 프로세스 (코드 새로 불러옴 = 새 부팅)
    const fresh = loadOpsBundle()
    extraBundles.push(fresh)
    const again = await startNode(t, fresh, { id: 'n1', prefix })
    const health = await again.http('GET', '/health')
    assert.equal(health.body.serverId, 'n1')
    assert.equal(health.body.draining, false)
    const f1 = fakeNodeFor(again, t)
    f1.connect('b179-host')
    const answer = await f1.createRoom('b179-host')
    assert.equal(answer.ok, true, `방 만들기 실패: ${answer.code} ${answer.message}`)
})

test('A17-B-180 Node 목록에 판·방 수: n1 판 1·방 1 → 판 끝·방 지움 뒤 0·0 (5명 판)', { skip: noRedis, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1 } = await startOpsNodes(t)
    t.mock.method(Math, 'random', () => 0)
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
    t.after(() => t.mock.timers.reset())
    const f1 = fakeNodeFor(n1, t)
    const w = gameWorld(t)
    const g = await W.openGame(w, f1, { prefix: 'b180', n: 5 })
    f1.connect('b180-other')
    const other = await f1.createRoom('b180-other')
    assert.equal(other.ok, true)
    const row = async () => (await n1.http('GET', '/internal/cluster', { internal: true })).body.nodes.find((n) => n.id === 'n1')
    const first = await row()
    assert.deepEqual({ games: first.games, rooms: first.rooms }, { games: 1, rooms: 1 })
    await W.playToEnd(w, g)
    // 결과 화면 180초 → 판 지워짐·아무도 안 온 같은 방 없어짐
    for (let i = 0; i < W.RESULT_SCREEN_MS / 1000 + 1; i += 1) t.mock.timers.tick(1000)
    await settle()
    const deleted = await f1.emit('b180-other', 'delete_room', {})
    assert.notEqual(deleted?.ok, false, `방 지우기 실패: ${JSON.stringify(deleted)}`)
    await settle()
    t.mock.timers.reset()
    const last = await row()
    assert.deepEqual({ games: last.games, rooms: last.rooms }, { games: 0, rooms: 0 })
})

test('A17-B-181 지금 상황(/internal/live)이 두 Node를 합침, n2 죽음이면 partial:true', { skip: noRedis, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1, n2 } = await startOpsNodes(t, { env: { NODE_DEAD_AFTER_MS: '10000' } })
    stubAuth(t, [n1, n2])
    for (let i = 0; i < 2; i += 1) await connectClient(t, n1, stubToken(n1.b, crypto.randomUUID()))
    for (let i = 0; i < 3; i += 1) await connectClient(t, n2, stubToken(n2.b, crypto.randomUUID()))
    const live = await n1.http('GET', '/internal/live', { internal: true })
    assert.equal(live.status, 200)
    assert.equal(live.body.onlineCount, 5)
    assert.equal(live.body.nodes.length, 2)
    assert.equal(live.body.partial, false)
    // n2 강제 종료 흉내 (Redis 끊김, 목록엔 아직 남음 → 물음에 답 없음)
    n2.proxy.kill()
    const dead = await n1.http('GET', '/internal/live', { internal: true })
    assert.equal(dead.body.partial, true)
})

test('A17-B-182 /health에 서버 이름·Redis 상태·비우기, 비우기 뒤 draining:true', { skip: noRedis, timeout: 30000 }, async (t) => {
    await ensureSchema()
    const { n1 } = await startOpsNodes(t)
    const before = await n1.http('GET', '/health')
    assert.deepEqual(
        { serverId: before.body.serverId, redis: before.body.redis, draining: before.body.draining },
        { serverId: 'n1', redis: 'up', draining: false },
    )
    // 시험 DB가 있으면 DB도 살아 있어 ok:true
    if (TEST_DB_URL) assert.equal(before.body.ok, true)
    else assert.equal('ok' in before.body, true)
    const drain = await n1.http('POST', '/internal/nodes/n1/drain', { internal: true, body: {} })
    assert.equal(drain.status, 200)
    const after = await n1.http('GET', '/health')
    assert.equal(after.body.draining, true)
})
