'use strict';

// F-32a 재화 상품 조회·검증. 상품은 외부 작성자가 DB(economy_currency_products)에 등록하며
// 게임 서버는 **요청할 때마다** 그 테이블을 읽는다 — 캐시도, 코드 카탈로그 대체도, DB 오류 시
// 하드코딩 상품도 없다(docs/requirements/f32a-currency-products-contract.md). 읽은 행은
// 서버가 다시 검증하고, 유효하지 않은 행은 목록·주문에서 조용히 뺀다. DB 조회 실패는 빈
// 목록으로 바꾸지 않고 그대로 던져 5xx가 되게 한다.

const { createError } = require('../utils/appError');
const { MAX_BALANCE } = require('./economy.service');

const KINDS = Object.freeze({ DIAMOND_TOPUP: 'DIAMOND_TOPUP', GOLD_PURCHASE: 'GOLD_PURCHASE' });
const STATUSES = Object.freeze({ ON_SALE: 'ON_SALE', STOPPED: 'STOPPED' });

// 허용 조합은 둘뿐이다: 원화로 다이아를 사거나(DIAMOND_TOPUP), 다이아로 골드를 산다.
const ALLOWED_CURRENCY_PAIRS = Object.freeze({
    [KINDS.DIAMOND_TOPUP]: Object.freeze({ payCurrency: 'KRW', grantCurrency: 'DIAMOND' }),
    [KINDS.GOLD_PURCHASE]: Object.freeze({ payCurrency: 'DIAMOND', grantCurrency: 'GOLD' }),
});

const defaultDb = () => require('../models');

const isPositiveInt = (value) => Number.isSafeInteger(value) && value > 0;
const isNonNegativeInt = (value) => Number.isSafeInteger(value) && value >= 0;
const isNonEmptyString = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

const productModel = (db) => db.EconomyCurrencyProduct ?? db.sequelize.models.EconomyCurrencyProduct;

/**
 * DB 행 하나를 검증해 서버 내부 표현(camelCase)으로 바꾼다. 어긋난 곳이 있으면 null이다.
 * 숫자 컬럼은 정수 타입 그대로여야 한다(문자열·소수는 잘못된 행이다).
 */
const normalizeProductRow = (row) => {
    if (!row) return null;
    const {
        product_id: productId, kind, display_name: displayName,
        pay_currency: payCurrency, pay_amount: payAmount,
        grant_currency: grantCurrency, grant_amount: grantAmount,
        bonus_amount: bonusAmount, status, sort_order: sortOrder, version,
    } = row;

    if (!isNonEmptyString(productId, 64) || !isNonEmptyString(displayName, 100)) return null;
    const pair = ALLOWED_CURRENCY_PAIRS[kind];
    if (!pair || pair.payCurrency !== payCurrency || pair.grantCurrency !== grantCurrency) return null;
    if (!isPositiveInt(payAmount) || payAmount > MAX_BALANCE) return null;
    if (!isPositiveInt(grantAmount) || !isNonNegativeInt(bonusAmount)) return null;
    // 지급 합계는 기존 원장이 받아 주는 한도 안이어야 한다(그 밖은 지급 단계에서 거부된다).
    if (grantAmount + bonusAmount > MAX_BALANCE) return null;
    if (!isPositiveInt(version)) return null;
    if (status !== STATUSES.ON_SALE && status !== STATUSES.STOPPED) return null;
    if (!Number.isSafeInteger(sortOrder)) return null;

    return {
        productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount,
        status, sortOrder, version,
    };
};

/** 공개 응답 필드만 고른다 — status·sortOrder 같은 내부 값은 싣지 않는다. */
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

/**
 * 판매 중이고 유효한 상품 목록(sort_order, product_id 순). kind를 주면 그 종류만.
 * 유효하지 않은 행은 뺀다. DB 오류는 삼키지 않는다.
 */
const listCurrencyProducts = async ({ kind } = {}, db = defaultDb()) => {
    if (kind !== undefined && !Object.prototype.hasOwnProperty.call(KINDS, kind)) {
        throw createError('알 수 없는 상품 종류입니다.', 400, 'INVALID_PRODUCT_KIND');
    }
    const rows = await productModel(db).findAll({
        where: { status: STATUSES.ON_SALE, ...(kind ? { kind } : {}) },
        order: [['sort_order', 'ASC'], ['product_id', 'ASC']],
    });
    return rows
        .map(normalizeProductRow)
        .filter((product) => product && product.status === STATUSES.ON_SALE)
        // DB 정렬 규칙과 무관하게 목록 순서를 결정적으로 만든다.
        .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.productId < b.productId ? -1 : (a.productId > b.productId ? 1 : 0)))
        .map(toPublicProduct);
};

/**
 * 신규 주문 근거가 되는 상품 한 건을 읽는다. 부재·잘못된 행은 PRODUCT_NOT_FOUND, 판매 중지는
 * PRODUCT_STOPPED, 버전이 다르면 PRODUCT_VERSION_MISMATCH(현재 상품을 currentProduct에
 * 공개 필드로 실어)다. 성공하면 서버 내부 표현(status·sortOrder 포함)을 돌려준다.
 */
const getCurrencyProduct = async ({ productId, version, kind }, db = defaultDb(), { transaction = null } = {}) => {
    const notFound = () => createError('상품을 찾을 수 없습니다.', 404, 'PRODUCT_NOT_FOUND');
    if (!isNonEmptyString(productId, 64)) throw notFound();

    // 부모 트랜잭션이 주어지면(골드 구매) 같은 트랜잭션으로 읽는다 — 없으면 기존 호출과 같다.
    const row = await productModel(db).findOne({
        where: { product_id: productId },
        ...(transaction ? { transaction } : {}),
    });
    const product = normalizeProductRow(row);
    if (!product) throw notFound();
    if (kind !== undefined && product.kind !== kind) throw notFound();

    if (product.status !== STATUSES.ON_SALE) {
        throw createError('판매가 중지된 상품입니다.', 409, 'PRODUCT_STOPPED');
    }
    if (version !== product.version) {
        throw Object.assign(
            createError('상품 정보가 변경되었습니다.', 409, 'PRODUCT_VERSION_MISMATCH'),
            { currentProduct: toPublicProduct(product) },
        );
    }
    return product;
};

module.exports = {
    KINDS,
    STATUSES,
    ALLOWED_CURRENCY_PAIRS,
    normalizeProductRow,
    toPublicProduct,
    listCurrencyProducts,
    getCurrencyProduct,
};
