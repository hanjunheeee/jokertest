'use strict';

// 결제 시험: 토스 어댑터(키 모양·응답 해석·시간 초과) · 다이아 충전 서비스(주문·승인·지급 대기·열린 주문) · 충전 처리기 HTTP
// DB 안 씀 (가짜 충전 DB), 토스 HTTP는 가짜 전송, 실제 토스 연결 확인은 .env에 시험 키(test_)가 있을 때만 2개
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-pay-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const topup = require('../../services/economy/topup');
const tossAdapter = require('../../utils/adapters/toss');
const topupController = require('../../controllers/economy/topup');
const { globalErrorHandler, notFoundHandler } = require('../../middlewares/errorHandler.middleware');
const { createFakeTopupDb } = require('../helpers/fakeTopupDb');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');

const { createTossAdapter, CONFIRM_URL, basicAuthHeader, readConfig, readClientKey } = tossAdapter;

// 지어낸 시험용 키 (모양만 맞춤)
const KEYS = Object.freeze({ TOSS_TEST_CLIENT_KEY: 'test_ck_audit00000client0002', TOSS_TEST_SECRET_KEY: 'test_sk_audit00000secret0002' });
const USER = 'user-pay-a';
const OTHER = 'user-pay-b';
const PRODUCT = Object.freeze({
    product_id: 'audit-diamond-50', kind: 'DIAMOND_TOPUP', display_name: '다이아 50개', pay_currency: 'KRW', pay_amount: 5500,
    grant_currency: 'DIAMOND', grant_amount: 50, bonus_amount: 3, status: 'ON_SALE', sort_order: 0, version: 2,
});
const GOLD_PRODUCT = Object.freeze({
    product_id: 'audit-gold-1', kind: 'GOLD_PURCHASE', display_name: '골드', pay_currency: 'DIAMOND', pay_amount: 10,
    grant_currency: 'GOLD', grant_amount: 1000, bonus_amount: 0, status: 'ON_SALE', sort_order: 1, version: 1,
});

const json = (status, body) => ({ status, bodyText: JSON.stringify(body) });

// 토스 서버 흉내: 결제창에서 만든 결제만 알고, 승인하면 DONE (덮어쓰기로 응답 바꿈)
const createFakeToss = () => {
    const payments = new Map();
    const calls = [];
    let override = null;
    const transport = async (url, request) => {
        calls.push({ url, ...request });
        if (override) return override(url, request);
        if (request.headers.Authorization !== basicAuthHeader(KEYS.TOSS_TEST_SECRET_KEY)) return json(401, { code: 'UNAUTHORIZED_KEY' });
        if (url === CONFIRM_URL) {
            const body = JSON.parse(request.body);
            const payment = payments.get(body.paymentKey);
            if (!payment) return json(404, { code: 'NOT_FOUND_PAYMENT' });
            if (payment.status === 'DONE') return json(400, { code: 'ALREADY_PROCESSED_PAYMENT' });
            if (payment.orderId !== body.orderId || payment.amount !== body.amount) return json(400, { code: 'INVALID_REQUEST' });
            payment.status = 'DONE';
            return json(200, { status: 'DONE', paymentKey: body.paymentKey, orderId: payment.orderId, totalAmount: payment.amount, currency: 'KRW' });
        }
        const paymentKey = decodeURIComponent(url.split('/').pop());
        const payment = payments.get(paymentKey);
        if (!payment) return json(404, { code: 'NOT_FOUND_PAYMENT' });
        return json(200, { status: payment.status, paymentKey, orderId: payment.orderId, totalAmount: payment.amount, currency: 'KRW' });
    };
    return {
        transport, calls, payments,
        confirmCalls: () => calls.filter((c) => c.url === CONFIRM_URL),
        authorize: (paymentKey, { orderId, amount, status = 'IN_PROGRESS' }) => payments.set(paymentKey, { orderId, amount, status }),
        respondWith: (fn) => { override = fn; },
    };
};

