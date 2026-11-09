'use strict';

// 결제·환불 통합 시험 (AD-180~185), 진짜 시험 DB + 관리자 라우터, 끝마다 지갑 = 장부 합
// npm run test:with-db -- tests/admin/payments.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

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

const db = () => require('../../models');
const refund = (agent, orderId, reason = '결제 회사 화면에서 취소함') => agent.post(`/admin-api/payments/orders/${orderId}/refund`, { reason });
const statusOf = async (orderId) => (await db().EconomyTopupOrder.findOne({ where: { order_id: orderId }, raw: true })).status;

test('AD-180: 주문 찾기 — 회원·상태·기간으로 거름, 50줄 넘게 안 줌, 커서로 이어 봄', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('pl');
    const other = await money.createMember('po');
    const granted = await money.createGrantedOrder(member.uuid);
    const failed = await money.createGrantedOrder(member.uuid, { status: 'FAILED' });
    await money.createGrantedOrder(other.uuid);

    const mine = await agent.get(`/admin-api/payments/orders?userUuid=${member.uuid}`);
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.items.map((item) => item.orderId).sort(), [granted.order_id, failed.order_id].sort());
    assert.equal(mine.body.items[0].user.nickname, member.nickname);
    assert.equal(mine.body.nextBefore, null);

    const onlyGranted = await agent.get(`/admin-api/payments/orders?userUuid=${member.uuid}&status=GRANTED`);
    assert.deepEqual(onlyGranted.body.items.map((item) => item.orderId), [granted.order_id]);
    assert.equal(onlyGranted.body.items[0].payAmount, 1100);
    assert.equal(onlyGranted.body.items[0].grantAmount, 100);
    assert.equal(onlyGranted.body.items[0].bonusAmount, 10);

    const future = new Date(Date.now() + 3_600_000).toISOString();
    const none = await agent.get(`/admin-api/payments/orders?userUuid=${member.uuid}&from=${encodeURIComponent(future)}`);
    assert.deepEqual(none.body.items, []);

    // 한 장에 1줄 → 다음 장에 나머지 1줄, 겹침 없음
    const page1 = await agent.get(`/admin-api/payments/orders?userUuid=${member.uuid}&limit=1`);
    assert.equal(page1.body.items.length, 1);
    assert.ok(page1.body.nextBefore);
    const page2 = await agent.get(`/admin-api/payments/orders?userUuid=${member.uuid}&limit=1&before=${page1.body.nextBefore}`);
    assert.equal(page2.body.items.length, 1);
    assert.notEqual(page2.body.items[0].orderId, page1.body.items[0].orderId);

    for (const query of ['limit=51', 'status=DONE', 'userUuid=abc', 'from=어제']) {
        const bad = await agent.get(`/admin-api/payments/orders?${encodeURI(query)}`);
        assert.equal(bad.status, 400, query);
        assert.equal(bad.body.code, 'INVALID_INPUT');
    }
    const detail = await agent.get(`/admin-api/payments/orders/${granted.order_id}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.ledger.map((entry) => entry.reason), ['DIAMOND_TOPUP']);
    const missing = await agent.get('/admin-api/payments/orders/ord-none-123');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'ORDER_NOT_FOUND');
});

test('AD-181: 환불 → REFUNDED + 장부 TOPUP_REFUND(refund:<주문>) 한 줄 + 기록, 지갑 = 장부 합', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const member = await money.createMember('pr');
    const order = await money.createGrantedOrder(member.uuid, { grantAmount: 100, bonusAmount: 10 });
    await money.fund(member.uuid, 'DIAMOND', 5);

    const res = await refund(agent, order.order_id);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.order.status, 'REFUNDED');
    assert.equal(res.body.ledgerEntry.amount, -110);
    assert.equal(res.body.ledgerEntry.balanceAfter, 5);
    assert.equal(await statusOf(order.order_id), 'REFUNDED');
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.diamond, 5);
    const refunds = entries.filter((entry) => entry.reason === 'TOPUP_REFUND');
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].reference_event_id, `refund:${order.order_id}`);
    const logs = await money.auditLogsOf('REFUND', order.order_id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].admin_id, admin.id);
    assert.equal(logs[0].reason, '결제 회사 화면에서 취소함');

    const detail = await agent.get(`/admin-api/payments/orders/${order.order_id}`);
    assert.deepEqual(detail.body.ledger.map((entry) => entry.reason), ['DIAMOND_TOPUP', 'TOPUP_REFUND']);
});

test('AD-182: 환불한 주문을 플레이어가 다시 확인 → 409 ORDER_REFUNDED, 결제 회사 안 부르고 다시 지급 없음', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('pa');
    const order = await money.createGrantedOrder(member.uuid);
    assert.equal((await refund(agent, order.order_id)).status, 200);
    const before = await money.ledgerOf(member.uuid);

    const { confirmTopupOrder } = require('../../services/economy');
    let adapterCalled = false;
    const adapter = { assertConfigured: () => { adapterCalled = true; }, confirmPayment: async () => { adapterCalled = true; } };
    await assert.rejects(
        confirmTopupOrder({ userId: member.uuid, orderId: order.order_id, paymentKey: order.payment_key, amount: order.pay_amount }, { adapter }),
        (error) => error.code === 'ORDER_REFUNDED' && error.status === 409,
    );
    assert.equal(adapterCalled, false);
    assert.equal((await money.ledgerOf(member.uuid)).length, before.length);
    await money.assertWalletMatchesLedger(member.uuid);

    // 관리자가 다시 환불해도 막힘
    const twice = await refund(agent, order.order_id);
    assert.equal(twice.status, 409);
    assert.equal(twice.body.code, 'ORDER_NOT_REFUNDABLE');
    assert.equal(twice.body.status, 'REFUNDED');
});

test('AD-183: 이미 쓴 다이아라 모자람 → 409 REFUND_BALANCE_SHORT { balance, needed }, 주문·지갑·장부·기록 그대로', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('ps');
    const order = await money.createGrantedOrder(member.uuid, { grantAmount: 100, bonusAmount: 10 });
    await require('../../services/economy/ledger').applyLedgerTransaction(db(), {
        userId: member.uuid, reason: 'GOLD_PURCHASE', currency: 'DIAMOND', amount: -50, referenceEventId: 'test:spent',
    });
    const before = await money.ledgerOf(member.uuid);

    const res = await refund(agent, order.order_id);

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'REFUND_BALANCE_SHORT');
    assert.equal(res.body.balance, 60);
    assert.equal(res.body.needed, 110);
    assert.equal(await statusOf(order.order_id), 'GRANTED');
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.diamond, 60);
    assert.equal(entries.length, before.length);
    assert.equal((await money.auditLogsOf('REFUND', order.order_id)).length, 0);
});

test('AD-184: 같은 주문 동시 환불 둘 → 하나만 200, 하나는 409, 장부 환불 줄 하나', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('pc');
    const order = await money.createGrantedOrder(member.uuid);

    const results = await Promise.all([refund(agent, order.order_id), refund(agent, order.order_id)]);

    assert.deepEqual(results.map((res) => res.status).sort(), [200, 409]);
    assert.equal(results.find((res) => res.status === 409).body.code, 'ORDER_NOT_REFUNDABLE');
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.diamond, 0);
    assert.equal(entries.filter((entry) => entry.reason === 'TOPUP_REFUND').length, 1);
    assert.equal((await money.auditLogsOf('REFUND', order.order_id)).length, 1);
});

test('AD-185: 지급 끝 아님(CONFIRMING·FAILED·없음) → 409 ORDER_NOT_REFUNDABLE·404, 사유 빔 → 400 REASON_REQUIRED', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('pn');
    for (const status of ['CONFIRMING', 'FAILED', 'PENDING_GRANT']) {
        const order = await money.createGrantedOrder(member.uuid, { status });
        const res = await refund(agent, order.order_id);
        assert.equal(res.status, 409, status);
        assert.equal(res.body.code, 'ORDER_NOT_REFUNDABLE');
        assert.equal(res.body.status, status);
        assert.equal(await statusOf(order.order_id), status);
    }
    const missing = await refund(agent, 'ord-not-here');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'ORDER_NOT_FOUND');

    const granted = await money.createGrantedOrder(member.uuid);
    const noReason = await refund(agent, granted.order_id, '  ');
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.code, 'REASON_REQUIRED');
    assert.equal(await statusOf(granted.order_id), 'GRANTED');
    await money.assertWalletMatchesLedger(member.uuid);
});
