'use strict';

// 다이아 충전 DB 시험: 진짜 시험 DB + 가짜 결제사로 승인·두 번·동시에·같은 결제 키·지급 실패 뒤 마무리·결제 실패·응답 놓침·환불·결제 키 하나를 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-328~347 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3), 진짜 결제사엔 요청 안 나감
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ledgerRepository = require('../../repositories/economy/ledger');

test.before(h.prepareDb);
test.after(h.closeDb);

// 지급 장부 줄 (번호 topup:<주문 id>)
const topupRows = async (uuid) => (await h.ledgerOf(uuid)).filter((row) => row.reason === 'DIAMOND_TOPUP');

// 충전 지급 장부 쓰기만 한 번 끊김 흉내 (다른 장부 쓰기는 그대로)
const failTopupLedgerOnce = (t) => {
    const original = ledgerRepository.createEntry;
    let failed = false;
    t.mock.method(ledgerRepository, 'createEntry', (models, row, transaction) => {
        if (!failed && row.reason === 'DIAMOND_TOPUP') {
            failed = true;
            throw new Error('장부 쓰기 끊김 흉내');
        }
        return original(models, row, transaction);
    });
    return () => failed;
};

// 공통 준비: 서버 · 가짜 결제사 · 충전 상품 (원화 1100 → 다이아 100 + 덤 10) · 새 사람
const setup = async (t, { label = 'top', tweak } = {}) => {
    const base = await h.startServer(t);
    const fake = h.installFakeToss(t, tweak);
    const product = await h.createTopupProduct();
    const user = await h.createUser(label);
    return { base, fake, product, user };
};

test('A12-B-328 승인되면 지급 → 주문 GRANTED·granted_at·장부 DIAMOND_TOPUP 1줄(topup:<주문 id>)·다이아 +110', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);

    const { orderId, confirm } = await h.runTopup(base, user, fake, product);
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    assert.equal(confirm.body.status, 'GRANTED');

    const order = await h.orderOf(orderId);
    assert.equal(order.status, 'GRANTED');
    assert.ok(order.granted_at);
    const rows = await topupRows(user);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reference_event_id, `topup:${orderId}`);
    assert.equal(Number(rows[0].amount), 110);
    assert.equal((await h.walletOf(user)).diamond, 110);
});

test('A12-B-329 같은 확인 두 번 → 장부 1줄·다이아 한 번만', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);
    const { orderId, paymentKey, amount, confirm } = await h.runTopup(base, user, fake, product);
    assert.equal(confirm.body.status, 'GRANTED');

    const again = await h.call(base, user, 'POST', `/economy/topup/orders/${orderId}/confirm`, { paymentKey, amount });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal((await topupRows(user)).length, 1);
    assert.equal((await h.walletOf(user)).diamond, 110);
});

test('A12-B-330 같은 확인 동시에 둘 → 장부 1줄', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);
    const created = await h.call(base, user, 'POST', '/economy/topup/orders', { productId: product.product_id, version: 1 });
    const { orderId, amount } = created.body;
    const paymentKey = h.newPaymentKey();
    fake.registerPayment(paymentKey, { orderId, amount });

    const body = { paymentKey, amount };
    await Promise.all([1, 2].map(() => h.call(base, user, 'POST', `/economy/topup/orders/${orderId}/confirm`, body)));
    // 하나가 "진행 중"이었으면 조회로 마무리됨
    await h.call(base, user, 'GET', `/economy/topup/orders/${orderId}`);
    assert.equal((await topupRows(user)).length, 1);
    assert.equal((await h.walletOf(user)).diamond, 110);
});

test('A12-B-331 같은 결제 키로 두 주문: A 확인 됨 → B에 같은 키 → 409 PAYMENT_KEY_CONFLICT·다이아 한 번만', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);
    const first = await h.runTopup(base, user, fake, product);
    assert.equal(first.confirm.body.status, 'GRANTED');

    const created = await h.call(base, user, 'POST', '/economy/topup/orders', { productId: product.product_id, version: 1 });
    const res = await h.call(base, user, 'POST', `/economy/topup/orders/${created.body.orderId}/confirm`, { paymentKey: first.paymentKey, amount: first.amount });
    h.assertCode(res, 409, 'PAYMENT_KEY_CONFLICT');
    assert.equal((await topupRows(user)).length, 1);
    assert.equal((await h.walletOf(user)).diamond, 110);
});