// 가짜 DB에 열린 주문 목록 조회(findAll)도 붙임
const addFindAll = (db) => {
    db.EconomyTopupOrder.findAll = async ({ where, limit }) => {
        const rows = db.orders().filter((row) => row.user_id === where.user_id && where.status.includes(row.status));
        rows.sort((a, b) => (b.created_at - a.created_at) || (a.order_id < b.order_id ? 1 : -1));
        return rows.slice(0, limit);
    };
};

const setUp = ({ env = { ...KEYS }, timeoutMs = 1000, now } = {}) => {
    const db = createFakeTopupDb();
    db.addProduct(PRODUCT);
    db.addProduct(GOLD_PRODUCT);
    addFindAll(db);
    const toss = createFakeToss();
    const adapter = createTossAdapter({ getEnv: () => env, transport: toss.transport, timeoutMs });
    const deps = { db, adapter, ...(now ? { now } : {}) };
    return { db, toss, env, deps };
};

let keySeq = 0;
const orderAndAuthorize = async (ctx, userId = USER) => {
    const created = await topup.createTopupOrder({ userId, productId: PRODUCT.product_id, version: 2 }, ctx.deps);
    keySeq += 1;
    const paymentKey = `tauditpay20261109${String(keySeq).padStart(4, '0')}`;
    ctx.toss.authorize(paymentKey, { orderId: created.orderId, amount: created.amount });
    return { ...created, paymentKey };
};
const confirm = (ctx, order, overrides = {}) => topup.confirmTopupOrder({
    userId: USER, orderId: order.orderId, paymentKey: order.paymentKey, amount: order.amount, ...overrides,
}, ctx.deps);

const quiet = (t) => {
    const warn = console.warn;
    const error = console.error;
    console.warn = () => {};
    console.error = () => {};
    t.after(() => { console.warn = warn; console.error = error; });
};

// ── 토스 키 모양 ──

test('토스 키: 앞말 뒤 8자 미만·200자 초과·빈칸·허용 밖 글자는 설정 없음(CONFIG_MISSING)', () => {
    for (const bad of ['test_ck_short7c', `test_ck_${'a'.repeat(201)}`, 'test_ck_has space1', 'test_ck_한글키값한글키값']) {
        assert.throws(() => readClientKey({ TOSS_TEST_CLIENT_KEY: bad }), { code: 'CONFIG_MISSING', status: 503 });
    }
    assert.equal(readClientKey({ TOSS_TEST_CLIENT_KEY: `test_ck_${'a'.repeat(8)}` }), `test_ck_${'a'.repeat(8)}`);
});

test('토스 키: 클라이언트·비밀 키 앞말을 바꿔 넣으면 거절, 결제창 키는 비밀 키 없이도 읽힌다', () => {
    assert.throws(() => readConfig({ TOSS_TEST_CLIENT_KEY: KEYS.TOSS_TEST_SECRET_KEY, TOSS_TEST_SECRET_KEY: KEYS.TOSS_TEST_CLIENT_KEY }), { code: 'CONFIG_MISSING' });
    assert.equal(readClientKey({ TOSS_TEST_CLIENT_KEY: KEYS.TOSS_TEST_CLIENT_KEY }), KEYS.TOSS_TEST_CLIENT_KEY);
    assert.throws(() => readConfig({ TOSS_TEST_CLIENT_KEY: KEYS.TOSS_TEST_CLIENT_KEY }), { code: 'CONFIG_MISSING' });
});

test('토스 키: 설정 없음 오류 문구에 어느 키인지·키 값이 안 들어간다', () => {
    try {
        readConfig({ TOSS_TEST_CLIENT_KEY: KEYS.TOSS_TEST_CLIENT_KEY, TOSS_TEST_SECRET_KEY: 'live_sk_realsecret123' });
        assert.fail('던져야 함');
    } catch (error) {
        assert.equal(error.message, '결제 설정이 올바르지 않습니다.');
        assert.equal(JSON.stringify({ ...error, message: error.message }).includes('realsecret'), false);
    }
});

// ── 토스 응답 해석 ──

