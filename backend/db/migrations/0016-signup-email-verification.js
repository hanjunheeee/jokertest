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
        if (table.email.allowNull !== false) {
            throw new Error(`${TABLE_NAME}.email이 NOT NULL이 아닙니다.`);
        }
        if (table.purpose.allowNull !== false) {
            throw new Error(`${TABLE_NAME}.purpose가 NOT NULL이 아닙니다.`);
        }
        if (table.code_hash.allowNull !== true) {
            throw new Error(`${TABLE_NAME}.code_hash가 nullable이 아닙니다.`);
        }
        if (table.proof_hash.allowNull !== true) {
            throw new Error(`${TABLE_NAME}.proof_hash가 nullable이 아닙니다.`);
        }

        const indexes = await queryInterface.showIndex(TABLE_NAME);
        const emailPurposeIndex = indexes.find((index) => index.name === EMAIL_PURPOSE_UNIQUE_INDEX);
        if (!emailPurposeIndex || emailPurposeIndex.unique !== true) {
            throw new Error(`${EMAIL_PURPOSE_UNIQUE_INDEX} 유일 인덱스가 없습니다.`);
        }
        const proofHashIndex = indexes.find((index) => index.name === PROOF_HASH_UNIQUE_INDEX);
        if (!proofHashIndex || proofHashIndex.unique !== true) {
            throw new Error(`${PROOF_HASH_UNIQUE_INDEX} 유일 인덱스가 없습니다.`);
        }
    },

    TABLE_NAME,
    TABLE_NAMES,
    EMAIL_PURPOSE_UNIQUE_INDEX,
    PROOF_HASH_UNIQUE_INDEX,
};
