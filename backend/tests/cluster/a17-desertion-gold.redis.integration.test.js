'use strict'

// 서버 2대 진짜 Redis + 시험 DB 시험: 한 Node 탈주를 다른 Node가 막음(알림·Redis 살아남·다시 켬), 판 골드는 사람마다 한 번·관리자 값이 다른 Node 판에 들어감·업적 신호가 옮긴 사람에게 감
// 목록 docs/게임_의도_2026-11-15/시험목록/A17-서버-여러대.md A17-B-150~158 (돌리기: with-lock.sh redis 안에 testdb, REDIS_URL_TEST·F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL || ''

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const http = require('node:http')
const { Server } = require('socket.io')
const ioClient = require('socket.io-client')

const W = require('./a17-world')
const { REDIS_URL_TEST, cleanupPrefix } = require('./helpers/redisNodes')
const { createRedisProxy } = require('./helpers/redisProxy')
const { listenOnFetchablePort, HIGH_PORT_MIN, HIGH_PORT_MAX } = require('../helpers/fetchablePort')

// 둘 다 있어야 돎 (npm test엔 없음)
const skipReason = !REDIS_URL_TEST ? 'REDIS_URL_TEST 없음 (with-lock.sh redis로 돌림)'
    : !TEST_DB_URL ? 'F01_TEST_DATABASE_URL 없음 (with-lock.sh testdb로 돌림)' : false

// Node마다 따로 부르는 것 (나중에 require하면 다른 묶음 것이 나와서 미리)
const EXTRA = [
    'models',
    'services/ops/gameSettings',
    'services/ops/reloadSync',
    'admin/services/gameSettings/manage',
    'socket/emitter',
    'services/game/record',
    'services/game/record/persist',
    'repositories/game/result',
    'services/economy/grants',
]
// 묶음은 주소가 있을 때만 (없으면 건너뛰기만 함)
const load = () => W.loadBundle({ extra: EXTRA, databaseUrl: TEST_DB_URL })
const B = skipReason ? {} : { n1: load(), n2: load() }
// 다시 켠 n2 (B-152), 처음부터 다시 부른 코드 = 새 프로세스
const B2_RESTART = skipReason ? null : load()

const D = () => B.n1.x.models
const redisPort = REDIS_URL_TEST ? Number(new URL(REDIS_URL_TEST).port || 6379) : 0
// 하트비트 0.2초 (Redis 상태 확인은 기본 2초)
const FAST = { CLUSTER_HEARTBEAT_MS: '200' }
const GOLD_KEY = 'GAME_GOLD_REWARD'
let adminId = null

// ── 시험 DB 준비 (파일 처음 한 번) ──
test.before(async () => {
    if (skipReason) return
    const migrationRunner = require('../../db/migrationRunner')
    const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb')
    const { MIGRATIONS } = require('../../scripts/migrate-db')
    const schema = buildManagedSchema({
        baseline: require('../../db/migrations/0001-legacy-baseline'),
        addRefreshTokenHistory: require('../../db/migrations/0004-add-refresh-token-history'),
        addSocialAuth: require('../../db/migrations/0005-add-social-auth'),
        migrationRunner,
    })
    // 허락된 시험 DB 이름 말고는 지우기 거부 (isolatedTestDb)
    await resetManagedSchema(D().sequelize, TEST_DB_URL, schema)
    await migrationRunner.applyMigrations({ sequelize: D().sequelize, migrations: MIGRATIONS })
    adminId = crypto.randomUUID()
    await D().AdminUser.create({ id: adminId, login_id: `a17-${adminId.slice(0, 8)}`, password_hash: 'not-a-real-hash', role: 'SUPER' })
})

test.after(async () => {
    if (skipReason) return
    for (const b of [B.n1, B.n2, B2_RESTART]) await b.x.models.sequelize.close().catch(() => {})
    // 늦게 불린 저장소(바깥 묶음)가 연 DB 연결도 닫음
    const outer = require.cache[require.resolve('../../models')]
    if (outer) await outer.exports.sequelize.close().catch(() => {})
})

// ── 이 파일 안 작은 도우미 (a17-world·공용은 안 고침) ──

// 진짜 시계로 잠깐 (가짜 시계 끈 뒤에만)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 조건이 될 때까지 진짜 시계로 기다림 → 됐으면 true, 시간 넘으면 false (판정은 뒤 assert가 함)
async function waitUntil(check, timeoutMs = 8000) {
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
        if (await check()) return true
        await sleep(50)
    }
    return Boolean(await check())
}