const adapterReplying = (respond, { timeoutMs } = {}) => {
    const seen = [];
    const adapter = createTossAdapter({
        getEnv: () => KEYS, timeoutMs,
        transport: async (url, request) => { seen.push({ url, ...request }); return respond(url, request); },
    });
    return { adapter, seen };
};
const REQ = { paymentKey: 'pay_audit_1', orderId: 'order-audit-1', amount: 5500 };
const done = (extra = {}) => json(200, { status: 'DONE', paymentKey: REQ.paymentKey, orderId: REQ.orderId, totalAmount: 5500, currency: 'KRW', ...extra });

test('토스 응답: 정한 시간 한도를 전송에 그대로 넘긴다', async () => {
    const { adapter, seen } = adapterReplying(() => done(), { timeoutMs: 1234 });
    await adapter.confirmPayment(REQ);
    await adapter.getPayment({ paymentKey: REQ.paymentKey });
    assert.deepEqual(seen.map((s) => s.timeoutMs), [1234, 1234]);
});

test('토스 응답: 시간 초과(AbortError)는 결제 여부 모름(UNKNOWN PAYMENT_UNCERTAIN)', async () => {
    const { adapter } = adapterReplying(() => { throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }); });
    assert.deepEqual(await adapter.confirmPayment(REQ), { ok: false, outcome: 'UNKNOWN', code: 'PAYMENT_UNCERTAIN' });
});

test('토스 응답: 승인 성공이어도 원화가 아니면(USD) MISMATCH', async () => {
    const { adapter } = adapterReplying(() => done({ currency: 'USD' }));
    assert.deepEqual(await adapter.confirmPayment(REQ), { ok: false, outcome: 'MISMATCH', code: 'PAYMENT_MISMATCH' });
});

test('토스 응답: 금액이 글자 "5500"으로 오면 같은 값이어도 MISMATCH', async () => {
    const { adapter } = adapterReplying(() => done({ totalAmount: '5500' }));
    assert.equal((await adapter.confirmPayment(REQ)).outcome, 'MISMATCH');
});

test('토스 응답: 부분 취소(PARTIAL_CANCELED)는 CANCELED, 코드 PAYMENT_PARTIAL_CANCELED', async () => {
    const { adapter } = adapterReplying(() => done({ status: 'PARTIAL_CANCELED' }));
    const result = await adapter.getPayment({ paymentKey: REQ.paymentKey });
    assert.equal(result.outcome, 'CANCELED');
    assert.equal(result.code, 'PAYMENT_PARTIAL_CANCELED');
});

test('토스 응답: 200인데 결제 키가 글자가 아니면 응답 이상(PROVIDER_RESPONSE_INVALID)', async () => {
    const { adapter } = adapterReplying(() => done({ paymentKey: 12345 }));
    assert.deepEqual(await adapter.getPayment({ paymentKey: REQ.paymentKey }), { ok: false, outcome: 'UNKNOWN', code: 'PROVIDER_RESPONSE_INVALID' });
});

test('토스 응답: 3xx(돌려보내기)는 결제 여부 모름', async () => {
    const { adapter } = adapterReplying(() => ({ status: 302, bodyText: '' }));
    assert.equal((await adapter.confirmPayment(REQ)).outcome, 'UNKNOWN');
});

test('토스 응답: 404 + 코드는 확정 거절(REJECTED), 코드 빈 객체면 PROVIDER_ERROR', async () => {
    const { adapter } = adapterReplying(() => json(404, { code: 'NOT_FOUND_PAYMENT', message: '결제 없음' }));
    assert.deepEqual(await adapter.getPayment({ paymentKey: REQ.paymentKey }), { ok: false, outcome: 'REJECTED', code: 'NOT_FOUND_PAYMENT' });
    const empty = adapterReplying(() => json(400, {}));
    assert.deepEqual(await empty.adapter.confirmPayment(REQ), { ok: false, outcome: 'REJECTED', code: 'PROVIDER_ERROR' });
});

test('토스 응답: 거절 결과에 토스 문구(message)는 안 실린다', async () => {
    const { adapter } = adapterReplying(() => json(400, { code: 'REJECT_CARD_COMPANY', message: '카드번호 1234-****' }));
    const result = await adapter.confirmPayment(REQ);
    assert.equal(JSON.stringify(result).includes('1234'), false);
});

