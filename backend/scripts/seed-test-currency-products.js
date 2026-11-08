#!/usr/bin/env node
'use strict';

// 로컬 확인용 재화 상품 시드 파일, 임시 가격의 다이아 충전 4개·골드 구매 4개를 economy_currency_products에 넣기
// 개발자가 직접 돌림 (node --env-file=.env scripts/seed-test-currency-products.js), 운영 상품은 외부가 DB에 넣음
const db = require('../models');

// 임시값 (운영 가격 아님, 운영자가 나중에 정함), 수량은 상점 묶음 그림(다이아 10·50·100·300, 금화 50·100·200·500)에 맞춤
const TEST_PRODUCTS = Object.freeze([
    { product_id: 'test-diamond-10', kind: 'DIAMOND_TOPUP', display_name: '다이아 10개', pay_currency: 'KRW', pay_amount: 1100, grant_currency: 'DIAMOND', grant_amount: 10, bonus_amount: 0, sort_order: 10 },
    { product_id: 'test-diamond-50', kind: 'DIAMOND_TOPUP', display_name: '다이아 50개', pay_currency: 'KRW', pay_amount: 5500, grant_currency: 'DIAMOND', grant_amount: 50, bonus_amount: 0, sort_order: 20 },
    { product_id: 'test-diamond-100', kind: 'DIAMOND_TOPUP', display_name: '다이아 100개', pay_currency: 'KRW', pay_amount: 11000, grant_currency: 'DIAMOND', grant_amount: 100, bonus_amount: 5, sort_order: 30 },
    { product_id: 'test-diamond-300', kind: 'DIAMOND_TOPUP', display_name: '다이아 300개', pay_currency: 'KRW', pay_amount: 33000, grant_currency: 'DIAMOND', grant_amount: 300, bonus_amount: 30, sort_order: 40 },
    { product_id: 'test-gold-50', kind: 'GOLD_PURCHASE', display_name: '금화 50개', pay_currency: 'DIAMOND', pay_amount: 5, grant_currency: 'GOLD', grant_amount: 50, bonus_amount: 0, sort_order: 110 },
    { product_id: 'test-gold-100', kind: 'GOLD_PURCHASE', display_name: '금화 100개', pay_currency: 'DIAMOND', pay_amount: 10, grant_currency: 'GOLD', grant_amount: 100, bonus_amount: 0, sort_order: 120 },
    { product_id: 'test-gold-200', kind: 'GOLD_PURCHASE', display_name: '금화 200개', pay_currency: 'DIAMOND', pay_amount: 20, grant_currency: 'GOLD', grant_amount: 200, bonus_amount: 0, sort_order: 130 },
    { product_id: 'test-gold-500', kind: 'GOLD_PURCHASE', display_name: '금화 500개', pay_currency: 'DIAMOND', pay_amount: 50, grant_currency: 'GOLD', grant_amount: 500, bonus_amount: 0, sort_order: 140 },
]);

// 비교할 칸 (값이 바뀌었을 때만 version 올림)
const FIELDS = ['kind', 'display_name', 'pay_currency', 'pay_amount', 'grant_currency', 'grant_amount', 'bonus_amount', 'sort_order'];

// 없으면 판매 중으로 넣고, 있으면 값이 다를 때만 고치고 version +1 (같으면 그대로)
const seed = async () => {
    const results = [];
    await db.sequelize.transaction(async (transaction) => {
        for (const product of TEST_PRODUCTS) {
            const current = await db.EconomyCurrencyProduct.findByPk(product.product_id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!current) {
                await db.EconomyCurrencyProduct.create({ ...product, status: 'ON_SALE', version: 1 }, { transaction });
                results.push(`${product.product_id}: 새로 넣음`);
                continue;
            }
            const changed = FIELDS.some((field) => current[field] !== product[field]) || current.status !== 'ON_SALE';
            if (!changed) {
                results.push(`${product.product_id}: 그대로`);
                continue;
            }
            await current.update({ ...product, status: 'ON_SALE', version: current.version + 1 }, { transaction });
            results.push(`${product.product_id}: 고침 (version ${current.version})`);
        }
    });
    return results;
};

// 운영 환경에선 안 돌림 (임시 가격이 운영 DB에 들어가지 않게)
const main = async () => {
    if (process.env.NODE_ENV === 'production') {
        console.error('운영 환경(NODE_ENV=production)에서는 시험 상품을 넣지 않습니다.');
        process.exitCode = 1;
        return;
    }
    try {
        for (const line of await seed()) console.log(line);
    } catch (error) {
        console.error(`시드 실패: ${error.name ?? 'Error'}`);
        process.exitCode = 1;
    } finally {
        await db.sequelize.close();
    }
};

if (require.main === module) main();

module.exports = { TEST_PRODUCTS, seed };
