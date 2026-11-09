// 한 계정 두 서버 + Redis 끊김 이상한 순서 시험 (메모리 Redis): 끊긴 사이 다른 서버로 새로 붙은 뒤 살아나면 옛 탭이 밀려나는지
// n1은 이 프로세스 cluster(진짜 replace.js), n2는 순번·conn·conn.replaced 알림을 손으로 흉내 (npm test에서 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const cluster = require('../../cluster')
const { createMemoryHub, quietLog } = require('../../cluster/testing/memoryCluster')
const emitter = require('../../socket/emitter')
const replace = require('../../socket/connection/replace')

const FAST = { CLUSTER_HEARTBEAT_MS: '30', NODE_DEAD_AFTER_MS: '150' }
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

// 조건이 될 때까지 기다림 (넘으면 false, 고정 시간 대신 상태 확인)
async function waitUntil(check, timeoutMs = 3000) {
    const started = Date.now()
    while (!(await check())) {
        if (Date.now() - started > timeoutMs) return false
        await tick(5)
    }
    return true
}

// n1(이 프로세스, 받침 b1) + n2 켜기, 가짜 io에 소켓 넣기, 끝에 다 비움
async function setup(t, sockets) {
    const hub = createMemoryHub()
    const b1 = hub.backend()
    await cluster.init({ backend: b1, env: { SERVER_ID: 'n1', ...FAST }, log: quietLog })
    const n2 = await hub.startNode('n2', { env: FAST })
    await n2.nodes.refresh()
    await cluster.nodes.refresh()
    emitter.setIo({ sockets: { sockets: new Map(sockets.map((s) => [s.id, s])) }, to: () => ({ emit() {} }) })
    replace.startReplaceSync()
    // n2가 받은 conn.replaced (n1이 n2 쪽 사람을 밀어낸 알림)
    const toN2 = []
    n2.bus.on('conn.replaced', (msg) => toN2.push(msg))
    t.after(async () => {
        emitter.setIo(null)
        emitter.onlineUsers.clear()
        replace.__resetReplaceForTests()
        await cluster.close()
        await hub.close()
    })
    return { hub, b1, n2, toN2 }
}

function makeSocket(id, sessionId) {
    return {
        id,
        connected: true,
        data: { user: { uuid: 'x', sessionId } },
        emitted: [],
        disconnects: 0,
        emit(event, payload) { this.emitted.push({ event, payload }) },
        disconnect() { this.disconnects += 1; this.connected = false },
    }
}

// n2에서 붙은 것 흉내: 순번 받고 conn 쓰고 알림 (n2 replace.js가 하는 일)
async function connectOnN2(n2, uuid, { socketId = 'n2-sock', sessionId = 'sess-n2' } = {}) {
    const seq = await n2.directory.nextSeq(n2.directory.keys.connseq(uuid), 60000)
    await n2.directory.write(n2.directory.keys.conn(uuid), { node: 'n2', bootEpoch: n2.bootEpoch, socketId, seq, sessionId }, { ttlMs: 60000 })
    await n2.bus.publish('conn.replaced', { uuid, node: 'n2', socketId, seq, sessionId })
    return seq
}

const connOf = async (n2, uuid) => (await n2.directory.read(n2.directory.keys.conn(uuid))).value

// [겹침: Redis 둘 다 끊김 + 같은 계정 두 서버 접속 + 살아난 뒤 다시 맞추기 순서 두 가지]
test('Redis 끊긴 동안 한 계정이 n1·n2 둘 다 붙음 → 살아난 뒤 n2 알림이 먼저면 순번 없는 n1 탭이 밀림, n1 다시 맞추기가 먼저면 n1이 순번 받고 알림', async (t) => {
    const early = makeSocket('n1-early', 'sess-a')
    const late = makeSocket('n1-late', 'sess-b')
    const { hub, n2, toN2 } = await setup(t, [early, late])
    hub.setDown(true)
    // 끊긴 동안 붙음: 순번 못 받음
    emitter.onlineUsers.set('u-early', early.id)
    emitter.onlineUsers.set('u-late', late.id)
    await replace.announceConnection(early, 'u-early')
    await replace.announceConnection(late, 'u-late')
    assert.equal(early.data.connSeq, undefined)

    hub.setDown(false)
    // (가) u-early: n2가 살아나자마자 알림 (n1 다시 맞추기 0.5초 전) → n1 탭은 옛것으로 봄
    await connectOnN2(n2, 'u-early')
    assert.equal(await waitUntil(() => early.disconnects === 1), true, 'n2 알림을 받고도 순번 없는 n1 탭이 안 밀림')
    assert.equal(early.emitted[0]?.payload?.code, 'REPLACED_BY_OTHER_LOGIN')
    assert.equal(emitter.onlineUsers.has('u-early'), false)

    // (나) u-late: n1 다시 맞추기가 먼저 → 순번 받고 conn 쓰고 n2에 알림
    assert.equal(await waitUntil(async () => (await connOf(n2, 'u-late'))?.node === 'n1'), true, '살아난 뒤 n1이 conn을 안 씀')
    assert.equal(Number.isInteger(late.data.connSeq), true)
    assert.equal(await waitUntil(() => toN2.some((m) => m.uuid === 'u-late' && m.node === 'n1')), true)
    // n2가 그 뒤에 더 큰 순번으로 붙으면 n1 탭이 밀림 (하나만 남음)
    await connectOnN2(n2, 'u-late')
    assert.equal(await waitUntil(() => late.disconnects === 1), true)
    // u-early는 n1이 다시 맞추기 때 다시 알리지 않음 (이미 밀림)
    assert.equal(toN2.some((m) => m.uuid === 'u-early'), false)
    assert.equal((await connOf(n2, 'u-early')).node, 'n2')
})

// [겹침: 한 서버만 Redis 끊김 + 그사이 다른 서버로 새 로그인 + 살아남]
test('n1만 Redis 끊긴 사이 같은 계정이 n2로 새로 붙음 → n1이 살아난 뒤 옛 n1 탭이 밀려남 (둘 다 남지 않음)', async (t) => {
    const old = makeSocket('n1-old', 'sess-a')
    const { b1, n2 } = await setup(t, [old])
    emitter.onlineUsers.set('u-split', old.id)
    await replace.announceConnection(old, 'u-split')
    assert.equal(old.data.connSeq, 1)

    // n1만 끊김 → n2의 conn.replaced 알림을 n1이 못 받음
    b1.setDown(true)
    const newSeq = await connectOnN2(n2, 'u-split', { sessionId: 'sess-other' })
    assert.equal(newSeq, 2)
    assert.equal(old.disconnects, 0)

    b1.setDown(false)
    // 살아난 뒤: n1 다시 맞추기(0.5초 묶음) → conn이 이미 더 큰 순번(n2)이면 내 옛 탭을 밀어내야 함
    const kicked = await waitUntil(() => old.disconnects === 1, 3000)
    assert.equal(kicked, true,
        `n1 살아난 뒤 3초가 지나도 옛 n1 탭(순번 1)이 안 밀림, conn=${JSON.stringify(await connOf(n2, 'u-split'))} (한 계정이 두 서버에 남음)`)
    assert.equal(old.emitted[0]?.payload?.code, 'REPLACED_BY_OTHER_LOGIN')
})
