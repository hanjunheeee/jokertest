'use strict';

// 전 Node 다시 읽기 시험 (AD-005·006), reloadEverywhere 결과 모양 (Node마다 ok·code, partial)
// 메모리 받침 Node 2개 (진짜 cluster 버스·RPC 코드, Redis 없이 npm test에서 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const { cluster, startPair } = require('../cluster/helpers/slice2');
const maintenance = require('../../services/ops/maintenance');
const bannedWords = require('../../services/ops/bannedWords');
const reloadSync = require('../../services/ops/reloadSync');
const { createError } = require('../../utils/appError');

// 다시 읽기를 가짜로 (DB 대신), 부른 수 셈
const stubReloads = (t, { failBannedWords = false } = {}) => {
    const calls = { maintenance: 0, bannedWords: 0 };
    t.mock.method(maintenance, 'reloadMaintenance', async () => { calls.maintenance += 1; return {}; });
    t.mock.method(bannedWords, 'reloadBannedWords', async () => {
        calls.bannedWords += 1;
        if (failBannedWords) throw new Error('DB 끊김');
        return { count: 0 };
    });
    t.after(() => reloadSync.__testables.stopSafetyNet());
    return calls;
};

test('AD-005: 단일 모드 → 나만 ok, partial false, 내 다시 읽기 한 번', async (t) => {
    const calls = stubReloads(t);
    const result = await reloadSync.reloadEverywhere('maintenance');
    assert.deepEqual(result, { nodes: [{ node: cluster.serverId(), ok: true }], partial: false });
    assert.equal(calls.maintenance, 1);
    assert.equal(calls.bannedWords, 0);
});

test('AD-005: 내 다시 읽기가 실패해도 던지지 않고 ok:false·RELOAD_FAILED', async (t) => {
    t.mock.method(console, 'warn', () => {});
    stubReloads(t, { failBannedWords: true });
    const result = await reloadSync.reloadEverywhere('bannedWords');
    assert.deepEqual(result, { nodes: [{ node: cluster.serverId(), ok: false, code: 'RELOAD_FAILED' }], partial: true });
});

test('AD-005: 모르는 what도 던지지 않음 → ok:false·UNKNOWN_RELOAD', async (t) => {
    stubReloads(t);
    const result = await reloadSync.reloadEverywhere('nothing');
    assert.equal(result.partial, true);
    assert.deepEqual(result.nodes, [{ node: cluster.serverId(), ok: false, code: 'UNKNOWN_RELOAD' }]);
});

test('AD-006: Node 둘 다 받음 → 둘 다 ok, partial false', async (t) => {
    const calls = stubReloads(t);
    const { n2 } = await startPair(t);
    let n2Got = null;
    n2.rpc.register('ops.reloadNow', (args) => { n2Got = args; return { ok: true }; });
    const result = await reloadSync.reloadEverywhere('maintenance');
    assert.equal(result.partial, false);
    assert.deepEqual(result.nodes.map((n) => [n.node, n.ok]).sort(), [['n1', true], ['n2', true]]);
    assert.deepEqual(n2Got, { what: 'maintenance' });
    assert.equal(calls.maintenance, 1);
});

test('AD-006: n2 처리기가 던짐 → n2 ok:false·code, partial true, n1은 ok', async (t) => {
    stubReloads(t);
    const { n2 } = await startPair(t);
    n2.rpc.register('ops.reloadNow', () => { throw createError('x', 500, 'BOOM'); });
    const result = await reloadSync.reloadEverywhere('bannedWords');
    assert.equal(result.partial, true);
    const byNode = Object.fromEntries(result.nodes.map((n) => [n.node, n]));
    assert.equal(byNode.n1.ok, true);
    assert.equal(byNode.n2.ok, false);
    assert.equal(typeof byNode.n2.code, 'string');
});

test('AD-006: n2 응답 없음 → 시간 초과 code, partial true (던지지 않음)', async (t) => {
    stubReloads(t);
    const { n2 } = await startPair(t, { env: { CLUSTER_RPC_TIMEOUT_MS: '80' } });
    n2.rpc.register('ops.reloadNow', () => new Promise(() => {}));
    const result = await reloadSync.reloadEverywhere('maintenance');
    assert.equal(result.partial, true);
    const n2Result = result.nodes.find((n) => n.node === 'n2');
    assert.deepEqual(n2Result, { node: 'n2', ok: false, code: 'RPC_TIMEOUT' });
    assert.equal(result.nodes.find((n) => n.node === 'n1').ok, true);
});

test('AD-006: n2가 다시 읽기 실패를 돌려줌 → 그 code 그대로', async (t) => {
    stubReloads(t);
    const { n2 } = await startPair(t);
    n2.rpc.register('ops.reloadNow', () => ({ ok: false, code: 'RELOAD_FAILED' }));
    const result = await reloadSync.reloadEverywhere('maintenance');
    assert.deepEqual(result.nodes.find((n) => n.node === 'n2'), { node: 'n2', ok: false, code: 'RELOAD_FAILED' });
    assert.equal(result.partial, true);
});
