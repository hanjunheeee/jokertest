// 조각 2 시험 도우미, 이 프로세스 cluster를 n1(메모리 받침)로 켜고 다른 Node n2를 같이 띄움
// tests/cluster/slice2-*.test.js가 씀 (Redis 없이 npm test에서 돎)
const cluster = require('../../../cluster')
const { createMemoryHub, quietLog } = require('../../../cluster/testing/memoryCluster')

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

// 조건이 될 때까지 기다림 (고정 시간 대신)
async function waitFor(check, timeoutMs = 3000) {
    const started = Date.now()
    while (!(await check())) {
        if (Date.now() - started > timeoutMs) throw new Error('waitFor 시간 초과')
        await tick(5)
    }
}

// n1 = 이 프로세스 cluster, n2 = 따로 도는 Node → { hub, n2, backend(n1 받침) }
async function startPair(t, { env = {}, n2Env = {}, n2Stats } = {}) {
    const hub = createMemoryHub()
    t.after(() => hub.close())
    const backend = hub.backend()
    await cluster.init({ backend, env: { SERVER_ID: 'n1', ...env }, log: quietLog })
    t.after(() => cluster.close())
    const n2 = await hub.startNode('n2', { env: n2Env, statsProvider: n2Stats })
    await cluster.nodes.refresh()
    await n2.nodes.refresh()
    return { hub, n2, backend }
}

// 소켓 흉내: force_disconnect·끊김 기록
function fakeSocket(uuid, sessionId = 's-1') {
    return {
        id: `sock-${uuid}`,
        data: { user: { uuid, sessionId } },
        emitted: [],
        disconnected: false,
        emit(event, payload) { this.emitted.push({ event, payload }) },
        disconnect() { this.disconnected = true },
    }
}

module.exports = { cluster, tick, waitFor, startPair, fakeSocket, quietLog }