// 시험 하나 준비: Node마다 Redis 중계 하나 + 키 앞머리, 켤 때 하는 일(탈주 막힘·판 골드 값 DB 읽기)까지
async function setup(t, { gold = 1, nodes = B } = {}) {
    const prefix = `a17-${crypto.randomUUID().slice(0, 8)}`
    const proxies = { n1: await createRedisProxy({ targetPort: redisPort }), n2: await createRedisProxy({ targetPort: redisPort }) }
    await setGoldInDb(gold)
    const w = await W.startNodes(t, nodes, { redisUrls: { n1: proxies.n1.url, n2: proxies.n2.url }, prefix, env: FAST })
    // 정리 고리는 먼저 단 것부터 돎 → Node를 끈(world) 뒤에 중계 닫고 키 지움
    t.after(async () => {
        for (const p of Object.values(proxies)) await p.close()
        await cleanupPrefix(prefix)
    })
    for (const id of w.ids) {
        const b = nodes[id]
        // 탈주·판 결과·판 골드는 진짜 저장소 (시험 DB)
        b.desertion.__setRepositoryForTests(null)
        b.G.__setGameResultPersistForTests(null)
        await bootReads(b)
    }
    // 판 끝 처리 끝 신호 모으기 (판 골드 → 업적 → 경제 다시 읽기 신호)
    const signals = []
    for (const id of w.ids) nodes[id].gs.setEmitToUser((uuid, event, payload) => signals.push({ node: id, uuid, event, payload }))
    t.after(() => { for (const id of w.ids) nodes[id].gs.setEmitToUser(null) })
    return { w, prefix, proxies, signals }
}

// 서버 켤 때 하는 읽기 (index.js와 같은 차례): 탈주 막힘·판 골드 값
async function bootReads(b) {
    await b.desertion.loadActiveDesertions()
    await b.x['services/ops/gameSettings'].reloadGameSettings()
}

// 판 골드 값 DB에 바로 넣기 (시험 시작 값 맞추기, 관리자 저장 시험은 관리자 길로 따로)
async function setGoldInDb(value) {
    await D().sequelize.query('UPDATE game_settings SET value_int = :value WHERE `key` = :key', { replacements: { value, key: GOLD_KEY } })
}

// 판 사람 DB 계정 만들기 (판 기록·장부·탈주 줄이 사람 표를 가리킴), uuid = 접두어-번호 (openGame과 같게)
async function createUsers(prefix, n) {
    const uuids = []
    for (let i = 0; i < n; i += 1) {
        const uuid = `${prefix}-${i}`
        await D().User.create({ uuid, password_hash: 'not-a-real-hash', nickname: `${prefix.slice(0, 6)}${i}`, email: `${uuid}@example.test` })
        await D().UserStats.create({ user_id: uuid })
        uuids.push(uuid)
    }
    return uuids
}

// 시험마다 다른 판 사람 접두어 (8글자)
const newPrefix = () => crypto.randomUUID().slice(0, 8)

// 판 끝 처리(판 골드 → 업적)가 끝나 전원이 경제 다시 읽기 신호를 받을 때까지 (진짜 시계)
async function waitEconomySignals(signals, uuids, timeoutMs = 20_000) {
    const done = await waitUntil(() => uuids.every((u) => signals.some((s) => s.uuid === u
        && s.event === 'account_cache_invalidated' && s.payload?.scopes?.includes('economy'))), timeoutMs)
    assert.equal(done, true, '판 끝 경제 다시 읽기 신호가 전원에게 안 옴 (판 끝 처리가 안 끝남)')
}

// 그 판 판 골드 장부 줄 (사람 하나)
const goldRows = (gameId, uuid) => D().sequelize.models.EconomyLedgerEntry.findAll({
    where: { user_id: uuid, reference_event_id: `game-reward:${gameId}` }, raw: true,
})
// 지갑 골드 (지갑 줄 없으면 0)
const goldOf = async (uuid) => Number((await D().sequelize.models.EconomyWallet.findOne({ where: { user_id: uuid }, raw: true }))?.balance_gold ?? 0)

