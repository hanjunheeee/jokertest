'use strict';

// 재화 상품 목록 시험: 진짜 경로(GET /economy/currency-products)에 요청 보내고 거르기·정렬·빈 목록·DB 실패·바로 반영·저장 금지 머리글을 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-118~129 (돌리기: node --env-file=.env.test --test tests/flow/a12-currency-products.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const w = require('./a12-request-world');

// 충전 행 하나 + 골드 행 하나 (DB 칸 이름)
const TOPUP = w.topupProductRow({ product_id: 'dia-100', sort_order: 1 });
const GOLD = w.goldProductRow({ product_id: 'gold-100', sort_order: 2 });

// 서버 + 상품 표 + 로그인
const setup = async (t, products) => {
    const base = await w.startApp(t);
    const db = w.topupDb(t, { products });
    const cookie = w.login(w.uid('a12-prod'));
    const list = (query = '') => w.call(base, 'GET', `/economy/currency-products${query}`, { cookie });
    return { db, list };
};

const idsOf = (res) => res.body.products.map((product) => product.productId);

// ── A12-B-118~120: 종류 거르기 ──

const KINDS = [
    ['A12-B-118', 'kind 없음', '', ['dia-100', 'gold-100']],
    ['A12-B-119', 'kind=DIAMOND_TOPUP', '?kind=DIAMOND_TOPUP', ['dia-100']],
    ['A12-B-120', 'kind=GOLD_PURCHASE', '?kind=GOLD_PURCHASE', ['gold-100']],
];
for (const [id, label, query, expected] of KINDS) {
    test(`${id} 상품 목록 ${label} → ${expected.join('·')}`, async (t) => {
        const { list } = await setup(t, [TOPUP, GOLD]);
        const res = await list(query);
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
        assert.deepEqual(idsOf(res).sort(), [...expected].sort());
    });
}

test('A12-B-121 모르는 종류 kind=GOLD → 400 INVALID_PRODUCT_KIND', async (t) => {
    const { list } = await setup(t, [TOPUP, GOLD]);
    const res = await list('?kind=GOLD');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_PRODUCT_KIND');
});

test('A12-B-122 판매 중지는 안 보임: ON_SALE 2 · STOPPED 1 → 2개', async (t) => {
    const { list } = await setup(t, [TOPUP, GOLD, w.topupProductRow({ product_id: 'dia-stop', status: 'STOPPED', sort_order: 3 })]);
    const res = await list();
    assert.equal(res.status, 200);
    assert.deepEqual(idsOf(res).sort(), ['dia-100', 'gold-100']);
});

test('A12-B-123 잘못된 행은 안 보임: 맞는 행 1 + 원화로 골드 파는 행 1 → 1개, 오류 아님', async (t) => {
    const bad = w.goldProductRow({ product_id: 'gold-krw', pay_currency: 'KRW', pay_amount: 1100 });
    const { list } = await setup(t, [TOPUP, bad]);
    const res = await list();
    assert.equal(res.status, 200);
    assert.deepEqual(idsOf(res), ['dia-100']);
});

test('A12-B-124 정렬 순서 sort_order 3·1·2 → 1·2·3 순', async (t) => {
    const { list } = await setup(t, [
        w.topupProductRow({ product_id: 'dia-c', sort_order: 3 }),
        w.topupProductRow({ product_id: 'dia-a', sort_order: 1 }),
        w.topupProductRow({ product_id: 'dia-b', sort_order: 2 }),
    ]);
    const res = await list();
    assert.deepEqual(idsOf(res), ['dia-a', 'dia-b', 'dia-c']);
});

test('A12-B-125 정렬 순서 같으면 상품 id 글자 순', async (t) => {
    const { list } = await setup(t, [
        w.topupProductRow({ product_id: 'dia-zeta', sort_order: 1 }),
        w.topupProductRow({ product_id: 'dia-alpha', sort_order: 1 }),
    ]);
    const res = await list();
    assert.deepEqual(idsOf(res), ['dia-alpha', 'dia-zeta']);
});

test('A12-B-126 상품 없음 → 200 products: []', async (t) => {
    const { list } = await setup(t, []);
    const res = await list();
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.products, []);
});

test('A12-B-127 DB 읽기 오류 → 5xx, 빈 목록으로 속이지 않음', async (t) => {
    const { db, list } = await setup(t, [TOPUP]);
    db.hooks.productFind = () => { throw new Error('connect ECONNREFUSED'); };
    const res = await list();
    assert.ok(res.status >= 500 && res.status < 600, `상태 ${res.status}`);
    assert.equal(res.body.products, undefined, '빈 목록을 줌');
});

test('A12-B-128 고치면 다음 요청에 바로: 행 값 바꿈(서버 다시 안 켬) → 새 값·새 버전', async (t) => {
    const { db, list } = await setup(t, [TOPUP]);
    const first = await list();
    assert.equal(first.body.products[0].payAmount, 1100);
    db.updateProduct('dia-100', { pay_amount: 1200, version: 4 });
    const second = await list();
    assert.equal(second.body.products[0].payAmount, 1200);
    assert.equal(second.body.products[0].version, 4);
});

test('A12-B-129 목록 답 머리글 Cache-Control: no-store', async (t) => {
    const { list } = await setup(t, [TOPUP]);
    const res = await list();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});
