'use strict';

// 다이아 충전 결제 확인 시험: 진짜 경로(POST /economy/topup/orders/:id/confirm)에 요청 보내고 답·주문 상태·장부·다이아·결제사에 물은 횟수를 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-146~165·176~207 (돌리기: node --env-file=.env.test --test tests/flow/a12-topup-confirm.test.js)
// 결제사는 가짜(fakeTossAdapter), 주문 DB도 가짜(fakeTopupDb) — "장부" = DIAMOND_TOPUP 줄, "결제사 N번" = 가짜 결제사가 받은 요청 수
const test = require('node:test');
const assert = require('node:assert/strict');

const tw = require('./a12-topup-world');

const { setupTopup, GRANT_TOTAL, PRODUCT, newPaymentKey } = tw;

// 시나리오마다 처음 확인 결과 (상태 숫자·코드·주문 상태·실패 코드)
const FIRST_EXPECT = {
    approve: { status: 200, order: 'GRANTED' },
    'lost-response': { order: 'CONFIRMING' },
    unreached: { order: 'CONFIRMING' },
    reject: { status: 402, code: 'PAYMENT_FAILED', order: 'FAILED' },
    cancel: { status: 402, code: 'PAYMENT_FAILED', order: 'CANCELED' },
    expire: { status: 402, code: 'PAYMENT_FAILED', order: 'EXPIRED' },
    waiting: { status: 503, code: 'PAYMENT_PROCESSING', order: 'CONFIRMING' },
    'tamper-amount': { status: 402, code: 'PAYMENT_FAILED', order: 'FAILED', failure: 'PAYMENT_MISMATCH' },
    'tamper-order': { status: 402, code: 'PAYMENT_FAILED', order: 'FAILED', failure: 'PAYMENT_MISMATCH' },
    'tamper-key': { status: 402, code: 'PAYMENT_FAILED', order: 'FAILED', failure: 'PAYMENT_MISMATCH' },
};

// 지급됨: 장부 1줄(지급+덤, 번호 topup:<주문 id>) · 다이아 한 번만
const assertGrantedOnce = (c, orderId) => {
    assert.equal(c.db.order(orderId).status, 'GRANTED');
    const rows = c.db.ledger().filter((row) => row.reason === 'DIAMOND_TOPUP');
    assert.equal(rows.length, 1, `장부 ${rows.length}줄`);
    assert.equal(rows[0].amount, GRANT_TOTAL);
    assert.equal(rows[0].reference_event_id, `topup:${orderId}`);
    assert.equal(c.diamond(), GRANT_TOTAL);
};

// 지급 0: 장부 0줄 · 다이아 0
const assertNotGranted = (c) => {
    assert.equal(c.ledgerCount(), 0, '장부 줄이 생김');
    assert.equal(c.diamond(), 0, '다이아가 들어옴');
};

// ── A12-B-146~155: 처음 확인 ──

const FIRST_IDS = ['A12-B-146', 'A12-B-147', 'A12-B-148', 'A12-B-149', 'A12-B-150', 'A12-B-151', 'A12-B-152', 'A12-B-153', 'A12-B-154', 'A12-B-155'];
tw.SCENARIOS.forEach((scenario, index) => {
    const e = FIRST_EXPECT[scenario];
    const label = e.status ? `${e.status}${e.code ? ` ${e.code}` : ''}` : '지급 0';
    test(`${FIRST_IDS[index]} 처음 확인, 결제사 ${scenario} → ${label}, 주문 ${e.order}${e.failure ? `(${e.failure})` : ''}`, async (t) => {
        const c = await setupTopup(t);
        const { orderId, amount, paymentKey } = await c.paidOrder(scenario);
        const res = await c.confirm(orderId, { paymentKey, amount });
        if (e.status) assert.equal(res.status, e.status, JSON.stringify(res.body));
        if (e.code) assert.equal(res.body.code, e.code);
        assert.equal(c.db.order(orderId).status, e.order);
        if (e.failure) assert.equal(c.db.order(orderId).failure_code, e.failure);
        if (scenario === 'approve') {
            assert.equal(res.body.ok, true);
            assert.equal(res.body.status, 'GRANTED');
            assert.equal(res.body.balanceDiamond, GRANT_TOTAL);
            assertGrantedOnce(c, orderId);
        } else {
            assertNotGranted(c);
        }
    });
});

