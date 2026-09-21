'use strict';

// F-32a currencyProducts.service.js 단위 시험 — 행 검증·목록 순서·주문용 조회. 인메모리 fake db 사용
// (실제 DB 반영 시험은 tests/db/f32a-topup.integration.test.js). 상품 수치는 자동 시험용 임시값이다.

const test = require('node:test');
const assert = require('node:assert/strict');

const products = require('./currencyProducts.service');
const { createFakeTopupDb } = require('../tests/helpers/fakeTopupDb');

const ROW = Object.freeze({
    product_id: 'p-1', kind: 'DIAMOND_TOPUP', display_name: '시험 상품(임시값)', pay_currency: 'KRW', pay_amount: 1000,
    grant_currency: 'DIAMOND', grant_amount: 100, bonus_amount: 10, status: 'ON_SALE', sort_order: 0, version: 1,
});

const INVALID_ROWS = {
    '통화 조합(다이아→다이아)': { pay_currency: 'DIAMOND', grant_currency: 'DIAMOND' },
    '충전인데 골드 지급': { grant_currency: 'GOLD' },
    '골드 구매를 원화로': { kind: 'GOLD_PURCHASE', pay_currency: 'KRW', grant_currency: 'GOLD' },
    '가격 0': { pay_amount: 0 },
    '가격 음수': { pay_amount: -1 },
    '가격 소수': { pay_amount: 10.5 },
    '가격 문자열': { pay_amount: '1000' },
    '지급량 0': { grant_amount: 0 },
    '지급량 소수': { grant_amount: 1.5 },
    '보너스 음수': { bonus_amount: -1 },
    '보너스 소수': { bonus_amount: 0.5 },
    '지급 합계 한도 초과': { grant_amount: 1_000_000_000, bonus_amount: 1 },
    '가격 한도 초과': { pay_amount: 1_000_000_001 },
    '버전 0': { version: 0 },
    '버전 소수': { version: 1.5 },
    '알 수 없는 종류': { kind: 'SKIN' },
    '알 수 없는 상태': { status: 'HIDDEN' },
    '소문자 상태': { status: 'on_sale' },
    '빈 표시 이름': { display_name: '' },
    '빈 상품 ID': { product_id: '' },
    '65자 상품 ID': { product_id: 'p'.repeat(65) },
    '정렬 순서 소수': { sort_order: 0.5 },
};

test('normalizeProductRow: 유효한 행은 내부 표현으로, 어긋난 행은 null', () => {
    assert.deepEqual(products.normalizeProductRow(ROW), {
        productId: 'p-1', kind: 'DIAMOND_TOPUP', displayName: '시험 상품(임시값)', payCurrency: 'KRW', payAmount: 1000,
        grantCurrency: 'DIAMOND', grantAmount: 100, bonusAmount: 10, status: 'ON_SALE', sortOrder: 0, version: 1,
    });
    assert.notEqual(products.normalizeProductRow({ ...ROW, bonus_amount: 0 }), null, '보너스 0은 유효하다');
    assert.notEqual(products.normalizeProductRow({ ...ROW, status: 'STOPPED' }), null, '중지 상품도 유효한 행이다');
    assert.notEqual(products.normalizeProductRow({ ...ROW, kind: 'GOLD_PURCHASE', pay_currency: 'DIAMOND', grant_currency: 'GOLD' }), null);
    assert.equal(products.normalizeProductRow(null), null);
    for (const [label, overrides] of Object.entries(INVALID_ROWS)) {
        assert.equal(products.normalizeProductRow({ ...ROW, ...overrides }), null, label);
    }
});

test('목록: 판매 중이고 유효한 행만 sort_order·product_id 순으로, 공개 필드만 돌려준다', async () => {
    const db = createFakeTopupDb();
    db.addProduct({ ...ROW, product_id: 'b', sort_order: 1 });
    db.addProduct({ ...ROW, product_id: 'a', sort_order: 1 });
    db.addProduct({ ...ROW, product_id: 'first', sort_order: 0 });
    db.addProduct({ ...ROW, product_id: 'gold', kind: 'GOLD_PURCHASE', pay_currency: 'DIAMOND', grant_currency: 'GOLD', sort_order: 2 });
    db.addProduct({ ...ROW, product_id: 'stopped', status: 'STOPPED' });
    // 어긋난 값이 product_id 자체인 행도 있으므로 overrides가 마지막에 와야 한다.
    for (const [label, overrides] of Object.entries(INVALID_ROWS)) db.addProduct({ ...ROW, product_id: `bad-${label}`, ...overrides });

    const all = await products.listCurrencyProducts({}, db);
    assert.deepEqual(all.map((p) => p.productId), ['first', 'a', 'b', 'gold']);
    assert.deepEqual(Object.keys(all[0]).sort(), [
        'bonusAmount', 'displayName', 'grantAmount', 'grantCurrency', 'kind', 'payAmount', 'payCurrency', 'productId', 'version',
    ]);
    assert.deepEqual((await products.listCurrencyProducts({ kind: 'GOLD_PURCHASE' }, db)).map((p) => p.productId), ['gold']);
    assert.deepEqual((await products.listCurrencyProducts({ kind: 'DIAMOND_TOPUP' }, db)).map((p) => p.productId), ['first', 'a', 'b']);
});

