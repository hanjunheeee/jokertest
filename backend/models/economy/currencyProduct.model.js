'use strict';

// 재화 상품 표(economy_currency_products) 모델, 다이아 충전·골드 구매 상품 한 줄씩
// models/index.js가 읽음, 재화 상품 저장소가 읽음
module.exports = (sequelize, DataTypes) => {
    const EconomyCurrencyProduct = sequelize.define('EconomyCurrencyProduct', {
        product_id: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
        // DIAMOND_TOPUP(돈 → 다이아) · GOLD_PURCHASE(다이아 → 골드)
        kind: { type: DataTypes.STRING(20), allowNull: false },
        display_name: { type: DataTypes.STRING(100), allowNull: false },
        // 내는 통화·금액 → 받는 통화·금액 (+ 덤)
        pay_currency: { type: DataTypes.STRING(10), allowNull: false },
        pay_amount: { type: DataTypes.INTEGER, allowNull: false },
        grant_currency: { type: DataTypes.STRING(10), allowNull: false },
        grant_amount: { type: DataTypes.INTEGER, allowNull: false },
        bonus_amount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        // ON_SALE · STOPPED
        status: { type: DataTypes.STRING(10), allowNull: false },
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        // 가격 바꾸면 올림, 구매 요청의 version과 다르면 거절 (옛 화면 가격으로 사기 막기)
        version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    }, {
        tableName: 'economy_currency_products',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    return EconomyCurrencyProduct;
};
