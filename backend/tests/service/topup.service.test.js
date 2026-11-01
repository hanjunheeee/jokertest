'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const topup = require('../../services/economy/topup');
const { createFakeTopupDb } = require('../helpers/fakeTopupDb');
const { createFakeTossAdapter } = require('../helpers/fakeTossAdapter');

const USER_A = 'user-a';
const USER_B = 'user-b';

const PRODUCT_ROW = Object.freeze({
    product_id: 'test-topup-1', kind: 'DIAMOND_TOPUP', display_name: '시험용 다이아(임시값)',
    pay_currency: 'KRW', pay_amount: 1000, grant_currency: 'DIAMOND', grant_amount: 100, bonus_amount: 10,
    status: 'ON_SALE', sort_order: 0, version: 1,
});

const setUp = () => {
    const db = createFakeTopupDb();
    db.addProduct(PRODUCT_ROW);
    const fake = createFakeTossAdapter();
    const clock = { ms: Date.parse('2026-09-22T00:00:00Z') };
    const deps = { db, adapter: fake, now: () => new Date(clock.ms) };
    return { db, fake, clock, deps };
};

let keyCounter = 0;
const newOrder = async (ctx, { userId = USER_A, scenario = 'approve' } = {}) => {
    const created = await topup.createTopupOrder({ userId, productId: 'test-topup-1', version: 1 }, ctx.deps);
    keyCounter += 1;
    const paymentKey = `pay_key_${keyCounter}`;
    ctx.fake.registerPayment(paymentKey, { orderId: created.orderId, amount: created.amount, scenario });
    return { ...created, paymentKey, userId };
};

const confirm = (ctx, order, overrides = {}) => topup.confirmTopupOrder({
    userId: order.userId ?? USER_A, orderId: order.orderId, paymentKey: order.paymentKey, amount: 1000, ...overrides,
}, ctx.deps);

const view = (ctx, order, userId = USER_A) => topup.getTopupOrder({ userId, orderId: order.orderId }, ctx.deps);

const assertNothingGranted = (ctx, order) => {
    assert.equal(ctx.db.ledger().filter((row) => row.reference_event_id === `topup:${order.orderId}`).length, 0);
    assert.equal(ctx.db.diamond(order.userId ?? USER_A), 0);
};

const waitFor = async (probe) => {
    for (let i = 0; i < 200; i += 1) {
        if (probe()) return;
        await new Promise((resolve) => { setImmediate(resolve); });
    }
    throw new Error('waitFor: 시간 초과');
};

test('주문 생성: DB 상품 스냅샷을 CREATED로 저장하고 서버 생성 orderId·공개 clientKey를 돌려준다', async () => {
    const ctx = setUp();
    const created = await topup.createTopupOrder({ userId: USER_A, productId: 'test-topup-1', version: 1 }, ctx.deps);

    assert.deepEqual(Object.keys(created).sort(), ['amount', 'clientKey', 'orderId', 'orderName']);
    assert.equal(created.amount, 1000);
    assert.equal(created.orderName, '시험용 다이아(임시값)');
    assert.equal(created.clientKey, ctx.fake.clientKey);
    const row = ctx.db.order(created.orderId);
    assert.deepEqual(
        [row.user_id, row.product_id, row.version, row.pay_amount, row.grant_amount, row.bonus_amount, row.status, row.payment_key],
        [USER_A, 'test-topup-1', 1, 1000, 100, 10, 'CREATED', null],
    );
    assert.equal(ctx.db.ledger().length, 0);
    assert.notEqual((await topup.createTopupOrder({ userId: USER_A, productId: 'test-topup-1', version: 1 }, ctx.deps)).orderId, created.orderId);
});

