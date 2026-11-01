'use strict';

// 재화 상품 행 검사 파일, DB 행을 믿을 수 있는 상품 모양으로 + 공개 모양
// currencyProducts/queries.js·index.js가 씀
const { MAX_BALANCE } = require('../constants');
const { ALLOWED_CURRENCY_PAIRS, STATUSES } = require('./constants');

// 1 이상 안전한 정수
const isPositiveInt = (value) => Number.isSafeInteger(value) && value > 0;

// 0 이상 안전한 정수
const isNonNegativeInt = (value) => Number.isSafeInteger(value) && value >= 0;

// 비어 있지 않고 최대 길이 안 넘는 문자열
const isNonEmptyString = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

// 값 하나라도 이상하면 null (잘못 넣은 행이 팔리지 않게)
const normalizeProductRow = (row) => {
    if (!row) return null;
    const {
        product_id: productId, kind, display_name: displayName,
        pay_currency: payCurrency, pay_amount: payAmount,
        grant_currency: grantCurrency, grant_amount: grantAmount,
        bonus_amount: bonusAmount, status, sort_order: sortOrder, version,
    } = row;

    // id·이름 길이
    if (!isNonEmptyString(productId, 64) || !isNonEmptyString(displayName, 100)) return null;
    // 종류마다 정해진 통화 짝만 (원화로 골드 팔기 같은 행 막기)
    const pair = ALLOWED_CURRENCY_PAIRS[kind];
    if (!pair || pair.payCurrency !== payCurrency || pair.grantCurrency !== grantCurrency) return null;
    // 값·지급량은 양의 정수, 합계도 최대 잔액 안
    if (!isPositiveInt(payAmount) || payAmount > MAX_BALANCE) return null;
    if (!isPositiveInt(grantAmount) || !isNonNegativeInt(bonusAmount)) return null;
    if (grantAmount + bonusAmount > MAX_BALANCE) return null;
    // 버전·판매 상태·정렬 순서 모양
    if (!isPositiveInt(version)) return null;
    if (status !== STATUSES.ON_SALE && status !== STATUSES.STOPPED) return null;
    if (!Number.isSafeInteger(sortOrder)) return null;

    return {
        productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount,
        status, sortOrder, version,
    };
};

// 화면에 보낼 값만 (판매 상태·정렬 순서는 뺌)
const toPublicProduct = (product) => ({
    productId: product.productId,
    kind: product.kind,
    displayName: product.displayName,
    payCurrency: product.payCurrency,
    payAmount: product.payAmount,
    grantCurrency: product.grantCurrency,
    grantAmount: product.grantAmount,
    bonusAmount: product.bonusAmount,
    version: product.version,
});

module.exports = {
    isNonEmptyString,
    normalizeProductRow,
    toPublicProduct,
};
