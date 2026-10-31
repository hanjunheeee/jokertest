'use strict';

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
