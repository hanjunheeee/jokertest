'use strict';

// F-08 지갑·거래 원장·소유권(entitlement)·장착(loadout) 4개 모델을 한 파일에 정의한다.
// models/index.js의 로더(backend/models/index.js readModels)는 파일 하나당 모델 하나만
// db[model.name]에 등록하므로(require(file)(sequelize, DataTypes) → 단일 반환값), 이
// 파일은 EconomyLedgerEntry만 반환하고 나머지 세 모델은 sequelize.define으로만 등록한다.
// sequelize.define은 반환값과 무관하게 항상 sequelize.models[name]에 등록되므로, 이
// 파일 밖에서는 db.EconomyLedgerEntry 또는 db.sequelize.models.EconomyWallet /
// .EconomyEntitlement / .EconomyLoadout으로 접근한다(backend/service/economy.service.js
// 참고). 네 모델 모두 users.uuid를 참조하고, FK 대상 모델(User)은 로더 실행 순서상 이
// 파일보다 늦게(또는 먼저) 로드될 수 있어 sequelize.define 시점이 아니라
// associate(models) 훅에서만 User를 참조한다.

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
    }, {
        tableName: 'economy_wallets',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    // 원장은 불변 이력이다 — updated_at을 두지 않는다. reference_event_id는 전역 유일
    // 제약으로 재처리 방지 키 역할을 한다(F-08 AC-02): 같은 참조 사건 ID로 지급/구매가
    // 재전송돼도 두 번째 INSERT는 유일 제약에 걸려 실패하고, 서비스 계층이 그 실패를
    // "이미 처리됨"으로 해석해 기존 결과를 그대로 돌려준다.
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
            unique: true,
        },
    }, {
        tableName: 'economy_ledger_entries',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
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

    // 선택된 장착값. 값이 없으면(null) A-04에 따라 서비스 계층이 금빛가면/평민 기본값을
    // 채운다 — 기존에 유효한 선택이 있으면 절대 덮어쓰지 않는다.
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
    }, {
        tableName: 'economy_loadouts',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    });

    EconomyLedgerEntry.associate = (models) => {
        EconomyWallet.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyLedgerEntry.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyEntitlement.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyLoadout.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
    };

    return EconomyLedgerEntry;
};
