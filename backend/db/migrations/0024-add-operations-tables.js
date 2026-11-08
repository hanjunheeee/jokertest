'use strict';

// 운영 받침 표 9개 마이그레이션, 신고·채팅 증거·금지어·점검·관리자 계정·관리자 기록·쿠폰·쿠폰 사용
// 관리자 서버(따로 운영, 같은 DB)가 읽고 쓰는 표 + 게임 서버가 따르는 표 (docs/운영_받침_2026-11-09.md)
// 없는 표만 만듦 (다시 돌려도 안전), 인덱스도 따로 확인 (표 만든 뒤 죽은 경우)
// 약관 버전·동의 표는 여기 없음 (회원 기능 쪽 마이그레이션 몫)

const TABLES = Object.freeze({
    REPORTS: 'reports',
    REPORT_CHAT_EVIDENCE: 'report_chat_evidence',
    BANNED_WORDS: 'banned_words',
    MAINTENANCE_STATE: 'maintenance_state',
    ADMIN_USERS: 'admin_users',
    ADMIN_AUDIT_LOGS: 'admin_audit_logs',
    COUPONS: 'coupons',
    COUPON_REDEMPTIONS: 'coupon_redemptions',
});

// 점검 상태는 한 줄만 (id 1 고정)
const MAINTENANCE_ROW_ID = 1;

// 표마다 인덱스 이름·칸·유일 여부 (verify가 칸 순서까지 대조)
const INDEXES = Object.freeze({
    [TABLES.REPORTS]: [
        // 같은 사람이 같은 판 같은 대상을 두 번 신고 못 하게
        { name: 'reports_reporter_target_game_unique', fields: ['reporter_id', 'target_id', 'game_id'], unique: true },
        { name: 'reports_status_created_idx', fields: ['status', 'created_at'], unique: false },
        { name: 'reports_target_created_idx', fields: ['target_id', 'created_at'], unique: false },
    ],
    [TABLES.REPORT_CHAT_EVIDENCE]: [
        { name: 'report_chat_evidence_report_idx', fields: ['report_id'], unique: false },
        // 90일 지난 증거 지우기용
        { name: 'report_chat_evidence_saved_idx', fields: ['saved_at'], unique: false },
    ],
    [TABLES.BANNED_WORDS]: [
        { name: 'banned_words_word_unique', fields: ['word'], unique: true },
    ],
    [TABLES.ADMIN_USERS]: [
        { name: 'admin_users_login_id_unique', fields: ['login_id'], unique: true },
    ],
    [TABLES.ADMIN_AUDIT_LOGS]: [
        { name: 'admin_audit_logs_admin_created_idx', fields: ['admin_id', 'created_at'], unique: false },
        { name: 'admin_audit_logs_target_idx', fields: ['target_type', 'target_id'], unique: false },
        { name: 'admin_audit_logs_created_idx', fields: ['created_at'], unique: false },
    ],
    [TABLES.COUPONS]: [
        { name: 'coupons_code_unique', fields: ['code'], unique: true },
    ],
    [TABLES.COUPON_REDEMPTIONS]: [
        // 한 사람 한 쿠폰 한 번
        { name: 'coupon_redemptions_coupon_user_unique', fields: ['coupon_id', 'user_id'], unique: true },
        { name: 'coupon_redemptions_user_idx', fields: ['user_id'], unique: false },
    ],
});

