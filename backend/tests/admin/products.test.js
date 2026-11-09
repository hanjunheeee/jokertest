'use strict';

// 상품 값 규칙 단위 시험 (AD-192), DB 없이 — 어긴 칸 이름으로 400 INVALID_PRODUCT, 맞으면 게임 서버 검사(normalize)도 통과
// cd backend && npm test -- tests/admin/products.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { assertProductRules } = require('../../admin/services/products/manage');
const { normalizeProductRow } = require('../../services/economy/currencyProducts/normalize');

const good = Object.freeze({
    productId: 'diamond-110', kind: 'DIAMOND_TOPUP', displayName: '다이아 110개', payCurrency: 'KRW', payAmount: 1100,
    grantCurrency: 'DIAMOND', grantAmount: 100, bonusAmount: 10, status: 'ON_SALE', sortOrder: 1, version: 1,
});

const brokenField = (patch) => {
    try {
        assertProductRules({ ...good, ...patch });
        return null;
    } catch (error) {
        assert.equal(error.status, 400);
        assert.equal(error.code, 'INVALID_PRODUCT');
        return error.details.field;
    }
};

test('AD-192: 맞는 상품은 통과 + 게임 서버 상점 검사도 통과', () => {
    assert.equal(brokenField({}), null);
    assert.equal(brokenField({ productId: 'gold-500', kind: 'GOLD_PURCHASE', payCurrency: 'DIAMOND', grantCurrency: 'GOLD', bonusAmount: 0 }), null);
    assert.ok(normalizeProductRow({
        product_id: good.productId, kind: good.kind, display_name: good.displayName, pay_currency: good.payCurrency,
        pay_amount: good.payAmount, grant_currency: good.grantCurrency, grant_amount: good.grantAmount,
        bonus_amount: good.bonusAmount, status: good.status, sort_order: good.sortOrder, version: good.version,
    }));
});

test('AD-192: 규칙 어김 → 400 INVALID_PRODUCT { field: 어긴 칸 }', () => {
    const cases = [
        [{ productId: '' }, 'productId'],
        [{ productId: 'a/b' }, 'productId'],
        [{ productId: 'x'.repeat(65) }, 'productId'],
        [{ displayName: '' }, 'displayName'],
        [{ displayName: '   ' }, 'displayName'],
        [{ displayName: '가'.repeat(101) }, 'displayName'],
        [{ kind: 'ITEM' }, 'kind'],
        [{ payCurrency: 'DIAMOND' }, 'payCurrency'],
        [{ grantCurrency: 'GOLD' }, 'grantCurrency'],
        [{ payAmount: 0 }, 'payAmount'],
        [{ payAmount: 1.5 }, 'payAmount'],
        [{ payAmount: '1100' }, 'payAmount'],
        [{ payAmount: 1_000_000_001 }, 'payAmount'],
        [{ grantAmount: 0 }, 'grantAmount'],
        [{ bonusAmount: -1 }, 'bonusAmount'],
        [{ grantAmount: 999_999_999, bonusAmount: 2 }, 'grantAmount'],
        [{ status: 'DELETED' }, 'status'],
        [{ sortOrder: 'first' }, 'sortOrder'],
    ];
    for (const [patch, field] of cases) assert.equal(brokenField(patch), field, JSON.stringify(patch));
});