// 사람마다 "판 골드 장부 GAME_REWARD 한 줄·amount, 지갑 = amount" (새 계정이라 처음 지갑 0)
async function assertGoldOnce(gameId, uuids, amount) {
    for (const uuid of uuids) {
        const rows = await goldRows(gameId, uuid)
        assert.equal(rows.length, 1, `${uuid} 판 골드 장부 줄 수`)
        assert.equal(rows[0].reason, 'GAME_REWARD', `${uuid} 장부 사유`)
        assert.equal(Number(rows[0].amount), amount, `${uuid} 장부 금액`)
        assert.equal(await goldOf(uuid), amount, `${uuid} 지갑 골드`)
    }
}

// 관리자 판 골드 저장 (그 Node가 받은 관리자 요청과 같은 길: DB 저장 + 기록 + 모든 Node 다시 읽기)
const saveGoldAsAdmin = (b, goldReward) => b.x['admin/services/gameSettings/manage'].updateGameSettings({
    req: { admin: { id: adminId }, adminRequestMeta: { ip: '127.0.0.1' }, headers: {} }, goldReward,
})

// 받은 판 끝 알림의 공개 줄 (winResult.reveals)
const revealsOf = (node, uuid) => node.sock(uuid).received
    .filter((e) => e.payload && typeof e.payload === 'object' && 'winResult' in e.payload)
    .at(-1)?.payload?.winResult?.reveals ?? null

// 가짜 시계 끄기 (판 타이머는 버려짐 → 판은 그 자리에서 멈춤, 뒤로는 DB·Redis를 진짜 시계로 기다림)
const clockOff = (t) => t.mock.timers.reset()

// ── A17-B-150~152 탈주 ──

test('A17-B-150 7명 판 n1 판에서 산 채로 나가기 → 그 사람이 n2로 방 만들기 → DESERTION_COOLDOWN', { skip: skipReason, timeout: 30_000 }, async (t) => {
    const { w } = await setup(t)
    const prefix = newPrefix()
    await createUsers(prefix, 7)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix, n: 7 })
    clockOff(t)
    const deserter = W.citizenOf(g)
    assert.equal((await w.n1.leaveGame(deserter, g.gameId)).ok, true)
    // 버스 알림이 n2에 닿을 때까지 (닿았는지는 아래 방 만들기 답으로 봄)
    await waitUntil(() => w.n2.b.desertion.getDesertionBlock(deserter) !== null, 3000)
    w.n2.connect(deserter)
    const answer = await w.n2.createRoom(deserter)
    assert.equal(answer.ok, false, `방 만들기가 됨: ${JSON.stringify(answer)}`)
    assert.equal(answer.code, 'DESERTION_COOLDOWN')
    assert.match(answer.message, /^탈주로 .+ 뒤에 참여할 수 있습니다\.$/)
})

test('A17-B-151 5명 판 Redis 끊긴 사이 n1 탈주(DB 한 줄) → 살아나면 n2가 DB에서 읽어 방 만들기 DESERTION_COOLDOWN', { skip: skipReason, timeout: 30_000 }, async (t) => {
    const { w, proxies } = await setup(t)
    const prefix = newPrefix()
    await createUsers(prefix, 5)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix, n: 5 })
    clockOff(t)
    const deserter = W.citizenOf(g)
    // Redis 죽음 (두 Node 다 끊김 → 버스 알림 못 감)
    proxies.n1.kill()
    proxies.n2.kill()
    assert.equal(await waitUntil(() => w.n1.cluster.state() === 'down' && w.n2.cluster.state() === 'down', 5000), true, 'Redis 끊김이 안 보임')
    assert.equal((await w.n1.leaveGame(deserter, g.gameId)).ok, true)
    const saved = await waitUntil(async () => (await D().GameDesertion.count({ where: { user_id: deserter } })) === 1, 5000)
    assert.equal(saved, true, '탈주 줄이 DB에 안 남음')
    // Redis 살아남 → n2가 다시 맞추기(DB 다시 읽기)
    proxies.n1.restore()
    proxies.n2.restore()
    assert.equal(await waitUntil(() => w.n2.cluster.state() === 'up', 8000), true, 'n2 Redis가 안 살아남')
    await waitUntil(() => w.n2.b.desertion.getDesertionBlock(deserter) !== null, 5000)
    w.n2.connect(deserter)
    const answer = await w.n2.createRoom(deserter)
    assert.equal(answer.ok, false, `방 만들기가 됨: ${JSON.stringify(answer)}`)
    assert.equal(answer.code, 'DESERTION_COOLDOWN')
})

