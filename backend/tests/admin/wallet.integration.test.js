'use strict';

// 골드·다이아 주고 뺏기 통합 시험 (AD-200~204), 진짜 시험 DB + 관리자 라우터, 끝마다 지갑 = 장부 합
// npm run test:with-db -- tests/admin/wallet.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');
const money = require('./helpers/money');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const adjust = (agent, uuid, body) => agent.post(`/admin-api/members/${uuid}/wallet/adjust`, {
    requestId: crypto.randomUUID(), reason: '보상 문의 처리', ...body,
});

test('AD-200: 골드 주기 → 장부 ADMIN_GRANT(admin:<요청 번호>) + 기록, 지갑 = 장부 합, 지갑 보기에 보임', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const member = await money.createMember('wg');
    const requestId = crypto.randomUUID();

    const res = await adjust(agent, member.uuid, { requestId, currency: 'GOLD', amount: 500 });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.balance, 500);
    assert.equal(res.body.ledgerEntry.reason, 'ADMIN_GRANT');
    assert.equal(res.body.ledgerEntry.amount, 500);
    const { entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].reference_event_id, `admin:${requestId}`);
    const logs = await money.auditLogsOf('WALLET_ADJUST', member.uuid);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].admin_id, admin.id);
    assert.equal(logs[0].reason, '보상 문의 처리');
    assert.equal(logs[0].request_id, requestId);

    // 다이아 뺏기도 장부 ADMIN_REVOKE(음수)
    await money.fund(member.uuid, 'DIAMOND', 30);
    const revoke = await adjust(agent, member.uuid, { currency: 'DIAMOND', amount: -20 });
    assert.equal(revoke.status, 200);
    assert.equal(revoke.body.ledgerEntry.reason, 'ADMIN_REVOKE');
    assert.equal(revoke.body.balance, 10);
    await money.assertWalletMatchesLedger(member.uuid);

    const view = await agent.get(`/admin-api/members/${member.uuid}/wallet`);
    assert.equal(view.status, 200);
    assert.equal(view.body.gold, 500);
    assert.equal(view.body.diamond, 10);
    assert.deepEqual(view.body.ledger.map((entry) => entry.reason), ['ADMIN_REVOKE', 'QA_TEST_GRANT', 'ADMIN_GRANT']);
});

test('AD-201: 뺏을 게 모자람 → 409 BALANCE_SHORT { balance, needed }, 지갑·장부·기록 그대로', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('ws');
    await money.fund(member.uuid, 'GOLD', 100);

    const res = await adjust(agent, member.uuid, { currency: 'GOLD', amount: -101 });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'BALANCE_SHORT');
    assert.equal(res.body.balance, 100);
    assert.equal(res.body.needed, 101);
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 100);
    assert.equal(entries.length, 1);
    assert.equal((await money.auditLogsOf('WALLET_ADJUST', member.uuid)).length, 0);

    // 지갑 줄이 아예 없는 회원도 마이너스 안 됨
    const empty = await money.createMember('we');
    const none = await adjust(agent, empty.uuid, { currency: 'DIAMOND', amount: -1 });
    assert.equal(none.status, 409);
    assert.equal(none.body.code, 'BALANCE_SHORT');
    assert.equal(none.body.balance, 0);
    await money.assertWalletMatchesLedger(empty.uuid);
});

test('AD-202: 같은 요청 번호 두 번(차례로·동시에) → 장부 한 줄·기록 한 줄, 같은 번호 다른 금액 → 409 REFERENCE_EVENT_CONFLICT', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('wi');
    const requestId = crypto.randomUUID();

    const first = await adjust(agent, member.uuid, { requestId, currency: 'GOLD', amount: 300 });
    const again = await adjust(agent, member.uuid, { requestId, currency: 'GOLD', amount: 300 });
    assert.equal(first.status, 200);
    assert.equal(again.status, 200);
    assert.equal(again.body.ledgerEntry.id, first.body.ledgerEntry.id);
    assert.equal(again.body.balance, 300);

    const other = await adjust(agent, member.uuid, { requestId, currency: 'GOLD', amount: 999 });
    assert.equal(other.status, 409);
    assert.equal(other.body.code, 'REFERENCE_EVENT_CONFLICT');

    // 동시에 같은 번호 둘 → 둘 다 같은 결과, 장부 한 줄
    const sameTime = crypto.randomUUID();
    const both = await Promise.all([1, 2].map(() => adjust(agent, member.uuid, { requestId: sameTime, currency: 'GOLD', amount: 7 })));
    assert.deepEqual(both.map((res) => res.status), [200, 200]);
    assert.equal(both[0].body.ledgerEntry.id, both[1].body.ledgerEntry.id);

    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 307);
    assert.equal(entries.length, 2);
    assert.equal((await money.auditLogsOf('WALLET_ADJUST', member.uuid)).length, 2);
});

test('AD-203: 10억 넘김 → 400 BALANCE_LIMIT_EXCEEDED, 그대로', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('wl');
    await money.fund(member.uuid, 'GOLD', 999_999_999);

    const res = await adjust(agent, member.uuid, { currency: 'GOLD', amount: 2 });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'BALANCE_LIMIT_EXCEEDED');
    const { wallet } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 999_999_999);
});

test('AD-204: 사유 빔 → 400 REASON_REQUIRED, 0원·소수·모르는 칸·없는 회원 → 400/404, 아무것도 안 바뀜', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('wv');

    const noReason = await adjust(agent, member.uuid, { currency: 'GOLD', amount: 10, reason: '   ' });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.code, 'REASON_REQUIRED');
    for (const [body, field] of [
        [{ amount: 0 }, 'amount'], [{ amount: 1.5 }, 'amount'], [{ amount: '10' }, 'amount'],
        [{ currency: 'RUBY' }, 'currency'], [{ requestId: 'abc' }, 'requestId'], [{ extra: 1 }, 'extra'],
    ]) {
        const res = await adjust(agent, member.uuid, { currency: 'GOLD', amount: 10, ...body });
        assert.equal(res.status, 400, field);
        assert.equal(res.body.code, 'INVALID_INPUT');
        assert.equal(res.body.field, field);
    }
    const missing = await adjust(agent, crypto.randomUUID(), { currency: 'GOLD', amount: 10 });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'MEMBER_NOT_FOUND');
    assert.equal((await money.ledgerOf(member.uuid)).length, 0);
    assert.equal((await money.auditLogsOf('WALLET_ADJUST', member.uuid)).length, 0);
});