// ── A12-B-156~165: 같은 확인을 한 번 더 ──

const AGAIN = [
    ['A12-B-156', 'approve', 'granted'],
    ['A12-B-157', 'lost-response', 'granted'],
    ['A12-B-158', 'unreached', 'granted'],
    ['A12-B-159', 'reject', 402],
    ['A12-B-160', 'cancel', 402],
    ['A12-B-161', 'expire', 402],
    ['A12-B-162', 'tamper-amount', 402],
    ['A12-B-163', 'tamper-order', 402],
    ['A12-B-164', 'tamper-key', 402],
    ['A12-B-165', 'waiting', 503],
];
for (const [id, scenario, expected] of AGAIN) {
    const label = expected === 'granted' ? '200 GRANTED, 장부 1줄·다이아 한 번만' : `${expected}, 장부 0`;
    test(`${id} 같은 확인 한 번 더, 결제사 ${scenario} → ${label}`, async (t) => {
        const c = await setupTopup(t);
        const { orderId, amount, paymentKey } = await c.paidOrder(scenario);
        await c.confirm(orderId, { paymentKey, amount });
        const res = await c.confirm(orderId, { paymentKey, amount });
        if (expected === 'granted') {
            assert.equal(res.status, 200, JSON.stringify(res.body));
            assert.equal(res.body.status, 'GRANTED');
            assert.equal(res.body.balanceDiamond, GRANT_TOTAL);
            assertGrantedOnce(c, orderId);
            return;
        }
        assert.equal(res.status, expected, JSON.stringify(res.body));
        assert.equal(res.body.code, expected === 402 ? 'PAYMENT_FAILED' : 'PAYMENT_PROCESSING');
        assertNotGranted(c);
    });
}

// ── A12-B-176~184: 주문 상태마다 확인 요청 ──

test('A12-B-176 CREATED 주문 + 첫 결제 키 → 결제사에 1번 물음, 지급됨', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    const res = await c.confirm(orderId, { paymentKey, amount });
    assert.equal(res.status, 200);
    assert.equal(c.providerCalls(), 1);
    assertGrantedOnce(c, orderId);
});

// 주문 줄을 그 상태로 바로 넣고 같은 결제 키를 결제사에 등록
const seededOrder = async (c, status, extra = {}) => {
    const paymentKey = newPaymentKey();
    const order = await tw.seedOrder(c.db, { userId: c.me, status, payment_key: paymentKey, product: PRODUCT, ...extra });
    c.toss.registerPayment(paymentKey, { orderId: order.order_id, amount: order.pay_amount, scenario: 'approve' });
    return { orderId: order.order_id, amount: order.pay_amount, paymentKey };
};

test('A12-B-177 CONFIRMING + 잠금 살아 있음 → 503, 결제사 0번', async (t) => {
    const c = await setupTopup(t);
    const o = await seededOrder(c, 'CONFIRMING', { lease_token: 'other-request', lease_expires_at: new Date(Date.now() + 20_000) });
    const res = await c.confirm(o.orderId, { paymentKey: o.paymentKey, amount: o.amount });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'PAYMENT_PROCESSING');
    assert.equal(c.providerCalls(), 0);
    assert.equal(c.db.order(o.orderId).status, 'CONFIRMING');
    assertNotGranted(c);
});

test('A12-B-178 CONFIRMING + 잠금 지남 → 다시 물어 마무리 (지급됨)', async (t) => {
    const c = await setupTopup(t);
    const o = await seededOrder(c, 'CONFIRMING', { lease_token: 'old-request', lease_expires_at: new Date(Date.now() - 1_000) });
    const res = await c.confirm(o.orderId, { paymentKey: o.paymentKey, amount: o.amount });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(c.providerCalls() >= 1, '결제사에 안 물음');
    assertGrantedOnce(c, o.orderId);
});

test('A12-B-179 PENDING_GRANT → 결제사 안 묻고 지급', async (t) => {
    const c = await setupTopup(t);
    const o = await seededOrder(c, 'PENDING_GRANT');
    const res = await c.confirm(o.orderId, { paymentKey: o.paymentKey, amount: o.amount });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'GRANTED');
    assert.equal(c.providerCalls(), 0);
    assertGrantedOnce(c, o.orderId);
});

