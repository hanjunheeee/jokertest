'use strict';

const { createError } = require('../../../utils/appError');
const { MAX_BALANCE } = require('..');

const KINDS = Object.freeze({ DIAMOND_TOPUP: 'DIAMOND_TOPUP', GOLD_PURCHASE: 'GOLD_PURCHASE' });
const STATUSES = Object.freeze({ ON_SALE: 'ON_SALE', STOPPED: 'STOPPED' });

const ALLOWED_CURRENCY_PAIRS = Object.freeze({
    [KINDS.DIAMOND_TOPUP]: Object.freeze({ payCurrency: 'KRW', grantCurrency: 'DIAMOND' }),
    [KINDS.GOLD_PURCHASE]: Object.freeze({ payCurrency: 'DIAMOND', grantCurrency: 'GOLD' }),
});

const defaultDb = () => require('../../../models');

const isPositiveInt = (value) => Number.isSafeInteger(value) && value > 0;
const isNonNegativeInt = (value) => Number.isSafeInteger(value) && value >= 0;
const isNonEmptyString = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

const productModel = (db) => db.EconomyCurrencyProduct ?? db.sequelize.models.EconomyCurrencyProduct;

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
    if (grantAmount + bonusAmount > MAX_BALANCE) return null;
    if (!isPositiveInt(version)) return null;
    if (status !== STATUSES.ON_SALE && status !== STATUSES.STOPPED) return null;
    if (!Number.isSafeInteger(sortOrder)) return null;

    return {
        productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount,
        status, sortOrder, version,
    };
};

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
        .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.productId < b.productId ? -1 : (a.productId > b.productId ? 1 : 0)))
        .map(toPublicProduct);
};

const getCurrencyProduct = async ({ productId, version, kind }, db = defaultDb(), { transaction = null } = {}) => {
    const notFound = () => createError('상품을 찾을 수 없습니다.', 404, 'PRODUCT_NOT_FOUND');
    if (!isNonEmptyString(productId, 64)) throw notFound();

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
