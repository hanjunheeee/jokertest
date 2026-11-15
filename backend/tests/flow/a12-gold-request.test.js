'use strict';

// 골드 구매 요청 몸 검사 시험: 진짜 경로(POST /economy/gold-purchases)에 요청 보내고 거절 코드·칸 길이·화면이 보낸 값 안 믿음을 지갑으로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-222~231 (돌리기: node --env-file=.env.test --test tests/flow/a12-gold-request.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const w = require('./a12-request-world');

// 골드 상품: 다이아 10 → 골드 100 (버전 1)
const PRODUCT = w.goldProductRow({ product_id: 'gold-100', pay_amount: 10, grant_amount: 100, bonus_amount: 0, version: 1 });

// 서버 + 다이아 50 가진 사람
const setup = async (t) => {
    const base = await w.startApp(t);
    const { db } = w.economyDb(t, { products: [PRODUCT] });
    const me = w.uid('a12-gold');
    w.seedWallet(db, me, { gold: 0, diamond: 50 });
    const cookie = w.login(me);
    const buy = (body) => w.call(base, 'POST', '/economy/gold-purchases', { cookie, body });
    const wallet = () => {
        const row = db._inspect.wallets.get(me);
        return { gold: row.balance_gold, diamond: row.balance_diamond };
    };
    return { db, me, buy, wallet };
};

const VALID = { productId: 'gold-100', version: 1, referenceEventId: 'gold-ref-1' };

// 400 + 코드, 지갑·장부 그대로
const assertRejected = async (c, body, code) => {
    const before = w.economyState(c.db);
    const res = await c.buy(body);
    assert.equal(res.status, 400, JSON.stringify(res.body));
    if (code) assert.equal(res.body.code, code);
    assert.equal(w.economyState(c.db), before, '지갑·장부가 바뀜');
};

// ── A12-B-222~226: 골드 구매 몸 검사 ──

// 칸 하나 뺀 몸
const without = (field) => Object.fromEntries(Object.entries(VALID).filter(([key]) => key !== field));
const noProduct = without('productId');
const noReference = without('referenceEventId');
const BODIES = [
    ['A12-B-222', 'productId 없음', noProduct, 'INVALID_GOLD_PURCHASE_REQUEST'],
    ['A12-B-223', '버전 0', { ...VALID, version: 0 }, 'INVALID_GOLD_PURCHASE_REQUEST'],
    ['A12-B-224', '버전 "1"(글자)', { ...VALID, version: '1' }, 'INVALID_GOLD_PURCHASE_REQUEST'],
    ['A12-B-225', 'referenceEventId 없음', noReference, 'INVALID_GOLD_PURCHASE_REQUEST'],
    ['A12-B-226', '모르는 칸 foo', { ...VALID, foo: 1 }, 'UNKNOWN_GOLD_PURCHASE_FIELD'],
];
for (const [id, label, body, code] of BODIES) {
    test(`${id} 골드 구매 ${label} → 400 ${code}, 지갑 그대로`, async (t) => {
        const c = await setup(t);
        await assertRejected(c, body, code);
    });
}

// ── A12-B-227~229: 칸 길이 ──

test('A12-B-227 상품 id 65자 → 400, 지갑 그대로', async (t) => {
    const c = await setup(t);
    await assertRejected(c, { ...VALID, productId: 'g'.repeat(65) }, null);
});

test('A12-B-228 참조 번호 150자 → 통과 (다이아 −10·골드 +100)', async (t) => {
    const c = await setup(t);
    const res = await c.buy({ ...VALID, referenceEventId: 'r'.repeat(150) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(c.wallet(), { gold: 100, diamond: 40 });
});

test('A12-B-229 참조 번호 151자 → 400, 지갑 그대로', async (t) => {
    const c = await setup(t);
    await assertRejected(c, { ...VALID, referenceEventId: 'r'.repeat(151) }, null);
});

// ── A12-B-230~231: 화면이 보낸 값·수량은 안 믿음 ──

const SNEAKY = [
    ['A12-B-230', 'price: 1', { price: 1 }],
    ['A12-B-231', 'grantAmount: 999999', { grantAmount: 999_999 }],
];
for (const [id, label, extra] of SNEAKY) {
    test(`${id} 몸에 ${label} 섞어 보냄 → 거절 없이 서버 상품 값으로 다이아 −10·골드 +100`, async (t) => {
        const c = await setup(t);
        const res = await c.buy({ ...VALID, ...extra });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.ok, true);
        assert.equal(res.body.balanceDiamond, 40);
        assert.equal(res.body.balanceGold, 100);
        assert.deepEqual(c.wallet(), { gold: 100, diamond: 40 });
    });
}
