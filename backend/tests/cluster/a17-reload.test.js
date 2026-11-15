'use strict'

// 골드 값·점검·금지어 다시 읽기 시험 — n1이 받은 관리자 저장·내부 다시 읽기가 n2(진짜 코드)에도 들어가는지, 놓쳐도 60초 안전망·Redis 살아남 때 들어가는지
// 목록 A17-B-060~069 (docs/게임_의도_2026-11-15/시험목록/A17-서버-여러대.md "골드 값·점검·금지어 다시 읽기"), 돌리기: node --env-file=.env.test --test tests/cluster/a17-reload.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')

const W = require('./a17-world')
const { listenOnFetchablePort } = require('../helpers/fetchablePort')

// Node마다 따로 불러 둘 것: 다시 읽기 맞추기·판 골드·점검·금지어·내부 API·관리자 경로 (나중에 부르면 다른 Node 것이 나옴)
const EXTRA = [
    'services/ops/reloadSync',
    'services/ops/gameSettings',
    'services/ops/maintenance',
    'services/ops/bannedWords',
    'controllers/ops/internal',
    'admin/routes/gameSettings.routes',
    'admin/routes/maintenance.routes',
]
const B = { n1: W.loadBundle({ extra: EXTRA }), n2: W.loadBundle({ extra: EXTRA }) }

// 모든 Node가 늦게 부르는 DB 창구 (같은 것 하나 = DB 하나), 표 읽기·쓰기만 가짜로 바꿈
const db = require('../../repositories/common/db')

const NOON_KST = Date.UTC(2026, 0, 15, 3, 0, 0)
const MAINTENANCE_TEXT = '서버 점검 중입니다. 점검이 끝난 뒤 다시 시도해주세요.'

// 가짜 DB 표: 판 골드 한 줄·점검 한 줄·금지어 (Node들이 같이 봄)
function fakeTables(t) {
    const store = { gold: 1, maintenance: null, banned: [] }
    const goldRows = () => [{ key: 'GAME_GOLD_REWARD', value_int: store.gold, updated_at: null, updated_by: null }]
    t.mock.method(db.sequelize, 'transaction', async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }))
    t.mock.method(db.AdminAuditLog, 'create', async () => ({ id: 1 }))
    t.mock.method(db.GameSetting, 'findAll', async () => goldRows())
    t.mock.method(db.GameSetting, 'findOne', async () => null)
    t.mock.method(db.GameSetting, 'create', async (row) => { store.gold = row.value_int; return row })
    const maintenanceRow = () => (store.maintenance ? { ...store.maintenance, update: async (c) => Object.assign(store.maintenance, c) } : null)
    t.mock.method(db.MaintenanceState, 'findOne', async () => maintenanceRow())
    t.mock.method(db.MaintenanceState, 'create', async (row) => { store.maintenance = { ...row }; return row })
    t.mock.method(db.BannedWord, 'findAll', async () => store.banned.map((word) => ({ word })))
    return store
}

// Node마다 들고 있는 값 처음으로 (판 골드 1·점검 꺼짐·금지어 없음)
function resetOps(t) {
    const reset = () => {
        for (const b of Object.values(B)) {
            b.x['services/ops/gameSettings'].__setGoldRewardForTests(1)
            b.x['services/ops/maintenance'].__setStateForTests({})
            b.x['services/ops/bannedWords'].__setWordsForTests([])
        }
    }
    reset()
    t.after(reset)
}

// n1 HTTP 앱: 관리자 판 설정·점검 경로(로그인은 건너뛰고 관리자 하나로) + 내부 다시 읽기 둘 (열쇠 확인은 건너뜀)
async function startN1App(t, b = B.n1) {
    const app = express()
    app.use(express.json())
    app.use((req, res, next) => { req.admin = { id: 'a17-admin' }; next() })
    app.use('/admin-api/game-settings', b.x['admin/routes/gameSettings.routes'])
    app.use('/admin-api/maintenance', b.x['admin/routes/maintenance.routes'])
    const internal = b.x['controllers/ops/internal']
    app.post('/internal/maintenance/reload', internal.reloadMaintenance)
    app.post('/internal/banned-words/reload', internal.reloadBannedWords)
    app.use((err, req, res, next) => res.status(err.status ?? 500).json({ ok: false, code: err.code ?? 'ERROR' }))
    const server = http.createServer(app)
    const { url } = await listenOnFetchablePort(server)
    t.after(() => new Promise((resolve) => server.close(() => resolve())))
    return {
        async call(method, path, body) {
            const res = await fetch(`${url}${path}`, {
                method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
            })
            return { status: res.status, body: await res.json() }
        },
    }
}

