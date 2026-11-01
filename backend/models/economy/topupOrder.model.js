'use strict';

// 다이아 충전 주문 표(economy_topup_orders) 모델, 결제 한 건에 한 줄 (만듦 → 확인 중 → 지급 대기 → 지급됨 / 실패)
// models/index.js가 읽음, 충전 주문 저장소가 씀
module.exports = (sequelize, DataTypes) => {
    const EconomyTopupOrder = sequelize.define('EconomyTopupOrder', {
        // 우리가 만들어 결제창에 넘긴 주문 id
        order_id: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
        user_id: { type: DataTypes.UUID, allowNull: false },
        // 주문 만들 때 상품 값을 복사해 둠 (나중에 상품 가격이 바뀌어도 이 주문은 그대로)
        product_id: { type: DataTypes.STRING(64), allowNull: false },
        version: { type: DataTypes.INTEGER, allowNull: false },
        pay_amount: { type: DataTypes.INTEGER, allowNull: false },
        grant_amount: { type: DataTypes.INTEGER, allowNull: false },
        bonus_amount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        order_name: { type: DataTypes.STRING(100), allowNull: false },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CREATED' },
        // 결제사가 준 결제 키, 다른 주문이 같은 키를 못 쓰게 유일
        payment_key: { type: DataTypes.STRING(200), allowNull: true },
        // 지금 이 주문을 확인 중인 요청 표시 + 끝나는 시각 (동시에 두 번 확인 막기)
        lease_token: { type: DataTypes.STRING(64), allowNull: true },
        lease_expires_at: { type: DataTypes.DATE, allowNull: true },
        // 결제사 승인 시각 · 다이아 지급 시각
        approved_at: { type: DataTypes.DATE, allowNull: true },
        granted_at: { type: DataTypes.DATE, allowNull: true },
        // 실패 때 남기는 안전한 코드 (결제사 원문 메시지는 안 남김)
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