test('주문 생성 거부: 없는 상품·중지·버전 불일치(현재 상품 동봉)·다른 종류·잘못된 행, 저장되지 않는다', async () => {
    const ctx = setUp();
    ctx.db.addProduct({ ...PRODUCT_ROW, product_id: 'gold-1', kind: 'GOLD_PURCHASE', pay_currency: 'DIAMOND', grant_currency: 'GOLD' });
    ctx.db.addProduct({ ...PRODUCT_ROW, product_id: 'stopped-1', status: 'STOPPED' });
    ctx.db.addProduct({ ...PRODUCT_ROW, product_id: 'bad-1', pay_amount: 0 });
    const attempt = (productId, version = 1) => topup.createTopupOrder({ userId: USER_A, productId, version }, ctx.deps);

    await assert.rejects(attempt('nope'), { code: 'PRODUCT_NOT_FOUND', status: 404 });
    await assert.rejects(attempt('gold-1'), { code: 'PRODUCT_NOT_FOUND' });
    await assert.rejects(attempt('bad-1'), { code: 'PRODUCT_NOT_FOUND' });
    await assert.rejects(attempt('stopped-1'), { code: 'PRODUCT_STOPPED', status: 409 });
    await assert.rejects(attempt('test-topup-1', 7), (error) => {
        assert.equal(error.code, 'PRODUCT_VERSION_MISMATCH');
        assert.deepEqual(error.currentProduct, {
            productId: 'test-topup-1', kind: 'DIAMOND_TOPUP', displayName: '시험용 다이아(임시값)', payCurrency: 'KRW',
            payAmount: 1000, grantCurrency: 'DIAMOND', grantAmount: 100, bonusAmount: 10, version: 1,
        });
        return true;
    });
    assert.equal(ctx.db.orders().length, 0);
});

test('주문 생성: 결제 설정이 없으면 주문을 저장하기 전에 CONFIG_MISSING이다', async () => {
    const ctx = setUp();
    ctx.fake.setConfigMissing(true);
    await assert.rejects(topup.createTopupOrder({ userId: USER_A, productId: 'test-topup-1', version: 1 }, ctx.deps), { code: 'CONFIG_MISSING' });
    assert.equal(ctx.db.orders().length, 0);
});

test('주문 생성: DB 조회 오류는 삼키지 않는다', async () => {
    const ctx = setUp();
    ctx.db.hooks.productFind = () => { throw Object.assign(new Error('boom'), { code: 'ER_INJECTED' }); };
    await assert.rejects(topup.createTopupOrder({ userId: USER_A, productId: 'test-topup-1', version: 1 }, ctx.deps), { code: 'ER_INJECTED' });
});

test('정상 승인: 스냅샷 합계(110)를 원장 1건·GRANTED로 지급하고, 반복 확인은 제공자를 다시 부르지 않는다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx);

    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 110 });
    const row = ctx.db.order(order.orderId);
    assert.deepEqual([row.status, row.payment_key, row.lease_token, row.failure_code], ['GRANTED', order.paymentKey, null, null]);
    assert.ok(row.approved_at && row.granted_at);

    const [entry] = ctx.db.ledger();
    assert.deepEqual(
        [entry.user_id, entry.reason, entry.currency, entry.amount, entry.balance_after, entry.item_id, entry.reference_event_id],
        [USER_A, 'DIAMOND_TOPUP', 'DIAMOND', 110, 110, null, `topup:${order.orderId}`],
    );
    assert.equal(ctx.db.diamond(USER_A), 110);

    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(ctx.db.ledger().length, 1);
    assert.equal(ctx.fake.callsOf('confirm').length, 1);
    assert.equal(ctx.fake.callsOf('confirm')[0].idempotencyKey, `topup-confirm:${order.orderId}`);

    const fetched = await view(ctx, order);
    assert.equal(fetched.status, 'GRANTED');
    assert.equal(fetched.balanceDiamond, 110);
    assert.ok(!('paymentKey' in fetched) && !('payment_key' in fetched) && !('lease_token' in fetched));
});

test('스냅샷: 주문 뒤 상품 가격·지급량·버전 변경과 삭제에도 승인 금액 1000·지급 110이 유지된다', async () => {
    const ctx = setUp();
    const first = await newOrder(ctx);
    const second = await newOrder(ctx);

    ctx.db.updateProduct('test-topup-1', { pay_amount: 5000, grant_amount: 500, bonus_amount: 99, version: 2 });
    await assert.rejects(confirm(ctx, first, { amount: 5000 }), { code: 'AMOUNT_MISMATCH' });
    assert.deepEqual(await confirm(ctx, first), { status: 'GRANTED', balanceDiamond: 110 });

    ctx.db.deleteProduct('test-topup-1');
    assert.deepEqual(await confirm(ctx, second), { status: 'GRANTED', balanceDiamond: 220 });
    assert.equal(ctx.db.order(second.orderId).grant_amount, 100);
});