// 두 Node + 가짜 표 + 값 처음으로
async function setup(t, opts) {
    const store = fakeTables(t)
    const w = await W.startNodes(t, { n1: B.n1, n2: B.n2 }, opts)
    resetOps(t)
    const app = await startN1App(t)
    return { w, store, app }
}

// Node 결과 줄 이름순 → [[node, ok]]
const nodeRows = (nodes) => nodes.map((n) => [n.node, n.ok]).sort((a, b) => a[0].localeCompare(b[0]))

// 그 Node에서 판 끝까지 → 결과 공개 칸의 사람별 골드 [값…]
async function goldAtEnd(w, node, prefix, n) {
    const g = await W.openGame(w, node, { prefix, n })
    await W.playToEnd(w, g)
    const ended = node.received(g.host, 'tribunal_vote_resolved').concat(node.received(g.host, 'night_result_applied'))
        .find((p) => p?.winResult)
    assert.ok(ended, '판 끝 칸을 못 받음')
    return ended.winResult.reveals.map((r) => r.goldReward)
}

// 그 Node에 사람 붙이고 진짜 사건 길(점검 문 포함)로 방 만들기 → 답
async function createViaEvent(node, uuid) {
    const s = node.connect(uuid)
    node.b.mm.registerMatchmakingHandlers(node.io, s, uuid)
    return new Promise((resolve) => s.trigger('create_room', { accessType: 'code', maxPlayers: 5, jokerCount: 1, ...W.TIMES }, resolve))
}

// 처리 안 된 오류 모으기 (시험 동안)
function trackErrors(t) {
    const errors = []
    const on = (e) => errors.push(String(e?.message ?? e))
    process.on('unhandledRejection', on)
    process.on('uncaughtException', on)
    t.after(() => { process.off('unhandledRejection', on); process.off('uncaughtException', on) })
    return errors
}

test('A17-B-060 관리자가 n1에서 판 골드 2 → 답 n1·n2 ok·일부 아님 → n2에서 시작한 판 끝 골드 2 (5명 판)', async (t) => {
    const { w, app } = await setup(t)
    const res = await app.call('PUT', '/admin-api/game-settings', { goldReward: 2 })
    assert.equal(res.status, 200)
    assert.deepEqual(nodeRows(res.body.nodes), [['n1', true], ['n2', true]])
    assert.equal(res.body.partial, false)
    w.useFakeClock(NOON_KST)
    const golds = await goldAtEnd(w, w.n2, 'r060', 5)
    assert.equal(golds.length, 5)
    for (const gold of golds) assert.equal(gold, 2)
})

test('A17-B-061 n2가 답 못 함(Redis 끊김) → 골드 바꾸기 답 일부만, n2 줄 ok:false', async (t) => {
    const { w, app } = await setup(t)
    w.setDown('n2', true)
    const res = await app.call('PUT', '/admin-api/game-settings', { goldReward: 2 })
    assert.equal(res.status, 200)
    assert.equal(res.body.partial, true)
    assert.deepEqual(nodeRows(res.body.nodes), [['n1', true], ['n2', false]])
})

test('A17-B-062 알림을 놓친 n2도 60초 안전망 뒤 새 값 → n2 판 골드 2 (5명 판)', async (t) => {
    const { w, store, app } = await setup(t)
    w.setDown('n2', true)
    await app.call('PUT', '/admin-api/game-settings', { goldReward: 2 })
    assert.equal(store.gold, 2)
    // 안전망 타이머(60초)를 가짜 시계로 다시 걺 (setInterval도 가짜)
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: NOON_KST })
    const sync = B.n2.x['services/ops/reloadSync'].__testables
    sync.stopSafetyNet()
    sync.startSafetyNet()
    t.after(() => sync.stopSafetyNet())
    w.tick(60_000)
    await w.settle()
    const golds = await goldAtEnd(w, w.n2, 'r062', 5)
    for (const gold of golds) assert.equal(gold, 2)
})

test('A17-B-063 n2 판 도중 n1에서 2로 → 그 판 끝 골드 1, 다음 판 2 (6명 판)', async (t) => {
    const { w, app } = await setup(t)
    w.useFakeClock(NOON_KST)
    const first = await W.openGame(w, w.n2, { prefix: 'r063a', n: 6 })
    const res = await app.call('PUT', '/admin-api/game-settings', { goldReward: 2 })
    assert.equal(res.body.partial, false)
    await W.playToEnd(w, first)
    const ended = w.n2.received(first.host, 'tribunal_vote_resolved').find((p) => p?.winResult)
    for (const row of ended.winResult.reveals) assert.equal(row.goldReward, 1, row.uuid)
    const golds = await goldAtEnd(w, w.n2, 'r063b', 6)
    for (const gold of golds) assert.equal(gold, 2)
})

