'use strict';

// 재화 상품 상수 파일, 상품 종류·판매 상태·종류별 통화 짝
// currencyProducts/normalize.js·queries.js·index.js가 씀

// 다이아 충전 · 골드 구매 두 가지
const KINDS = Object.freeze({ DIAMOND_TOPUP: 'DIAMOND_TOPUP', GOLD_PURCHASE: 'GOLD_PURCHASE' });

// 판매 중 · 판매 중지
const STATUSES = Object.freeze({ ON_SALE: 'ON_SALE', STOPPED: 'STOPPED' });

// 종류마다 내는 통화·받는 통화가 정해져 있음 (어긋난 행은 버림)
const ALLOWED_CURRENCY_PAIRS = Object.freeze({
    [KINDS.DIAMOND_TOPUP]: Object.freeze({ payCurrency: 'KRW', grantCurrency: 'DIAMOND' }),
    [KINDS.GOLD_PURCHASE]: Object.freeze({ payCurrency: 'DIAMOND', grantCurrency: 'GOLD' }),
});

module.exports = {
    KINDS,
    STATUSES,
    ALLOWED_CURRENCY_PAIRS,
};
