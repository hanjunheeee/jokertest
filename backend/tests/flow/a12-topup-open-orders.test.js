'use strict';

// 열린 충전 주문 찾기 시험: 진짜 경로(GET /economy/topup/orders?state=open)로 확인 중·지급 대기만·최신순·5개·내 것만·응답 칸·부작용 없음을 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-209~219 (돌리기: node --env-file=.env.test --test tests/flow/a12-topup-open-orders.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const tw = require('./a12-topup-world');

const { setupTopup, PRODUCT } = tw;

// 만든 시각을 정해 주문 줄 넣기 (분 단위로 늦을수록 최신)
const BASE_MS = Date.UTC(2026, 10, 16, 0, 0, 0);
const seed = (c, { status, minute, userId = c.me, paymentKey }) => tw.seedOrder(c.db, {
    userId, status, product: PRODUCT, created_at: new Date(BASE_MS + minute * 60_000), payment_key: paymentKey ?? null,
});

const idsOf = (res) => res.body.orders.map((order) => order.orderId);

test('A12-B-209 내 주문 8가지 상태 한 줄씩 → CONFIRMING·PENDING_GRANT 둘만', async (t) => {
    const c = await setupTopup(t);
    const states = ['CREATED', 'CONFIRMING', 'PENDING_GRANT', 'GRANTED', 'FAILED', 'CANCELED', 'EXPIRED', 'REFUNDED'];
    const rows = [];
    for (const [index, status] of states.entries()) rows.push(await seed(c, { status, minute: index }));
    const res = await c.openOrders();
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.orders.map((order) => order.status).sort(), ['CONFIRMING', 'PENDING_GRANT']);
});

test('A12-B-210 열린 주문 3개 → 만든 시각 늦은 것부터', async (t) => {
    const c = await setupTopup(t);
    const early = await seed(c, { status: 'CONFIRMING', minute: 1 });
    const late = await seed(c, { status: 'PENDING_GRANT', minute: 9 });
    const middle = await seed(c, { status: 'CONFIRMING', minute: 5 });
    const res = await c.openOrders();
    assert.deepEqual(idsOf(res), [late.order_id, middle.order_id, early.order_id]);
});

// ── A12-B-211~213: 최대 5개 경계 ──

const LIMITS = [
    ['A12-B-211', 4, 4],
    ['A12-B-212', 5, 5],
    ['A12-B-213', 6, 5],
];
for (const [id, made, shown] of LIMITS) {
    test(`${id} 열린 주문 ${made}개 → ${shown}개${made > shown ? ' (최신 5개)' : ''}`, async (t) => {
        const c = await setupTopup(t);
        const rows = [];
        for (let minute = 0; minute < made; minute += 1) rows.push(await seed(c, { status: 'PENDING_GRANT', minute }));
        const res = await c.openOrders();
        assert.equal(res.body.orders.length, shown);
        const newest = rows.slice().reverse().slice(0, shown).map((row) => row.order_id);
        assert.deepEqual(idsOf(res), newest);
    });
}

test('A12-B-214 남 계정 열린 주문 3 + 내 것 0 → 빈 배열', async (t) => {
    const c = await setupTopup(t);
    const other = tw.uid('a12-open-other');
    for (let minute = 0; minute < 3; minute += 1) await seed(c, { status: 'CONFIRMING', minute, userId: other });
    const res = await c.openOrders();
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.orders, []);
});

test('A12-B-215 응답 줄마다 orderId·status·amount·orderName·createdAt만 (결제 키·클라이언트 키·잠금 표 없음)', async (t) => {
    const c = await setupTopup(t);
    await tw.seedOrder(c.db, {
        userId: c.me, status: 'CONFIRMING', product: PRODUCT, payment_key: 'pk_a12_open_secretish',
        lease_token: 'lease-a12-open', lease_expires_at: new Date(Date.now() - 1_000),
    });
    const res = await c.openOrders();
    assert.equal(res.body.orders.length, 1);
    assert.deepEqual(Object.keys(res.body.orders[0]).sort(), ['amount', 'createdAt', 'orderId', 'orderName', 'status']);
    assert.ok(!res.text.includes('pk_a12_open_secretish'), '결제 키가 실림');
    assert.ok(!res.text.includes('lease-a12-open'), '잠금 표가 실림');
    assert.ok(!res.text.includes(tw.FAKE_CLIENT_KEY), '클라이언트 키가 실림');
});

test('A12-B-216 찾기는 아무것도 안 바꿈: 부르기 전후 주문 상태·장부·지갑 같음, 결제사 0번', async (t) => {
    const c = await setupTopup(t);
    // 결제는 됐는데 지급 대기·확인 중으로 멈춘 주문 (조회였다면 마무리됐을 것)
    const pending = await seed(c, { status: 'PENDING_GRANT', minute: 1, paymentKey: tw.newPaymentKey() });
    const confirmingKey = tw.newPaymentKey();
    const confirming = await seed(c, { status: 'CONFIRMING', minute: 2, paymentKey: confirmingKey });
    c.toss.registerPayment(confirmingKey, { orderId: confirming.order_id, amount: confirming.pay_amount });
    const before = tw.topupState(c.db);
    const res = await c.openOrders();
    assert.equal(res.body.orders.length, 2);
    assert.equal(tw.topupState(c.db), before, '주문·장부가 바뀜');
    assert.equal(c.db.order(pending.order_id).status, 'PENDING_GRANT');
    assert.equal(c.diamond(), 0, '지갑이 바뀜');
    assert.equal(c.db.wallet(c.me), undefined, '지갑 행이 생김');
    assert.equal(c.providerCalls(), 0);
});

// ── A12-B-217~218: state 값 ──

const STATES = [
    ['A12-B-217', 'state 없음', ''],
    ['A12-B-218', 'state=all', '?state=all'],
];
for (const [id, label, query] of STATES) {
    test(`${id} ${label} → 400 INVALID_TOPUP_ORDER_REQUEST`, async (t) => {
        const c = await setupTopup(t);
        await seed(c, { status: 'CONFIRMING', minute: 1 });
        const res = await c.openOrders(query);
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_TOPUP_ORDER_REQUEST');
    });
}

test('A12-B-219 열린 주문 응답 Cache-Control: no-store', async (t) => {
    const c = await setupTopup(t);
    const res = await c.openOrders();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});
