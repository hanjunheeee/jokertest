'use strict';

// F-31a: 가입 이메일 인증 상태 테이블을 추가한다. 컬럼 정의는
// backend/models/user/signupEmailVerification.model.js와 항상 같은 모양이어야 한다.
// users에는 어떤 컬럼도 추가하지 않는다(email_verified는 이 마이그레이션이 갱신하지
// 않는다 — A-03) — 기존 계정의 로그인·email_verified 값은 이 마이그레이션 전후로
// 그대로 유지된다.
//
// 0001~0015와 같은 패턴(존재 확인 후 생성, 부분 실행 시 빠진 인덱스만 보완, verify,
// 파괴적 down 금지)을 따른다.

const TABLE_NAME = 'signup_email_verifications';
const EMAIL_PURPOSE_UNIQUE_INDEX = 'signup_email_verifications_email_purpose_unique';
const PROOF_HASH_UNIQUE_INDEX = 'signup_email_verifications_proof_hash_unique';

const TABLE_NAMES = { SIGNUP_EMAIL_VERIFICATIONS: TABLE_NAME };

const REQUIRED_COLUMNS = [
    'id', 'email', 'purpose', 'generation',
    'code_hash', 'code_expires_at', 'attempts', 'code_consumed_at', 'sent_at',
    'proof_hash', 'proof_expires_at', 'proof_consumed_at',
];

/**
 * 컬럼별로 verify가 반드시 확인하는 계약(0012-add-notifications.js의 COLUMN_CONTRACTS와
 * 같은 원칙). type은 MySQL describeTable()의 원시 타입 문자열에 대한 관대한 정규식이다 —
 * 표시 폭(예: int(11) vs int)까지는 강제하지 않되, INTEGER/VARCHAR(n)/DATETIME처럼
 * 근본적으로 다른 컬럼으로 바뀌는 것은 잡아낸다. code_hash/proof_hash가 nullable이 아니게
 * 바뀌면 "원문 대신 해시만 저장한다"는 전제와 무관하게 매 요청마다 값이 강제되어 버리고,
 * email/purpose가 nullable이면 유일 인덱스가 있어도 행 식별이 흔들린다.
 */
const COLUMN_CONTRACTS = Object.freeze({
    id: { allowNull: false, primaryKey: true, type: /^int/i },
    email: { allowNull: false, type: /^varchar\(100\)$/i },
    purpose: { allowNull: false, type: /^varchar\(20\)$/i },
    generation: { allowNull: false, type: /^int/i },
    code_hash: { allowNull: true, type: /^varchar\(64\)$/i },
    code_expires_at: { allowNull: true, type: /^datetime/i },
    attempts: { allowNull: false, type: /^int/i },
    code_consumed_at: { allowNull: true, type: /^datetime/i },
    sent_at: { allowNull: true, type: /^datetime/i },
    proof_hash: { allowNull: true, type: /^varchar\(64\)$/i },
    proof_expires_at: { allowNull: true, type: /^datetime/i },
    proof_consumed_at: { allowNull: true, type: /^datetime/i },
});

/** 인덱스 이름별로 정확히 어떤 컬럼을 어느 순서로 덮어야 하는지(0012와 같은 원칙) —
 *  이름과 unique만 보면 UNIQUE(id)에 같은 이름만 붙인 스키마도 통과해버린다. */
const EXPECTED_INDEXES = Object.freeze({
    [EMAIL_PURPOSE_UNIQUE_INDEX]: { unique: true, fields: ['email', 'purpose'] },
    [PROOF_HASH_UNIQUE_INDEX]: { unique: true, fields: ['proof_hash'] },
});

/** showIndex() 결과의 필드 이름만 뽑는다(MySQL은 [{attribute,...}], 인메모리 시험 대역은
 *  문자열 배열을 줄 수 있어 양쪽을 모두 받는다 — 0012-add-notifications.js와 동일). */
const indexFieldNames = (index) => (Array.isArray(index?.fields) ? index.fields : []).map((field) => (
    typeof field === 'string' ? field : (field?.attribute ?? field?.name ?? '')
));