test('토스 응답: 승인 요청 본문은 결제 키·주문 id·금액 셋뿐', async () => {
    const { adapter, seen } = adapterReplying(() => done());
    await adapter.confirmPayment(REQ);
    assert.deepEqual(JSON.parse(seen[0].body), REQ);
    assert.equal(seen[0].method, 'POST');
});

// ── 충전 주문 만들기 ──

test('주문 만들기: 금액·주문 이름·지급량은 서버 상품표 값, 주문 id는 서버가 만든 UUID', async () => {
    const ctx = setUp();
    const created = await topup.createTopupOrder({ userId: USER, productId: PRODUCT.product_id, version: 2, amount: 1 }, ctx.deps);
    assert.equal(created.amount, 5500);
    assert.equal(created.orderName, '다이아 50개');
    assert.equal(created.clientKey, KEYS.TOSS_TEST_CLIENT_KEY);
    assert.match(created.orderId, /^[0-9a-f-]{36}$/);
    const row = ctx.db.order(created.orderId);
    assert.deepEqual([row.pay_amount, row.grant_amount, row.bonus_amount, row.version, row.status], [5500, 50, 3, 2, 'CREATED']);
});

test('주문 만들기: 로그인 안 했으면(빈 uuid·글자 아님) 401, 주문 없음', async () => {
    const ctx = setUp();
    for (const userId of ['', undefined, 42]) {
        await assert.rejects(topup.createTopupOrder({ userId, productId: PRODUCT.product_id, version: 2 }, ctx.deps), (e) => e.status === 401);
    }
    assert.equal(ctx.db.orders().length, 0);
});

test('주문 만들기: 골드 구매 상품 id로 충전 주문은 404 PRODUCT_NOT_FOUND', async () => {
    const ctx = setUp();
    await assert.rejects(topup.createTopupOrder({ userId: USER, productId: GOLD_PRODUCT.product_id, version: 1 }, ctx.deps), { code: 'PRODUCT_NOT_FOUND', status: 404 });
});

test('주문 만들기: 화면이 본 버전(1)이 지금 버전(2)과 다르면 409와 지금 상품 공개 값', async () => {
    const ctx = setUp();
    await assert.rejects(topup.createTopupOrder({ userId: USER, productId: PRODUCT.product_id, version: 1 }, ctx.deps), (e) => {
        assert.equal(e.code, 'PRODUCT_VERSION_MISMATCH');
        assert.equal(e.currentProduct.version, 2);
        assert.equal(e.currentProduct.payAmount, 5500);
        assert.equal('status' in e.currentProduct, false);
        return true;
    });
});

test('주문 만들기: 운영 키(live_)만 있으면 주문 저장 전에 CONFIG_MISSING', async () => {
    const ctx = setUp({ env: { TOSS_TEST_CLIENT_KEY: 'live_ck_aaaaaaaaaaaaaa', TOSS_TEST_SECRET_KEY: KEYS.TOSS_TEST_SECRET_KEY } });
    await assert.rejects(topup.createTopupOrder({ userId: USER, productId: PRODUCT.product_id, version: 2 }, ctx.deps), { code: 'CONFIG_MISSING' });
    assert.equal(ctx.db.orders().length, 0);
});

// ── 승인 입력 확인 ──

test('승인 입력: 금액이 0·음수·소수·글자·너무 큰 수면 토스를 안 부르고 400', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    for (const amount of [0, -5500, 5500.5, '5500', Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(confirm(ctx, order, { amount }), { code: 'INVALID_TOPUP_CONFIRM_REQUEST', status: 400 });
    }
    assert.equal(ctx.toss.calls.length, 0);
});

test('승인 입력: 결제 키에 빈칸·201자·허용 밖 글자면 400, 주문 id 모양이 틀리면 404', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    for (const paymentKey of ['has space', 'k'.repeat(201), 'key<script>']) {
        await assert.rejects(confirm(ctx, order, { paymentKey }), { code: 'INVALID_TOPUP_CONFIRM_REQUEST' });
    }
    await assert.rejects(confirm(ctx, order, { orderId: '../x' }), { code: 'ORDER_NOT_FOUND', status: 404 });
    assert.equal(ctx.toss.calls.length, 0);
});

