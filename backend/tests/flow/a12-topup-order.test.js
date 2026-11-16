'use strict';

// 충전 주문 만들기 시험: 진짜 경로(POST /economy/topup/orders)에 요청 보내고 답·주문 줄을 가짜 DB로 봄, 결제사는 가짜
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-130~145 (돌리기: node --env-file=.env.test --test tests/flow/a12-topup-order.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const w = require('./a12-request-world');
const { createTossAdapter } = require('../../utils/adapters/toss');
const { installFakeAdapter } = require('../helpers/fakeTossAdapter');

// 지금 버전 3인 충전 상품 + 골드 상품 + 판매 중지 충전 상품
const PRODUCTS = [
    w.topupProductRow({ product_id: 'dia-100', version: 3 }),
    w.topupProductRow({ product_id: 'dia-stop', status: 'STOPPED', version: 1 }),
    w.goldProductRow({ product_id: 'gold-100', version: 1 }),
];

// 공개 상품 9칸
const PUBLIC_FIELDS = ['productId', 'kind', 'displayName', 'payCurrency', 'payAmount', 'grantCurrency', 'grantAmount', 'bonusAmount', 'version'];

// 서버 + 상품 + 가짜 결제사 + 로그인
const setup = async (t, { toss = true } = {}) => {
    const base = await w.startApp(t);
    const db = w.topupDb(t, { products: PRODUCTS });
    const fake = toss ? w.fakeToss(t) : null;
    const me = w.uid('a12-order');
    const cookie = w.login(me);
    const order = (body) => w.call(base, 'POST', '/economy/topup/orders', { cookie, body });
    return { db, fake, me, order };
};

test('A12-B-130 판매 중 충전 상품 + 지금 버전 → 201 {ok, orderId, amount, orderName, clientKey}, 주문 CREATED 1줄(상품 값 복사)', async (t) => {
    const c = await setup(t);
    const res = await c.order({ productId: 'dia-100', version: 3 });
    // 주문 줄이 새로 생기는 요청이라 201 (만들어짐)
    assert.equal(res.status, 201, `상태 ${res.status}`);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.orderId, 'string');
    assert.equal(res.body.amount, 1100);
    assert.equal(res.body.orderName, '다이아 100');
    assert.equal(res.body.clientKey, w.FAKE_CLIENT_KEY);
    const rows = c.db.orders();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].order_id, res.body.orderId);
    assert.equal(rows[0].status, 'CREATED');
    assert.equal(rows[0].user_id, c.me);
    assert.deepEqual(
        [rows[0].product_id, rows[0].version, rows[0].pay_amount, rows[0].grant_amount, rows[0].bonus_amount, rows[0].order_name],
        ['dia-100', 3, 1100, 100, 10, '다이아 100'],
    );
});

test('A12-B-131 몸에 amount → 400 UNKNOWN_TOPUP_ORDER_FIELD, 주문 0줄', async (t) => {
    const c = await setup(t);
    const res = await c.order({ productId: 'dia-100', version: 3, amount: 1 });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'UNKNOWN_TOPUP_ORDER_FIELD');
    assert.equal(c.db.orders().length, 0);
});

// ── A12-B-132~134: 버전 경계 ──

const VERSIONS = [
    ['A12-B-132', '지금−1', 2, false],
    ['A12-B-133', '지금', 3, true],
    ['A12-B-134', '지금+1', 4, false],
];
for (const [id, label, version, ok] of VERSIONS) {
    test(`${id} 버전 ${label}(${version}) → ${ok ? '됨' : '409 PRODUCT_VERSION_MISMATCH + 지금 상품, 주문 0줄'}`, async (t) => {
        const c = await setup(t);
        const res = await c.order({ productId: 'dia-100', version });
        if (ok) {
            assert.equal(res.body.ok, true, JSON.stringify(res.body));
            assert.equal(c.db.orders().length, 1);
            return;
        }
        assert.equal(res.status, 409);
        assert.equal(res.body.code, 'PRODUCT_VERSION_MISMATCH');
        // 지금 상품이 실리는 칸 이름은 product
        assert.equal(res.body.product?.productId, 'dia-100', '지금 상품이 안 실림');
        assert.equal(res.body.product?.version, 3);
        assert.equal(c.db.orders().length, 0);
    });
}