test('소유권·존재·금액·입력 형식은 외부 호출 전에 거부되고 주문 상태를 바꾸지 않는다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx);

    await assert.rejects(confirm(ctx, order, { userId: USER_B }), { code: 'NOT_OWNER', status: 403 });
    await assert.rejects(view(ctx, order, USER_B), { code: 'NOT_OWNER' });
    await assert.rejects(confirm(ctx, { ...order, orderId: 'a-missing-order' }), { code: 'ORDER_NOT_FOUND', status: 404 });
    await assert.rejects(confirm(ctx, { ...order, orderId: 'x' }), { code: 'ORDER_NOT_FOUND' });
    await assert.rejects(view(ctx, { orderId: 'a-missing-order' }), { code: 'ORDER_NOT_FOUND' });
    await assert.rejects(confirm(ctx, order, { amount: 999 }), { code: 'AMOUNT_MISMATCH', status: 400 });
    for (const amount of ['1000', 1000.5, -1000, 0, null, undefined, Number.NaN]) {
        await assert.rejects(confirm(ctx, order, { amount }), { code: 'INVALID_TOPUP_CONFIRM_REQUEST' }, String(amount));
    }
    for (const paymentKey of ['', 'k'.repeat(201), 123, null, 'has space']) {
        await assert.rejects(confirm(ctx, order, { paymentKey }), { code: 'INVALID_TOPUP_CONFIRM_REQUEST' }, String(paymentKey));
    }

    assert.equal(ctx.fake.calls.length, 0);
    assert.deepEqual([ctx.db.order(order.orderId).status, ctx.db.order(order.orderId).payment_key], ['CREATED', null]);
    assertNothingGranted(ctx, order);
});

test('결제창 복귀만으로(조회) 승인·지급하지 않는다 — CREATED 조회는 부작용이 없다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx);
    const fetched = await view(ctx, order);
    assert.equal(fetched.status, 'CREATED');
    assert.equal(ctx.fake.calls.length, 0);
    assert.equal(ctx.db.order(order.orderId).payment_key, null);
    assertNothingGranted(ctx, order);
});

test('결제키: 다른 주문이 점유한 키·이미 저장된 키와 다른 키는 외부 호출 없이 거부된다', async () => {
    const ctx = setUp();
    const first = await newOrder(ctx);
    const second = await newOrder(ctx);
    const waiting = await newOrder(ctx, { scenario: 'waiting' });

    await confirm(ctx, first);
    await assert.rejects(confirm(ctx, second, { paymentKey: first.paymentKey }), { code: 'PAYMENT_KEY_CONFLICT', status: 409 });
    assert.deepEqual([ctx.db.order(second.orderId).status, ctx.db.order(second.orderId).payment_key], ['CREATED', null]);
    assert.equal(ctx.db.orders().filter((row) => row.payment_key === first.paymentKey).length, 1);

    await assert.rejects(confirm(ctx, first, { userId: USER_B }), { code: 'NOT_OWNER' });
    await assert.rejects(confirm(ctx, first, { amount: 999 }), { code: 'AMOUNT_MISMATCH' });
    await assert.rejects(confirm(ctx, first, { paymentKey: 'pay_other' }), { code: 'PAYMENT_KEY_MISMATCH', status: 409 });

    await assert.rejects(confirm(ctx, waiting), { code: 'PAYMENT_PROCESSING' });
    const callsBefore = ctx.fake.calls.length;
    await assert.rejects(confirm(ctx, waiting, { paymentKey: 'pay_swapped' }), { code: 'PAYMENT_KEY_MISMATCH' });
    assert.equal(ctx.fake.calls.length, callsBefore);
    assert.equal(ctx.db.ledger().length, 1);
});

test('결제키가 다른 주문용으로 등록되어 있으면 제공자가 거절하고 미지급 FAILED다', async () => {
    const ctx = setUp();
    const target = await newOrder(ctx);
    const other = await newOrder(ctx);

    await assert.rejects(confirm(ctx, target, { paymentKey: other.paymentKey }), { code: 'PAYMENT_FAILED', status: 402 });
    assert.equal(ctx.db.order(target.orderId).status, 'FAILED');
    assertNothingGranted(ctx, target);
});