test('A12-B-332 장부 쓰기 실패 → PENDING_GRANT·장부 0 → 조회 → GRANTED·장부 1', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);
    const failed = failTopupLedgerOnce(t);

    const { orderId, confirm } = await h.runTopup(base, user, fake, product);
    assert.equal(failed(), true, '끊김 흉내가 걸렸어야 함');
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    assert.equal(confirm.body.status, 'PENDING_GRANT');
    assert.equal((await h.orderOf(orderId)).status, 'PENDING_GRANT');
    assert.equal((await topupRows(user)).length, 0);

    const view = await h.call(base, user, 'GET', `/economy/topup/orders/${orderId}`);
    assert.equal(view.status, 200, JSON.stringify(view.body));
    assert.equal(view.body.status, 'GRANTED');
    assert.equal((await topupRows(user)).length, 1);
    assert.equal((await h.walletOf(user)).diamond, 110);
});

test('A12-B-333 주문 뒤 관리자가 상품 값을 바꿈 → 지급은 주문에 복사된 값', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);
    const created = await h.call(base, user, 'POST', '/economy/topup/orders', { productId: product.product_id, version: 1 });
    const { orderId, amount } = created.body;
    // 주문 뒤 상품을 다이아 999 + 덤 1로 바꾸고 버전 올림
    await h.models().EconomyCurrencyProduct.update({ grant_amount: 999, bonus_amount: 1, version: 2 }, { where: { product_id: product.product_id } });

    const paymentKey = h.newPaymentKey();
    fake.registerPayment(paymentKey, { orderId, amount });
    const res = await h.call(base, user, 'POST', `/economy/topup/orders/${orderId}/confirm`, { paymentKey, amount });
    assert.equal(res.body.status, 'GRANTED', JSON.stringify(res.body));
    assert.equal((await h.walletOf(user)).diamond, 110);
});

// ── A12-B-334~340 결제 실패는 지급 0 ──
// 시나리오마다 주문 상태, 실패 코드는 대문자·숫자·_ 모양만
const FAIL_CASES = [
    { no: 'A12-B-334', scenario: 'reject', status: 'FAILED' },
    { no: 'A12-B-335', scenario: 'cancel', status: 'CANCELED' },
    { no: 'A12-B-336', scenario: 'expire', status: 'EXPIRED' },
    { no: 'A12-B-337', scenario: 'tamper-amount', status: 'FAILED' },
    { no: 'A12-B-338', scenario: 'tamper-order', status: 'FAILED' },
    { no: 'A12-B-339', scenario: 'tamper-key', status: 'FAILED' },
    { no: 'A12-B-340', scenario: 'waiting', status: 'CONFIRMING' },
];

for (const c of FAIL_CASES) {
    test(`${c.no} 결제사 ${c.scenario} → 장부 0·다이아 그대로·주문 ${c.status}`, async (t) => {
        if (h.noDb(t)) return;
        const { base, fake, product, user } = await setup(t);
        await h.fund(user, 'DIAMOND', 5);

        const { orderId, confirm } = await h.runTopup(base, user, fake, product, { scenario: c.scenario });
        assert.ok(confirm.status >= 400, JSON.stringify(confirm.body));

        const order = await h.orderOf(orderId);
        assert.equal(order.status, c.status);
        if (order.failure_code !== null) assert.match(order.failure_code, /^[A-Z0-9_]+$/);
        if (c.status !== 'CONFIRMING') assert.notEqual(order.failure_code, null);
        assert.equal((await topupRows(user)).length, 0);
        assert.equal((await h.walletOf(user)).diamond, 5);
    });
}

test('A12-B-341 응답 놓친 결제(lost-response) → 다음 조회가 마무리·GRANTED·장부 1', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);

    const { orderId, confirm } = await h.runTopup(base, user, fake, product, { scenario: 'lost-response' });
    assert.notEqual(confirm.body.status, 'GRANTED');
    assert.equal((await topupRows(user)).length, 0);

    const view = await h.call(base, user, 'GET', `/economy/topup/orders/${orderId}`);
    assert.equal(view.body.status, 'GRANTED', JSON.stringify(view.body));
    assert.equal((await topupRows(user)).length, 1);
    assert.equal((await h.walletOf(user)).diamond, 110);
});

