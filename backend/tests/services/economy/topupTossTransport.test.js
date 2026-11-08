'use strict';

// 충전 서비스 + 진짜 토스 어댑터 시험 (토스 HTTP만 가짜 전송으로 바꿔 끼움)
// 승인 성공·금액 불일치·중복 승인·키 없음·토스 오류 응답·토스가 다른 금액을 돌려줄 때를 봄
const test = require('node:test');
const assert = require('node:assert/strict');

const topup = require('../../../services/economy/topup');
const { createTossAdapter, CONFIRM_URL, basicAuthHeader, idempotencyKeyOf } = require('../../../utils/adapters/toss');
const { createFakeTopupDb } = require('../../helpers/fakeTopupDb');

// 지어낸 시험용 키 (모양만 맞춤, 진짜 키 아님)
const KEYS = Object.freeze({ TOSS_TEST_CLIENT_KEY: 'test_ck_synthetic0000client0001', TOSS_TEST_SECRET_KEY: 'test_sk_synthetic0000secret0001' });
const USER = 'user-toss-a';
const PRODUCT = Object.freeze({
    product_id: 'test-diamond-100', kind: 'DIAMOND_TOPUP', display_name: '다이아 100개', pay_currency: 'KRW', pay_amount: 11000,
    grant_currency: 'DIAMOND', grant_amount: 100, bonus_amount: 5, status: 'ON_SALE', sort_order: 0, version: 1,
});

// 토스 서버 흉내: 결제창에서 만든 결제(READY/IN_PROGRESS)만 알고, 승인하면 DONE
const createFakeToss = () => {
    const payments = new Map();
    const calls = [];
    let override = null;
    const json = (status, body) => ({ status, bodyText: JSON.stringify(body) });
    const transport = async (url, request) => {
        calls.push({ url, ...request });
        if (override) return override(url, request);
        if (request.headers.Authorization !== basicAuthHeader(KEYS.TOSS_TEST_SECRET_KEY)) {
            return json(401, { code: 'UNAUTHORIZED_KEY', message: '인증되지 않은 키' });
        }
        if (url === CONFIRM_URL) {
            const body = JSON.parse(request.body);
            const payment = payments.get(body.paymentKey);
            if (!payment) return json(404, { code: 'NOT_FOUND_PAYMENT', message: '없는 결제' });
            if (payment.status === 'DONE') return json(400, { code: 'ALREADY_PROCESSED_PAYMENT', message: '이미 처리됨' });
            if (payment.orderId !== body.orderId || payment.amount !== body.amount) {
                return json(400, { code: 'INVALID_REQUEST', message: '요청 값이 결제와 다름' });
            }
            payment.status = 'DONE';
            return json(200, { status: 'DONE', paymentKey: body.paymentKey, orderId: payment.orderId, totalAmount: payment.amount, currency: 'KRW' });
        }
        const paymentKey = decodeURIComponent(url.split('/').pop());
        const payment = payments.get(paymentKey);
        if (!payment) return json(404, { code: 'NOT_FOUND_PAYMENT', message: '없는 결제' });
        return json(200, { status: payment.status, paymentKey, orderId: payment.orderId, totalAmount: payment.amount, currency: 'KRW' });
    };
    return {
        transport,
        calls,
        confirmCalls: () => calls.filter((call) => call.url === CONFIRM_URL),
        // 결제창에서 결제가 만들어진 것처럼 등록
        authorize: (paymentKey, { orderId, amount }) => payments.set(paymentKey, { orderId, amount, status: 'IN_PROGRESS' }),
        respondWith: (fn) => { override = fn; },
    };
};

const setUp = ({ env = { ...KEYS } } = {}) => {
    const db = createFakeTopupDb();
    db.addProduct(PRODUCT);
    const toss = createFakeToss();
    const adapter = createTossAdapter({ getEnv: () => env, transport: toss.transport, timeoutMs: 1000 });
    return { db, toss, env, deps: { db, adapter } };
};

let keySeq = 0;
// 주문 만들기 + 결제창 결제 하나
const orderAndAuthorize = async (ctx) => {
    const created = await topup.createTopupOrder({ userId: USER, productId: PRODUCT.product_id, version: 1 }, ctx.deps);
    keySeq += 1;
    const paymentKey = `tviva2026110900000${keySeq}`;
    ctx.toss.authorize(paymentKey, { orderId: created.orderId, amount: created.amount });
    return { ...created, paymentKey };
};

const confirm = (ctx, order, overrides = {}) => topup.confirmTopupOrder({
    userId: USER, orderId: order.orderId, paymentKey: order.paymentKey, amount: order.amount, ...overrides,
}, ctx.deps);

test('승인 성공: 주문 금액은 서버 상품값(11000), 토스 승인 1번에 Basic 인증·주문별 멱등 키, 다이아 105 지급', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    assert.equal(order.amount, 11000);
    assert.equal(order.clientKey, KEYS.TOSS_TEST_CLIENT_KEY);

    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 105 });
    const [call] = ctx.toss.confirmCalls();
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.Authorization, basicAuthHeader(KEYS.TOSS_TEST_SECRET_KEY));
    assert.equal(call.headers['Idempotency-Key'], idempotencyKeyOf(order.orderId));
    assert.deepEqual(JSON.parse(call.body), { paymentKey: order.paymentKey, orderId: order.orderId, amount: 11000 });
    assert.equal(ctx.db.diamond(USER), 105);
    assert.equal(ctx.db.order(order.orderId).status, 'GRANTED');
});

