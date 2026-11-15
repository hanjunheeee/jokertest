'use strict';

// 판 설정 값 표 마이그레이션, 운영 값 한 줄씩(game_settings) 표 새로 + 판마다 주는 골드 처음 값 1
// scripts/migrate-db.js 목록이 씀, 판 설정 값 서비스가 서버 켤 때·다시 읽기 때 읽고 관리자가 바꿈 (고치기 계획 단위 8·10)
// 없는 표만 만듦·처음 줄은 없을 때만 넣음 (다시 돌려도 안전, 관리자가 바꾼 값 안 덮음), down은 이 표만 지움

const TABLES = Object.freeze({
    GAME_SETTINGS: 'game_settings',
});

// 값 이름 (판 하나 끝날 때 한 사람에게 주는 골드)
const SETTING_KEYS = Object.freeze({
    GAME_GOLD_REWARD: 'GAME_GOLD_REWARD',
});

// 처음 넣어 두는 줄
const SEED_ROWS = Object.freeze([
    Object.freeze({ key: SETTING_KEYS.GAME_GOLD_REWARD, valueInt: 1 }),
]);

// 표 정의
const tableDefinitions = (Sequelize) => [
    [TABLES.GAME_SETTINGS, {
        key: { type: Sequelize.STRING(60), primaryKey: true, allowNull: false },
        value_int: { type: Sequelize.INTEGER, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        // 바꾼 관리자 id (처음 줄은 빈 값), 관리자 지워도 기록 남게 외래 키 안 검 (maintenance_state와 같음)
        updated_by: { type: Sequelize.UUID, allowNull: true },
    }],
];

// 표 하나 칸 대조 (NULL 허용·기본 키까지)
const verifyColumns = async (queryInterface, table, columns) => {
    const described = await queryInterface.describeTable(table);
    for (const [column, definition] of Object.entries(columns)) {
        const actual = described[column];
        if (!actual) throw new Error(`0034: ${table}.${column} 칸이 없음`);
        if (actual.allowNull !== undefined && actual.allowNull !== (definition.allowNull !== false)) {
            throw new Error(`0034: ${table}.${column} NULL 허용이 다름`);
        }
        if (definition.primaryKey && actual.primaryKey !== undefined && actual.primaryKey !== true) {
            throw new Error(`0034: ${table}.${column}이 기본 키가 아님`);
        }
    }
};

module.exports = {
    name: '0034-add-game-settings',

    async up(queryInterface, Sequelize, sequelize) {
        const existing = new Set(await queryInterface.showAllTables());
        for (const [table, columns] of tableDefinitions(Sequelize)) {
            if (!existing.has(table)) await queryInterface.createTable(table, columns);
        }

        // 처음 줄은 없을 때만 (key는 MySQL 예약어라 따옴표)
        if (sequelize) {
            for (const row of SEED_ROWS) {
                await sequelize.query(
                    `INSERT IGNORE INTO \`${TABLES.GAME_SETTINGS}\` (\`key\`, value_int, updated_at, updated_by) VALUES (:key, :valueInt, NOW(), NULL)`,
                    { replacements: { key: row.key, valueInt: row.valueInt } },
                );
            }
        }
    },

    // 되돌리기: 판 설정 값 표만 지움 (관리자가 바꾼 값도 사라짐)
    async down(queryInterface) {
        const existing = new Set(await queryInterface.showAllTables());
        if (existing.has(TABLES.GAME_SETTINGS)) await queryInterface.dropTable(TABLES.GAME_SETTINGS);
    },

    // 표·칸 대조 + 처음 줄 있는지 (값은 관리자가 바꿨을 수 있어 안 봄)
    async verify(queryInterface, Sequelize, sequelize) {
        const existing = new Set(await queryInterface.showAllTables());
        for (const [table, columns] of tableDefinitions(Sequelize)) {
            if (!existing.has(table)) throw new Error(`0034: ${table} 표가 없음`);
            await verifyColumns(queryInterface, table, columns);
        }
        if (!sequelize) return;
        for (const row of SEED_ROWS) {
            const [rows] = await sequelize.query(
                `SELECT COUNT(*) AS count FROM \`${TABLES.GAME_SETTINGS}\` WHERE \`key\` = :key`,
                { replacements: { key: row.key } },
            );
            if (Number(rows?.[0]?.count) !== 1) throw new Error(`0034: ${row.key} 줄이 없음`);
        }
    },

    TABLES,
    SETTING_KEYS,
    SEED_ROWS,
};
