'use strict';

// 약관 버전·동의 표 2개 마이그레이션 + 지금 쓸 자리용 약관 2개 (이용약관·개인정보 처리방침)
// 관리자 서버(같은 DB)가 새 버전을 넣고, 게임 서버는 가입·재동의 때 읽고 동의 기록만 씀 (docs/회원기능_2026-11-09.md)
// 없는 표·인덱스만 만듦 (다시 돌려도 안전), 자리용 문서도 같은 종류·버전이 없을 때만 넣음

const TABLES = Object.freeze({
    TERMS_VERSIONS: 'terms_versions',
    USER_TERMS_AGREEMENTS: 'user_terms_agreements',
});

// 약관 종류 (이용약관·개인정보 처리방침)
const TERMS_KINDS = Object.freeze(['TERMS', 'PRIVACY']);

const INDEXES = Object.freeze({
    [TABLES.TERMS_VERSIONS]: [
        // 같은 종류 같은 버전 두 번 못 넣게
        { name: 'terms_versions_kind_version_unique', fields: ['kind', 'version'], unique: true },
        // 종류마다 지금 시행 중인 버전 찾기용
        { name: 'terms_versions_kind_effective_idx', fields: ['kind', 'effective_at'], unique: false },
    ],
    [TABLES.USER_TERMS_AGREEMENTS]: [
        // 한 사람 한 버전 한 번만 동의 기록
        { name: 'user_terms_agreements_user_version_unique', fields: ['user_id', 'terms_version_id'], unique: true },
        { name: 'user_terms_agreements_version_idx', fields: ['terms_version_id'], unique: false },
    ],
});

// verify가 보는 칸: NULL 허용·기본 키만 (타입 표기는 방언마다 달라 안 봄)
const COLUMN_CONTRACTS = Object.freeze({
    [TABLES.TERMS_VERSIONS]: {
        id: { allowNull: false, primaryKey: true },
        kind: { allowNull: false }, version: { allowNull: false }, title: { allowNull: false },
        body: { allowNull: true }, url: { allowNull: true }, effective_at: { allowNull: false },
        is_required: { allowNull: false }, created_by_admin_id: { allowNull: true }, created_at: { allowNull: false },
    },
    [TABLES.USER_TERMS_AGREEMENTS]: {
        id: { allowNull: false, primaryKey: true },
        user_id: { allowNull: false }, terms_version_id: { allowNull: false }, agreed_at: { allowNull: false },
    },
});

const FOREIGN_KEYS = Object.freeze([
    { table: TABLES.USER_TERMS_AGREEMENTS, column: 'user_id', refTable: 'users', refColumn: 'uuid' },
    { table: TABLES.USER_TERMS_AGREEMENTS, column: 'terms_version_id', refTable: TABLES.TERMS_VERSIONS, refColumn: 'id' },
]);

// 자리용 문서 본문 (실제 법률 문구 아님, 운영자가 관리자 서버에서 새 버전으로 채움)
const PLACEHOLDER_NOTICE = '이 문서는 자리용입니다. 실제 내용은 운영자가 관리자 서버에서 새 버전으로 채웁니다.';
const PLACEHOLDER_SEEDS = Object.freeze([
    {
        kind: 'TERMS',
        version: '0.1-placeholder',
        title: '이용약관',
        body: [
            PLACEHOLDER_NOTICE,
            '',
            '[채워야 할 항목]',
            '- 서비스 이용 조건과 계정 관리 책임',
            '- 채팅 신고 처리: 신고된 판의 채팅을 증거로 90일 보관한 뒤 지움',
            '- 유료 재화(다이아) 결제·환불 기준, 회원 탈퇴 때 남은 재화는 사라짐',
            '- 이용 제한(정지) 기준과 이의 제기 방법',
            '- 만 14세 미만은 가입할 수 없음',
        ].join('\n'),
    },
    {
        kind: 'PRIVACY',
        version: '0.1-placeholder',
        title: '개인정보 처리방침',
        body: [
            PLACEHOLDER_NOTICE,
            '',
            '[채워야 할 항목]',
            '- 수집 항목과 목적: 이메일(로그인·인증번호·계정 안내), 생년월일(만 14세 확인·아이디 찾기), 닉네임(게임 안 표시)',
            '- 결제 기록: 충전 주문·결제 확인 기록 보관 기간',
            '- 채팅 신고 증거: 신고된 판의 채팅 90일 보관',
            '- 보관 기간과 탈퇴 때 처리: 이메일·닉네임은 알아볼 수 없게 바꾸고 전적은 이름 없이 남김',
            '- 개인정보 보호 담당자 연락처',
        ].join('\n'),
    },
]);
// 자리용 문서 시행일 (고정, 다시 돌려도 같은 값)
const PLACEHOLDER_EFFECTIVE_AT = '2026-11-09 00:00:00';

