// 조각 2 시험: HTTP가 다른 Node 상태 읽기 — 공지 online·강제 끊기 대체·live 합치기·Node 목록·drain·신고·탈퇴
// MN-030~033·115·121~125·129·130 (메모리 받침 Node 2개, 디렉터리 값은 시험이 직접 넣음)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const { cluster, waitFor, startPair, fakeSocket } = require('./helpers/slice2')
const { sendAnnouncement } = require('../../services/ops/announcements')
const { disconnectUser } = require('../../services/ops/disconnect')
const liveService = require('../../services/ops/live')
const clusterOps = require('../../services/ops/clusterOps')
const { submitReport } = require('../../services/ops/report')
const chatBuffer = require('../../services/ops/chatBuffer')
const registryState = require('../../game-core/core/registry/state')
const { isInActiveGameAnywhere } = require('../../services/auth/account/activeGameCheck')
const gameSession = require('../../game-core/gameSession')

const A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const B = 'bbbbbbbb-0000-4000-8000-00000000000b'
const C = 'cccccccc-0000-4000-8000-00000000000c'
const D = 'dddddddd-0000-4000-8000-00000000000d'
const GAME = 'eeeeeeee-0000-4000-8000-00000000000e'

const keys = () => cluster.directory.keys()

// ── 공지 online ──

function announceDeps(rows, localOnline) {
    const sent = []
    return {
        sent,
        deps: {
            onlineUsers: new Map(localOnline.map((uuid) => [uuid, 'sock'])),
            db: { OnlinePresence: { findAll: async () => rows } },
            cluster,
            notificationService: {
                NOTIFICATION_TYPES: { SYSTEM: 'SYSTEM' },
                createNotification: async ({ userId }) => ({ created: true, notification: { userId } }),
                emitNotificationCreated: (userId) => sent.push(userId),
            },
        },
    }
}

test('MN-030·031: 공지 online = 두 Node 접속자 전원 (DB ONLINE 줄 + 살아 있는 Node), 죽은 Node 줄은 빠짐', async (t) => {
    await startPair(t)
    const rows = [
        { user_id: A, server_id: 'n1' }, { user_id: B, server_id: 'n2' }, { user_id: C, server_id: 'n9-dead' }, { user_id: D, server_id: null },
    ]
    const { deps, sent } = announceDeps(rows, [D])
    const result = await sendAnnouncement({ announcementId: 'a30', title: 't', body: 'b', target: 'online' }, deps)
    assert.equal(result.recipientCount, 3)
    assert.deepEqual(sent.sort(), [A, B, D].sort())
})

test('MN-031: Redis down이면 살아 있는 Node가 나뿐 → 내 Node 줄·접속자만', async (t) => {
    const { hub } = await startPair(t)
    hub.setDown(true)
    const { deps, sent } = announceDeps([{ user_id: A, server_id: 'n1' }, { user_id: B, server_id: 'n2' }], [])
    await sendAnnouncement({ announcementId: 'a31', title: 't', body: 'b', target: 'online' }, deps)
    assert.deepEqual(sent, [A])
})

// ── 강제 끊기 ──

// 어댑터가 붙은 io 흉내: in = 전 Node, local.in = 이 Node만
function fakeClusterIo({ everywhere, here, failEverywhere = false }) {
    return {
        in: () => ({ fetchSockets: async () => { if (failEverywhere) throw new Error('timeout'); return everywhere } }),
        local: { in: () => ({ fetchSockets: async () => here }) },
    }
}

const banRepo = { checkActiveBan: async () => ({}), findByUuid: async () => ({ status: 'ACTIVE' }), markOnlineSessionsOffline: async () => {} }

test('MN-032: 강제 끊기 요청을 받은 Node가 다른 Node 소켓까지 끊고 수가 맞음', async (t) => {
    await startPair(t)
    const mine = fakeSocket(A)
    const remote = fakeSocket(A)
    const result = await disconnectUser(A, { getIo: () => fakeClusterIo({ everywhere: [mine, remote], here: [mine] }), userRepository: banRepo })
    assert.deepEqual(result, { uuid: A, code: 'ACCOUNT_BANNED', disconnected: 2, partial: false })
    assert.equal(remote.disconnected, true)
})

test('MN-033: 강제 끊기 + Redis 죽음 → 내 Node만 + partial', async (t) => {
    const { hub } = await startPair(t)
    hub.setDown(true)
    const mine = fakeSocket(A)
    const result = await disconnectUser(A, { getIo: () => fakeClusterIo({ everywhere: [mine, fakeSocket(A)], here: [mine] }), userRepository: banRepo })
    assert.equal(result.disconnected, 1)
    assert.equal(result.partial, true)
})