test('목록: 빈 상품표는 빈 배열, 알 수 없는 kind는 400, DB 오류는 삼키지 않는다', async () => {
    const db = createFakeTopupDb();
    assert.deepEqual(await products.listCurrencyProducts({}, db), []);
    await assert.rejects(products.listCurrencyProducts({ kind: 'SKIN' }, db), { code: 'INVALID_PRODUCT_KIND', status: 400 });

    db.addProduct(ROW);
    db.hooks.productFind = () => { throw Object.assign(new Error('boom'), { code: 'ER_INJECTED' }); };
    await assert.rejects(products.listCurrencyProducts({}, db), { code: 'ER_INJECTED' });
});

test('요청마다 DB를 읽는다 — 등록·수정·중지·삭제가 다음 조회에 바로 반영된다', async () => {
    const db = createFakeTopupDb();
    assert.deepEqual(await products.listCurrencyProducts({}, db), []);

    db.addProduct(ROW);
    assert.equal((await products.listCurrencyProducts({}, db)).length, 1);

    db.updateProduct('p-1', { pay_amount: 2000, version: 2 });
    const [changed] = await products.listCurrencyProducts({}, db);
    assert.deepEqual([changed.payAmount, changed.version], [2000, 2]);

    db.updateProduct('p-1', { status: 'STOPPED', version: 3 });
    assert.deepEqual(await products.listCurrencyProducts({}, db), []);

    db.deleteProduct('p-1');
    await assert.rejects(products.getCurrencyProduct({ productId: 'p-1', version: 3 }, db), { code: 'PRODUCT_NOT_FOUND' });
});

test('주문용 조회: 부재·중지·버전 불일치를 구분하고 성공하면 내부 표현을 돌려준다', async () => {
    const db = createFakeTopupDb();
    db.addProduct(ROW);
    db.addProduct({ ...ROW, product_id: 'stopped', status: 'STOPPED' });
    db.addProduct({ ...ROW, product_id: 'bad', pay_amount: 0 });
    db.addProduct({ ...ROW, product_id: 'gold', kind: 'GOLD_PURCHASE', pay_currency: 'DIAMOND', grant_currency: 'GOLD' });

    const ok = await products.getCurrencyProduct({ productId: 'p-1', version: 1, kind: 'DIAMOND_TOPUP' }, db);
    assert.deepEqual([ok.productId, ok.payAmount, ok.grantAmount, ok.bonusAmount, ok.version], ['p-1', 1000, 100, 10, 1]);

    await assert.rejects(products.getCurrencyProduct({ productId: 'missing', version: 1 }, db), { code: 'PRODUCT_NOT_FOUND', status: 404 });
    await assert.rejects(products.getCurrencyProduct({ productId: 123, version: 1 }, db), { code: 'PRODUCT_NOT_FOUND' });
    await assert.rejects(products.getCurrencyProduct({ productId: 'bad', version: 1 }, db), { code: 'PRODUCT_NOT_FOUND' });
    await assert.rejects(products.getCurrencyProduct({ productId: 'gold', version: 1, kind: 'DIAMOND_TOPUP' }, db), { code: 'PRODUCT_NOT_FOUND' });
    await assert.rejects(products.getCurrencyProduct({ productId: 'stopped', version: 1 }, db), { code: 'PRODUCT_STOPPED', status: 409 });
    await assert.rejects(products.getCurrencyProduct({ productId: 'stopped', version: 99 }, db), { code: 'PRODUCT_STOPPED' }, '중지가 버전 불일치보다 먼저 판정된다');
    await assert.rejects(products.getCurrencyProduct({ productId: 'p-1', version: 2 }, db), (error) => {
        assert.equal(error.code, 'PRODUCT_VERSION_MISMATCH');
        assert.equal(error.status, 409);
        assert.equal(error.currentProduct.version, 1);
        assert.ok(!('status' in error.currentProduct) && !('sortOrder' in error.currentProduct), '현재 상품은 공개 필드만');
        return true;
    });
});