test('A17-B-152 6명 판 n1 탈주 → n2 끄고 다시 켬(DB에서 읽음) → n2 방 만들기 DESERTION_COOLDOWN', { skip: skipReason, timeout: 30_000 }, async (t) => {
    const { w, prefix: keyPrefix, proxies } = await setup(t)
    const prefix = newPrefix()
    await createUsers(prefix, 6)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix, n: 6 })
    clockOff(t)
    const deserter = W.citizenOf(g)
    assert.equal((await w.n1.leaveGame(deserter, g.gameId)).ok, true)
    assert.equal(await waitUntil(async () => (await D().GameDesertion.count({ where: { user_id: deserter } })) === 1, 5000), true, '탈주 줄이 DB에 안 남음')
    // n2 끔 → 처음부터 다시 부른 코드로 같은 이름 n2 켬 (메모리 막힘 표는 빈 채 시작)
    await w.kill('n2')
    const again = await W.startNodes(t, { n2: B2_RESTART }, { redisUrls: { n2: proxies.n2.url }, prefix: keyPrefix, env: FAST })
    B2_RESTART.desertion.__setRepositoryForTests(null)
    await bootReads(B2_RESTART)
    // 다시 켠 n2가 쓴 키도 끝에 지움 (앞 정리보다 늦게 끔)
    t.after(() => cleanupPrefix(keyPrefix))
    again.n2.connect(deserter)
    const answer = await again.n2.createRoom(deserter)
    assert.equal(answer.ok, false, `방 만들기가 됨: ${JSON.stringify(answer)}`)
    assert.equal(answer.code, 'DESERTION_COOLDOWN')
})

// ── A17-B-153~157 판 골드 ──

test('A17-B-153 5명 판(n2 출신 2명) 판 끝까지 → 5명 지갑 +1, 장부 GAME_REWARD 사람마다 1줄', { skip: skipReason, timeout: 60_000 }, async (t) => {
    const { w, signals } = await setup(t, { gold: 1 })
    const prefix = newPrefix()
    const uuids = await createUsers(prefix, 5)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix, n: 5, movers: { from: w.n2, uuids: uuids.slice(3) } })
    await W.playToEnd(w, g)
    clockOff(t)
    await waitEconomySignals(signals, uuids)
    await assertGoldOnce(g.gameId, uuids, 1)
})

test('A17-B-154 6명 판 같은 판 결과 저장을 n1·n2가 같이 → 사람마다 장부 1줄, 지갑 +1', { skip: skipReason, timeout: 60_000 }, async (t) => {
    const { w, signals } = await setup(t, { gold: 1 })
    const prefix = newPrefix()
    const uuids = await createUsers(prefix, 6)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix, n: 6 })
    await W.playToEnd(w, g)
    // n1이 판 끝에 저장을 시작한 바로 그때 n2도 같은 판 저장 (같은 판 기록이 두 Node로 간 경우)
    const session = w.n1.session(g.gameId)
    assert.ok(session, '끝난 판이 n1에 없음')
    B.n2.x['services/game/record'].persistTerminalSession(session, { completed: true })
    clockOff(t)
    // 먼저 끝난 쪽 신호 → 두 번째 저장은 같은 판이라 DB가 막거나 같은 참조 id라 안 줌, 늦게 도는 쪽이 끝나게 잠깐 더 둠
    await waitEconomySignals(signals, uuids)
    await sleep(1500)
    await assertGoldOnce(g.gameId, uuids, 1)
})

test('A17-B-155 7명 판 관리자가 n1에서 판 골드 2로 저장 → n2에서 시작한 판 끝 → 7명 장부 +2', { skip: skipReason, timeout: 60_000 }, async (t) => {
    const { w, signals } = await setup(t, { gold: 1 })
    const prefix = newPrefix()
    const uuids = await createUsers(prefix, 7)
    const saved = await saveGoldAsAdmin(B.n1, 2)
    assert.deepEqual(saved.nodes.map((n) => [n.node, n.ok]).sort(), [['n1', true], ['n2', true]], `Node별 반영: ${JSON.stringify(saved)}`)
    w.useFakeClock()
    const g = await W.openGame(w, w.n2, { prefix, n: 7 })
    await W.playToEnd(w, g)
    clockOff(t)
    await waitEconomySignals(signals, uuids)
    await assertGoldOnce(g.gameId, uuids, 2)
})

