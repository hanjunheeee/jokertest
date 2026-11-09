// 즉시 끊기 순서 시험: 다른 Node 플레이어도 첫 안내가 정지·비활성 문구 (세션 내림 알림이 안내보다 먼저 가면 "세션 만료"로 끊김)
// 앞 시험은 가짜 소켓(늘 돎), 뒤 시험은 진짜 Redis Node 둘 (npm run test:with-redis, REDIS_URL_TEST 없으면 건너뜀)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { Server } = require('socket.io')

const { REDIS_URL_TEST, skipReason, sleep, uniquePrefix, waitFor, startRedisNode, connectUser, cleanupPrefix } = require('./helpers/redisNodes')
const cluster = require('../../cluster')
const { quietLog } = require('../../cluster/testing/memoryCluster')
const { disconnectUser } = require('../../services/ops/disconnect')
const { notifySessionsRevoked } = require('../../repositories/user/revokeSignal')

const UUID = 'aaaaaaaa-0000-4000-8000-0000000000dc'
const FAST = { CLUSTER_HEARTBEAT_MS: '200', NODE_DEAD_AFTER_MS: '1000' }

// 세 code별 가짜 저장소 재료 (정지 → 비활성 → 그 밖)
const CASES = [
    { code: 'ACCOUNT_BANNED', ban: { reason: '욕설' }, status: 'ACTIVE' },
    { code: 'ACCOUNT_INACTIVE', ban: null, status: 'SUSPENDED' },
    { code: 'ADMIN_DISCONNECT', ban: null, status: 'ACTIVE' },
]

// 가짜 저장소: 세션 내림은 DB 걸리는 시간만큼 쉬고 진짜 내림 알림(버스)까지 보냄, 부른 때 기록
const fakeRepo = ({ ban, status }, log = []) => ({
    checkActiveBan: async () => ban,
    findByUuid: async () => ({ uuid: UUID, status }),
    markOnlineSessionsOffline: async (uuid) => {
        log.push('세션 내림')
        await sleep(3)
        notifySessionsRevoked(uuid)
    },
})

// ── 가짜 소켓: 세션 내림은 모든 소켓 안내·끊기 뒤 ──

for (const one of CASES) {
    test(`즉시 끊기 순서: ${one.code} — 안내·끊기 먼저, 세션 내림은 그 뒤 (그 밖이면 내림 없음)`, async () => {
        const log = []
        const socketOf = (id) => ({
            id,
            emit: (event, payload) => log.push(`${id} ${event} ${payload.code}`),
            disconnect: () => log.push(`${id} 끊기`),
        })
        const sockets = [socketOf('s1'), socketOf('s2')]
        const io = { in: () => ({ fetchSockets: async () => sockets }) }
        const result = await disconnectUser(UUID, { getIo: () => io, userRepository: fakeRepo(one, log) })
        const tail = one.code === 'ADMIN_DISCONNECT' ? [] : ['세션 내림']
        assert.deepEqual(log, [`s1 force_disconnect ${one.code}`, 's1 끊기', `s2 force_disconnect ${one.code}`, 's2 끊기', ...tail])
        assert.equal(result.disconnected, 2)
    })
}

// ── 진짜 Redis Node 둘 ──

// n1 = 이 프로세스 cluster(진짜 Redis + 어댑터) + socket.io 서버 (접속 때 user:<uuid> 채널)
async function startSelfNode(t, prefix) {
    const server = http.createServer()
    const io = new Server(server, { transports: ['websocket'] })
    io.on('connection', (socket) => { if (socket.handshake.auth?.uuid) socket.join(`user:${socket.handshake.auth.uuid}`) })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    await cluster.init({ io, env: { REDIS_URL: REDIS_URL_TEST, SERVER_ID: 'n1', REDIS_KEY_PREFIX: prefix, ...FAST }, log: quietLog })
    t.after(async () => {
        await new Promise((resolve) => io.close(() => resolve()))
        await cluster.close()
    })
    return { io }
}

// n2의 소켓 세션 확인 흉내: 내림 알림(버스)을 받자마자 그 사람 소켓을 "세션 만료"로 끊음 (DB 확인 시간 0 = 가장 빠른 경우)
function watchRevokeLikeSessionCheck(n2) {
    n2.node.bus.on(cluster.BUS_TYPES.AUTH_REVOKED, async (msg) => {
        const sockets = await n2.io.local.in(`user:${msg.uuid}`).fetchSockets()
        for (const socket of sockets) {
            socket.emit('force_disconnect', { code: 'SESSION_EXPIRED', message: '세션이 만료되었습니다. 다시 로그인해주세요.' })
            socket.disconnect(true)
        }
    })
}

test('즉시 끊기 순서(진짜 Redis): n1이 끊은 n2 플레이어의 첫 안내 = 정지·비활성·관리자 끊기 문구 (세 code × 5번)', { skip: skipReason }, async (t) => {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    const self = await startSelfNode(t, prefix)
    const n2 = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST })
    await n2.node.nodes.refresh()
    await cluster.nodes.refresh()
    watchRevokeLikeSessionCheck(n2)

    for (const one of CASES) {
        for (let round = 0; round < 5; round += 1) {
            const player = await connectUser(t, n2.port, UUID)
            const closed = new Promise((resolve) => player.socket.once('disconnect', resolve))
            await disconnectUser(UUID, { getIo: () => self.io, userRepository: fakeRepo(one) })
            await closed
            await waitFor(async () => player.received.some((item) => item.event === 'force_disconnect'), { timeoutMs: 2000 })
            const first = player.received.find((item) => item.event === 'force_disconnect')
            assert.equal(first.payload.code, one.code, `${one.code} ${round + 1}번째: 첫 안내가 ${first.payload.code}`)
            player.socket.close()
        }
    }
})
