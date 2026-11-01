'use strict';

// 재화 상품 입구, 옛 currencyProducts.service와 같은 이름만 골라 내보냄
// economy 경로·충전·골드 구매가 이 입구로 부름
const { KINDS, STATUSES, ALLOWED_CURRENCY_PAIRS } = require('./constants');
const { normalizeProductRow, toPublicProduct } = require('./normalize');
const { listCurrencyProducts, getCurrencyProduct } = require('./queries');

module.exports = {
    KINDS,
    STATUSES,
    ALLOWED_CURRENCY_PAIRS,
    normalizeProductRow,
    toPublicProduct,
    listCurrencyProducts,
    getCurrencyProduct,
};
