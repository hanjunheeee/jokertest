// 진짜 Redis 통합 시험 도우미, 한 프로세스에 Node(=socket.io 서버 + cluster) 여럿 띄우기·처리 안 된 거절 세기
// tests/cluster/*.integration.test.js가 씀, REDIS_URL_TEST 없으면 시험이 건너뜀
const http = require('node:http')
const crypto = require('node:crypto')
const { Server } = require('socket.io')
const ioClient = require('socket.io-client')

const { createClusterNode } = require('../../../cluster/node')
const { createRedisBackend } = require('../../../cluster/redis')
const { readClusterConfig } = require('../../../config/cluster')
const { quietLog } = require('../../../cluster/testing/memoryCluster')

const REDIS_URL_TEST = process.env.REDIS_URL_TEST || ''
const skipReason = REDIS_URL_TEST ? false : 'REDIS_URL_TEST 없음 (npm run test:with-redis로 돌림)'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 시험마다 다른 앞머리 (같은 Redis를 써도 안 섞임)
const uniquePrefix = () => `mntest:${crypto.randomUUID().slice(0, 8)}`

// 조건이 될 때까지 기다림 → 걸린 ms, 시간 넘으면 오류
async function waitFor(check, { timeoutMs = 8000, stepMs = 20 } = {}) {
    const started = Date.now()
    while (!(await check())) {
        if (Date.now() - started > timeoutMs) throw new Error('waitFor 시간 초과')
        await sleep(stepMs)
    }
    return Date.now() - started
}

// Node 하나: socket.io 서버(user:<uuid> 채널에 넣는 단순 접속) + 진짜 Redis cluster
async function startRedisNode(t, { url, serverId, prefix, env = {}, withIo = true, log = quietLog, bootEpoch }) {
    const config = readClusterConfig({ REDIS_URL: url, SERVER_ID: serverId, REDIS_KEY_PREFIX: prefix, ...env })
    const backend = createRedisBackend(config, { log })
    let io = null
    let server = null
    if (withIo) {
        server = http.createServer()
        io = new Server(server, { transports: ['websocket'] })
        io.on('connection', (socket) => {
            const uuid = socket.handshake.auth?.uuid
            if (uuid) socket.join(`user:${uuid}`)
        })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    }
    const node = createClusterNode({ config, backend, log, bootEpoch })
    // 운영 끄기 순서와 같게: 소켓(어댑터) 먼저 닫고 Redis 연결
    t.after(async () => {
        if (io) await new Promise((resolve) => io.close(() => resolve()))
        await node.close().catch(() => {})
    })
    await node.start({ io })
    return { node, io, port: server?.address().port ?? null, backend }
}

// 사용자 소켓 하나 붙이기 → { socket, received:[{event,payload}] }
async function connectUser(t, port, uuid) {
    const socket = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], auth: { uuid }, reconnection: false })
    const received = []
    socket.onAny((event, payload) => received.push({ event, payload }))
    t.after(() => socket.close())
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
    })
    await sleep(30)
    return { socket, received }
}

// 처리 안 된 거절 세기 (시험 동안만)
function trackUnhandled(t) {
    const seen = []
    const onReject = (reason) => seen.push(String(reason?.message ?? reason))
    process.on('unhandledRejection', onReject)
    t.after(() => process.off('unhandledRejection', onReject))
    return seen
}

// 앞머리 키 지우기 (시험 끝 정리)
async function cleanupPrefix(prefix) {
    if (!REDIS_URL_TEST) return
    const Redis = require('ioredis')
    const client = new Redis(REDIS_URL_TEST, { lazyConnect: true, maxRetriesPerRequest: 1 })
    try {
        await client.connect()
        let cursor = '0'
        do {
            const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 500)
            cursor = next
            if (keys.length) await client.del(...keys)
        } while (cursor !== '0')
    } finally {
        client.disconnect()
    }
}

// 시험 Redis에 직접 명령 (CONFIG SET 등)
async function withAdminClient(fn) {
    const Redis = require('ioredis')
    const client = new Redis(REDIS_URL_TEST, { lazyConnect: true, maxRetriesPerRequest: 1 })
    try {
        await client.connect()
        return await fn(client)
    } finally {
        client.disconnect()
    }
}

module.exports = {
    REDIS_URL_TEST, skipReason, sleep, uniquePrefix, waitFor,
    startRedisNode, connectUser, trackUnhandled, cleanupPrefix, withAdminClient,
}
