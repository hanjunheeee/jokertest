// 조각 1·2·3 묶음 진짜 Redis 통합 시험: 이 프로세스 cluster(n1) + 따로 도는 n2를 같은 Redis에 붙여 위치·밀어내기·요청 제한·서버 이름 확인
// npm run test:with-redis로 돎 (REDIS_URL_TEST 없으면 건너뜀), 메모리 Redis 시험(tests/socket/multinode)과 같은 길을 진짜 Redis로 한 번 더
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const { REDIS_URL_TEST, skipReason, uniquePrefix, waitFor, startRedisNode, cleanupPrefix } = require('./helpers/redisNodes')
const { quietLog } = require('../../cluster/testing/memoryCluster')
const cluster = require('../../cluster')
const emitter = require('../../socket/emitter')
const replace = require('../../socket/connection/replace')
const locationSync = require('../../socket/connection/locationSync')
const { playerRoom } = require('../../socket/matchmaking/core/state')
const { gameSessions, playerSession } = require('../../game-core/core/registry/state')
const presenceService = require('../../services/presence/status')
const onlinePresenceRepository = require('../../repositories/presence/onlinePresence')
const { createRateLimiter } = require('../../middlewares/rateLimit.middleware')
const { buildFindIdRateLimiters, buildPasswordResetRateLimiters } = require('../../middlewares/authRateLimit.middleware')

const FAST = { CLUSTER_HEARTBEAT_MS: '200', NODE_DEAD_AFTER_MS: '1000' }

// n1 = 이 프로세스 cluster, n2 = 진짜 Redis Node (둘 다 같은 앞머리)
async function realPair(t) {
    const prefix = uniquePrefix()
    t.after(() => cleanupPrefix(prefix))
    await cluster.init({ env: { REDIS_URL: REDIS_URL_TEST, SERVER_ID: 'n1', REDIS_KEY_PREFIX: prefix, ...FAST }, log: quietLog })
    t.after(() => cluster.close())
    const { node: n2 } = await startRedisNode(t, { url: REDIS_URL_TEST, serverId: 'n2', prefix, env: FAST, withIo: false })
    await waitFor(async () => { await cluster.nodes.refresh(); return cluster.nodes.isAlive('n2') })
    await n2.nodes.refresh()
    return { prefix, n2 }
}

// 내 Node 소켓 하나 (끊기면 표시만)
function fakeSocket(id, sessionId = 's1') {
    return {
        id, connected: true, data: { user: { sessionId } }, sent: [],
        emit(event, payload) { this.sent.push({ event, payload }) },
        disconnect() { this.connected = false },
    }
}

function useIo(t, sockets) {
    emitter.setIo({ sockets: { sockets: new Map(sockets.map((s) => [s.id, s])) }, to: () => ({ emit() {} }) })
    t.after(() => { emitter.setIo(null); emitter.onlineUsers.clear(); replace.__resetReplaceForTests() })
}

test('조각1·3 진짜 Redis: 장부 바뀜 → loc 키를 n2가 읽음, 나가면 지움', { skip: skipReason }, async (t) => {
    const { n2 } = await realPair(t)
    playerRoom.clear(); playerSession.clear(); gameSessions.clear()
    locationSync.__stopLocationSyncForTests()
    locationSync.startLocationSync()
    t.after(() => { locationSync.__stopLocationSyncForTests(); playerRoom.clear(); playerSession.clear(); gameSessions.clear() })
    const keys = cluster.directory.keys()

    playerRoom.set('ri-u1', 'room-ri')
    await locationSync.flushNow()
    const seen = await n2.directory.locate(keys.loc('ri-u1'))
    assert.deepEqual([seen.available, seen.node, seen.alive, seen.self], [true, 'n1', true, false])
    assert.equal(seen.value.kind, 'room')

    playerRoom.delete('ri-u1')
    await locationSync.flushNow()
    assert.equal((await n2.directory.read(keys.loc('ri-u1'))).value, null)
})