test('A17-B-064 Redis 끊긴 동안 DB 골드 2로 → 살아나면 안전망 안 기다리고 n2 값 2 (5명 판)', async (t) => {
    const { w, store } = await setup(t)
    w.hub.setDown(true)
    store.gold = 2
    w.hub.setDown(false)
    // 살아난 뒤 다시 맞추기(0.5초 모음) 지나게, 안전망(60초)보다 훨씬 짧게
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    w.useFakeClock(NOON_KST)
    const golds = await goldAtEnd(w, w.n2, 'r064', 5)
    for (const gold of golds) assert.equal(gold, 2)
})

test('A17-B-065 점검을 n1에서 다시 읽으면 n2 방 만들기도 점검 거절', async (t) => {
    const { w, store, app } = await setup(t)
    store.maintenance = { id: 1, is_enabled: true, message: null, starts_at: null, ends_at: null }
    const res = await app.call('POST', '/internal/maintenance/reload')
    assert.equal(res.status, 200)
    await w.settle()
    const reply = await createViaEvent(w.n2, 'u065')
    assert.equal(reply.ok, false)
    assert.equal(reply.code, 'MAINTENANCE')
    assert.equal(reply.message, MAINTENANCE_TEXT)
})

test('A17-B-066 새 금지어를 n1에서 다시 읽으면 n2 판 채팅도 가림 (7명 판)', async (t) => {
    const { w, store, app } = await setup(t)
    store.banned = ['바보']
    const res = await app.call('POST', '/internal/banned-words/reload')
    assert.equal(res.status, 200)
    await w.settle()
    w.useFakeClock(NOON_KST)
    const g = await W.openGame(w, w.n2, { prefix: 'r066', n: 7 })
    w.advanceUntil(w.n2, g.gameId, (s) => s.phase === 'DAY')
    const speaker = W.citizenOf(g)
    const sent = await w.n2.ask(w.n2.b.G.handleSubmitGameChatMessage, speaker, { gameId: g.gameId, text: '너 바보야' })
    assert.equal(sent.ok, true)
    for (const uuid of g.uuids) {
        assert.deepEqual(w.n2.received(uuid, 'day_chat_message_received').map((p) => p.text), ['너 **야'], uuid)
    }
})

test('A17-B-067 관리자 점검 저장(n1) → 답 n1·n2 ok → n2 방 만들기 거절', async (t) => {
    const { w, app } = await setup(t)
    const res = await app.call('PUT', '/admin-api/maintenance', { enabled: true, startsAt: new Date(Date.now() - 60_000).toISOString() })
    assert.equal(res.status, 200)
    assert.deepEqual(nodeRows(res.body.nodes), [['n1', true], ['n2', true]])
    const reply = await createViaEvent(w.n2, 'u067')
    assert.equal(reply.ok, false)
    assert.equal(reply.code, 'MAINTENANCE')
})

test('A17-B-068 모르는 이름의 다시 읽기 알림은 n2가 무시, 오류 없음', async (t) => {
    const { w, store } = await setup(t)
    const errors = trackErrors(t)
    // DB엔 점검이 켜져 있어도 모르는 이름이면 n2는 다시 안 읽음
    store.maintenance = { id: 1, is_enabled: true, message: null, starts_at: null, ends_at: null }
    const sent = await w.n1.cluster.bus.publish('ops.reload', { what: '없는이름' })
    assert.equal(sent, true)
    await w.settle()
    const reply = await createViaEvent(w.n2, 'u068')
    assert.equal(reply.ok, true, `값이 바뀜: ${reply.code}`)
    assert.deepEqual(errors, [])
})

test('A17-B-069 Redis 없음(1대)에서 골드 2 저장 → 답 Node 1개 ok·일부 아님, 다음 판 골드 2 (5명 판)', async (t) => {
    fakeTables(t)
    const w = await W.startNodes(t, { n1: B.n1 })
    resetOps(t)
    // Redis 없는 1대로 (닫으면 REDIS_URL 없는 단일 모드)
    await B.n1.cluster.close()
    assert.equal(B.n1.cluster.isEnabled(), false)
    const app = await startN1App(t)
    const res = await app.call('PUT', '/admin-api/game-settings', { goldReward: 2 })
    assert.equal(res.status, 200)
    assert.equal(res.body.nodes.length, 1)
    assert.equal(res.body.nodes[0].ok, true)
    assert.equal(res.body.partial, false)
    w.useFakeClock(NOON_KST)
    const golds = await goldAtEnd(w, w.n1, 'r069', 5)
    for (const gold of golds) assert.equal(gold, 2)
})
