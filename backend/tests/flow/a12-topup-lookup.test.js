'use strict';

// 다이아 충전 주문 조회 시험: 확인 뒤 진짜 경로(GET /economy/topup/orders/:id)로 조회해 상태·장부·결제사에 물은 횟수를 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-166~175·208 (돌리기: node --env-file=.env.test --test tests/flow/a12-topup-lookup.test.js)
// 결제사·주문 DB는 가짜 — 응답 놓친 결제는 조회가 결제사에 다시 물어 마무리하는지 봄
const test = require('node:test');
const assert = require('node:assert/strict');

const tw = require('./a12-topup-world');

const { setupTopup, GRANT_TOTAL } = tw;

// ── A12-B-166~175: 확인 뒤 주문 조회가 마무리 ──

const AFTER = [
    ['A12-B-166', 'approve', 'GRANTED'],
    ['A12-B-167', 'lost-response', 'GRANTED'],
    ['A12-B-168', 'unreached', 'GRANTED'],
    ['A12-B-169', 'reject', 'FAILED'],
    ['A12-B-170', 'cancel', 'CANCELED'],
    ['A12-B-171', 'expire', 'EXPIRED'],
    ['A12-B-172', 'waiting', 'CONFIRMING'],
    ['A12-B-173', 'tamper-amount', 'FAILED'],
    ['A12-B-174', 'tamper-order', 'FAILED'],
    ['A12-B-175', 'tamper-key', 'FAILED'],
];
for (const [id, scenario, status] of AFTER) {
    const granted = status === 'GRANTED';
    test(`${id} 확인 뒤 주문 조회, 결제사 ${scenario} → ${status}${granted ? '·장부 1' : '·장부 0'}`, async (t) => {
        const c = await setupTopup(t);
        const { orderId, amount, paymentKey } = await c.paidOrder(scenario);
        await c.confirm(orderId, { paymentKey, amount });
        const res = await c.lookup(orderId);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.ok, true);
        assert.equal(res.body.orderId, orderId);
        assert.equal(res.body.status, status);
        assert.equal(c.db.order(orderId).status, status);
        if (granted) {
            assert.equal(res.body.balanceDiamond, GRANT_TOTAL);
            assert.equal(c.ledgerCount(), 1);
            assert.equal(c.diamond(), GRANT_TOTAL);
        } else {
            assert.equal(c.ledgerCount(), 0, '장부 줄이 생김');
            assert.equal(c.diamond(), 0);
        }
    });
}

// ── A12-B-208: 결제창에서 돌아오기만 해선 지급 안 함 ──

test('A12-B-208 주문 만든 뒤 확인 없이 조회만 → CREATED, 결제사 0번, 지급 0', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount } = await c.createOrder();
    // 결제창에서 결제는 됨 (결제사엔 있음), 화면은 확인을 안 보냄
    c.pay(orderId, amount, 'approve');
    const res = await c.lookup(orderId);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'CREATED');
    assert.equal(c.providerCalls(), 0);
    assert.equal(c.ledgerCount(), 0);
    assert.equal(c.diamond(), 0);
});