module.exports = {
    name: '0016-signup-email-verification',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());

        if (!existingTables.has(TABLE_NAME)) {
            await queryInterface.createTable(TABLE_NAME, {
                id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
                email: { type: Sequelize.STRING(100), allowNull: false },
                purpose: { type: Sequelize.STRING(20), allowNull: false },
                generation: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                code_hash: { type: Sequelize.STRING(64), allowNull: true },
                code_expires_at: { type: Sequelize.DATE, allowNull: true },
                attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                code_consumed_at: { type: Sequelize.DATE, allowNull: true },
                sent_at: { type: Sequelize.DATE, allowNull: true },
                proof_hash: { type: Sequelize.STRING(64), allowNull: true },
                proof_expires_at: { type: Sequelize.DATE, allowNull: true },
                proof_consumed_at: { type: Sequelize.DATE, allowNull: true },
            });
        }

        // 부분 실행(테이블은 만들어졌지만 인덱스 추가 단계에서 중단된 경우)에도 빠진
        // 인덱스만 보완한다 — 기존 행은 건드리지 않는다.
        const indexes = await queryInterface.showIndex(TABLE_NAME);
        if (!indexes.some((index) => index.name === EMAIL_PURPOSE_UNIQUE_INDEX)) {
            await queryInterface.addIndex(TABLE_NAME, ['email', 'purpose'], {
                name: EMAIL_PURPOSE_UNIQUE_INDEX, unique: true,
            });
        }
        if (!indexes.some((index) => index.name === PROOF_HASH_UNIQUE_INDEX)) {
            await queryInterface.addIndex(TABLE_NAME, ['proof_hash'], {
                name: PROOF_HASH_UNIQUE_INDEX, unique: true,
            });
        }
    },

    async down() {
        throw new Error('0016-signup-email-verification의 down()은 지원하지 않습니다.');
    },

    async verify(queryInterface) {
        const table = await queryInterface.describeTable(TABLE_NAME);
        const missing = REQUIRED_COLUMNS.filter((column) => !table[column]);
        if (missing.length > 0) {
            throw new Error(`${TABLE_NAME}에 누락된 컬럼: [${missing.join(', ')}]`);
        }

        for (const [column, contract] of Object.entries(COLUMN_CONTRACTS)) {
            const actual = table[column];
            // describeTable이 allowNull/type을 주지 않는 방언에서는 그 항목을 판정하지
            // 않는다(없는 정보를 불일치로 단정하지 않는다) — 0012-add-notifications.js와 동일.
            if (actual.allowNull !== undefined && actual.allowNull !== contract.allowNull) {
                throw new Error(
                    `${TABLE_NAME}.${column}의 NULL 허용이 계약과 다릅니다: ` +
                    `기대 allowNull=${contract.allowNull}, 실제 allowNull=${actual.allowNull}`,
                );
            }
            if (contract.primaryKey === true && actual.primaryKey !== undefined && actual.primaryKey !== true) {
                throw new Error(`${TABLE_NAME}.${column} 컬럼이 기본 키가 아닙니다.`);
            }
            if (contract.type && actual.type !== undefined && !contract.type.test(String(actual.type))) {
                throw new Error(
                    `${TABLE_NAME}.${column}의 타입이 계약과 다릅니다: ` +
                    `기대 패턴 ${contract.type}, 실제 ${actual.type}`,
                );
            }
        }

        const indexes = await queryInterface.showIndex(TABLE_NAME);
        for (const [name, expected] of Object.entries(EXPECTED_INDEXES)) {
            const index = indexes.find((candidate) => candidate.name === name);
            if (!index) {
                throw new Error(`${TABLE_NAME} 적용 후에도 ${name} 인덱스가 없습니다.`);
            }
            // 이름이 같아도 덮는 컬럼이 다르면(예: 같은 이름의 UNIQUE(id)) 유일성 계약이
            // 지켜지지 않는다 — 순서까지 정확히 대조한다.
            const actualFields = indexFieldNames(index);
            if (actualFields.join(',') !== expected.fields.join(',')) {
                throw new Error(
                    `${TABLE_NAME}의 ${name} 인덱스가 기대한 컬럼을 덮지 않습니다: ` +
                    `기대 [${expected.fields.join(', ')}], 실제 [${actualFields.join(', ')}]`,
                );
            }
            const isUnique = index.unique === true;
            if (isUnique !== expected.unique) {
                throw new Error(
                    `${TABLE_NAME}의 ${name} 인덱스 unique 여부가 계약과 다릅니다: ` +
                    `기대 ${expected.unique}, 실제 ${isUnique}`,
                );
            }
        }
    },

    TABLE_NAME,
    TABLE_NAMES,
    EMAIL_PURPOSE_UNIQUE_INDEX,
    PROOF_HASH_UNIQUE_INDEX,
    REQUIRED_COLUMNS,
    COLUMN_CONTRACTS,
    EXPECTED_INDEXES,
};