test('A12-B-180 GRANTED → 200 잔액, 결제사 0번 (다시 안 줌)', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    await c.confirm(orderId, { paymentKey, amount });
    const callsBefore = c.providerCalls();
    const res = await c.confirm(orderId, { paymentKey, amount });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'GRANTED');
    assert.equal(res.body.balanceDiamond, GRANT_TOTAL);
    assert.equal(c.providerCalls(), callsBefore, '결제사에 다시 물음');
    assertGrantedOnce(c, orderId);
});

const TERMINAL = [
    ['A12-B-181', 'FAILED'],
    ['A12-B-182', 'CANCELED'],
    ['A12-B-183', 'EXPIRED'],
];
for (const [id, status] of TERMINAL) {
    test(`${id} ${status} 주문 확인 → 402, 결제사 0번`, async (t) => {
        const c = await setupTopup(t);
        const o = await seededOrder(c, status);
        const res = await c.confirm(o.orderId, { paymentKey: o.paymentKey, amount: o.amount });
        assert.equal(res.status, 402);
        assert.equal(res.body.code, 'PAYMENT_FAILED');
        assert.equal(c.providerCalls(), 0);
        assert.equal(c.db.order(o.orderId).status, status);
        assertNotGranted(c);
    });
}

test('A12-B-184 REFUNDED 주문 확인 → 409 ORDER_REFUNDED, 결제사 0번·지급 0', async (t) => {
    const c = await setupTopup(t);
    const o = await seededOrder(c, 'REFUNDED');
    const res = await c.confirm(o.orderId, { paymentKey: o.paymentKey, amount: o.amount });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'ORDER_REFUNDED');
    assert.equal(c.providerCalls(), 0);
    assert.equal(c.db.order(o.orderId).status, 'REFUNDED');
    assertNotGranted(c);
});

// ── A12-B-185~186: 잠금 표 30초 경계 (가짜 시계) ──

// 다른 요청이 T0에 잡은 주문 (잠금 30초 = T0+30초까지)
const leasedAt = async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const c = await setupTopup(t);
    const t0 = Date.now();
    const o = await seededOrder(c, 'CONFIRMING', { lease_token: 'other-request', lease_expires_at: new Date(t0 + 30_000) });
    return { c, o, t0 };
};

test('A12-B-185 다른 요청이 잡은 지 29초 → 503, 결제사 0번', async (t) => {
    const { c, o, t0 } = await leasedAt(t);
    t.mock.timers.setTime(t0 + 29_000);
    const res = await c.confirm(o.orderId, { paymentKey: o.paymentKey, amount: o.amount });
    assert.equal(res.status, 503);
    assert.equal(c.providerCalls(), 0);
    assertNotGranted(c);
});

test('A12-B-186 다른 요청이 잡은 지 30초 지남 → 이 요청이 잡고 물음 (지급됨)', async (t) => {
    const { c, o, t0 } = await leasedAt(t);
    t.mock.timers.setTime(t0 + 30_000);
    const res = await c.confirm(o.orderId, { paymentKey: o.paymentKey, amount: o.amount });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(c.providerCalls() >= 1, '결제사에 안 물음');
    assertGrantedOnce(c, o.orderId);
});

// ── A12-B-187~189: 금액 경계 (금액 바꿔치기) ──

const AMOUNTS = [
    ['A12-B-187', '주문−1', -1, false],
    ['A12-B-188', '주문', 0, true],
    ['A12-B-189', '주문+1', 1, false],
];
for (const [id, label, delta, ok] of AMOUNTS) {
    test(`${id} 확인 amount = ${label} → ${ok ? '됨' : '400 AMOUNT_MISMATCH, 결제사 0번·주문 상태 그대로'}`, async (t) => {
        const c = await setupTopup(t);
        const { orderId, amount, paymentKey } = await c.paidOrder('approve');
        const res = await c.confirm(orderId, { paymentKey, amount: amount + delta });
        if (ok) {
            assert.equal(res.status, 200);
            assertGrantedOnce(c, orderId);
            return;
        }
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'AMOUNT_MISMATCH');
        assert.equal(c.providerCalls(), 0);
        assert.equal(c.db.order(orderId).status, 'CREATED');
        assert.equal(c.db.order(orderId).payment_key, null);
        assertNotGranted(c);
    });
}

// ── A12-B-190~192: 주문 찾기 거절 ──