test('MN-033: up인데 다른 Node가 늦음(어댑터 시간 초과) → 내 Node만 + partial', async (t) => {
    await startPair(t)
    const mine = fakeSocket(A)
    const result = await disconnectUser(A, { getIo: () => fakeClusterIo({ everywhere: [], here: [mine], failEverywhere: true }), userRepository: banRepo })
    assert.deepEqual([result.disconnected, result.partial], [1, true])
})

// ── live·cluster·drain ──

test('MN-129: /internal/live 합침 — 접속 수 합, 방·판에 node 칸, Node별 줄, partial', async (t) => {
    const { n2 } = await startPair(t)
    t.mock.method(liveService, 'getLiveSummary', () => ({ onlineCount: 3, rooms: [{ roomId: 'r1' }], games: [] }))
    n2.rpc.register('ops.liveSummary', () => ({ onlineCount: 2, rooms: [], games: [{ gameId: 'g2' }] }))
    const merged = await liveService.getClusterLiveSummary()
    assert.equal(merged.onlineCount, 5)
    assert.deepEqual(merged.rooms, [{ roomId: 'r1', node: 'n1' }])
    assert.deepEqual(merged.games, [{ gameId: 'g2', node: 'n2' }])
    assert.deepEqual(merged.nodes.map((n) => [n.node, n.ok]), [['n1', true], ['n2', true]])
    assert.equal(merged.partial, false)
    const only = await liveService.getClusterLiveSummary({ node: 'n2' })
    assert.deepEqual([only.onlineCount, only.gameCount, only.nodes.length], [2, 1, 1])
    // n2가 답 못 함 → 그 Node 줄은 ok:false, partial
    n2.rpc.register('ops.liveSummary', () => { throw Object.assign(new Error('x'), { code: 'BROKEN' }) })
    const broken = await liveService.getClusterLiveSummary()
    assert.equal(broken.partial, true)
    assert.equal(broken.nodes[1].ok, false)
})

test('MN-130·115: /internal/cluster Node 목록 + drain은 그 Node에 시켜 하트비트에 실림 (판 0 확인)', async (t) => {
    const { n2 } = await startPair(t, { n2Env: { CLUSTER_HEARTBEAT_MS: '20' }, n2Stats: () => ({ games: 0, rooms: 0, online: 4 }) })
    // drain 처리기는 Node마다 같은 코드 → n2에도 같은 것 붙임 (한 프로세스 시험이라)
    n2.rpc.register('ops.setDraining', (args) => ({ draining: n2.nodes.setDraining(args?.draining !== false) }))
    assert.deepEqual(await clusterOps.setNodeDraining('n2', true), { node: 'n2', draining: true })
    assert.equal(n2.nodes.isDraining(), true)
    await waitFor(async () => {
        const view = await clusterOps.describeCluster()
        return view.nodes.find((n) => n.id === 'n2')?.draining === true
    })
    const view = await clusterOps.describeCluster()
    assert.deepEqual(view.nodes.map((n) => n.id), ['n1', 'n2'])
    assert.deepEqual([view.serverId, view.redis, view.partial], ['n1', 'up', false])
    const n2Line = view.nodes[1]
    assert.deepEqual([n2Line.games, n2Line.online, n2Line.self], [0, 4, false])
    assert.deepEqual(await clusterOps.setNodeDraining('n1', true), { node: 'n1', draining: true })
    assert.equal(cluster.nodes.isDraining(), true)
    cluster.nodes.setDraining(false)
    await assert.rejects(clusterOps.setNodeDraining('n9', true), { status: 404, code: 'NODE_UNAVAILABLE' })
    await assert.rejects(clusterOps.setNodeDraining('bad id!', true), { status: 400 })
})

// ── 신고 ──

function reportDeps(created) {
    return {
        db: {
            GameResultPlayer: { count: async () => 0 },
            Report: { findOne: async () => null, create: async (row) => { created.report = row; return { id: 77 } } },
            ReportChatEvidence: { create: async (row) => { created.evidence = row } },
        },
        gameSessions: new Map(),
        chatBuffer: { getGameChatMessages: () => [] },
        gameLookup: require('../../services/ops/gameLookup'),
        now: () => new Date(),
    }
}
const reportBody = { targetUuid: B, gameId: GAME, reasonCode: 'ABUSE' }

test('MN-121·122: 진행 중 판이 다른 Node → RPC로 같이 한 판 확인 + 판 Node 버퍼에서 채팅 증거', async (t) => {
    const { n2 } = await startPair(t)
    await n2.directory.write(keys().game(GAME), 'n2', { ttlMs: 60000 })
    n2.rpc.register('game.participants', ({ uuids }) => ({ found: true, both: uuids.every((u) => [A, B].includes(u)) }))
    n2.rpc.register('game.chatEvidence', () => ({ messages: [{ text: '증거' }] }))
    const created = {}
    const result = await submitReport({ reporterId: A, body: reportBody }, reportDeps(created))
    assert.deepEqual(result, { reportId: 77, evidenceSaved: true })
    assert.deepEqual(created.evidence.messages, [{ text: '증거' }])
})