// verify가 보는 칸: NULL 허용·기본 키만 (타입 표기는 방언마다 달라 안 봄)
const COLUMN_CONTRACTS = Object.freeze({
    [TABLES.REPORTS]: {
        id: { allowNull: false, primaryKey: true },
        reporter_id: { allowNull: false }, target_id: { allowNull: false }, game_id: { allowNull: false },
        reason_code: { allowNull: false }, memo: { allowNull: true }, status: { allowNull: false },
        handled_by_admin_id: { allowNull: true }, handled_at: { allowNull: true }, created_at: { allowNull: false },
    },
    [TABLES.REPORT_CHAT_EVIDENCE]: {
        id: { allowNull: false, primaryKey: true },
        report_id: { allowNull: false }, game_id: { allowNull: false }, messages: { allowNull: false }, saved_at: { allowNull: false },
    },
    [TABLES.BANNED_WORDS]: {
        id: { allowNull: false, primaryKey: true },
        word: { allowNull: false }, is_active: { allowNull: false }, created_by_admin_id: { allowNull: true },
        created_at: { allowNull: false }, updated_at: { allowNull: false },
    },
    [TABLES.MAINTENANCE_STATE]: {
        id: { allowNull: false, primaryKey: true },
        is_enabled: { allowNull: false }, message: { allowNull: true }, starts_at: { allowNull: true },
        ends_at: { allowNull: true }, updated_by_admin_id: { allowNull: true }, updated_at: { allowNull: false },
    },
    [TABLES.ADMIN_USERS]: {
        id: { allowNull: false, primaryKey: true },
        login_id: { allowNull: false }, password_hash: { allowNull: false }, role: { allowNull: false },
        totp_secret: { allowNull: true }, is_active: { allowNull: false }, last_login_at: { allowNull: true },
        created_at: { allowNull: false }, updated_at: { allowNull: false },
    },
    [TABLES.ADMIN_AUDIT_LOGS]: {
        id: { allowNull: false, primaryKey: true },
        admin_id: { allowNull: false }, action: { allowNull: false }, target_type: { allowNull: true },
        target_id: { allowNull: true }, before_value: { allowNull: true }, after_value: { allowNull: true },
        ip: { allowNull: true }, created_at: { allowNull: false },
    },
    [TABLES.COUPONS]: {
        id: { allowNull: false, primaryKey: true },
        code: { allowNull: false }, reward_type: { allowNull: false }, reward_amount: { allowNull: false },
        max_uses: { allowNull: true }, used_count: { allowNull: false }, starts_at: { allowNull: true },
        ends_at: { allowNull: true }, is_active: { allowNull: false }, created_by_admin_id: { allowNull: true },
        created_at: { allowNull: false }, updated_at: { allowNull: false },
    },
    [TABLES.COUPON_REDEMPTIONS]: {
        id: { allowNull: false, primaryKey: true },
        coupon_id: { allowNull: false }, user_id: { allowNull: false }, redeemed_at: { allowNull: false },
    },
});

// 외래 키 (표·칸 → 가리키는 표·칸)
const FOREIGN_KEYS = Object.freeze([
    { table: TABLES.REPORTS, column: 'reporter_id', refTable: 'users', refColumn: 'uuid' },
    { table: TABLES.REPORTS, column: 'target_id', refTable: 'users', refColumn: 'uuid' },
    { table: TABLES.REPORT_CHAT_EVIDENCE, column: 'report_id', refTable: TABLES.REPORTS, refColumn: 'id' },
    { table: TABLES.ADMIN_AUDIT_LOGS, column: 'admin_id', refTable: TABLES.ADMIN_USERS, refColumn: 'id' },
    { table: TABLES.COUPON_REDEMPTIONS, column: 'coupon_id', refTable: TABLES.COUPONS, refColumn: 'id' },
    { table: TABLES.COUPON_REDEMPTIONS, column: 'user_id', refTable: 'users', refColumn: 'uuid' },
]);

