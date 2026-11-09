'use strict';

// 관리자 페이지 표 마이그레이션, 관리자 세션·로그인 시도 표 새로 + 관리자 계정·관리자 기록·정지 표에 칸 더함
// scripts/migrate-db.js 목록이 씀, 게임 서버 /admin-api가 읽고 씀 (docs/관리자-페이지/설계.md 6-1)
// 없는 것만 만듦·인덱스 따로 확인 (다시 돌려도 안전), down은 이 파일이 만든 것만 지움

const TABLES = Object.freeze({
    ADMIN_USERS: 'admin_users',
    ADMIN_AUDIT_LOGS: 'admin_audit_logs',
    USER_BANS: 'user_bans',
    ADMIN_SESSIONS: 'admin_sessions',
    ADMIN_LOGIN_ATTEMPTS: 'admin_login_attempts',
});

// 기존 표에 더하는 칸 (표 → 칸 → 정의)
const addedColumns = (Sequelize) => ({
    [TABLES.ADMIN_USERS]: {
        // 클라우드플레어 Access 이메일과 맞춰 봄 (두 문이 같은 사람인지)
        email: { type: Sequelize.STRING(255), allowNull: true },
        // 마지막으로 쓴 OTP 칸 번호 (같은 번호 다시 못 쓰게)
        totp_last_step: { type: Sequelize.BIGINT, allowNull: true },
        password_changed_at: { type: Sequelize.DATE, allowNull: true },
    },
    [TABLES.ADMIN_AUDIT_LOGS]: {
        // 관리자끼리 메모 (플레이어에겐 안 보임)
        reason: { type: Sequelize.STRING(500), allowNull: true },
        access_email: { type: Sequelize.STRING(255), allowNull: true },
        request_id: { type: Sequelize.STRING(64), allowNull: true },
    },
    [TABLES.USER_BANS]: {
        // 해제 = end_at 지금·is_permanent 0도 같이 → 기존 정지 판정은 이 칸을 안 봐도 맞음
        lifted_at: { type: Sequelize.DATE, allowNull: true },
        lifted_by: { type: Sequelize.UUID, allowNull: true },
        lift_reason: { type: Sequelize.STRING(500), allowNull: true },
    },
});

