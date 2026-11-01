'use strict';

// 경제 모델 꺼내기 파일, 상품·충전 주문·장부 모델
// db에 바로 없으면 sequelize models에서 꺼냄 (시험 가짜 db 두 모양 다 받음)

// 재화 상품 모델
const productModel = (db) => db.EconomyCurrencyProduct ?? db.sequelize.models.EconomyCurrencyProduct;

// 충전 주문 모델
const orderModel = (db) => db.EconomyTopupOrder ?? db.sequelize.models.EconomyTopupOrder;

// 장부 모델
const ledgerModel = (db) => db.EconomyLedgerEntry ?? db.sequelize.models.EconomyLedgerEntry;

module.exports = {
    productModel,
    orderModel,
    ledgerModel,
};