test('A12-B-190 없는 주문 확인 → 404 ORDER_NOT_FOUND', async (t) => {
    const c = await setupTopup(t);
    const res = await c.confirm('a12-no-such-order', { paymentKey: newPaymentKey(), amount: 1100 });
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'ORDER_NOT_FOUND');
    assert.equal(c.providerCalls(), 0);
});

test('A12-B-191 주문 id 모양 틀림(../x) → 404', async (t) => {
    const c = await setupTopup(t);
    const res = await c.confirm(encodeURIComponent('../x'), { paymentKey: newPaymentKey(), amount: 1100 });
    assert.equal(res.status, 404);
    assert.equal(c.providerCalls(), 0);
});

test('A12-B-192 남의 주문 확인 → 403 NOT_OWNER', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    const stranger = tw.login(tw.uid('a12-topup-other'));
    const res = await c.confirm(orderId, { paymentKey, amount }, stranger);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'NOT_OWNER');
    assert.equal(c.providerCalls(), 0);
    assert.equal(c.db.order(orderId).status, 'CREATED');
    assertNotGranted(c);
});

// ── A12-B-193~194: 결제 키 겹침 ──

test('A12-B-193 이미 다른 결제 키가 붙은 주문에 새 키 → 409 PAYMENT_KEY_MISMATCH, 지급 0', async (t) => {
    const c = await setupTopup(t);
    // 첫 키로 확인 → 응답 놓쳐 확인 중으로 남음 (키 붙음)
    const { orderId, amount, paymentKey } = await c.paidOrder('lost-response');
    await c.confirm(orderId, { paymentKey, amount });
    const otherKey = c.pay(orderId, amount, 'approve');
    const res = await c.confirm(orderId, { paymentKey: otherKey, amount });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'PAYMENT_KEY_MISMATCH');
    assert.equal(c.db.order(orderId).payment_key, paymentKey);
    assertNotGranted(c);
});

test('A12-B-194 다른 주문이 쓰는 결제 키 → 409 PAYMENT_KEY_CONFLICT, 지급 0', async (t) => {
    const c = await setupTopup(t);
    const a = await c.paidOrder('lost-response');
    await c.confirm(a.orderId, { paymentKey: a.paymentKey, amount: a.amount });
    const b = await c.createOrder();
    const res = await c.confirm(b.orderId, { paymentKey: a.paymentKey, amount: b.amount });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'PAYMENT_KEY_CONFLICT');
    assert.equal(c.db.order(b.orderId).payment_key, null);
    assertNotGranted(c);
});

// ── A12-B-195~199: 확인 몸 모양 ──

const BAD_BODIES = [
    ['A12-B-195', '결제 키 모양 틀림', (p) => ({ paymentKey: 'bad key!', amount: p.amount })],
    ['A12-B-196', 'amount 0', (p) => ({ paymentKey: p.paymentKey, amount: 0 })],
    ['A12-B-197', 'amount −1', (p) => ({ paymentKey: p.paymentKey, amount: -1 })],
    ['A12-B-198', 'amount "1100"(글자)', (p) => ({ paymentKey: p.paymentKey, amount: '1100' })],
    ['A12-B-199', 'amount 1.5', (p) => ({ paymentKey: p.paymentKey, amount: 1.5 })],
];
for (const [id, label, bodyOf] of BAD_BODIES) {
    test(`${id} 확인 몸 ${label} → 400 INVALID_TOPUP_CONFIRM_REQUEST`, async (t) => {
        const c = await setupTopup(t);
        const paid = await c.paidOrder('approve');
        const res = await c.confirm(paid.orderId, bodyOf(paid));
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_TOPUP_CONFIRM_REQUEST');
        assert.equal(c.providerCalls(), 0);
        assert.equal(c.db.order(paid.orderId).status, 'CREATED');
        assertNotGranted(c);
    });
}

test('A12-B-200 확인 몸에 모르는 칸 grantAmount → 400 UNKNOWN_TOPUP_CONFIRM_FIELD', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    const res = await c.confirm(orderId, { paymentKey, amount, grantAmount: 999_999 });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'UNKNOWN_TOPUP_CONFIRM_FIELD');
    assert.equal(c.providerCalls(), 0);
    assertNotGranted(c);
});