test('A17-B-156 8명 판 n2 판 시작(값 1) 뒤 n1에서 3으로 바꿈 → 그 판 끝 장부 +1', { skip: skipReason, timeout: 60_000 }, async (t) => {
    const { w, signals } = await setup(t, { gold: 1 })
    const prefix = newPrefix()
    const uuids = await createUsers(prefix, 8)
    w.useFakeClock()
    const g = await W.openGame(w, w.n2, { prefix, n: 8 })
    const saved = await saveGoldAsAdmin(B.n1, 3)
    assert.equal(saved.partial, false, `일부만 반영: ${JSON.stringify(saved)}`)
    await W.playToEnd(w, g)
    clockOff(t)
    await waitEconomySignals(signals, uuids)
    await assertGoldOnce(g.gameId, uuids, 1)
})

test('A17-B-157 10명 판 n1에서 0으로 저장 → n2 판 끝 → 장부 줄 0, 판 끝 칸 goldReward 0', { skip: skipReason, timeout: 60_000 }, async (t) => {
    const { w, signals } = await setup(t, { gold: 1 })
    const prefix = newPrefix()
    const uuids = await createUsers(prefix, 10)
    const saved = await saveGoldAsAdmin(B.n1, 0)
    assert.equal(saved.partial, false, `일부만 반영: ${JSON.stringify(saved)}`)
    w.useFakeClock()
    const g = await W.openGame(w, w.n2, { prefix, n: 10 })
    await W.playToEnd(w, g)
    clockOff(t)
    await waitEconomySignals(signals, uuids)
    for (const uuid of uuids) {
        assert.equal((await goldRows(g.gameId, uuid)).length, 0, `${uuid} 판 골드 장부 줄`)
        assert.equal(await goldOf(uuid), 0, `${uuid} 지갑`)
        const reveals = revealsOf(w.n2, uuid)
        assert.ok(reveals, `${uuid} 판 끝 알림 없음`)
        for (const row of reveals) assert.equal(row.goldReward, 0, `${uuid}가 받은 ${row.uuid} 줄 goldReward`)
    }
})

// ── A17-B-158 업적·잔액 신호가 다른 Node로 옮긴 사람에게 ──

// socket.io 서버 하나 (계정 채널 user:<uuid>에 넣는 단순 접속, 운영 연결 처리기 맨 앞과 같음)
async function startIoServer(t) {
    const server = http.createServer()
    const io = new Server(server, { transports: ['websocket'] })
    io.on('connection', (socket) => {
        const uuid = socket.handshake.auth?.uuid
        if (uuid) socket.join(`user:${uuid}`)
    })
    // 포트 고르기는 crypto로 (world가 Math.random을 0으로 묶어 늘 같은 포트를 고름)
    const { port } = await listenOnFetchablePort(server, { pickPort: () => crypto.randomInt(HIGH_PORT_MIN, HIGH_PORT_MAX + 1) })
    // 닫기는 Node(cluster)보다 먼저 (운영 끄기 순서, 늦으면 닫힌 Redis 연결에 어댑터가 써서 처리 안 된 거절이 남)
    let closed = null
    const close = () => { closed ??= new Promise((resolve) => io.close(() => resolve())); return closed }
    t.after(close)
    return { io, port, close }
}

// 이 Node cluster를 socket.io 서버까지 붙여 다시 켬 (Redis 어댑터가 붙어야 다른 Node 계정 채널로 감), 환경값은 startNodes와 같게
async function reinitWithIo(b, id, { io, url, prefix }) {
    await b.cluster.init({
        io,
        env: { SERVER_ID: id, ...W.BASE_ENV, ...FAST, REDIS_URL: url, REDIS_KEY_PREFIX: prefix },
        bootEpoch: b.mm.__getBootEpochForTests(),
        log: b.mem.quietLog,
    })
}

// 옛 판 n판(운영 출처·끝까지 간 판) 넣기 → 업적 "판 수" 기준 바로 앞까지
async function seedCompletedGames(uuid, count) {
    for (let i = 0; i < count; i += 1) {
        const id = crypto.randomUUID()
        const at = new Date(Date.UTC(2026, 9, 1 + i))
        await D().GameResult.create({
            id, started_at: at, ended_at: at, winner: 'CITIZEN', win_reason: 'ALL_JOKERS_ELIMINATED', day_index: 2, player_count: 5,
            settings: { gameSource: { v: 1, value: 'production' } }, completed: true,
        })
        await D().GameResultPlayer.create({ game_id: id, user_id: uuid, nickname_snapshot: '옛판', role: 'CITIZEN', team: 'CITIZEN', won: false, is_alive: false })
    }
}

