'use strict';

// 경제 경로 로그인·남의 것 시험: 토큰 없이 18개 경로 → 401·DB 그대로, 남의 지갑·구매 결과·주문 → 403·404
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-094~117 (돌리기: node --env-file=.env.test --test tests/flow/a12-economy-access.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const w = require('./a12-request-world');

// 서버 + 아이템·지갑 가짜 DB + 충전 주문 표 (한 사람 골드 1000, 주문 1개)
const setupAll = async (t) => {
    const base = await w.startApp(t);
    const tdb = w.topupDb(t);
    const { db, couponTables } = w.economyDb(t, { coupons: [{ code: 'A12-ACCESS', reward_type: 'GOLD', reward_amount: 100 }] });
    // 충전 주문 표만 아이템 DB에 같이 얹음 (한 DB로 모든 경로)
    db.EconomyTopupOrder = tdb.EconomyTopupOrder;
    w.useDb(t, db);
    const me = w.uid('a12-acc');
    w.seedWallet(db, me, { gold: 1_000, diamond: 100 });
    const order = await w.seedOrder(tdb, { userId: me, status: 'CREATED' });
    const toss = w.fakeToss(t);
    toss.registerPayment('pk_a12_access_0001', { orderId: order.order_id, amount: order.pay_amount });
    return { base, db, tdb, toss, me, order, coupons: couponTables };
};

// 경로마다 (토큰 있으면 무언가 바뀌었을) 요청
const ROUTES = [
    ['A12-B-094', '지갑', (c) => ['GET', `/economy/accounts/${c.me}/wallet`]],
    ['A12-B-095', '가진 것', (c) => ['GET', `/economy/accounts/${c.me}/entitlements`]],
    ['A12-B-096', '거래 내역', (c) => ['GET', `/economy/accounts/${c.me}/transactions`]],
    ['A12-B-097', '단건 구매', () => ['POST', '/economy/purchase', { itemId: 'profile-border-남작', referenceEventId: 'r-097' }]],
    ['A12-B-098', '묶음 구매', () => ['POST', '/economy/purchases/bulk', { referenceEventId: 'r-098', items: [{ itemId: 'profile-border-남작' }] }]],
    ['A12-B-099', '결과 다시 묻기', () => ['GET', '/economy/purchases/r-099']],
    ['A12-B-100', '골드 구매', () => ['POST', '/economy/gold-purchases', { productId: 'gold-100', version: 1, referenceEventId: 'r-100' }]],
    ['A12-B-101', '끼우기', () => ['POST', '/economy/equip', { slot: 'PLAYER_CARD_FRAME', itemId: 'player-card-베이스', expectedRevision: 'rev' }]],
    ['A12-B-102', '사진·테두리 끼우기', () => ['POST', '/economy/equip-profile', { photoItemId: 'player-profile-기사', expectedRevision: 'rev' }]],
    ['A12-B-103', '관리자 보상', (c) => ['POST', '/economy/admin/grant', { userId: c.me, reason: 'QA_TEST_GRANT_GOLD', referenceEventId: 'r-103' }]],
    ['A12-B-104', '쿠폰', () => ['POST', '/economy/coupons/redeem', { code: 'A12-ACCESS' }]],
    ['A12-B-105', '상품 목록', () => ['GET', '/economy/currency-products']],
    ['A12-B-106', '주문 만들기', () => ['POST', '/economy/topup/orders', { productId: 'dia-100', version: 3 }]],
    ['A12-B-107', '결제 확인', (c) => ['POST', `/economy/topup/orders/${c.order.order_id}/confirm`, { paymentKey: 'pk_a12_access_0001', amount: c.order.pay_amount }]],
    ['A12-B-108', '열린 주문', () => ['GET', '/economy/topup/orders?state=open']],
    ['A12-B-109', '주문 하나', (c) => ['GET', `/economy/topup/orders/${c.order.order_id}`]],
    ['A12-B-110', '팔레트 읽기', () => ['GET', '/user/me/emoji-palette']],
    ['A12-B-111', '팔레트 저장', () => ['PUT', '/user/me/emoji-palette', { slots: Array(8).fill(null), expectedRevision: 'rev' }]],
];
for (const [id, label, requestOf] of ROUTES) {
    test(`${id} 토큰 없이 ${label} → 401, DB 안 바뀜`, async (t) => {
        const c = await setupAll(t);
        // 지갑·장부·가진 것·구매 요청·팔레트 + 주문 + 쿠폰 사용 기록
        const stateOf = () => [w.economyState(c.db), w.topupState(c.tdb), JSON.stringify([c.coupons.couponRows, c.coupons.redemptions])];
        const before = stateOf();
        const [method, path, body] = requestOf(c);
        const res = await w.call(c.base, method, path, { body });
        assert.equal(res.status, 401, JSON.stringify(res.body));
        assert.deepEqual(stateOf(), before, 'DB가 바뀜');
        assert.equal(c.toss.calls.length, 0, '결제사에 물음');
    });
}

// ── A12-B-112~117: 남의 것은 못 봄 ──

// 나와 남 둘 (남은 골드·다이아·주문을 가짐)
const setupPair = async (t) => {
    const c = await setupAll(t);
    const other = w.uid('a12-acc-other');
    w.seedWallet(c.db, other, { gold: 500, diamond: 50 });
    const otherOrder = await w.seedOrder(c.tdb, { userId: other, status: 'CREATED' });
    c.toss.registerPayment('pk_a12_access_other', { orderId: otherOrder.order_id, amount: otherOrder.pay_amount });
    return { ...c, other, otherOrder, cookie: w.login(c.me) };
};

const OTHERS_ACCOUNT = [
    ['A12-B-112', '지갑', 'wallet'],
    ['A12-B-113', '가진 것', 'entitlements'],
    ['A12-B-114', '거래 내역', 'transactions'],
];
for (const [id, label, tail] of OTHERS_ACCOUNT) {
    test(`${id} 경로에 남 uuid: ${label} → 403 ECONOMY_FORBIDDEN`, async (t) => {
        const c = await setupPair(t);
        const before = w.economyState(c.db);
        const res = await w.call(c.base, 'GET', `/economy/accounts/${c.other}/${tail}`, { cookie: c.cookie });
        assert.equal(res.status, 403);
        assert.equal(res.body.code, 'ECONOMY_FORBIDDEN');
        assert.ok(!res.text.includes('"balanceGold"'), '남의 잔액이 답에 실림');
        assert.equal(w.economyState(c.db), before);
    });
}

test('A12-B-115 남의 구매 번호 결과 → 404, 남의 구매 그대로', async (t) => {
    const c = await setupPair(t);
    const otherCookie = w.login(c.other);
    const bought = await w.call(c.base, 'POST', '/economy/purchase', {
        cookie: otherCookie, body: { itemId: 'profile-border-남작', referenceEventId: 'r-115-other' },
    });
    assert.equal(bought.status, 201, '준비: 남이 삼');
    const before = w.economyState(c.db);
    const res = await w.call(c.base, 'GET', '/economy/purchases/r-115-other', { cookie: c.cookie });
    assert.equal(res.status, 404);
    assert.equal(w.economyState(c.db), before);
});

test('A12-B-116 남의 주문 조회 → 403 NOT_OWNER, 남의 주문 상태·장부 그대로', async (t) => {
    const c = await setupPair(t);
    const before = w.topupState(c.tdb);
    const res = await w.call(c.base, 'GET', `/economy/topup/orders/${c.otherOrder.order_id}`, { cookie: c.cookie });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'NOT_OWNER');
    assert.equal(w.topupState(c.tdb), before);
    assert.equal(c.toss.calls.length, 0);
});

test('A12-B-117 남의 주문 확인 → 403 NOT_OWNER, 남의 주문 상태·장부 그대로', async (t) => {
    const c = await setupPair(t);
    const before = w.topupState(c.tdb);
    const res = await w.call(c.base, 'POST', `/economy/topup/orders/${c.otherOrder.order_id}/confirm`, {
        cookie: c.cookie, body: { paymentKey: 'pk_a12_access_other', amount: c.otherOrder.pay_amount },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'NOT_OWNER');
    assert.equal(w.topupState(c.tdb), before);
    assert.equal(c.tdb.order(c.otherOrder.order_id).status, 'CREATED');
    assert.equal(c.toss.calls.length, 0);
});