const tableDefinitions = (Sequelize) => [
    [TABLES.TERMS_VERSIONS, {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        kind: { type: Sequelize.STRING(20), allowNull: false },
        version: { type: Sequelize.STRING(40), allowNull: false },
        title: { type: Sequelize.STRING(100), allowNull: false },
        // 본문 또는 주소 둘 중 하나 이상 (관리자 서버 몫)
        body: { type: Sequelize.TEXT, allowNull: true },
        url: { type: Sequelize.STRING(500), allowNull: true },
        effective_at: { type: Sequelize.DATE, allowNull: false },
        is_required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_by_admin_id: { type: Sequelize.UUID, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
    [TABLES.USER_TERMS_AGREEMENTS, {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
        user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
        terms_version_id: {
            type: Sequelize.INTEGER, allowNull: false,
            references: { model: TABLES.TERMS_VERSIONS, key: 'id' },
        },
        // IP는 안 남김 (동의 시각만)
        agreed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    }],
];

const indexFieldNames = (index) => (Array.isArray(index?.fields) ? index.fields : []).map((field) => (
    typeof field === 'string' ? field : (field?.attribute ?? field?.name ?? '')
));

const sameName = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

module.exports = {
    name: '0026-add-terms-agreements',

    async up(queryInterface, Sequelize, sequelize) {
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

        // 자리용 문서: 같은 종류·버전 없을 때만 (유일 인덱스가 겹침 막음)
        if (sequelize) {
            for (const seed of PLACEHOLDER_SEEDS) {
                await sequelize.query(
                    `INSERT IGNORE INTO \`${TABLES.TERMS_VERSIONS}\`
                     (kind, version, title, body, url, effective_at, is_required, created_by_admin_id, created_at)
                     VALUES (:kind, :version, :title, :body, NULL, :effectiveAt, 1, NULL, NOW())`,
                    { replacements: { ...seed, effectiveAt: PLACEHOLDER_EFFECTIVE_AT } },
                );
            }
        }
    },

    async down(queryInterface) {
        const existing = new Set(await queryInterface.showAllTables());
        for (const table of [TABLES.USER_TERMS_AGREEMENTS, TABLES.TERMS_VERSIONS]) {
            if (existing.has(table)) await queryInterface.dropTable(table);
        }
    },

    async verify(queryInterface) {
        const existing = new Set(await queryInterface.showAllTables());
        const missing = Object.values(TABLES).filter((table) => !existing.has(table));
        if (missing.length > 0) throw new Error(`0026: 없는 표 [${missing.join(', ')}]`);

        for (const [table, contracts] of Object.entries(COLUMN_CONTRACTS)) {
            const described = await queryInterface.describeTable(table);
            for (const [column, contract] of Object.entries(contracts)) {
                const actual = described[column];
                if (!actual) throw new Error(`0026: ${table}.${column} 칸이 없습니다.`);
                if (actual.allowNull !== undefined && actual.allowNull !== contract.allowNull) {
                    throw new Error(`0026: ${table}.${column} NULL 허용이 다릅니다 (기대 ${contract.allowNull})`);
                }
                if (contract.primaryKey && actual.primaryKey !== undefined && actual.primaryKey !== true) {
                    throw new Error(`0026: ${table}.${column}이 기본 키가 아닙니다.`);
                }
            }
        }

        for (const [table, indexes] of Object.entries(INDEXES)) {
            const present = await queryInterface.showIndex(table);
            for (const index of indexes) {
                const found = present.find((candidate) => candidate.name === index.name);
                if (!found) throw new Error(`0026: ${table}에 ${index.name} 인덱스가 없습니다.`);
                if (indexFieldNames(found).join(',') !== index.fields.join(',')) {
                    throw new Error(`0026: ${index.name} 칸이 다릅니다 (기대 [${index.fields.join(', ')}])`);
                }
                if ((found.unique === true) !== index.unique) {
                    throw new Error(`0026: ${index.name} 유일 여부가 다릅니다 (기대 ${index.unique})`);
                }
            }
        }

        if (typeof queryInterface.getForeignKeyReferencesForTable === 'function') {
            for (const fk of FOREIGN_KEYS) {
                const references = await queryInterface.getForeignKeyReferencesForTable(fk.table);
                const found = Array.isArray(references) && references.some((reference) => (
                    sameName(reference?.columnName, fk.column)
                    && sameName(reference?.referencedTableName, fk.refTable)
                    && sameName(reference?.referencedColumnName, fk.refColumn)
                ));
                if (!found) throw new Error(`0026: ${fk.table}.${fk.column} → ${fk.refTable}.${fk.refColumn} 외래 키가 없습니다.`);
            }
        }
    },

    TABLES,
    TERMS_KINDS,
    INDEXES,
    COLUMN_CONTRACTS,
    FOREIGN_KEYS,
    PLACEHOLDER_SEEDS,
    PLACEHOLDER_EFFECTIVE_AT,
};