test('승인 입력: 남의 주문을 승인하려 하면 403 NOT_OWNER, 토스·주문 그대로', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    await assert.rejects(confirm(ctx, order, { userId: OTHER }), { code: 'NOT_OWNER', status: 403 });
    assert.equal(ctx.toss.calls.length, 0);
    assert.equal(ctx.db.order(order.orderId).status, 'CREATED');
});

test('승인 입력: 화면 금액이 서버 주문 금액(5500)과 다르면 AMOUNT_MISMATCH, 결제 키도 안 붙는다', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    await assert.rejects(confirm(ctx, order, { amount: 550 }), { code: 'AMOUNT_MISMATCH', status: 400 });
    assert.equal(ctx.db.order(order.orderId).payment_key, null);
});

// ── 승인·지급 ──

test('승인: 지급 다이아는 기본+보너스(53), 두 주문이면 잔액 106·장부 2줄(참조 id 다름)', async () => {
    const ctx = setUp();
    const a = await orderAndAuthorize(ctx);
    const b = await orderAndAuthorize(ctx);
    assert.deepEqual(await confirm(ctx, a), { status: 'GRANTED', balanceDiamond: 53 });
    assert.deepEqual(await confirm(ctx, b), { status: 'GRANTED', balanceDiamond: 106 });
    assert.deepEqual(ctx.db.ledger().map((row) => row.reference_event_id).sort(), [`topup:${a.orderId}`, `topup:${b.orderId}`].sort());
    assert.equal(ctx.db.diamond(USER), 106);
});

test('승인: 처음 승인이 "이미 처리된 결제"로 거절되면 조회로 결과를 받아 지급한다', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.payments.get(order.paymentKey).status = 'DONE';
    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 53 });
    assert.equal(ctx.toss.confirmCalls().length, 1);
    assert.equal(ctx.toss.calls.length, 2);
});

test('승인: 지급된 주문을 다시 승인하면 토스 없이 같은 잔액', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    await confirm(ctx, order);
    const before = ctx.toss.calls.length;
    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 53 });
    assert.equal(ctx.toss.calls.length, before);
});

test('승인: 토스 응답이 시간 초과면 503 PAYMENT_PROCESSING, 주문은 확인 중·잠금 표는 풀림', async (t) => {
    quiet(t);
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => { throw Object.assign(new Error('timeout'), { name: 'AbortError' }); });
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING', status: 503 });
    const row = ctx.db.order(order.orderId);
    assert.equal(row.status, 'CONFIRMING');
    assert.equal(row.lease_token, null);
    assert.equal(row.payment_key, order.paymentKey);
    assert.equal(ctx.db.diamond(USER), 0);
});

test('승인: 시간 초과 뒤 토스가 돌아오면 같은 주문 재확인으로 지급 (조회 → 진행 중이면 승인 다시)', async (t) => {
    quiet(t);
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => { throw Object.assign(new Error('timeout'), { name: 'AbortError' }); });
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING' });
    ctx.toss.respondWith(null);
    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 53 });
    assert.equal(ctx.db.ledger().length, 1);
});

test('승인: 입금 대기(WAITING_FOR_DEPOSIT)는 지급 없이 503 확인 중', async (t) => {
    quiet(t);
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => json(200, { status: 'WAITING_FOR_DEPOSIT', paymentKey: order.paymentKey, orderId: order.orderId, totalAmount: 5500, currency: 'KRW' }));
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING' });
    assert.equal(ctx.db.order(order.orderId).status, 'CONFIRMING');
    assert.equal(ctx.db.diamond(USER), 0);
});

test('승인: 토스가 원화 아닌 결제를 돌려주면 FAILED(PAYMENT_MISMATCH)·402·지급 없음', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => done({ paymentKey: order.paymentKey, orderId: order.orderId, currency: 'USD' }));
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED', status: 402 });
    assert.equal(ctx.db.order(order.orderId).status, 'FAILED');
    assert.equal(ctx.db.order(order.orderId).failure_code, 'PAYMENT_MISMATCH');
    assert.equal(ctx.db.diamond(USER), 0);
});

