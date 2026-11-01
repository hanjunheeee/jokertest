'use strict';

// 경제 모델 꺼내기 파일, 지갑·장부·보유·장착·구매 요청·팔레트 묶음 + 상품·충전 주문·장부 모델 하나씩
// 경제 서비스들과 currencyProduct.js·topupOrder.js가 부름 (장부 말고는 db에 안 올라 있음)

// 경제 모델 묶음 (장부만 db에 바로 있음, 나머지는 sequelize.models)
const economyModels = (db) => ({
    sequelize: db.sequelize,
    EconomyWallet: db.sequelize.models.EconomyWallet,
    EconomyLedgerEntry: db.EconomyLedgerEntry,
    EconomyEntitlement: db.sequelize.models.EconomyEntitlement,
    EconomyLoadout: db.sequelize.models.EconomyLoadout,
    EconomyPurchaseRequest: db.sequelize.models.EconomyPurchaseRequest,
    EconomyEmojiPalette: db.sequelize.models.EconomyEmojiPalette,
});

// 아래 셋은 db에 바로 있으면 그것, 없으면 sequelize.models (시험 가짜 db 두 모양 다 받음)
// 재화 상품 모델
const productModel = (db) => db.EconomyCurrencyProduct ?? db.sequelize.models.EconomyCurrencyProduct;

// 충전 주문 모델
const orderModel = (db) => db.EconomyTopupOrder ?? db.sequelize.models.EconomyTopupOrder;

// 장부 모델 (충전 지급 뒤 잔액 읽기용)
const ledgerModel = (db) => db.EconomyLedgerEntry ?? db.sequelize.models.EconomyLedgerEntry;

module.exports = {
    economyModels,
    productModel,
    orderModel,
    ledgerModel,
};
