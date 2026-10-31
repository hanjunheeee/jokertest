'use strict';

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