test('A17-B-158 5명 판 끝 직후 한 사람이 로비로 가 n2에 붙음 → 그 사람이 achievement_granted·account_cache_invalidated 받음', { skip: skipReason, timeout: 60_000 }, async (t) => {
    const { w, prefix: keyPrefix, proxies } = await setup(t, { gold: 1 })
    // 업적은 운영 출처 판만 셈 (시험 출처는 안 붙음)
    const savedSource = process.env.GAME_SOURCE_OVERRIDE
    process.env.GAME_SOURCE_OVERRIDE = 'production'
    t.after(() => { if (savedSource === undefined) delete process.env.GAME_SOURCE_OVERRIDE; else process.env.GAME_SOURCE_OVERRIDE = savedSource })
    const io1 = await startIoServer(t)
    const io2 = await startIoServer(t)
    await reinitWithIo(B.n1, 'n1', { io: io1.io, url: proxies.n1.url, prefix: keyPrefix })
    await reinitWithIo(B.n2, 'n2', { io: io2.io, url: proxies.n2.url, prefix: keyPrefix })
    // 다시 켠 뒤 서로 볼 때까지
    assert.equal(await waitUntil(async () => {
        await w.refresh()
        return B.n1.cluster.nodes.list().some((n) => n.id === 'n2') && B.n2.cluster.nodes.list().some((n) => n.id === 'n1')
    }, 5000), true, 'Node끼리 못 봄')
    // n1이 보내는 길 = 운영과 같게 계정 채널(socket/emitter)로: 판 끝 신호는 n1 묶음 것, 업적 알림은 늦게 불리는 바깥 것
    const outerEmitter = require('../../socket/emitter')
    const n1Emitter = B.n1.x['socket/emitter']
    n1Emitter.setIo(io1.io)
    outerEmitter.setIo(io1.io)
    B.n1.gs.setEmitToUser(n1Emitter.emitToUser)
    t.after(() => { n1Emitter.setIo(null); outerEmitter.setIo(null) })
    // 진짜 업적 평가 (world는 업적을 아무것도 안 하는 함수로 끼워 둠)
    B.n1.G.__setEvaluateAchievementsForTests(null)
    // 판 결과 저장을 잠깐 붙잡음: 그 사람이 n2에 다 붙은 뒤 진짜 저장소로 저장 (판 골드도 진짜 장부)
    let openGate
    const gate = new Promise((resolve) => { openGate = resolve })
    B.n1.G.__setGameResultPersistForTests(async (record) => { await gate; return B.n1.x['repositories/game/result'].persistGameResultRecord(record) })
    B.n1.x['services/game/record/persist'].__setGameGoldGrantForTests(B.n1.x['services/economy/grants'].grantGameRewards)
    t.after(() => { openGate(); B.n1.x['services/game/record/persist'].__setGameGoldGrantForTests(null) })

    const prefix = newPrefix()
    const uuids = await createUsers(prefix, 5)
    w.useFakeClock()
    const g = await W.openGame(w, w.n1, { prefix, n: 5 })
    const mover = W.citizenOf(g)
    // 판 수 3 업적 바로 앞 (옛 판 2판)
    await seedCompletedGames(mover, 2)
    await W.playToEnd(w, g)
    clockOff(t)
    // 판 끝 직후 로비로 → n1 소켓 떼고 n2에 붙음
    assert.equal((await w.n1.enterLobby(mover)).ok, true)
    w.n1.drop(mover)
    const client = ioClient(`http://127.0.0.1:${io2.port}`, { transports: ['websocket'], auth: { uuid: mover }, reconnection: false })
    const got = []
    client.onAny((event, payload) => got.push({ event, payload }))
    try {
        assert.equal(await waitUntil(() => client.connected, 5000), true, 'n2 접속 안 됨')
        await sleep(50)
        openGate()
        const done = await waitUntil(() => got.some((e) => e.event === 'achievement_granted')
            && got.some((e) => e.event === 'account_cache_invalidated' && e.payload?.gameId === g.gameId), 20_000)
        assert.equal(done, true, `n2에 붙은 사람이 받은 것: ${JSON.stringify(got.map((e) => e.event))}`)
        assert.equal(uuids.includes(mover), true)
    } finally {
        // 판 끝 처리(업적 → 경제 신호)가 끝난 뒤 소켓·서버를 Node보다 먼저 닫음
        await waitUntil(() => got.some((e) => e.event === 'account_cache_invalidated' && e.payload?.scopes?.includes('economy')), 5000)
        client.close()
        await io1.close()
        await io2.close()
    }
})