test('승인: 토스 거절 코드 모양이 이상하면 실패 코드는 PROVIDER_ERROR로 저장', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => json(400, { code: 'bad code; drop table' }));
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED' });
    assert.equal(ctx.db.order(order.orderId).failure_code, 'PROVIDER_ERROR');
});

for (const [status, orderStatus] of [['CANCELED', 'CANCELED'], ['EXPIRED', 'EXPIRED'], ['ABORTED', 'FAILED']]) {
    test(`승인: 토스 결제 상태 ${status}면 주문 ${orderStatus}·402, 다시 승인해도 토스를 또 안 부른다`, async () => {
        const ctx = setUp();
        const order = await orderAndAuthorize(ctx);
        ctx.toss.respondWith(() => done({ status, paymentKey: order.paymentKey, orderId: order.orderId }));
        await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED', status: 402 });
        assert.equal(ctx.db.order(order.orderId).status, orderStatus);
        const calls = ctx.toss.calls.length;
        await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED' });
        assert.equal(ctx.toss.calls.length, calls);
    });
}

test('승인: 키 인증 실패(401)는 실패로 단정 안 함 — 확인 중으로 남고 지급 없음', async (t) => {
    quiet(t);
    const ctx = setUp({ env: { TOSS_TEST_CLIENT_KEY: KEYS.TOSS_TEST_CLIENT_KEY, TOSS_TEST_SECRET_KEY: 'test_sk_wrongwrongwrong01' } });
    const order = await orderAndAuthorize(ctx);
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING' });
    assert.equal(ctx.db.order(order.orderId).status, 'CONFIRMING');
});

test('지급 대기: 장부 쓰기가 실패하면 PENDING_GRANT로 답하고, 다음 승인 요청이 토스 없이 지급한다', async (t) => {
    quiet(t);
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.db.hooks.ledgerCreate = () => { throw new Error('장부 잠김'); };
    assert.deepEqual(await confirm(ctx, order), { status: 'PENDING_GRANT' });
    assert.equal(ctx.db.order(order.orderId).status, 'PENDING_GRANT');
    ctx.db.hooks.ledgerCreate = null;
    const calls = ctx.toss.calls.length;
    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 53 });
    assert.equal(ctx.toss.calls.length, calls);
});

// ── 주문 조회·열린 주문 ──

test('주문 조회: 지급된 주문은 잔액을, 실패 주문은 잔액 null, 화면 값에 결제 키·잠금 표가 없다', async () => {
    const ctx = setUp();
    const good = await orderAndAuthorize(ctx);
    await confirm(ctx, good);
    const bad = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => json(400, { code: 'REJECT_CARD_COMPANY' }));
    await assert.rejects(confirm(ctx, bad));
    const goodView = await topup.getTopupOrder({ userId: USER, orderId: good.orderId }, ctx.deps);
    const badView = await topup.getTopupOrder({ userId: USER, orderId: bad.orderId }, ctx.deps);
    assert.equal(goodView.balanceDiamond, 53);
    assert.equal(badView.balanceDiamond, null);
    assert.equal(badView.status, 'FAILED');
    for (const view of [goodView, badView]) {
        assert.equal('paymentKey' in view || 'payment_key' in view || 'leaseToken' in view, false);
    }
});

test('주문 조회: 남의 주문은 403 NOT_OWNER, 없는 주문은 404', async () => {
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    await assert.rejects(topup.getTopupOrder({ userId: OTHER, orderId: order.orderId }, ctx.deps), { code: 'NOT_OWNER' });
    await assert.rejects(topup.getTopupOrder({ userId: USER, orderId: 'missing-order-id' }, ctx.deps), { code: 'ORDER_NOT_FOUND' });
});

test('주문 조회: 결제 설정이 빠진 채 확인 중 주문을 열어도 던지지 않고 지금 상태를 준다', async (t) => {
    quiet(t);
    const ctx = setUp();
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => { throw new Error('ECONNRESET'); });
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING' });
    delete ctx.env.TOSS_TEST_SECRET_KEY;
    const view = await topup.getTopupOrder({ userId: USER, orderId: order.orderId }, ctx.deps);
    assert.equal(view.status, 'CONFIRMING');
});

