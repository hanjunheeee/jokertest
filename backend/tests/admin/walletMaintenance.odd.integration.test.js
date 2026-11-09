'use strict';

// 관리자 지갑·점검 동시 시험 파일, 관리자 둘이 같은 회원에게 동시에 골드 주기·뺏기 + 둘이 점검을 동시에 켜고 끔
// 진짜 시험 DB + 관리자 라우터, 끝마다 지갑 = 장부 합·기록 수 = 장부 수·이 Node 점검 상태 = DB
// npm run test:with-db -- tests/admin/walletMaintenance.odd.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp, createTestAdmin, createAgent, randomIp } = require('./helpers/adminTestApp');
const money = require('./helpers/money');
const maintenance = require('../../services/ops/maintenance');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => {
    maintenance.__setStateForTests({ enabled: false });
    require('../../services/ops/reloadSync').__testables.stopSafetyNet();
    if (dbHandle) await dbHandle.close();
});

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');

// 같은 시험 서버에 관리자 둘 로그인 → [a, b]
const twoAgents = async (t) => {
    const first = await adminTestApp({ t });
    const account = await createTestAdmin();
    const other = createAgent({ url: first.url, ip: randomIp() });
    const res = await other.login(account);
    assert.equal(res.status, 200, `둘째 관리자 로그인 ${res.status}`);
    return [first.agent, other];
};

const adjust = (agent, uuid, body) => agent.post(`/admin-api/members/${uuid}/wallet/adjust`, {
    requestId: crypto.randomUUID(), reason: '보상 문의 처리', ...body,
});

// ── 지갑 ──

test('[동시] 관리자 둘이 지갑 없는 새 회원에게 다른 요청 번호로 같은 순간 골드 주기 → 둘 다 200, 지갑 = 합, 장부·기록 둘', async (t) => {
    if (skipWithoutDb(t)) return;
    const [a, b] = await twoAgents(t);
    const member = await money.createMember('wo');
    const [ra, rb] = await Promise.all([
        adjust(a, member.uuid, { currency: 'GOLD', amount: 300 }),
        adjust(b, member.uuid, { currency: 'GOLD', amount: 500 }),
    ]);
    assert.deepEqual([ra.status, rb.status], [200, 200], JSON.stringify([ra.body, rb.body]));
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 800);
    assert.equal(entries.length, 2);
    assert.equal((await money.auditLogsOf('WALLET_ADJUST', member.uuid)).length, 2);
});

test('[동시+따닥] 관리자 둘이 각자 따닥(같은 요청 번호 두 번씩) 네 요청이 같은 순간 → 장부·기록 둘, 지갑 = 합', async (t) => {
    if (skipWithoutDb(t)) return;
    const [a, b] = await twoAgents(t);
    const member = await money.createMember('wd');
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    const results = await Promise.all([
        adjust(a, member.uuid, { requestId: idA, currency: 'DIAMOND', amount: 40 }),
        adjust(a, member.uuid, { requestId: idA, currency: 'DIAMOND', amount: 40 }),
        adjust(b, member.uuid, { requestId: idB, currency: 'DIAMOND', amount: 60 }),
        adjust(b, member.uuid, { requestId: idB, currency: 'DIAMOND', amount: 60 }),
    ]);
    assert.deepEqual(results.map((res) => res.status), [200, 200, 200, 200], JSON.stringify(results.map((res) => res.body)));
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.diamond, 100);
    assert.equal(entries.length, 2);
    assert.equal((await money.auditLogsOf('WALLET_ADJUST', member.uuid)).length, 2);
});

test('[동시] 잔액 0인 회원에게 관리자 A 100 주기 · 관리자 B 100 뺏기가 같은 순간 → 음수 없음, 뺏기는 200 또는 409 BALANCE_SHORT, 기록 수 = 장부 수', async (t) => {
    if (skipWithoutDb(t)) return;
    const [a, b] = await twoAgents(t);
    const member = await money.createMember('wr');
    const [grant, revoke] = await Promise.all([
        adjust(a, member.uuid, { currency: 'GOLD', amount: 100 }),
        adjust(b, member.uuid, { currency: 'GOLD', amount: -100 }),
    ]);
    assert.equal(grant.status, 200, JSON.stringify(grant.body));
    assert.ok(revoke.status === 200 || (revoke.status === 409 && revoke.body.code === 'BALANCE_SHORT'), JSON.stringify(revoke.body));
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.ok(wallet.gold >= 0);
    assert.equal(wallet.gold, revoke.status === 200 ? 0 : 100);
    const adminEntries = entries.filter((entry) => entry.reason.startsWith('ADMIN_'));
    assert.equal((await money.auditLogsOf('WALLET_ADJUST', member.uuid)).length, adminEntries.length);
});

test('[동시·끝값] 관리자 둘이 새 회원에게 다른 요청 번호로 다섯 번씩(열 요청) 같은 순간 주기 → 전부 200, 장부·기록 열, 지갑 = 합', async (t) => {
    if (skipWithoutDb(t)) return;
    const [a, b] = await twoAgents(t);
    const member = await money.createMember('w10');
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => adjust(index % 2 ? b : a, member.uuid, { currency: 'GOLD', amount: 10 + index })));
    const statuses = results.map((res) => res.status);
    assert.deepEqual(statuses, Array(10).fill(200), JSON.stringify(results.filter((res) => res.status !== 200).map((res) => res.body)));
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 145);
    assert.equal(entries.length, 10);
    assert.equal((await money.auditLogsOf('WALLET_ADJUST', member.uuid)).length, 10);
});

// ── 점검 ──

test('[동시] 관리자 둘이 점검 켜기·끄기를 같은 순간 (8번 되풀이) → 매번 이 Node 점검 상태 = DB 줄, 기록 둘씩', async (t) => {
    if (skipWithoutDb(t)) return;
    const [a, b] = await twoAgents(t);
    const put = (agent, body) => agent.request('PUT', '/admin-api/maintenance', { body });
    const later = () => new Date(Date.now() + 30 * 60_000).toISOString();
    const before = await db().AdminAuditLog.count({ where: { action: 'MAINTENANCE_UPDATE' } });
    const mismatches = [];
    for (let round = 0; round < 8; round += 1) {
        const [on, off] = await Promise.all([
            put(a, { enabled: true, message: `점검 ${round}`, startsAt: later() }),
            put(b, { enabled: false }),
        ]);
        assert.deepEqual([on.status, off.status], [200, 200], JSON.stringify([on.body, off.body]));
        const row = await db().MaintenanceState.findOne({ where: { id: 1 }, raw: true });
        const memory = maintenance.getMaintenanceState();
        if (Boolean(row.is_enabled) !== memory.enabled) mismatches.push({ round, db: Boolean(row.is_enabled), memory: memory.enabled });
    }
    assert.deepEqual(mismatches, [], '두 저장이 겹친 뒤 이 Node가 DB와 다른 점검 상태를 들고 있음');
    const after = await db().AdminAuditLog.count({ where: { action: 'MAINTENANCE_UPDATE' } });
    assert.equal(after - before, 16);
    // 끝: 꺼 둠 (타이머·안내 정리)
    assert.equal((await put(a, { enabled: false })).status, 200);
    assert.equal(maintenance.getMaintenanceState().enabled, false);
});
