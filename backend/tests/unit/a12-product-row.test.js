'use strict';

// 재화 상품 행 검사 시험: DB 행 하나 넣고 상품으로 받아지는지·빠지는지, 화면에 보내는 칸만 남는지 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-022~044 (돌리기: node --env-file=.env.test --test tests/unit/a12-product-row.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeProductRow, toPublicProduct } = require('../../services/economy/currencyProducts');

// 맞는 충전 행 (원화 → 다이아)
const topupRow = (overrides = {}) => ({
    product_id: 'dia-100',
    kind: 'DIAMOND_TOPUP',
    display_name: '다이아 100',
    pay_currency: 'KRW',
    pay_amount: 1100,
    grant_currency: 'DIAMOND',
    grant_amount: 100,
    bonus_amount: 0,
    status: 'ON_SALE',
    sort_order: 1,
    version: 1,
    ...overrides,
});

// 맞는 골드 행 (다이아 → 골드)
const goldRow = (overrides = {}) => topupRow({
    product_id: 'gold-100', kind: 'GOLD_PURCHASE', display_name: '골드 100',
    pay_currency: 'DIAMOND', pay_amount: 10, grant_currency: 'GOLD', grant_amount: 100, ...overrides,
});

// 상품이면 받은 값이 행 값 그대로인지, 빠짐이면 null
const assertKept = (row) => {
    const product = normalizeProductRow(row);
    assert.notEqual(product, null, '상품으로 안 받아짐');
    assert.equal(product.productId, row.product_id);
    assert.equal(product.payAmount, row.pay_amount);
    assert.equal(product.grantAmount, row.grant_amount);
    assert.equal(product.bonusAmount, row.bonus_amount);
};
const assertDropped = (row) => assert.equal(normalizeProductRow(row), null, '잘못된 행이 상품으로 받아짐');

// ── A12-B-022~036: 잘못된 행은 목록·주문에서 빠짐 ──

const ROWS = [
    ['A12-B-022', '맞는 충전 행(KRW→DIAMOND)', topupRow(), true],
    ['A12-B-023', '맞는 골드 행(DIAMOND→GOLD)', goldRow(), true],
    ['A12-B-024', 'KRW→GOLD (원화로 골드)', goldRow({ pay_currency: 'KRW' }), false],
    ['A12-B-025', 'DIAMOND→DIAMOND', topupRow({ pay_currency: 'DIAMOND' }), false],
    ['A12-B-026', 'GOLD→DIAMOND (역교환)', goldRow({ pay_currency: 'GOLD', grant_currency: 'DIAMOND' }), false],
    ['A12-B-027', '결제 0', topupRow({ pay_amount: 0 }), false],
    ['A12-B-028', '결제 −1', topupRow({ pay_amount: -1 }), false],
    ['A12-B-029', '결제 1', topupRow({ pay_amount: 1 }), true],
    ['A12-B-030', '지급 0', topupRow({ grant_amount: 0 }), false],
    ['A12-B-031', '지급 1', topupRow({ grant_amount: 1 }), true],
    ['A12-B-032', '덤 −1', topupRow({ bonus_amount: -1 }), false],
    ['A12-B-033', '덤 0', topupRow({ bonus_amount: 0 }), true],
    ['A12-B-034', '결제 1.5', topupRow({ pay_amount: 1.5 }), false],
    ['A12-B-035', '종류 모름', topupRow({ kind: 'GEM_TOPUP' }), false],
    ['A12-B-036', '판매 상태 DELETED', topupRow({ status: 'DELETED' }), false],
];
for (const [id, label, row, kept] of ROWS) {
    test(`${id} 상품 행 ${label} → ${kept ? '상품' : '빠짐'}`, () => (kept ? assertKept(row) : assertDropped(row)));
}

// ── A12-B-037~041: 칸 길이·버전 ──

const SHAPES = [
    ['A12-B-037', '버전 0', topupRow({ version: 0 }), false],
    ['A12-B-038', '상품 id 64자', topupRow({ product_id: 'p'.repeat(64) }), true],
    ['A12-B-039', '상품 id 65자', topupRow({ product_id: 'p'.repeat(65) }), false],
    ['A12-B-040', '이름 빈 글자', topupRow({ display_name: '' }), false],
    ['A12-B-041', '이름 101자', topupRow({ display_name: '가'.repeat(101) }), false],
];
for (const [id, label, row, kept] of SHAPES) {
    test(`${id} 상품 행 ${label} → ${kept ? '상품' : '빠짐'}`, () => (kept ? assertKept(row) : assertDropped(row)));
}

// ── A12-B-042~043: 지급+덤 합 10억 경계 ──

test('A12-B-042 지급+덤 = 1,000,000,000 → 상품', () => {
    assertKept(topupRow({ grant_amount: 999_999_000, bonus_amount: 1_000 }));
});

test('A12-B-043 지급+덤 = 1,000,000,001 → 빠짐', () => {
    assertDropped(topupRow({ grant_amount: 999_999_000, bonus_amount: 1_001 }));
});

// ── A12-B-044: 화면에 보내는 상품 칸 ──

test('A12-B-044 공개 상품 = 9칸만 (판매 상태·정렬 순서 없음)', () => {
    const row = topupRow({ bonus_amount: 10, sort_order: 7, version: 4 });
    const shown = toPublicProduct(normalizeProductRow(row));
    assert.deepEqual(shown, {
        productId: 'dia-100',
        kind: 'DIAMOND_TOPUP',
        displayName: '다이아 100',
        payCurrency: 'KRW',
        payAmount: 1100,
        grantCurrency: 'DIAMOND',
        grantAmount: 100,
        bonusAmount: 10,
        version: 4,
    });
});
