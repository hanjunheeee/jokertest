'use strict';

// 문의 표 마이그레이션, 플레이어 문의(inquiries)·관리자 답(inquiry_replies) 표 새로
// scripts/migrate-db.js 목록이 씀, 플레이어 /inquiries·관리자 /admin-api/inquiries가 읽고 씀 (docs/관리자-페이지/설계.md 6-2)
// 없는 표만 만듦·인덱스 따로 확인 (다시 돌려도 안전), down은 두 표만 지움

const TABLES = Object.freeze({
    INQUIRIES: 'inquiries',
    INQUIRY_REPLIES: 'inquiry_replies',
});

// 표 정의 (만드는 순서 = 가리키는 표 먼저)
const tableDefinitions = (Sequelize) => [
    [TABLES.INQUIRIES, {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
        // BUG·ACCOUNT·ETC
        category: { type: Sequelize.STRING(20), allowNull: false },
        // 금지어 가린 뒤 저장
        title: { type: Sequelize.STRING(100), allowNull: false },
        body: { type: Sequelize.STRING(2000), allowNull: false },
        // OPEN(답 기다림) → ANSWERED(답함)
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'OPEN' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        answered_at: { type: Sequelize.DATE, allowNull: true },
    }],
    [TABLES.INQUIRY_REPLIES, {
        // 알림 출처 키 inquiry-reply:<이 id>
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
        inquiry_id: {
            type: Sequelize.BIGINT, allowNull: false,
            references: { model: TABLES.INQUIRIES, key: 'id' }, onDelete: 'CASCADE',
        },
        admin_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'admin_users', key: 'id' } },
        body: { type: Sequelize.STRING(2000), allowNull: false },
        // 같은 요청 번호 두 번이면 처음 답 (두 번 눌러도 한 줄)
        request_id: { type: Sequelize.STRING(64), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
];

const INDEXES = Object.freeze({
    [TABLES.INQUIRIES]: [
        // 관리자 목록 (상태별 최근)
        { name: 'inquiries_status_created_idx', fields: ['status', 'created_at'], unique: false },
        // 내 문의 목록
        { name: 'inquiries_user_created_idx', fields: ['user_id', 'created_at'], unique: false },
    ],
    [TABLES.INQUIRY_REPLIES]: [
        { name: 'inquiry_replies_request_id_unique', fields: ['request_id'], unique: true },
        { name: 'inquiry_replies_inquiry_created_idx', fields: ['inquiry_id', 'created_at'], unique: false },
    ],
});

const FOREIGN_KEYS = Object.freeze([
    { table: TABLES.INQUIRIES, column: 'user_id', refTable: 'users', refColumn: 'uuid' },
    { table: TABLES.INQUIRY_REPLIES, column: 'inquiry_id', refTable: TABLES.INQUIRIES, refColumn: 'id' },
    { table: TABLES.INQUIRY_REPLIES, column: 'admin_id', refTable: 'admin_users', refColumn: 'id' },
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
        if (!actual) throw new Error(`0032: ${table}.${column} 칸이 없음`);
        if (actual.allowNull !== undefined && actual.allowNull !== (definition.allowNull !== false)) {
            throw new Error(`0032: ${table}.${column} NULL 허용이 다름`);
        }
    }
};

// 표 하나 인덱스 대조 (칸 순서·유일까지)
const verifyIndexes = async (queryInterface, table, indexes) => {
    const present = await queryInterface.showIndex(table);
    for (const index of indexes) {
        const found = present.find((candidate) => candidate.name === index.name);
        if (!found) throw new Error(`0032: ${table}에 ${index.name} 인덱스가 없음`);
        if (indexFieldNames(found).join(',') !== index.fields.join(',')) throw new Error(`0032: ${index.name} 칸이 다름`);
        if ((found.unique === true) !== index.unique) throw new Error(`0032: ${index.name} 유일 여부가 다름`);
    }
};

module.exports = {
    name: '0032-add-inquiries',

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

    // 되돌리기: 답 → 문의 순서로 지움 (쌓인 문의도 사라짐 → 백업 뒤에만)
    async down(queryInterface) {
        const existing = new Set(await queryInterface.showAllTables());
        for (const table of [TABLES.INQUIRY_REPLIES, TABLES.INQUIRIES]) {
            if (existing.has(table)) await queryInterface.dropTable(table);
        }
    },

    async verify(queryInterface, Sequelize) {
        const existing = new Set(await queryInterface.showAllTables());
        for (const [table, columns] of tableDefinitions(Sequelize)) {
            if (!existing.has(table)) throw new Error(`0032: ${table} 표가 없음`);
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
            if (!found) throw new Error(`0032: ${fk.table}.${fk.column} → ${fk.refTable}.${fk.refColumn} 외래 키가 없음`);
        }
    },

    TABLES,
    INDEXES,
    FOREIGN_KEYS,
};
