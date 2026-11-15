'use strict';

// 충전 경로 오류 응답 모양 시험: 표에 없는 오류는 고정 글·내부 글자 없음, 모양 틀린 바뀐 상품은 응답에 안 붙임
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-220~221 (돌리기: node --env-file=.env.test --test tests/flow/a12-topup-errors.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const tw = require('./a12-topup-world');
const currencyProducts = require('../../services/economy/currencyProducts');
const { createError } = require('../../utils/appError');

test('A12-B-220 충전 경로에서 가짜 DB가 모르는 오류(글에 표 이름 섞음) → 500, 고정 글, 내부 글자 없음', async (t) => {
    const c = await tw.setupTopup(t);
    const bodies = [];
    for (const message of [
        "Table 'economy_topup_orders' doesn't exist (ER_NO_SUCH_TABLE)",
        "Unknown column 'economy_currency_products.secret_col' in 'field list'",
    ]) {
        c.db.hooks.productFind = () => { throw new Error(message); };
        const res = await tw.call(c.base, 'POST', '/economy/topup/orders', { cookie: c.cookie, body: { productId: 'dia-100', version: 3 } });
        assert.equal(res.status, 500);
        for (const inner of ['economy_topup_orders', 'economy_currency_products', 'ER_NO_SUCH_TABLE', 'secret_col', 'Unknown column']) {
            assert.ok(!res.text.includes(inner), `내부 글자 "${inner}"가 답에 실림`);
        }
        bodies.push(res.text);
    }
    // 고정 글: 다른 오류여도 답이 같음
    assert.equal(bodies[0], bodies[1]);
    assert.equal(c.db.orders().length, 0);
});

test('A12-B-221 바뀐 상품 칸 하나라도 모양 틀림(payAmount가 글자) → 409 응답에 currentProduct 없음', async (t) => {
    const c = await tw.setupTopup(t);
    const original = currencyProducts.getCurrencyProduct;
    currencyProducts.getCurrencyProduct = async () => {
        throw Object.assign(createError('상품 정보가 변경되었습니다.', 409, 'PRODUCT_VERSION_MISMATCH'), {
            currentProduct: {
                productId: 'dia-100', kind: 'DIAMOND_TOPUP', displayName: '다이아 100', payCurrency: 'KRW', payAmount: '1100',
                grantCurrency: 'DIAMOND', grantAmount: 100, bonusAmount: 10, version: 3,
            },
        });
    };
    t.after(() => { currencyProducts.getCurrencyProduct = original; });
    const res = await tw.call(c.base, 'POST', '/economy/topup/orders', { cookie: c.cookie, body: { productId: 'dia-100', version: 2 } });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'PRODUCT_VERSION_MISMATCH');
    assert.equal(res.body.currentProduct, undefined, '모양 틀린 상품이 붙음');
    // 다른 이름으로도 상품이 안 붙음
    assert.equal(res.body.product, undefined, '모양 틀린 상품이 다른 칸으로 붙음');
    assert.ok(!res.text.includes('"1100"'), '글자 결제값이 답에 실림');
});
