'use strict';

// F-32a 다이아 충전 주문. 주문 시점의 상품 스냅샷(product_id·version·가격·지급량)을 이
// 행이 직접 들고 있어, 이후 상품이 수정·중지·삭제되어도 승인 대조와 지급은 이 값으로 한다.
// 실제 DDL은 backend/db/migrations/0018-add-currency-products-topup-orders.js가 책임지며
// 이 정의와 항상 같은 모양이어야 한다(문자열 정렬 규칙은 DB 기본값 — 다른 경제 테이블과 같다).
//
// 상태: CREATED → CONFIRMING → PENDING_GRANT → GRANTED, 제공자가 확인한 실패는
// FAILED/CANCELED/EXPIRED. lease_token/lease_expires_at은 외부 승인 호출을 맡은 처리자를
// 구분하는 임대다 — DB 잠금은 외부 호출 동안 잡지 않는다. payment_key는 NULL을 여러 행이
// 가질 수 있는 유일 인덱스라, 한 결제키는 최대 한 주문만 점유한다.

module.exports = (sequelize, DataTypes) => {
    const EconomyTopupOrder = sequelize.define('EconomyTopupOrder', {
        order_id: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
        user_id: { type: DataTypes.UUID, allowNull: false },
        product_id: { type: DataTypes.STRING(64), allowNull: false },
        version: { type: DataTypes.INTEGER, allowNull: false },
        pay_amount: { type: DataTypes.INTEGER, allowNull: false },
        grant_amount: { type: DataTypes.INTEGER, allowNull: false },
        bonus_amount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        order_name: { type: DataTypes.STRING(100), allowNull: false },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CREATED' },
        payment_key: { type: DataTypes.STRING(200), allowNull: true },
        lease_token: { type: DataTypes.STRING(64), allowNull: true },
        lease_expires_at: { type: DataTypes.DATE, allowNull: true },
        approved_at: { type: DataTypes.DATE, allowNull: true },
        granted_at: { type: DataTypes.DATE, allowNull: true },
        failure_code: { type: DataTypes.STRING(80), allowNull: true },
    }, {
        tableName: 'economy_topup_orders',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['payment_key'], name: 'economy_topup_orders_payment_key_unique' },
        ],
    });

    EconomyTopupOrder.associate = (models) => {
        EconomyTopupOrder.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
    };

    return EconomyTopupOrder;
};
