'use strict';

// 탈주 기록 표 마이그레이션, 한 판 한 사람 한 줄(game_desertions) 표 새로
// scripts/migrate-db.js 목록이 씀, 탈주 기록 저장소가 쓰고 서버 켤 때·관리자 회원 상세가 읽음 (고치기 계획 단위 8·12·13)
// 없는 표만 만듦·인덱스 따로 확인 (다시 돌려도 안전), down은 이 표만 지움

const TABLES = Object.freeze({
    GAME_DESERTIONS: 'game_desertions',
});

// 탈주 이유 (산 채로 나감 · 끊긴 뒤 60초 못 돌아옴)
const REASONS = Object.freeze({
    LEFT_ALIVE: 'LEFT_ALIVE',
    DISCONNECT_TIMEOUT: 'DISCONNECT_TIMEOUT',
});

// 표 정의
const tableDefinitions = (Sequelize) => [
    [TABLES.GAME_DESERTIONS, {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
        // 판 도중에 쓰니까 판 결과 표 외래 키는 안 검 (0008과 같은 까닭)
        game_id: { type: Sequelize.UUID, allowNull: false },
        // LEFT_ALIVE·DISCONNECT_TIMEOUT
        reason: { type: Sequelize.STRING(30), allowNull: false },
        deserted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        // 탈주 시각 + 대기 시간 (자정 지나도 남음)
        blocked_until: { type: Sequelize.DATE, allowNull: false },
    }],
];

const INDEXES = Object.freeze({
    [TABLES.GAME_DESERTIONS]: [
        // 같은 사람 같은 판은 한 줄만 (두 번 적기 막기)
        { name: 'game_desertions_user_game_unique', fields: ['user_id', 'game_id'], unique: true },
        // 그날 몇 번째인지·관리자 회원 상세 최근 기록
        { name: 'game_desertions_user_deserted_idx', fields: ['user_id', 'deserted_at'], unique: false },
        // 서버 켤 때 아직 막힌 줄 한 번 읽기
        { name: 'game_desertions_blocked_until_idx', fields: ['blocked_until'], unique: false },
    ],
});

const FOREIGN_KEYS = Object.freeze([
    { table: TABLES.GAME_DESERTIONS, column: 'user_id', refTable: 'users', refColumn: 'uuid' },
]);

const indexFieldNames = (index) => (Array.isArray(index?.fields) ? index.fields : []).map((field) => (
    typeof field === 'string' ? field : (field?.attribute ?? field?.name ?? '')
));

const sameName = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

// 표 하나 칸 대조 (NULL 허용까지)
const verifyColumns = async (queryInterface, table, columns) => {
    const described = await queryInterface.describeTable(table);
    for (const [column, definition] of Object.entries(columns)) {
        const actual = described[column];
        if (!actual) throw new Error(`0033: ${table}.${column} 칸이 없음`);
        if (actual.allowNull !== undefined && actual.allowNull !== (definition.allowNull !== false)) {
            throw new Error(`0033: ${table}.${column} NULL 허용이 다름`);
        }
    }
};

// 표 하나 인덱스 대조 (칸 순서·유일까지)
const verifyIndexes = async (queryInterface, table, indexes) => {
    const present = await queryInterface.showIndex(table);
    for (const index of indexes) {
        const found = present.find((candidate) => candidate.name === index.name);
        if (!found) throw new Error(`0033: ${table}에 ${index.name} 인덱스가 없음`);
        if (indexFieldNames(found).join(',') !== index.fields.join(',')) throw new Error(`0033: ${index.name} 칸이 다름`);
        if ((found.unique === true) !== index.unique) throw new Error(`0033: ${index.name} 유일 여부가 다름`);
    }
};

module.exports = {
    name: '0033-add-game-desertions',

    async up(queryInterface, Sequelize) {
        const existing = new Set(await queryInterface.showAllTables());
        for (const [table, columns] of tableDefinitions(Sequelize)) {
            if (!existing.has(table)) await queryInterface.createTable(table, columns);
        }
        for (const [table, indexes] of Object.entries(INDEXES)) {
            const present = await queryInterface.showIndex(table);
            for (const index of indexes) {
                if (present.some((candidate) => candidate.name === index.name)) continue;
                await queryInterface.addIndex(table, index.fields, { name: index.name, unique: index.unique });
            }
        }
    },

    // 되돌리기: 탈주 기록 표만 지움 (쌓인 기록도 사라짐 → 백업 뒤에만)
    async down(queryInterface) {
        const existing = new Set(await queryInterface.showAllTables());
        if (existing.has(TABLES.GAME_DESERTIONS)) await queryInterface.dropTable(TABLES.GAME_DESERTIONS);
    },

    async verify(queryInterface, Sequelize) {
        const existing = new Set(await queryInterface.showAllTables());
        for (const [table, columns] of tableDefinitions(Sequelize)) {
            if (!existing.has(table)) throw new Error(`0033: ${table} 표가 없음`);
            await verifyColumns(queryInterface, table, columns);
            await verifyIndexes(queryInterface, table, INDEXES[table]);
        }
        if (typeof queryInterface.getForeignKeyReferencesForTable !== 'function') return;
        for (const fk of FOREIGN_KEYS) {
            const references = await queryInterface.getForeignKeyReferencesForTable(fk.table);
            const found = Array.isArray(references) && references.some((reference) => (
                sameName(reference?.columnName, fk.column)
                && sameName(reference?.referencedTableName, fk.refTable)
                && sameName(reference?.referencedColumnName, fk.refColumn)
            ));
            if (!found) throw new Error(`0033: ${fk.table}.${fk.column} → ${fk.refTable}.${fk.refColumn} 외래 키가 없음`);
        }
    },

    TABLES,
    REASONS,
    INDEXES,
    FOREIGN_KEYS,
};