test('MN-122: 판이 끝나 디렉터리에서 빠졌어도 전 Node에 물어 증거를 찾음', async (t) => {
    const { n2 } = await startPair(t)
    n2.rpc.register('game.chatEvidence', () => ({ messages: [{ text: '끝난 판 채팅' }] }))
    const created = {}
    const deps = reportDeps(created)
    deps.db.GameResultPlayer.count = async () => 2
    const result = await submitReport({ reporterId: A, body: reportBody }, deps)
    assert.equal(result.evidenceSaved, true)
})

test('MN-123: 판 Node 죽음 → DB만, 증거 없이 저장', async (t) => {
    const { n2 } = await startPair(t)
    await n2.directory.write(keys().game(GAME), 'n2', { ttlMs: 60000 })
    await n2.close()
    await cluster.nodes.refresh()
    const created = {}
    const deps = reportDeps(created)
    deps.db.GameResultPlayer.count = async () => 2
    assert.deepEqual(await submitReport({ reporterId: A, body: reportBody }, deps), { reportId: 77, evidenceSaved: false })
    deps.db.GameResultPlayer.count = async () => 1
    await assert.rejects(submitReport({ reporterId: A, body: reportBody }, deps), { status: 404 })
})

test('MN-121: 판 Node 쪽 처리기 — 이 Node 장부·버퍼 기준으로 답함', async (t) => {
    await startPair(t)
    registryState.gameSessions.set(GAME, { id: GAME, players: new Map([[A, {}], [B, {}]]) })
    t.after(() => registryState.gameSessions.delete(GAME))
    chatBuffer.recordGameChatMessage(GAME, { channel: 'day', senderUuid: A, text: '안녕' })
    t.after(() => chatBuffer.__resetForTests())
    assert.deepEqual(await cluster.rpc.call('n1', 'game.participants', { gameId: GAME, uuids: [A, B] }), { found: true, both: true })
    assert.deepEqual(await cluster.rpc.call('n1', 'game.participants', { gameId: GAME, uuids: [A, C] }), { found: true, both: false })
    assert.equal((await cluster.rpc.call('n1', 'game.chatEvidence', { gameId: GAME })).messages[0].text, '안녕')
})

// ── 탈퇴 판 중 ──

test('MN-124: 다른 Node 판 중 탈퇴 → 판 중(409로 이어짐)', async (t) => {
    const { n2 } = await startPair(t)
    t.mock.method(gameSession, 'isMatchmakingBlocked', () => false)
    await n2.directory.write(keys().loc(A), { node: 'n2', bootEpoch: n2.bootEpoch, kind: 'game', id: GAME }, { ttlMs: 60000 })
    n2.rpc.register('user.inActiveGame', ({ uuid }) => ({ inGame: uuid === A }))
    assert.equal(await isInActiveGameAnywhere(A), true)
    assert.equal(await isInActiveGameAnywhere(B), false)
    const withdrawService = require('../../services/auth/account/withdraw')
    await assert.rejects(withdrawService.withdrawAccount({ uuid: A, password: 'x' }), { status: 409, code: 'WITHDRAW_IN_GAME' })
})

test('MN-125: 탈퇴 판 확인 못 함 → 503 CLUSTER_UNAVAILABLE (Redis down·답 없음)', async (t) => {
    const { hub, n2 } = await startPair(t, { env: { CLUSTER_RPC_TIMEOUT_MS: '50' } })
    t.mock.method(gameSession, 'isMatchmakingBlocked', () => false)
    await n2.directory.write(keys().loc(A), { node: 'n2', bootEpoch: n2.bootEpoch, kind: 'game', id: GAME }, { ttlMs: 60000 })
    n2.rpc.register('user.inActiveGame', () => new Promise(() => {}))
    await assert.rejects(isInActiveGameAnywhere(A), { status: 503, code: 'CLUSTER_UNAVAILABLE' })
    hub.setDown(true)
    await assert.rejects(isInActiveGameAnywhere(B), { status: 503, code: 'CLUSTER_UNAVAILABLE' })
})

test('MN-124: 위치의 Node가 죽었으면 판도 사라짐 → 판 아님', async (t) => {
    const { n2 } = await startPair(t)
    t.mock.method(gameSession, 'isMatchmakingBlocked', () => false)
    await n2.directory.write(keys().loc(A), { node: 'n2', bootEpoch: 'old-boot', kind: 'game', id: GAME }, { ttlMs: 60000 })
    assert.equal(await isInActiveGameAnywhere(A), false)
})