test('제공자 응답 변조(금액·주문·결제키)는 지급하지 않고 FAILED(PAYMENT_MISMATCH)다', async () => {
    for (const scenario of ['tamper-amount', 'tamper-order', 'tamper-key']) {
        const ctx = setUp();
        const order = await newOrder(ctx, { scenario });
        await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED' }, scenario);
        const row = ctx.db.order(order.orderId);
        assert.deepEqual([row.status, row.failure_code, row.lease_token], ['FAILED', 'PAYMENT_MISMATCH', null], scenario);
        assertNothingGranted(ctx, order);
    }
});

test('실패·취소·만료는 미지급 종단 상태이고 재확인해도 제공자를 다시 부르지 않는다', async () => {
    const expected = { reject: 'FAILED', cancel: 'CANCELED', expire: 'EXPIRED' };
    for (const [scenario, status] of Object.entries(expected)) {
        const ctx = setUp();
        const order = await newOrder(ctx, { scenario });
        await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED', status: 402 }, scenario);
        assert.equal(ctx.db.order(order.orderId).status, status, scenario);
        assert.equal((await view(ctx, order)).status, status);
        assertNothingGranted(ctx, order);

        const calls = ctx.fake.calls.length;
        await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_FAILED' });
        assert.equal(ctx.fake.calls.length, calls, scenario);
    }
});

test('입금 대기·미등록 결제: 대기는 CONFIRMING(미지급), 미등록 결제키는 FAILED', async () => {
    const ctx = setUp();
    const waiting = await newOrder(ctx, { scenario: 'waiting' });
    await assert.rejects(confirm(ctx, waiting), { code: 'PAYMENT_PROCESSING', status: 503 });
    assert.equal(ctx.db.order(waiting.orderId).status, 'CONFIRMING');
    assert.equal(ctx.db.order(waiting.orderId).lease_token, null, '결과가 불명이면 임대를 돌려준다');
    assert.equal((await view(ctx, waiting)).status, 'CONFIRMING');
    assertNothingGranted(ctx, waiting);

    const created = await topup.createTopupOrder({ userId: USER_A, productId: 'test-topup-1', version: 1 }, ctx.deps);
    await assert.rejects(
        topup.confirmTopupOrder({ userId: USER_A, orderId: created.orderId, paymentKey: 'pay_never_registered', amount: 1000 }, ctx.deps),
        { code: 'PAYMENT_FAILED' },
    );
    assert.equal(ctx.db.order(created.orderId).status, 'FAILED');
});

test('설정 미비: 승인 호출은 CONFIG_MISSING이고 주문·지급이 바뀌지 않으며, 복구되면 같은 주문이 진행된다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx);
    ctx.fake.setConfigMissing(true);

    await assert.rejects(confirm(ctx, order), { code: 'CONFIG_MISSING', status: 503 });
    assert.deepEqual([ctx.db.order(order.orderId).status, ctx.db.order(order.orderId).payment_key], ['CREATED', null]);
    assert.equal(ctx.fake.calls.length, 0);
    assertNothingGranted(ctx, order);

    ctx.fake.setConfigMissing(false);
    assert.equal((await confirm(ctx, order)).status, 'GRANTED');
});

test('응답 유실(제공자는 승인): CONFIRMING으로 남고, 새 서비스 인스턴스의 조회가 제공자 조회로 복구해 1회 지급한다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx, { scenario: 'lost-response' });

    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING' });
    const mid = ctx.db.order(order.orderId);
    assert.deepEqual([mid.status, mid.payment_key, mid.lease_token], ['CONFIRMING', order.paymentKey, null]);
    assert.equal(ctx.fake.providerState(order.paymentKey), 'DONE');
    assertNothingGranted(ctx, order);

    const resolved = require.resolve('../../services/economy/topup');
    delete require.cache[resolved];
    const freshService = require('../../services/economy/topup');
    const recovered = await freshService.getTopupOrder({ userId: USER_A, orderId: order.orderId }, ctx.deps);
    assert.equal(recovered.status, 'GRANTED');
    assert.equal(recovered.balanceDiamond, 110);
    assert.equal(ctx.db.ledger().length, 1);
    assert.equal(ctx.fake.callsOf('confirm').length, 1, '복구는 승인을 다시 하지 않고 조회한다');
    assert.equal(ctx.fake.callsOf('get').length, 1);

    assert.deepEqual(await freshService.confirmTopupOrder({ userId: USER_A, orderId: order.orderId, paymentKey: order.paymentKey, amount: 1000 }, ctx.deps), { status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(ctx.db.ledger().length, 1);
});

test('응답 유실 뒤 같은 confirm 재시도가 복구해 지급한다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx, { scenario: 'lost-response' });
    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING' });
    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(ctx.db.ledger().length, 1);
    assert.equal(ctx.fake.callsOf('confirm').length, 1);
});

