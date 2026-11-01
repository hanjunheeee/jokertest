'use strict';

// 경제 표 모델 6개 파일, 지갑·장부·보유 아이템·장착·구매 요청·이모티콘 팔레트 (전부 계정 uuid로 이어짐)
// models/index.js가 읽음, 장부만 db에 오르고 나머지는 repositories/economy/models.js가 꺼냄
module.exports = (sequelize, DataTypes) => {
    // 지갑: 계정마다 한 줄, 골드·다이아 잔액
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

    // 장부: 잔액이 바뀌거나 아이템을 받을 때마다 한 줄 (지우거나 고치지 않음)
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
        // PURCHASE·GOLD_PURCHASE·DIAMOND_TOPUP·DEFAULT_GRANT·ACHIEVEMENT_REWARD 등
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
        // 바뀐 양 (아이템만 받을 땐 0) + 바뀐 뒤 잔액
        amount: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        balance_after: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        // 이 거래를 부른 일의 id, 같은 사람·같은 id는 한 줄만 (같은 요청 두 번 처리 막기)
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

    // 보유 아이템: 사람·아이템마다 한 줄 (같은 아이템은 한 번만)
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
        // 장착 칸에 맞는 종류인지 볼 때 씀 (프로필 사진·테두리·카드 틀·스킨 등)
        item_type: {
            type: DataTypes.STRING(40),
            allowNull: false,
        },
        // 어떻게 얻었는지 (PURCHASE·DEFAULT_GRANT·ACHIEVEMENT_GRANT)
        source: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
    }, {
        tableName: 'economy_entitlements',
        timestamps: true,
        // 얻은 시각
        createdAt: 'acquired_at',
        updatedAt: false,
        indexes: [
            { unique: true, fields: ['user_id', 'item_id'], name: 'economy_entitlements_user_item_unique' },
        ],
    });

    // 장착: 계정마다 한 줄, 칸마다 끼운 아이템 id (null이면 안 끼움)
    const EconomyLoadout = sequelize.define('EconomyLoadout', {
        user_id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
        },
        // 프로필 사진·테두리·플레이어 카드 틀
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
        // 직업별 스킨 (귀족·광대·경비원·주치의·마녀사냥꾼)
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
        // 바꿀 때마다 새 uuid, 화면이 본 값과 다르면 저장 거절 (다른 창에서 바꾼 것 덮어쓰기 막기)
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

    // 구매 요청: 아이템·골드 구매 요청마다 한 줄, 같은 요청이 다시 오면 저장한 결과를 그대로 돌려줌
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
        // 화면이 보낸 요청 id, 같은 사람·같은 id는 한 줄만
        reference_event_id: {
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        // SINGLE·BULK(아이템) · GOLD(골드 구매)
        kind: {
            type: DataTypes.STRING(10),
            allowNull: false,
        },
        // 받은 요청 내용 (같은 id로 다른 내용이 오면 거절하려고 비교) + 처리 결과
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

    // 이모티콘 팔레트: 계정마다 한 줄, 게임 중 쓸 이모티콘 8칸
    const EconomyEmojiPalette = sequelize.define('EconomyEmojiPalette', {
        user_id: {
            type: DataTypes.UUID,
            primaryKey: true,
            allowNull: false,
        },
        // 칸마다 이모티콘 아이템 id (null이면 빈 칸)
        slot_1: { type: DataTypes.STRING(120), allowNull: true },
        slot_2: { type: DataTypes.STRING(120), allowNull: true },
        slot_3: { type: DataTypes.STRING(120), allowNull: true },
        slot_4: { type: DataTypes.STRING(120), allowNull: true },
        slot_5: { type: DataTypes.STRING(120), allowNull: true },
        slot_6: { type: DataTypes.STRING(120), allowNull: true },
        slot_7: { type: DataTypes.STRING(120), allowNull: true },
        slot_8: { type: DataTypes.STRING(120), allowNull: true },
        // 장착과 같은 방식, 화면이 본 값과 다르면 저장 거절
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

    // 여섯 모델 관계를 장부 associate에서 다 이음 (index.js가 장부 것만 부름)
    EconomyLedgerEntry.associate = (models) => {
        EconomyWallet.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyLedgerEntry.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyEntitlement.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyLoadout.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyPurchaseRequest.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
        EconomyEmojiPalette.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
    };

    // 장부만 돌려줌 (다른 다섯은 sequelize.models에서 꺼냄)
    return EconomyLedgerEntry;
};