test('A12-B-201 확인할 때 결제 설정 없음 → 503 CONFIG_MISSING, 주문 CREATED 그대로·지급 0', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    c.toss.setConfigMissing(true);
    const res = await c.confirm(orderId, { paymentKey, amount });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'CONFIG_MISSING');
    assert.equal(c.db.order(orderId).status, 'CREATED');
    assertNotGranted(c);
});

// ── A12-B-202~203: 동시에 ──

test('A12-B-202 같은 주문 확인 둘이 동시에 → 둘째 503, 결제사 1번, 풀면 장부 1줄', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    const held = c.toss.hold(paymentKey);
    const first = c.confirm(orderId, { paymentKey, amount });
    await held.entered;
    const second = await c.confirm(orderId, { paymentKey, amount });
    assert.equal(second.status, 503);
    assert.equal(c.providerCalls(), 1);
    held.release();
    const done = await first;
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assertGrantedOnce(c, orderId);
});

test('A12-B-203 같은 결제 키로 두 주문 동시에 → 하나만 키가 붙고 다른 하나 409, 장부 1줄', async (t) => {
    const c = await setupTopup(t);
    const a = await c.paidOrder('approve');
    const b = await c.createOrder();
    const held = c.toss.hold(a.paymentKey);
    const first = c.confirm(a.orderId, { paymentKey: a.paymentKey, amount: a.amount });
    await held.entered;
    const second = await c.confirm(b.orderId, { paymentKey: a.paymentKey, amount: b.amount });
    held.release();
    const done = await first;
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(second.status, 409);
    const keyed = c.db.orders().filter((row) => row.payment_key === a.paymentKey);
    assert.equal(keyed.length, 1, '결제 키가 두 주문에 붙음');
    assertGrantedOnce(c, a.orderId);
});

// ── A12-B-204~205: 지급 쓰기 실패 뒤 이어서 ──

// 장부 쓰기를 첫 번만 실패하게
const failLedgerOnce = (c) => {
    let failed = false;
    c.db.hooks.ledgerCreate = () => {
        if (!failed) {
            failed = true;
            throw new Error('ledger write failed');
        }
    };
};

test('A12-B-204 장부 쓰기 1번 오류 → 응답 PENDING_GRANT·장부 0 → 같은 확인 다시 → GRANTED·장부 1', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    failLedgerOnce(c);
    const first = await c.confirm(orderId, { paymentKey, amount });
    assert.equal(first.body.status, 'PENDING_GRANT', JSON.stringify(first.body));
    assert.equal(c.db.order(orderId).status, 'PENDING_GRANT');
    assertNotGranted(c);
    const again = await c.confirm(orderId, { paymentKey, amount });
    assert.equal(again.status, 200);
    assert.equal(again.body.status, 'GRANTED');
    assertGrantedOnce(c, orderId);
});

test('A12-B-205 장부 쓰기 1번 오류 → 확인 대신 주문 조회로 → GRANTED·장부 1', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    failLedgerOnce(c);
    const first = await c.confirm(orderId, { paymentKey, amount });
    assert.equal(first.body.status, 'PENDING_GRANT', JSON.stringify(first.body));
    assertNotGranted(c);
    const looked = await c.lookup(orderId);
    assert.equal(looked.status, 200);
    assert.equal(looked.body.status, 'GRANTED');
    assertGrantedOnce(c, orderId);
});

// ── A12-B-206~207: 주문 뒤 상품이 바뀌어도 주문 값 ──

test('A12-B-206 주문 뒤 상품 결제값·지급량 바뀜 → 확인 amount는 주문 값이어야 맞음, 지급은 주문 지급량', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    c.db.updateProduct(PRODUCT.product_id, { pay_amount: 2200, grant_amount: 300, bonus_amount: 0, version: 4 });
    const wrong = await c.confirm(orderId, { paymentKey, amount: 2200 });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, 'AMOUNT_MISMATCH');
    const res = await c.confirm(orderId, { paymentKey, amount });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assertGrantedOnce(c, orderId);
});

test('A12-B-207 주문 뒤 상품 판매 중지 → 그래도 주문 값대로 지급', async (t) => {
    const c = await setupTopup(t);
    const { orderId, amount, paymentKey } = await c.paidOrder('approve');
    c.db.updateProduct(PRODUCT.product_id, { status: 'STOPPED' });
    const res = await c.confirm(orderId, { paymentKey, amount });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assertGrantedOnce(c, orderId);
});
