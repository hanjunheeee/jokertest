'use strict';

// 재화 상품 입구 파일, 상품 상수·행 검사·목록/하나 조회 내보냄
// economy/index.js·goldPurchase.js·topup/create.js·controllers/economy/topup.js가 부름 (시험이 이 객체 함수 갈아끼움)
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
