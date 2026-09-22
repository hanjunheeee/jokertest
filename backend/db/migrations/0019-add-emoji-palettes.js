'use strict';

// F-33 E-2(설계도 §2-2): 계정별 이모티콘 팔레트(8칸) 저장 테이블 economy_emoji_palettes를
// 추가한다. 컬럼 정의는 backend/models/economy/economy.model.js의 EconomyEmojiPalette와
// 항상 같은 모양이어야 한다.
//
// 0018·0016과 같은 패턴을 따른다: 테이블 존재 확인 후에만 생성(재실행 안전), verify가
// 컬럼·타입·NULL 허용·기본키·사용자 FK를 확인. 다만 이 테이블은 결제·원장 같은 되돌릴 수
// 없는 이력이 아니라 "지금 고른 8칸"뿐이라, 0010처럼 down()에서 dropTable을 실제로 수행한다.
//
// revision은 0010-add-economy-loadout-revision.js가 economy_loadouts에 도입한 것과 같은
// CAS(compare-and-swap) 토큰이다 — 같은 STRING(36) UUID이고, 애플리케이션이 매 저장마다
// 새 값을 발급한다(DB DEFAULT를 쓰지 않는다: 모든 행이 같은 값을 공유하면 CAS 비교가
// 무의미해진다). 그래서 이 컬럼에는 기본값이 없고, 행을 만드는 쪽(economy.service.js의
// getEmojiPalette/saveEmojiPalette findOrCreate)이 항상 값을 채운다.

const TABLE_NAME = 'economy_emoji_palettes';

/** 팔레트 8칸. 값은 itemId(문자열) 또는 빈 칸(NULL)이다 — economy_entitlements.item_id와
 *  같은 STRING(120)이라 어떤 소유 항목도 그대로 담을 수 있다. */
const SLOT_COLUMNS = Object.freeze(['slot_1', 'slot_2', 'slot_3', 'slot_4', 'slot_5', 'slot_6', 'slot_7', 'slot_8']);

/** 0018 PRODUCT_COLUMN_CONTRACTS와 같은 원칙: type은 describeTable 원시 타입에 대한 관대한
 *  정규식이고, allowNull·primaryKey는 정확히 대조한다. */
const COLUMN_CONTRACTS = Object.freeze({
    user_id: { allowNull: false, primaryKey: true, type: /^char\(36\)/i },
    ...Object.fromEntries(SLOT_COLUMNS.map((column) => [column, { allowNull: true, type: /^varchar\(120\)/i }])),
    revision: { allowNull: false, type: /^varchar\(36\)/i },
    created_at: { allowNull: false, type: /^datetime/i },
    updated_at: { allowNull: false, type: /^datetime/i },
});

const sameName = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

const verifyTable = async (queryInterface, tableName, contracts) => {
    const table = await queryInterface.describeTable(tableName);
    const missing = Object.keys(contracts).filter((column) => !table[column]);
    if (missing.length > 0) {
        throw new Error(`${tableName}에 누락된 컬럼: [${missing.join(', ')}]`);
    }

    for (const [column, contract] of Object.entries(contracts)) {
        const actual = table[column];
        if (actual.allowNull !== undefined && actual.allowNull !== contract.allowNull) {
            throw new Error(
                `${tableName}.${column}의 NULL 허용이 계약과 다릅니다: ` +
                `기대 allowNull=${contract.allowNull}, 실제 allowNull=${actual.allowNull}`,
            );
        }
        if (contract.primaryKey === true && actual.primaryKey !== undefined && actual.primaryKey !== true) {
            throw new Error(`${tableName}.${column} 컬럼이 기본 키가 아닙니다.`);
        }
        if (contract.primaryKey !== true && actual.primaryKey === true) {
            throw new Error(`${tableName}.${column} 컬럼이 계약에 없는 기본 키입니다.`);
        }
        if (contract.type && actual.type !== undefined && !contract.type.test(String(actual.type))) {
            throw new Error(
                `${tableName}.${column}의 타입이 계약과 다릅니다: ` +
                `기대 패턴 ${contract.type}, 실제 ${actual.type}`,
            );
        }
    }
};

module.exports = {
    name: '0019-add-emoji-palettes',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());

        // 이미 있으면(재실행) 아무 것도 하지 않는다 — DDL을 다시 던지지 않으므로 반복 실행이
        // 안전하다(AC-08).
        if (existingTables.has(TABLE_NAME)) return;

        await queryInterface.createTable(TABLE_NAME, {
            user_id: {
                type: Sequelize.UUID,
                primaryKey: true,
                allowNull: false,
                references: { model: 'users', key: 'uuid' },
            },
            ...Object.fromEntries(SLOT_COLUMNS.map((column) => [
                column, { type: Sequelize.STRING(120), allowNull: true },
            ])),
            revision: { type: Sequelize.STRING(36), allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable(TABLE_NAME);
    },

    async verify(queryInterface) {
        await verifyTable(queryInterface, TABLE_NAME, COLUMN_CONTRACTS);

        // 소유자 없는 팔레트를 막는 users.uuid FK — 방언이 조회를 지원할 때만 판정한다
        // (0018 verify와 같은 방식).
        if (typeof queryInterface.getForeignKeyReferencesForTable === 'function') {
            const references = await queryInterface.getForeignKeyReferencesForTable(TABLE_NAME);
            const found = Array.isArray(references) && references.some((reference) => (
                sameName(reference?.columnName, 'user_id')
                && sameName(reference?.referencedTableName, 'users')
                && sameName(reference?.referencedColumnName, 'uuid')
            ));
            if (!found) {
                throw new Error(`${TABLE_NAME}.user_id → users.uuid 외래 키가 없습니다.`);
            }
        }
    },

    TABLE_NAME,
    SLOT_COLUMNS,
    COLUMN_CONTRACTS,
};