// ── A12-B-135~137: 살 수 없는 상품 ──

const UNSELLABLE = [
    ['A12-B-135', '없는 id', 'dia-none', 1, 404, 'PRODUCT_NOT_FOUND'],
    ['A12-B-136', '판매 중지', 'dia-stop', 1, 409, 'PRODUCT_STOPPED'],
    ['A12-B-137', '골드 상품 id로 충전', 'gold-100', 1, 404, null],
];
for (const [id, label, productId, version, status, code] of UNSELLABLE) {
    test(`${id} ${label} → ${status}${code ? ` ${code}` : ''}, 주문 0줄`, async (t) => {
        const c = await setup(t);
        const res = await c.order({ productId, version });
        assert.equal(res.status, status);
        if (code) assert.equal(res.body.code, code);
        assert.equal(c.db.orders().length, 0);
    });
}

// ── A12-B-138~141: 버전 모양 ──

const BAD_VERSIONS = [
    ['A12-B-138', '0', { version: 0 }],
    ['A12-B-139', '"1"(글자)', { version: '1' }],
    ['A12-B-140', '1.5', { version: 1.5 }],
    ['A12-B-141', '없음', {}],
];
for (const [id, label, versionPart] of BAD_VERSIONS) {
    test(`${id} 버전 ${label} → 400 INVALID_TOPUP_ORDER_REQUEST, 주문 0줄`, async (t) => {
        const c = await setup(t);
        const res = await c.order({ productId: 'dia-100', ...versionPart });
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_TOPUP_ORDER_REQUEST');
        assert.equal(c.db.orders().length, 0);
    });
}

test('A12-B-142 결제 설정 없음 → 503 CONFIG_MISSING, 주문 0줄', async (t) => {
    const c = await setup(t);
    c.fake.setConfigMissing(true);
    const res = await c.order({ productId: 'dia-100', version: 3 });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'CONFIG_MISSING');
    assert.equal(c.db.orders().length, 0);
});

test('A12-B-143 비밀 키는 안 나감: 응답 칸에 클라이언트 키만, 비밀 키 글자 없음', async (t) => {
    const c = await setup(t, { toss: false });
    // 진짜 어댑터 + 지어낸 키 묶음 (전송은 막아 둠, 주문 만들기는 결제사에 안 물음)
    const env = { TOSS_TEST_CLIENT_KEY: 'test_ck_A12ORDERFAKE0001', TOSS_TEST_SECRET_KEY: 'test_sk_A12ORDERSECRET0001' };
    installFakeAdapter(t, createTossAdapter({ getEnv: () => env, transport: async () => { throw new Error('결제사로 나가면 안 됨'); } }));
    const res = await c.order({ productId: 'dia-100', version: 3 });
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
    assert.equal(res.body.clientKey, env.TOSS_TEST_CLIENT_KEY);
    assert.ok(!res.text.includes(env.TOSS_TEST_SECRET_KEY), '비밀 키가 답에 실림');
    assert.ok(!res.text.includes('A12ORDERSECRET'), '비밀 키 조각이 답에 실림');
    assert.ok(!res.text.includes('test_sk_'), '비밀 키 앞말이 답에 실림');
});

test('A12-B-144 버전 거절 응답 product = 공개 9칸만 (판매 상태·정렬 없음)', async (t) => {
    const c = await setup(t);
    const res = await c.order({ productId: 'dia-100', version: 2 });
    assert.equal(res.status, 409);
    assert.ok(res.body.product, '응답에 product 없음');
    assert.deepEqual(Object.keys(res.body.product).sort(), [...PUBLIC_FIELDS].sort());
    assert.equal(res.body.product.payAmount, 1100);
});

test('A12-B-145 같은 상품 주문 두 번 → 주문 id 다른 CREATED 2줄', async (t) => {
    const c = await setup(t);
    const first = await c.order({ productId: 'dia-100', version: 3 });
    const second = await c.order({ productId: 'dia-100', version: 3 });
    assert.equal(first.body.ok, true);
    assert.equal(second.body.ok, true);
    assert.notEqual(first.body.orderId, second.body.orderId);
    const rows = c.db.orders();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.status), ['CREATED', 'CREATED']);
});