test('열린 주문: 확인 중·지급 대기만, 내 것만, 최신 순 최대 5개 (만듦·지급됨·실패는 뺌)', async (t) => {
    quiet(t);
    let ms = Date.parse('2026-11-09T00:00:00Z');
    const ctx = setUp();
    const orders = [];
    for (let i = 0; i < 7; i += 1) {
        const order = await orderAndAuthorize(ctx);
        ctx.db.order(order.orderId).created_at = new Date(ms += 1000);
        orders.push(order);
    }
    ctx.toss.respondWith(() => { throw new Error('ECONNRESET'); });
    for (const order of orders.slice(0, 6)) await assert.rejects(confirm(ctx, order));
    ctx.db.order(orders[0].orderId).status = 'GRANTED';
    const other = await orderAndAuthorize(ctx, OTHER);
    ctx.db.order(other.orderId).status = 'CONFIRMING';
    const list = await topup.listOpenTopupOrders({ userId: USER }, ctx.deps);
    assert.deepEqual(list.map((o) => o.orderId), orders.slice(1, 6).reverse().map((o) => o.orderId));
    assert.deepEqual(Object.keys(list[0]).sort(), ['amount', 'createdAt', 'orderId', 'orderName', 'status']);
});

test('열린 주문: 로그인 안 했으면 401', async () => {
    const ctx = setUp();
    await assert.rejects(topup.listOpenTopupOrders({ userId: '' }, ctx.deps), (e) => e.status === 401);
});

// ── 충전 처리기 HTTP (진짜 서비스 + 가짜 DB + 진짜 어댑터·가짜 전송) ──

const startServer = async (t, ctx) => {
    for (const name of ['createTopupOrder', 'confirmTopupOrder', 'getTopupOrder', 'listOpenTopupOrders']) {
        const original = topup[name];
        topup[name] = (args) => original(args, ctx.deps);
        t.after(() => { topup[name] = original; });
    }
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { uuid: req.get('x-test-user') || USER }; next(); });
    app.post('/economy/topup/orders', topupController.createOrder);
    app.get('/economy/topup/orders', topupController.listOpenOrders);
    app.post('/economy/topup/orders/:orderId/confirm', topupController.confirmOrder);
    app.get('/economy/topup/orders/:orderId', topupController.getOrder);
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return url;
};
const call = async (base, method, path, body, user) => {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(user ? { 'x-test-user': user } : {}), Connection: 'close' },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json(), headers: res.headers };
};

test('HTTP 충전: 주문 201 → 결제창 결제 → 승인 200 GRANTED 잔액 → 주문 조회 GRANTED', async (t) => {
    const ctx = setUp();
    const base = await startServer(t, ctx);
    const created = await call(base, 'POST', '/economy/topup/orders', { productId: PRODUCT.product_id, version: 2 });
    assert.equal(created.status, 201);
    assert.equal(created.body.amount, 5500);
    ctx.toss.authorize('tauditHttpKey0001', { orderId: created.body.orderId, amount: 5500 });
    const confirmed = await call(base, 'POST', `/economy/topup/orders/${created.body.orderId}/confirm`, { paymentKey: 'tauditHttpKey0001', amount: 5500 });
    assert.deepEqual([confirmed.status, confirmed.body], [200, { ok: true, status: 'GRANTED', balanceDiamond: 53 }]);
    const view = await call(base, 'GET', `/economy/topup/orders/${created.body.orderId}`);
    assert.equal(view.body.status, 'GRANTED');
});

test('HTTP 충전: 결제 설정 없음은 503 CONFIG_MISSING 고정 문구·캐시 금지', async (t) => {
    const ctx = setUp({ env: {} });
    const base = await startServer(t, ctx);
    const res = await call(base, 'POST', '/economy/topup/orders', { productId: PRODUCT.product_id, version: 2 });
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { ok: false, code: 'CONFIG_MISSING', message: '결제 설정이 올바르지 않습니다.' });
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('HTTP 충전: 확인 진행 중은 503 + Retry-After 2', async (t) => {
    quiet(t);
    const ctx = setUp();
    const base = await startServer(t, ctx);
    const order = await orderAndAuthorize(ctx);
    ctx.toss.respondWith(() => { throw new Error('ECONNRESET'); });
    const res = await call(base, 'POST', `/economy/topup/orders/${order.orderId}/confirm`, { paymentKey: order.paymentKey, amount: 5500 });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'PAYMENT_PROCESSING');
    assert.equal(res.headers.get('retry-after'), '2');
});