test('제공자에 닿기 전 실패(승인 불명): 실패로 단정하지 않고 재확인이 같은 멱등키로 승인한다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx, { scenario: 'unreached' });

    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING' });
    assert.equal(ctx.db.order(order.orderId).status, 'CONFIRMING');
    assert.equal(ctx.fake.providerState(order.paymentKey), 'IN_PROGRESS');

    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 110 });
    const keys = ctx.fake.callsOf('confirm').map((call) => call.idempotencyKey);
    assert.deepEqual(keys, [`topup-confirm:${order.orderId}`, `topup-confirm:${order.orderId}`]);
    assert.equal(ctx.db.ledger().length, 1);
});

test('원장 생성 실패: PENDING_GRANT로 남고(원장 0건·지갑 롤백) 조회·재확인이 이어서 1회 지급한다', async () => {
    const ctx = setUp();
    const viaGet = await newOrder(ctx);
    const viaConfirm = await newOrder(ctx, { userId: USER_B });

    ctx.db.hooks.ledgerCreate = () => {
        ctx.db.hooks.ledgerCreate = null;
        throw Object.assign(new Error('injected ledger failure'), { code: 'ER_INJECTED' });
    };
    assert.deepEqual(await confirm(ctx, viaGet), { status: 'PENDING_GRANT' });
    const pending = ctx.db.order(viaGet.orderId);
    assert.equal(pending.status, 'PENDING_GRANT');
    assert.ok(pending.approved_at, '승인 사실은 저장되어 있다');
    assert.equal(ctx.db.ledger().length, 0);
    assert.equal(ctx.db.wallet(USER_A), undefined, '지갑 생성도 롤백된다');

    assert.equal((await view(ctx, viaGet)).status, 'GRANTED');
    assert.equal(ctx.db.ledger().length, 1);
    assert.equal(ctx.db.diamond(USER_A), 110);

    ctx.db.hooks.ledgerCreate = () => {
        ctx.db.hooks.ledgerCreate = null;
        throw Object.assign(new Error('injected ledger failure'), { code: 'ER_INJECTED' });
    };
    assert.deepEqual(await confirm(ctx, viaConfirm), { status: 'PENDING_GRANT' });
    const callsBefore = ctx.fake.calls.length;
    assert.deepEqual(await confirm(ctx, viaConfirm), { status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(ctx.fake.calls.length, callsBefore, 'PENDING_GRANT 복구는 제공자를 다시 부르지 않는다');
    assert.equal(ctx.db.ledger().length, 2);
    assert.equal(ctx.db.diamond(USER_B), 110);
});

test('승인 사실 저장(PENDING_GRANT) 실패: CONFIRMING으로 남고(임대 반납) 다음 조회가 제공자 상태로 복구한다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx);
    ctx.db.hooks.orderUpdate = (patch) => {
        if (patch.status === 'PENDING_GRANT') {
            ctx.db.hooks.orderUpdate = null;
            throw Object.assign(new Error('injected persist failure'), { code: 'ER_INJECTED' });
        }
    };

    await assert.rejects(confirm(ctx, order), { code: 'ER_INJECTED' });
    const row = ctx.db.order(order.orderId);
    assert.deepEqual([row.status, row.payment_key, row.lease_token], ['CONFIRMING', order.paymentKey, null]);
    assertNothingGranted(ctx, order);

    assert.equal((await view(ctx, order)).status, 'GRANTED');
    assert.equal(ctx.db.ledger().length, 1);
    assert.equal(ctx.fake.callsOf('confirm').length, 1);
    assert.equal(ctx.fake.callsOf('get').length, 1);
});

test('조회 복구: 임대가 만료된 CONFIRMING은 이어받고, 유효한 임대는 건드리지 않으며, 설정이 없으면 저장 상태를 그대로 보여 준다', async () => {
    const ctx = setUp();
    const stuck = await newOrder(ctx);
    Object.assign(ctx.db.order(stuck.orderId), {
        status: 'CONFIRMING', payment_key: stuck.paymentKey, lease_token: 'dead', lease_expires_at: new Date(ctx.clock.ms - 60_000),
    });
    assert.equal((await view(ctx, stuck)).status, 'GRANTED');
    assert.equal(ctx.fake.callsOf('get').length, 1, '중단 뒤에는 먼저 제공자 상태를 조회한다');
    assert.equal(ctx.fake.callsOf('confirm').length, 1);

    const live = await newOrder(ctx);
    Object.assign(ctx.db.order(live.orderId), {
        status: 'CONFIRMING', payment_key: live.paymentKey, lease_token: 'live', lease_expires_at: new Date(ctx.clock.ms + 60_000),
    });
    const calls = ctx.fake.calls.length;
    assert.equal((await view(ctx, live)).status, 'CONFIRMING');
    await assert.rejects(confirm(ctx, live), { code: 'PAYMENT_PROCESSING' });
    assert.equal(ctx.fake.calls.length, calls);

    const noConfig = await newOrder(ctx);
    Object.assign(ctx.db.order(noConfig.orderId), { status: 'CONFIRMING', payment_key: noConfig.paymentKey, lease_token: null });
    ctx.fake.setConfigMissing(true);
    assert.equal((await view(ctx, noConfig)).status, 'CONFIRMING');
    assert.equal(ctx.db.order(noConfig.orderId).lease_token, null, '설정이 없으면 임대도 잡지 않는다');
});

test('외부 승인 대기 중: 유효 임대가 있어 중복 confirm은 제공자를 다시 부르지 않고, 해제되면 1회 지급된다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx);

    const hold = ctx.fake.hold(order.paymentKey);
    const first = confirm(ctx, order);
    await hold.entered;
    const mid = ctx.db.order(order.orderId);
    assert.equal(mid.status, 'CONFIRMING');
    assert.ok(mid.lease_token && mid.lease_expires_at > new Date(ctx.clock.ms));

    await assert.rejects(confirm(ctx, order), { code: 'PAYMENT_PROCESSING' });
    assert.equal((await view(ctx, order)).status, 'CONFIRMING');
    assert.equal(ctx.fake.callsOf('confirm').length, 1);
    assert.equal(ctx.fake.callsOf('get').length, 0);

    hold.release();
    assert.deepEqual(await first, { status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(ctx.db.ledger().length, 1);
});

test('임대를 잃은 이전 처리자는 새 처리자의 결과를 덮지 못하고, 지급은 1회다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx);

    const hold = ctx.fake.hold(order.paymentKey);
    const stale = confirm(ctx, order).then((value) => ({ value }), (error) => ({ error }));
    await hold.entered;
    const firstToken = ctx.db.order(order.orderId).lease_token;

    ctx.clock.ms += topup.LEASE_MS + 1000;
    const successor = confirm(ctx, order).then((value) => ({ value }), (error) => ({ error }));
    await waitFor(() => ctx.db.order(order.orderId).lease_token !== firstToken);

    hold.release();
    const [staleResult, successorResult] = await Promise.all([stale, successor]);
    assert.equal(staleResult.error?.code, 'PAYMENT_PROCESSING', '임대를 잃은 처리자는 결과를 저장하지 못한다');
    assert.deepEqual(successorResult.value, { status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(ctx.db.ledger().length, 1);
    assert.equal(ctx.db.diamond(USER_A), 110);
});

test('지급은 주문 GRANTED 갱신과 같은 트랜잭션이다 — 주문 갱신이 실패하면 원장·지갑도 롤백된다', async () => {
    const ctx = setUp();
    const order = await newOrder(ctx);
    ctx.db.hooks.orderUpdate = (patch) => {
        if (patch.status === 'GRANTED') {
            ctx.db.hooks.orderUpdate = null;
            throw Object.assign(new Error('injected grant failure'), { code: 'ER_INJECTED' });
        }
    };

    assert.deepEqual(await confirm(ctx, order), { status: 'PENDING_GRANT' });
    assert.equal(ctx.db.ledger().length, 0, '원장이 주문 상태보다 먼저 남으면 안 된다');
    assert.equal(ctx.db.diamond(USER_A), 0);
    assert.equal(ctx.db.order(order.orderId).status, 'PENDING_GRANT');

    assert.deepEqual(await confirm(ctx, order), { status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(ctx.db.ledger().length, 1);
});
