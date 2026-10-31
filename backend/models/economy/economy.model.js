'use strict';

module.exports = (sequelize, DataTypes) => {
    const EconomyWallet = sequelize.define('EconomyWallet', {
        user_id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
        },
        balance_gold: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        balance_diamond: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
    }, {
        tableName: 'economy_wallets',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    const EconomyLedgerEntry = sequelize.define('EconomyLedgerEntry', {
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        reason: {
            type: DataTypes.STRING(40),
            allowNull: false,
        },
        item_id: {
            type: DataTypes.STRING(120),
            allowNull: true,
        },
        currency: {
            type: DataTypes.STRING(10),
            allowNull: false,
        },
        amount: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        balance_after: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        reference_event_id: {
            type: DataTypes.STRING(150),
            allowNull: false,
        },
    }, {
        tableName: 'economy_ledger_entries',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
        indexes: [
            { unique: true, fields: ['user_id', 'reference_event_id'], name: 'economy_ledger_entries_user_reference_unique' },
        ],
    });

    const EconomyEntitlement = sequelize.define('EconomyEntitlement', {
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        item_id: {
            type: DataTypes.STRING(120),
            allowNull: false,
        },
        item_type: {
            type: DataTypes.STRING(40),
            allowNull: false,
        },
        source: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
    }, {
        tableName: 'economy_entitlements',
        timestamps: true,
        createdAt: 'acquired_at',
        updatedAt: false,
        indexes: [
            { unique: true, fields: ['user_id', 'item_id'], name: 'economy_entitlements_user_item_unique' },
        ],
    });

    const EconomyLoadout = sequelize.define('EconomyLoadout', {
        user_id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
        },
        selected_profile_photo_id: {
            type: DataTypes.STRING(120),
            allowNull: true,
        },
        selected_profile_border_id: {
            type: DataTypes.STRING(120),
            allowNull: true,
        },
        selected_card_frame_id: {
            type: DataTypes.STRING(120),
            allowNull: true,
        },
        selected_skin_noble: {
            type: DataTypes.STRING(191),
            allowNull: true,
        },
        selected_skin_clown: {
            type: DataTypes.STRING(191),
            allowNull: true,
        },
        selected_skin_guard: {
            type: DataTypes.STRING(191),
            allowNull: true,
        },
        selected_skin_doctor: {
            type: DataTypes.STRING(191),
            allowNull: true,
        },
        selected_skin_witch_hunter: {
            type: DataTypes.STRING(191),
            allowNull: true,
        },
        revision: {
            type: DataTypes.STRING(36),
            allowNull: false,
        },
    }, {
        tableName: 'economy_loadouts',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    const EconomyPurchaseRequest = sequelize.define('EconomyPurchaseRequest', {
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        reference_event_id: {
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        kind: {
            type: DataTypes.STRING(10),
            allowNull: false,
        },
        payload_json: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        result_json: {
            type: DataTypes.JSON,
            allowNull: false,
        },
    }, {
        tableName: 'economy_purchase_requests',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
        indexes: [
            { unique: true, fields: ['user_id', 'reference_event_id'], name: 'economy_purchase_requests_user_reference_unique' },
        ],
    });

    const EconomyEmojiPalette = sequelize.define('EconomyEmojiPalette', {
        user_id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
        },
        slot_1: { type: DataTypes.STRING(120), allowNull: true },
        slot_2: { type: DataTypes.STRING(120), allowNull: true },
        slot_3: { type: DataTypes.STRING(120), allowNull: true },
        slot_4: { type: DataTypes.STRING(120), allowNull: true },
        slot_5: { type: DataTypes.STRING(120), allowNull: true },
        slot_6: { type: DataTypes.STRING(120), allowNull: true },
        slot_7: { type: DataTypes.STRING(120), allowNull: true },
        slot_8: { type: DataTypes.STRING(120), allowNull: true },
        revision: {
            type: DataTypes.STRING(36),
            allowNull: false,
        },
    }, {
        tableName: 'economy_emoji_palettes',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    EconomyLedgerEntry.associate = (models) => {
        EconomyWallet.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyLedgerEntry.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyEntitlement.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyLoadout.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyPurchaseRequest.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyEmojiPalette.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
    };

    return EconomyLedgerEntry;
};
