// Node 여러 개 시험 도우미 파일, 메모리 Redis 위에 이 프로세스 = n1, 따로 도는 n2를 켬
// tests/socket/multinode/*.test.js가 씀 (진짜 Redis 없이 npm test에서 돎)
const cluster = require('../../../cluster')
const { createMemoryHub, quietLog } = require('../../../cluster/testing/memoryCluster')

// 시간 줄인 환경값 (하트비트 30ms, 죽음 판정 150ms, OFFLINE 미루기 30ms)
const FAST_ENV = { CLUSTER_HEARTBEAT_MS: '30', NODE_DEAD_AFTER_MS: '150', PRESENCE_OFFLINE_DELAY_MS: '30' }

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

// 조건이 될 때까지 기다림 (고정 시간 대신)
async function waitFor(check, timeoutMs = 3000) {
    const started = Date.now()
    while (!(await check())) {
        if (Date.now() - started > timeoutMs) throw new Error('waitFor 시간 초과')
        await tick(5)
    }
}

// n1(이 프로세스 cluster) + n2 켜기 → { hub, n2 }, 시험 끝에 둘 다 끔
async function startTwoNodes(t, { env = {}, bootEpoch } = {}) {
    const hub = createMemoryHub()
    await cluster.init({ backend: hub.backend(), env: { SERVER_ID: 'n1', ...FAST_ENV, ...env }, bootEpoch, log: quietLog })
    const n2 = await hub.startNode('n2', { env: FAST_ENV })
    t.after(async () => {
        await cluster.close()
        await hub.close()
    })
    await n2.nodes.refresh()
    await cluster.nodes.refresh()
    return { hub, n2 }
}

// 디렉터리 값 바로 읽기 (n2 쪽에서 봄 = 다른 Node가 보는 값)
const readKey = async (n2, key) => (await n2.directory.read(key)).value

module.exports = { cluster, FAST_ENV, tick, waitFor, startTwoNodes, readKey, quietLog }