test('같은 주문 두 번 승인: 끝난 뒤 다시 보내도·동시에 보내도 토스 승인은 1번, 장부 1줄', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    const results = await Promise.allSettled([confirm(ctx, order), confirm(ctx, order)]);
    // 하나는 지급, 다른 하나는 지급 또는 진행 중(503)
    assert.ok(results.some((r) => r.status === 'fulfilled' && r.value.status === 'GRANTED'));
    for (const r of results) {
        if (r.status === 'rejected') assert.equal(r.reason.code, 'PAYMENT_PROCESSING');
    }
    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 105 });
    assert.equal(ctx.toss.confirmCalls().length, 1);
    assert.equal(ctx.db.ledger().filter((row) => row.reference_event_id === `topup:${order.orderId}`).length, 1);
    assert.equal(ctx.db.diamond(USER), 105);
});

test('금액 불일치: 화면이 보낸 금액이 주문과 다르면 토스를 부르지 않고 AMOUNT_MISMATCH, 지급 없음', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    await assert.rejects(confirm(ctx, order, { amount: 100 }), { code: 'AMOUNT_MISMATCH', status: 400 });
    assert.equal(ctx.toss.calls.length, 0);
    assert.equal(ctx.db.order(order.orderId).status, 'CREATED');
    assert.equal(ctx.db.diamond(USER), 0);
});

test('토스가 다른 금액의 결제를 돌려주면 지급하지 않고 FAILED(PAYMENT_MISMATCH)', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith((url, request) => {
        const body = JSON.parse(request.body);
        return { status: 200, bodyText: JSON.stringify({ status: 'DONE', paymentKey: body.paymentKey, orderId: body.orderId, totalAmount: 10, currency: 'KRW' }) };
    });
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED', status: 402 });
    assert.equal(ctx.db.order(order.orderId).status, 'FAILED');
    assert.equal(ctx.db.ledger().length, 0);
});

test('키 없음: 클라이언트·비밀 키가 없거나 운영(live) 키면 주문을 저장하지 않고 CONFIG_MISSING(503)', async () => {
    for (const env of [{}, { TOSS_TEST_CLIENT_KEY: KEYS.TOSS_TEST_CLIENT_KEY }, { TOSS_TEST_CLIENT_KEY: 'live_ck_aaaaaaaaaaaa', TOSS_TEST_SECRET_KEY: 'live_sk_bbbbbbbbbbbb' }]) {
        const ctx = setUp({ env });
        const attempt = topup.createTopupOrder({ userId: USER, productId: PRODUCT.product_id, version: 1 }, ctx.deps);
        if (env.TOSS_TEST_CLIENT_KEY === KEYS.TOSS_TEST_CLIENT_KEY) {
            // 클라이언트 키만 있으면 주문은 되지만 승인 때 막힘
            const order = await attempt;
            await assert.rejects(confirm(ctx, { ...order, paymentKey: 'tviva_nosecret_01' }), { code: 'CONFIG_MISSING', status: 503 });
            assert.equal(ctx.db.order(order.orderId).status, 'CREATED');
        } else {
            await assert.rejects(attempt, { code: 'CONFIG_MISSING', status: 503 });
            assert.equal(ctx.db.orders().length, 0);
        }
        assert.equal(ctx.toss.calls.length, 0);
    }
});

test('토스 거절 응답(4xx + 코드)은 PAYMENT_FAILED(402)·주문 FAILED, 다시 확인해도 토스를 또 부르지 않음', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => ({ status: 400, bodyText: JSON.stringify({ code: 'REJECT_CARD_COMPANY', message: '카드사 거절' }) }));
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED', status: 402 });
    const row = ctx.db.order(order.orderId);
    assert.equal(row.status, 'FAILED');
    assert.equal(row.failure_code, 'REJECT_CARD_COMPANY');
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED' });
    assert.equal(ctx.toss.confirmCalls().length, 1);
    assert.equal(ctx.db.diamond(USER), 0);
});

test('토스 서버 오류(500)·키 인증 실패(401)는 실패로 단정하지 않음: 확인 중으로 남고, 고쳐지면 같은 주문이 이어서 지급', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => ({ status: 500, bodyText: '{"code":"FAILED_INTERNAL_SYSTEM_PROCESSING"}' }));
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING', status: 503 });
    assert.equal(ctx.db.order(order.orderId).status, 'CONFIRMING');
    ctx.toss.respondWith(() => ({ status: 401, bodyText: '{"code":"UNAUTHORIZED_KEY"}' }));
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING' });
    assert.equal(ctx.db.diamond(USER), 0);

    // 토스가 돌아오면 같은 주문 다시 확인으로 지급 (조회 → 아직 진행 중이면 승인 다시)
    ctx.toss.respondWith(null);
    const result = await confirm(ctx, order);
    assert.deepEqual(result, { status: 'GRANTED', balanceDiamond: 105 });
    assert.equal(ctx.db.ledger().length, 1);
});