// 새 표 (만드는 순서 그대로)
const newTables = (Sequelize) => [
    [TABLES.ADMIN_SESSIONS, {
        // 쿠키 원문의 sha256 (원문은 DB에 없음)
        id: { type: Sequelize.CHAR(64), primaryKey: true, allowNull: false },
        admin_id: { type: Sequelize.UUID, allowNull: false, references: { model: TABLES.ADMIN_USERS, key: 'id' } },
        access_email: { type: Sequelize.STRING(255), allowNull: true },
        ip: { type: Sequelize.STRING(45), allowNull: true },
        user_agent: { type: Sequelize.STRING(255), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        // 가만히 30분 판정용 (1분에 한 번만 고침)
        last_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        // 로그인 뒤 12시간
        expires_at: { type: Sequelize.DATE, allowNull: false },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
    }],
    [TABLES.ADMIN_LOGIN_ATTEMPTS, {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
        // 없는 아이디도 셈 (아이디마다 잠깐 막기)
        login_id: { type: Sequelize.STRING(50), allowNull: false },
        admin_id: { type: Sequelize.UUID, allowNull: true },
        ip: { type: Sequelize.STRING(45), allowNull: false },
        access_email: { type: Sequelize.STRING(255), allowNull: true },
        ok: { type: Sequelize.BOOLEAN, allowNull: false },
        // BAD_CREDENTIALS·LOCKED·EMAIL_MISMATCH·DISABLED
        failure_code: { type: Sequelize.STRING(40), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
];

// 이 파일이 만드는 인덱스 (verify가 칸 순서·유일까지 대조)
const INDEXES = Object.freeze({
    [TABLES.ADMIN_USERS]: [{ name: 'admin_users_email_unique', fields: ['email'], unique: true }],
    // 처리 이력 칸 거르기 (동작 묶음 + 기간)
    [TABLES.ADMIN_AUDIT_LOGS]: [{ name: 'admin_audit_logs_action_created_idx', fields: ['action', 'created_at'], unique: false }],
    [TABLES.ADMIN_SESSIONS]: [
        { name: 'admin_sessions_admin_revoked_idx', fields: ['admin_id', 'revoked_at'], unique: false },
        // 지난 세션 치우기
        { name: 'admin_sessions_expires_idx', fields: ['expires_at'], unique: false },
    ],
    [TABLES.ADMIN_LOGIN_ATTEMPTS]: [
        { name: 'admin_login_attempts_login_created_idx', fields: ['login_id', 'created_at'], unique: false },
        { name: 'admin_login_attempts_ip_created_idx', fields: ['ip', 'created_at'], unique: false },
    ],
});

const FOREIGN_KEYS = Object.freeze([
    { table: TABLES.ADMIN_SESSIONS, column: 'admin_id', refTable: TABLES.ADMIN_USERS, refColumn: 'id' },
]);

// showIndex 결과 칸 이름만 (MySQL은 객체, 가짜는 글자)
const indexFieldNames = (index) => (Array.isArray(index?.fields) ? index.fields : []).map((field) => (
    typeof field === 'string' ? field : (field?.attribute ?? field?.name ?? '')
));

const sameName = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

// 없는 인덱스만 만듦 (표만 만들고 죽은 경우도 메움)
const ensureIndexes = async (queryInterface, indexesByTable) => {
    for (const [table, indexes] of Object.entries(indexesByTable)) {
        const present = await queryInterface.showIndex(table);
        for (const index of indexes) {
            if (present.some((candidate) => candidate.name === index.name)) continue;
            await queryInterface.addIndex(table, index.fields, { name: index.name, unique: index.unique });
        }
    }
};

// 인덱스 하나 대조, 다르면 던짐
const verifyIndex = (present, table, index) => {
    const found = present.find((candidate) => candidate.name === index.name);
    if (!found) throw new Error(`0031: ${table}에 ${index.name} 인덱스가 없음`);
    if (indexFieldNames(found).join(',') !== index.fields.join(',')) throw new Error(`0031: ${index.name} 칸이 다름`);
    if ((found.unique === true) !== index.unique) throw new Error(`0031: ${index.name} 유일 여부가 다름`);
};

module.exports = {
    name: '0031-add-admin-page-tables',

    async up(queryInterface, Sequelize) {
        for (const [table, columns] of Object.entries(addedColumns(Sequelize))) {
            const described = await queryInterface.describeTable(table);
            for (const [column, definition] of Object.entries(columns)) {
                if (!described[column]) await queryInterface.addColumn(table, column, definition);
            }
        }
        const existing = new Set(await queryInterface.showAllTables());
        for (const [table, columns] of newTables(Sequelize)) {
            if (!existing.has(table)) await queryInterface.createTable(table, columns);
        }
        await ensureIndexes(queryInterface, INDEXES);
    },

    // 되돌리기: 새 표 지우고 더한 인덱스·칸만 뺌 (쌓인 세션·로그인 기록·해제 사유도 사라짐 → 백업 뒤에만)
    async down(queryInterface, Sequelize) {
        const existing = new Set(await queryInterface.showAllTables());
        for (const table of [TABLES.ADMIN_LOGIN_ATTEMPTS, TABLES.ADMIN_SESSIONS]) {
            if (existing.has(table)) await queryInterface.dropTable(table);
        }
        for (const table of [TABLES.ADMIN_USERS, TABLES.ADMIN_AUDIT_LOGS]) {
            const present = await queryInterface.showIndex(table);
            for (const index of INDEXES[table]) {
                if (present.some((candidate) => candidate.name === index.name)) await queryInterface.removeIndex(table, index.name);
            }
        }
        for (const [table, columns] of Object.entries(addedColumns(Sequelize))) {
            const described = await queryInterface.describeTable(table);
            for (const column of Object.keys(columns)) {
                if (described[column]) await queryInterface.removeColumn(table, column);
            }
        }
    },

    // 칸·표·인덱스·외래 키 대조, 어긋나면 던지기만
    async verify(queryInterface, Sequelize) {
        for (const [table, columns] of Object.entries(addedColumns(Sequelize))) {
            const described = await queryInterface.describeTable(table);
            for (const column of Object.keys(columns)) {
                if (!described[column]) throw new Error(`0031: ${table}.${column} 칸이 없음`);
            }
        }
        const existing = new Set(await queryInterface.showAllTables());
        for (const [table, columns] of newTables(Sequelize)) {
            if (!existing.has(table)) throw new Error(`0031: ${table} 표가 없음`);
            const described = await queryInterface.describeTable(table);
            for (const [column, definition] of Object.entries(columns)) {
                const actual = described[column];
                if (!actual) throw new Error(`0031: ${table}.${column} 칸이 없음`);
                if (actual.allowNull !== undefined && actual.allowNull !== (definition.allowNull !== false)) {
                    throw new Error(`0031: ${table}.${column} NULL 허용이 다름`);
                }
            }
        }
        for (const [table, indexes] of Object.entries(INDEXES)) {
            const present = await queryInterface.showIndex(table);
            for (const index of indexes) verifyIndex(present, table, index);
        }
        if (typeof queryInterface.getForeignKeyReferencesForTable !== 'function') return;
        for (const fk of FOREIGN_KEYS) {
            const references = await queryInterface.getForeignKeyReferencesForTable(fk.table);
            const found = Array.isArray(references) && references.some((reference) => (
                sameName(reference?.columnName, fk.column)
                && sameName(reference?.referencedTableName, fk.refTable)
                && sameName(reference?.referencedColumnName, fk.refColumn)
            ));
            if (!found) throw new Error(`0031: ${fk.table}.${fk.column} → ${fk.refTable}.${fk.refColumn} 외래 키가 없음`);
        }
    },

    TABLES,
    INDEXES,
    FOREIGN_KEYS,
};
