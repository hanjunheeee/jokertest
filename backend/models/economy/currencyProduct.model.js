'use strict';

// F-32a 재화 상품표. 외부 작성자(별도 백엔드)가 이 테이블에 상품을 등록·수정·판매 중지하고,
// 게임 서버는 요청마다 읽기만 한다(docs/requirements/f32a-currency-products-contract.md).
// 실제 DDL은 backend/db/migrations/0018-add-currency-products-topup-orders.js가 책임지며 이
// 정의는 그 결과 스키마와 항상 같은 모양이어야 한다. 문자열 식별자는 다른 경제 테이블과
// 같이 DB 기본 정렬 규칙을 쓴다(마이그레이션도 같은 규칙).
//
// 주문(EconomyTopupOrder)에는 이 테이블을 가리키는 FK를 두지 않는다 — 상품이 삭제되어도
// 이미 만들어진 주문의 스냅샷을 훼손하면 안 된다. 이 파일에는 운영 상품을 넣지 않는다.

module.exports = (sequelize, DataTypes) => {
    const EconomyCurrencyProduct = sequelize.define('EconomyCurrencyProduct', {
        product_id: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
        kind: { type: DataTypes.STRING(20), allowNull: false },
        display_name: { type: DataTypes.STRING(100), allowNull: false },
        pay_currency: { type: DataTypes.STRING(10), allowNull: false },
        pay_amount: { type: DataTypes.INTEGER, allowNull: false },
        grant_currency: { type: DataTypes.STRING(10), allowNull: false },
        grant_amount: { type: DataTypes.INTEGER, allowNull: false },
        bonus_amount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        status: { type: DataTypes.STRING(10), allowNull: false },
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    }, {
        tableName: 'economy_currency_products',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    return EconomyCurrencyProduct;
};