test('조각3 진짜 Redis: n2에서 더 큰 순번으로 붙음 → n1 옛 소켓 밀려남, 그 전엔 n1이 conn 주인', { skip: skipReason }, async (t) => {
    const { n2 } = await realPair(t)
    replace.startReplaceSync()
    const socket = fakeSocket('ri-s1')
    useIo(t, [socket])
    emitter.onlineUsers.set('ri-u2', socket.id)
    await replace.announceConnection(socket, 'ri-u2')
    assert.equal(socket.data.connSeq, 1)
    const keys = cluster.directory.keys()
    assert.equal((await n2.directory.locate(keys.conn('ri-u2'))).node, 'n1')

    // n2가 순번 받고 알림 (n2 쪽 announceConnection과 같은 순서)
    const seq = await n2.directory.nextSeq(keys.connseq('ri-u2'), cluster.TTL.conn)
    await n2.directory.write(keys.conn('ri-u2'), { node: 'n2', bootEpoch: n2.bootEpoch, socketId: 'x', seq, sessionId: 's2' }, { ttlMs: cluster.TTL.conn })
    assert.equal(await n2.bus.publish(cluster.BUS_TYPES.CONN_REPLACED, { uuid: 'ri-u2', node: 'n2', socketId: 'x', seq, sessionId: 's2' }), true)

    await waitFor(() => socket.connected === false)
    assert.equal(socket.data.forcedLogout, true)
    assert.equal(socket.sent[0].payload.code, 'REPLACED_BY_OTHER_LOGIN')
    assert.equal(await replace.isConnectedElsewhere('ri-u2'), true)
})

test('조각2·통합 진짜 Redis: 인증 ip 제한 셋은 Redis 키가 따로, 같은 이름은 Node끼리 합쳐 셈', { skip: skipReason }, async (t) => {
    const { n2 } = await realPair(t)
    const env = {
        FIND_ID_WINDOW_MS: '60000', FIND_ID_IP_MAX: '2',
        PASSWORD_RESET_REQUEST_WINDOW_MS: '60000', PASSWORD_RESET_REQUEST_IP_MAX: '2',
        PASSWORD_RESET_CHECK_WINDOW_MS: '60000', PASSWORD_RESET_CHECK_IP_MAX: '2',
    }
    const findId = buildFindIdRateLimiters(env, createRateLimiter)
    const reset = buildPasswordResetRateLimiters(env, createRateLimiter)
    const run = async (limiter) => {
        let status = 'next'
        const res = { status(code) { status = code; return this }, json() { return this } }
        await limiter({ ip: '7.7.7.7' }, res, () => {})
        return status
    }
    // n2에서 아이디 찾기 한 번 → n1 아이디 찾기는 한 번 더만 됨
    await n2.counters.hit('rl:find-id-ip:ip:7.7.7.7', 60000)
    assert.equal(await run(findId.ip), 'next')
    assert.equal(await run(findId.ip), 429)
    // 창·최대가 같아도 재설정 ip 제한은 따로
    assert.equal(await run(reset.requestIp), 'next')
    assert.equal(await run(reset.checkIp), 'next')
    assert.equal((await n2.counters.peek('rl:reset-request-ip:ip:7.7.7.7')).count, 1)
    assert.equal((await n2.counters.peek('rl:reset-check-ip:ip:7.7.7.7')).count, 1)
})

test('통합 진짜 Redis: 접속 상태 저장의 서버 이름 = cluster.serverId() (SERVER_ID 환경값 아님)', { skip: skipReason }, async (t) => {
    await realPair(t)
    const calls = []
    t.mock.method(onlinePresenceRepository, 'markOfflineIfOwner', async (uuid, serverId) => { calls.push(['off', serverId]) })
    t.mock.method(onlinePresenceRepository, 'upsertOnlinePresence', async (uuid, status, serverId) => { calls.push([status, serverId]) })
    await presenceService.setPresence('ri-u3', 'ONLINE')
    await presenceService.setPresence('ri-u3', 'OFFLINE')
    assert.deepEqual(calls, [['ONLINE', 'n1'], ['off', 'n1']])
})