// 표 정의 (만드는 순서 = 외래 키 가리키는 표 먼저)
const tableDefinitions = (Sequelize) => [
    [TABLES.REPORTS, {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
        reporter_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
        target_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
        // 판 id (game_results.id와 같은 모양, 판 저장 전 신고도 받아 외래 키는 안 검)
        game_id: { type: Sequelize.STRING(64), allowNull: false },
        // ABUSE·SPAM·GRIEFING·CHEATING·NICKNAME·ETC (게임 서버가 목록으로 거름)
        reason_code: { type: Sequelize.STRING(40), allowNull: false },
        memo: { type: Sequelize.STRING(500), allowNull: true },
        // OPEN → RESOLVED·DISMISSED (관리자 서버가 바꿈)
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'OPEN' },
        handled_by_admin_id: { type: Sequelize.UUID, allowNull: true },
        handled_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
    [TABLES.REPORT_CHAT_EVIDENCE, {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
        report_id: {
            type: Sequelize.BIGINT, allowNull: false,
            references: { model: TABLES.REPORTS, key: 'id' }, onDelete: 'CASCADE',
        },
        game_id: { type: Sequelize.STRING(64), allowNull: false },
        // 판 채팅 묶음 [{ at, channel, senderUuid, nickname, text }]
        messages: { type: Sequelize.JSON, allowNull: false },
        saved_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
    [TABLES.BANNED_WORDS, {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        word: { type: Sequelize.STRING(100), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_by_admin_id: { type: Sequelize.UUID, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
    [TABLES.MAINTENANCE_STATE, {
        // 늘 1 한 줄
        id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
        is_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        message: { type: Sequelize.STRING(500), allowNull: true },
        // 시작 전이면 아직 안 막음, 끝 예정은 안내용 (자동으로 안 꺼짐)
        starts_at: { type: Sequelize.DATE, allowNull: true },
        ends_at: { type: Sequelize.DATE, allowNull: true },
        updated_by_admin_id: { type: Sequelize.UUID, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
    [TABLES.ADMIN_USERS, {
        // users.uuid와 같은 모양 (user_bans.banned_by에 그대로 넣게)
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        login_id: { type: Sequelize.STRING(50), allowNull: false },
        password_hash: { type: Sequelize.STRING(255), allowNull: false },
        // SUPER·OPERATOR·VIEWER (관리자 서버가 정함)
        role: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'VIEWER' },
        // 2단계 인증 비밀 (관리자 서버가 암호화해 넣음)
        totp_secret: { type: Sequelize.STRING(255), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        last_login_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
    [TABLES.ADMIN_AUDIT_LOGS, {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
        admin_id: { type: Sequelize.UUID, allowNull: false, references: { model: TABLES.ADMIN_USERS, key: 'id' } },
        action: { type: Sequelize.STRING(60), allowNull: false },
        target_type: { type: Sequelize.STRING(40), allowNull: true },
        target_id: { type: Sequelize.STRING(64), allowNull: true },
        before_value: { type: Sequelize.JSON, allowNull: true },
        after_value: { type: Sequelize.JSON, allowNull: true },
        ip: { type: Sequelize.STRING(45), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
    [TABLES.COUPONS, {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        code: { type: Sequelize.STRING(40), allowNull: false },
        // GOLD·DIAMOND (장부 통화 그대로)
        reward_type: { type: Sequelize.STRING(20), allowNull: false },
        reward_amount: { type: Sequelize.INTEGER, allowNull: false },
        // null이면 횟수 제한 없음
        max_uses: { type: Sequelize.INTEGER, allowNull: true },
        used_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        starts_at: { type: Sequelize.DATE, allowNull: true },
        ends_at: { type: Sequelize.DATE, allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_by_admin_id: { type: Sequelize.UUID, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
    [TABLES.COUPON_REDEMPTIONS, {
        // 장부 참조 id(coupon:<이 id>)로 씀
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        coupon_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: TABLES.COUPONS, key: 'id' } },
        user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
        redeemed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
];

// showIndex 결과 칸 이름만 (MySQL은 객체, 가짜는 글자)
const indexFieldNames = (index) => (Array.isArray(index?.fields) ? index.fields : []).map((field) => (
    typeof field === 'string' ? field : (field?.attribute ?? field?.name ?? '')
));

const sameName = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

module.exports = {
    name: '0024-add-operations-tables',

    async up(queryInterface, Sequelize, sequelize) {
        const existing = new Set(await queryInterface.showAllTables());
        for (const [table, columns] of tableDefinitions(Sequelize)) {
            if (!existing.has(table)) await queryInterface.createTable(table, columns);
        }

        // 인덱스는 표와 따로 확인 (표만 만들고 죽은 경우)
        for (const [table, indexes] of Object.entries(INDEXES)) {
            const present = await queryInterface.showIndex(table);
            for (const index of indexes) {
                if (present.some((candidate) => candidate.name === index.name)) continue;
                await queryInterface.addIndex(table, index.fields, { name: index.name, unique: index.unique });
            }
        }

        // 점검 한 줄 없으면 꺼진 상태로 넣음 (게임 서버는 읽기만)
        if (sequelize) {
            await sequelize.query(
                `INSERT IGNORE INTO \`${TABLES.MAINTENANCE_STATE}\` (id, is_enabled, message, updated_at) VALUES (:id, 0, NULL, NOW())`,
                { replacements: { id: MAINTENANCE_ROW_ID } },
            );
        }
    },

    // 되돌리기: 가리키는 표부터 지움 (쌓인 신고·쿠폰 기록도 사라짐 → 백업 뒤에만)
    async down(queryInterface) {
        const existing = new Set(await queryInterface.showAllTables());
        const order = [
            TABLES.COUPON_REDEMPTIONS, TABLES.COUPONS, TABLES.ADMIN_AUDIT_LOGS, TABLES.ADMIN_USERS,
            TABLES.MAINTENANCE_STATE, TABLES.BANNED_WORDS, TABLES.REPORT_CHAT_EVIDENCE, TABLES.REPORTS,
        ];
        for (const table of order) {
            if (existing.has(table)) await queryInterface.dropTable(table);
        }
    },

    // 표·칸·인덱스·외래 키 대조, 어긋나면 던지기만 (지우거나 다시 만들지 않음)
    async verify(queryInterface) {
        const existing = new Set(await queryInterface.showAllTables());
        const missing = Object.values(TABLES).filter((table) => !existing.has(table));
        if (missing.length > 0) throw new Error(`0024: 없는 표 [${missing.join(', ')}]`);

        for (const [table, contracts] of Object.entries(COLUMN_CONTRACTS)) {
            const described = await queryInterface.describeTable(table);
            for (const [column, contract] of Object.entries(contracts)) {
                const actual = described[column];
                if (!actual) throw new Error(`0024: ${table}.${column} 칸이 없습니다.`);
                if (actual.allowNull !== undefined && actual.allowNull !== contract.allowNull) {
                    throw new Error(`0024: ${table}.${column} NULL 허용이 다릅니다 (기대 ${contract.allowNull})`);
                }
                if (contract.primaryKey && actual.primaryKey !== undefined && actual.primaryKey !== true) {
                    throw new Error(`0024: ${table}.${column}이 기본 키가 아닙니다.`);
                }
            }
        }

        for (const [table, indexes] of Object.entries(INDEXES)) {
            const present = await queryInterface.showIndex(table);
            for (const index of indexes) {
                const found = present.find((candidate) => candidate.name === index.name);
                if (!found) throw new Error(`0024: ${table}에 ${index.name} 인덱스가 없습니다.`);
                if (indexFieldNames(found).join(',') !== index.fields.join(',')) {
                    throw new Error(`0024: ${index.name} 칸이 다릅니다 (기대 [${index.fields.join(', ')}])`);
                }
                if ((found.unique === true) !== index.unique) {
                    throw new Error(`0024: ${index.name} 유일 여부가 다릅니다 (기대 ${index.unique})`);
                }
            }
        }

        // 외래 키는 방언이 조회를 지원할 때만
        if (typeof queryInterface.getForeignKeyReferencesForTable === 'function') {
            for (const fk of FOREIGN_KEYS) {
                const references = await queryInterface.getForeignKeyReferencesForTable(fk.table);
                const found = Array.isArray(references) && references.some((reference) => (
                    sameName(reference?.columnName, fk.column)
                    && sameName(reference?.referencedTableName, fk.refTable)
                    && sameName(reference?.referencedColumnName, fk.refColumn)
                ));
                if (!found) throw new Error(`0024: ${fk.table}.${fk.column} → ${fk.refTable}.${fk.refColumn} 외래 키가 없습니다.`);
            }
        }
    },

    TABLES,
    INDEXES,
    COLUMN_CONTRACTS,
    FOREIGN_KEYS,
    MAINTENANCE_ROW_ID,
};