test('A12-B-342 PENDING_GRANT 주문 → 새 로그인으로 열린 주문 찾기 → 조회 → GRANTED·장부 1줄', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);
    failTopupLedgerOnce(t);
    const { orderId, confirm } = await h.runTopup(base, user, fake, product);
    assert.equal(confirm.body.status, 'PENDING_GRANT');

    // 다른 브라우저 = 새 세션 토큰
    const token = h.tokenOf(user);
    const open = await h.call(base, null, 'GET', '/economy/topup/orders?state=open', undefined, { token });
    assert.equal(open.status, 200, JSON.stringify(open.body));
    assert.ok(open.body.orders.some((order) => order.orderId === orderId && order.status === 'PENDING_GRANT'));

    const view = await h.call(base, null, 'GET', `/economy/topup/orders/${orderId}`, undefined, { token });
    assert.equal(view.body.status, 'GRANTED', JSON.stringify(view.body));
    assert.equal((await topupRows(user)).length, 1);
});

test('A12-B-343 환불된 주문 다시 확인 → 409 ORDER_REFUNDED·장부 그대로', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);
    const { orderId, paymentKey, amount, confirm } = await h.runTopup(base, user, fake, product);
    assert.equal(confirm.body.status, 'GRANTED');
    // 관리자 서버가 환불한 것 흉내 (주문 상태만 REFUNDED)
    await h.models().EconomyTopupOrder.update({ status: 'REFUNDED' }, { where: { order_id: orderId } });
    const ledgerBefore = await h.ledgerOf(user);

    const res = await h.call(base, user, 'POST', `/economy/topup/orders/${orderId}/confirm`, { paymentKey, amount });
    h.assertCode(res, 409, 'ORDER_REFUNDED');
    assert.deepEqual(await h.ledgerOf(user), ledgerBefore);
});

test('A12-B-344 결제사 답에 긴 한글 글 → 주문 failure_code에 코드 모양만 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    // 결제사가 코드 칸에 사람 글을 넣어 거절하는 경우 흉내
    const longText = '카드사 사정으로 결제가 거절되었습니다. 고객센터로 문의해 주세요. '.repeat(5);
    const tweak = (fake) => {
        const original = fake.confirmPayment;
        fake.confirmPayment = async (request) => {
            await original(request);
            return { ok: false, outcome: 'REJECTED', code: longText };
        };
    };
    const { base, fake, product, user } = await setup(t, { tweak });

    const { orderId } = await h.runTopup(base, user, fake, product);
    const order = await h.orderOf(orderId);
    assert.equal(order.status, 'FAILED');
    assert.match(order.failure_code, /^[A-Z0-9_]{1,80}$/);
    assert.doesNotMatch(order.failure_code, /[가-힣]/);
});

test('A12-B-345 다른 주문 줄에 같은 결제 키 직접 넣기 → DB가 막음', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);
    const { paymentKey, confirm } = await h.runTopup(base, user, fake, product);
    assert.equal(confirm.body.status, 'GRANTED');

    await assert.rejects(
        h.models().EconomyTopupOrder.create({
            order_id: `a12d-${crypto.randomUUID()}`.slice(0, 64), user_id: user, product_id: product.product_id, version: 1,
            pay_amount: 1100, grant_amount: 100, bonus_amount: 10, order_name: '다이아 110개', status: 'CREATED', payment_key: paymentKey,
        }),
        { name: 'SequelizeUniqueConstraintError' },
    );
});

test('A12-B-346 결제 키 없는 CREATED 주문 3줄이 같이 있어도 됨 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const { base, product, user } = await setup(t);
    for (let i = 0; i < 3; i += 1) {
        const res = await h.call(base, user, 'POST', '/economy/topup/orders', { productId: product.product_id, version: 1 });
        assert.equal(res.status, 201, JSON.stringify(res.body));
    }
    const rows = await h.models().EconomyTopupOrder.findAll({ where: { user_id: user }, raw: true });
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.status === 'CREATED' && row.payment_key === null));
});

test('A12-B-347 하루 지난 CREATED 주문에 approve 확인 → 지급됨(서버가 시간으로 끝내지 않음) [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const { base, fake, product, user } = await setup(t);
    const created = await h.call(base, user, 'POST', '/economy/topup/orders', { productId: product.product_id, version: 1 });
    const { orderId, amount } = created.body;
    await h.db.sequelize.query('UPDATE economy_topup_orders SET created_at = DATE_SUB(created_at, INTERVAL 1 DAY) WHERE order_id = ?', { replacements: [orderId] });

    const paymentKey = h.newPaymentKey();
    fake.registerPayment(paymentKey, { orderId, amount });
    const res = await h.call(base, user, 'POST', `/economy/topup/orders/${orderId}/confirm`, { paymentKey, amount });
    assert.equal(res.body.status, 'GRANTED', JSON.stringify(res.body));
    assert.equal((await h.walletOf(user)).diamond, 110);
});
