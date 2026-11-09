// 빈칸 채우기 시험: POST /internal/nodes/:id/drain 경로 끝까지 (열쇠 → 처리기 → Node에 시킴 → 하트비트)
// 메모리 받침 Node 2개(n1 = 이 프로세스, n2 = 따로), 진짜 Redis·DB 안 씀 — 빈칸찾기 중 5
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'

const test = require('node:test')
const assert = require('node:assert/strict')

const { cluster, waitFor, startPair } = require('../cluster/helpers/slice2')
const { GOOD_KEY, startInternalApp, callInternal } = require('../audit-2026-11-09/opsFakes')
const { pickLeastBusyNode } = require('../../socket/connection/nodeRouting')
require('../../services/ops/clusterOps')

// n2에도 이 Node와 같은 drain 처리기 붙임 (한 프로세스 시험이라 손으로)
async function startDrainPair(t) {
    const pair = await startPair(t, { n2Env: { CLUSTER_HEARTBEAT_MS: '20' } })
    pair.n2.rpc.register('ops.setDraining', (args) => ({ draining: pair.n2.nodes.setDraining(args?.draining !== false) }))
    t.after(() => cluster.nodes.setDraining(false))
    return pair
}

// n1이 본 n2 draining 값 (하트비트 다시 읽고)
async function n2DrainingSeenByN1() {
    await cluster.nodes.refresh()
    return cluster.nodes.list().find((n) => n.id === 'n2')?.draining === true
}

test('drain 경로: 열쇠 맞으면 200 { ok, node, draining:true } → n2가 draining, n1 목록에도 실림', async (t) => {
    const { n2 } = await startDrainPair(t)
    const url = await startInternalApp(t)
    const res = await callInternal(url, 'POST', '/nodes/n2/drain', { key: GOOD_KEY })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: true, node: 'n2', draining: true })
    assert.equal(n2.nodes.isDraining(), true)
    await waitFor(n2DrainingSeenByN1)
    assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('drain 경로: 본문 { draining:false }면 → 풀림 (켠 뒤 끄기)', async (t) => {
    const { n2 } = await startDrainPair(t)
    const url = await startInternalApp(t)
    await callInternal(url, 'POST', '/nodes/n2/drain', { key: GOOD_KEY })
    const res = await callInternal(url, 'POST', '/nodes/n2/drain', { key: GOOD_KEY, body: { draining: false } })
    assert.deepEqual(res.body, { ok: true, node: 'n2', draining: false })
    assert.equal(n2.nodes.isDraining(), false)
})

test('drain 경로: 없는 Node id → 404 NODE_UNAVAILABLE, 이상한 이름 → 400 INVALID_NODE', async (t) => {
    await startDrainPair(t)
    const url = await startInternalApp(t)
    const missing = await callInternal(url, 'POST', '/nodes/n9/drain', { key: GOOD_KEY })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.code, 'NODE_UNAVAILABLE')
    const bad = await callInternal(url, 'POST', `/nodes/${'x'.repeat(65)}/drain`, { key: GOOD_KEY })
    assert.equal(bad.status, 400)
    assert.equal(bad.body.code, 'INVALID_NODE')
})

test('drain 경로: 열쇠 없으면 401이고 n2는 그대로 (아무나 못 끔)', async (t) => {
    const { n2 } = await startDrainPair(t)
    const url = await startInternalApp(t)
    const res = await callInternal(url, 'POST', '/nodes/n2/drain')
    assert.equal(res.status, 401)
    assert.equal(n2.nodes.isDraining(), false)
})

test('drain 경로: n1을 drain하면 새 접속은 n2로, n2까지 drain하면 → 보낼 곳 없음(n2로 안 감)', async (t) => {
    await startDrainPair(t)
    const url = await startInternalApp(t)
    await callInternal(url, 'POST', '/nodes/n1/drain', { key: GOOD_KEY })
    assert.equal(cluster.nodes.isDraining(), true)
    await cluster.nodes.refresh()
    assert.equal(pickLeastBusyNode(), 'n2')
    await callInternal(url, 'POST', '/nodes/n2/drain', { key: GOOD_KEY })
    await waitFor(n2DrainingSeenByN1)
    assert.equal(pickLeastBusyNode(), null)
})
