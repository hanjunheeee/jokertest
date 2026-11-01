'use strict';

// 재화 상품 조회 파일, 판매 목록 · 상품 하나 (판매·버전 확인)
// currencyProducts/index.js 거쳐 controllers/economy/topup.js(목록)·topup/create.js·goldPurchase.js(하나)가 부름
const { createError } = require('../../../utils/appError');
const { KINDS, STATUSES } = require('./constants');
const { normalizeProductRow, toPublicProduct, isNonEmptyString } = require('./normalize');
const productRepository = require('../../../repositories/economy/currencyProduct');

// db 안 넘기면 진짜 models (부를 때 require, 가짜 db 넘기는 시험은 진짜 DB 안 엶)
const defaultDb = () => require('../../../repositories/common/db');

// 판매 중인 것만, 정렬 순서 → id 순
const listCurrencyProducts = async ({ kind } = {}, db = defaultDb()) => {
    // 모르는 종류 거절
    if (kind !== undefined && !Object.prototype.hasOwnProperty.call(KINDS, kind)) {
        throw createError('알 수 없는 상품 종류입니다.', 400, 'INVALID_PRODUCT_KIND');
    }
    // 이상한 행은 빼고 공개 모양으로
    const rows = await productRepository.listByStatus(db, { status: STATUSES.ON_SALE, kind });
    return rows
        .map(normalizeProductRow)
        .filter((product) => product && product.status === STATUSES.ON_SALE)
        .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.productId < b.productId ? -1 : (a.productId > b.productId ? 1 : 0)))
        .map(toPublicProduct);
};

// 없음·종류 다름은 404, 판매 중지·버전 바뀜은 409 (바뀐 상품 같이 줌)
const getCurrencyProduct = async ({ productId, version, kind }, db = defaultDb(), { transaction = null } = {}) => {
    // id 모양 틀리면 DB 안 가고 404
    const notFound = () => createError('상품을 찾을 수 없습니다.', 404, 'PRODUCT_NOT_FOUND');
    if (!isNonEmptyString(productId, 64)) throw notFound();

    // 없음·이상한 행·다른 종류 상품은 404 (충전 상품 id로 골드 사기 막기)
    const row = await productRepository.findProduct(db, productId, transaction);
    const product = normalizeProductRow(row);
    if (!product) throw notFound();
    if (kind !== undefined && product.kind !== kind) throw notFound();

    // 판매 중지면 거절
    if (product.status !== STATUSES.ON_SALE) {
        throw createError('판매가 중지된 상품입니다.', 409, 'PRODUCT_STOPPED');
    }
    // 화면이 본 버전과 다르면 거절 (바뀐 값으로 사는 것 막기)
    if (version !== product.version) {
        throw Object.assign(
            createError('상품 정보가 변경되었습니다.', 409, 'PRODUCT_VERSION_MISMATCH'),
            { currentProduct: toPublicProduct(product) },
        );
    }
    return product;
};

module.exports = {
    listCurrencyProducts,
    getCurrencyProduct,
};