test('HTTP 충전: 금액 불일치 400 AMOUNT_MISMATCH, 남의 주문 403 NOT_OWNER', async (t) => {
    const ctx = setUp();
    const base = await startServer(t, ctx);
    const order = await orderAndAuthorize(ctx);
    const mismatch = await call(base, 'POST', `/economy/topup/orders/${order.orderId}/confirm`, { paymentKey: order.paymentKey, amount: 100 });
    assert.deepEqual([mismatch.status, mismatch.body.code], [400, 'AMOUNT_MISMATCH']);
    const notMine = await call(base, 'POST', `/economy/topup/orders/${order.orderId}/confirm`, { paymentKey: order.paymentKey, amount: 5500 }, OTHER);
    assert.deepEqual([notMine.status, notMine.body.code], [403, 'NOT_OWNER']);
});

test('HTTP 충전: 열린 주문 목록은 state=open일 때만, 캐시 금지', async (t) => {
    const ctx = setUp();
    const base = await startServer(t, ctx);
    const bad = await call(base, 'GET', '/economy/topup/orders?state=all');
    assert.deepEqual([bad.status, bad.body.code], [400, 'INVALID_TOPUP_ORDER_REQUEST']);
    const ok = await call(base, 'GET', '/economy/topup/orders?state=open');
    assert.deepEqual([ok.status, ok.body], [200, { ok: true, orders: [] }]);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
});

// ── 실제 토스 연결 확인 (.env 시험 키 있을 때만, 키 값은 출력·기록 안 함) ──

// .env에서 토스 키 두 줄만 읽음 (DB 주소 등 다른 값은 안 읽음)
const readLiveTossEnv = () => {
    try {
        const text = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
        const env = {};
        for (const line of text.split(/\r?\n/)) {
            const match = /^\s*(TOSS_TEST_CLIENT_KEY|TOSS_TEST_SECRET_KEY)\s*=\s*(.*?)\s*$/.exec(line);
            if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
        }
        readConfig(env);
        return env;
    } catch {
        return null;
    }
};
const LIVE_TOSS_ENV = process.env.RUN_LIVE_TOSS === '0' ? null : readLiveTossEnv();
const liveSkip = LIVE_TOSS_ENV ? false : '.env에 토스 시험 키(test_ck_·test_sk_)가 없음 (또는 RUN_LIVE_TOSS=0)';

test('실제 토스: 시험 비밀 키로 가짜 결제 키 승인을 보내면 키 인증은 통과하고 정해진 거절(REJECTED)이 온다', { skip: liveSkip, timeout: 20_000 }, async () => {
    const adapter = createTossAdapter({ getEnv: () => LIVE_TOSS_ENV, timeoutMs: 10_000 });
    const result = await adapter.confirmPayment({
        paymentKey: `audit_fake_payment_key_${Date.now()}`, orderId: `audit-fake-order-${Date.now()}`, amount: 1000,
    });
    assert.equal(result.ok, false);
    assert.notEqual(result.code, 'PROVIDER_AUTH', '시험 비밀 키 인증이 거절됨');
    assert.equal(result.outcome, 'REJECTED', `거절이 아닌 결과: ${result.outcome}/${result.code}`);
    assert.match(result.code, /^[A-Z0-9_]+$/);
});

test('실제 토스: 없는 결제 키 조회도 키 인증은 통과하고 REJECTED', { skip: liveSkip, timeout: 20_000 }, async () => {
    const adapter = createTossAdapter({ getEnv: () => LIVE_TOSS_ENV, timeoutMs: 10_000 });
    const result = await adapter.getPayment({ paymentKey: `audit_fake_payment_key_${Date.now()}` });
    assert.notEqual(result.code, 'PROVIDER_AUTH');
    assert.equal(result.outcome, 'REJECTED', `거절이 아닌 결과: ${result.outcome}/${result.code}`);
});
