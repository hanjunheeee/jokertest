'use strict';

// 재화 상품 저장소 파일, 상태별 목록 · 상품 하나
// 재화 상품 서비스(currencyProducts/queries.js)가 부름 (행 검사는 서비스 몫)
const { productModel } = require('./models');

// 그 상태 상품을 정렬 순서 → id 순으로 (종류 주면 그 종류만)
const listByStatus = (db, { status, kind }) => productModel(db).findAll({
    where: { status, ...(kind ? { kind } : {}) },
    order: [['sort_order', 'ASC'], ['product_id', 'ASC']],
});

// 상품 id로 하나 (트랜잭션 주면 그 안에서, 골드 구매가 구매 트랜잭션 안에서 다시 읽음)
const findProduct = (db, productId, transaction = null) => productModel(db).findOne({
    where: { product_id: productId },
    ...(transaction ? { transaction } : {}),
});

module.exports = {
    listByStatus,
    findProduct,
};
