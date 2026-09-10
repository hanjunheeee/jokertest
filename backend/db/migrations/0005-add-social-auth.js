'use strict';

// F-05 소셜 계정 공통 기반 — external_identities(AC-01 유일 제약), oauth_states(AC-05
// state 검증), social_signup_intents(AC-02/AC-03 가입 보완 자격) 3개 테이블을 추가한다.
// 0004와 같은 패턴으로 재실행 시 이미 테이블이 있으면 아무 것도 하지 않는 멱등한 형태다.
// 기존에 적용된 0001~0004의 내용·체크섬은 건드리지 않는다.

const TABLE_NAMES = {
    EXTERNAL_IDENTITIES: 'external_identities',
    OAUTH_STATES: 'oauth_states',
    SOCIAL_SIGNUP_INTENTS: 'social_signup_intents',
};

module.exports = {
    name: '0005-add-social-auth',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());

        if (!existingTables.has(TABLE_NAMES.EXTERNAL_IDENTITIES)) {
            await queryInterface.createTable(TABLE_NAMES.EXTERNAL_IDENTITIES, {
                id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
                provider: { type: Sequelize.STRING(30), allowNull: false },
                subject: { type: Sequelize.STRING(255), allowNull: false },
                user_id: {
                    type: Sequelize.UUID, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                email_snapshot: { type: Sequelize.STRING(100), allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
            await queryInterface.addIndex(TABLE_NAMES.EXTERNAL_IDENTITIES, ['provider', 'subject'], {
                name: 'external_identities_provider_subject_unique', unique: true,
            });
            await queryInterface.addIndex(TABLE_NAMES.EXTERNAL_IDENTITIES, ['user_id'], {
                name: 'external_identities_user_id',
            });
        }

        if (!existingTables.has(TABLE_NAMES.OAUTH_STATES)) {
            await queryInterface.createTable(TABLE_NAMES.OAUTH_STATES, {
                id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
                state_hash: { type: Sequelize.STRING(64), allowNull: false },
                purpose: { type: Sequelize.STRING(20), allowNull: false },
                user_id: {
                    type: Sequelize.UUID, allowNull: true,
                    references: { model: 'users', key: 'uuid' },
                },
                browser_fingerprint_hash: { type: Sequelize.STRING(64), allowNull: false },
                expires_at: { type: Sequelize.DATE, allowNull: false },
                consumed_at: { type: Sequelize.DATE, allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
            await queryInterface.addIndex(TABLE_NAMES.OAUTH_STATES, ['state_hash'], {
                name: 'oauth_states_state_hash_unique', unique: true,
            });
        }

        if (!existingTables.has(TABLE_NAMES.SOCIAL_SIGNUP_INTENTS)) {
            await queryInterface.createTable(TABLE_NAMES.SOCIAL_SIGNUP_INTENTS, {
                id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
                intent_token_hash: { type: Sequelize.STRING(64), allowNull: false },
                provider: { type: Sequelize.STRING(30), allowNull: false },
                subject: { type: Sequelize.STRING(255), allowNull: false },
                email: { type: Sequelize.STRING(100), allowNull: false },
                expires_at: { type: Sequelize.DATE, allowNull: false },
                consumed_at: { type: Sequelize.DATE, allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
            await queryInterface.addIndex(TABLE_NAMES.SOCIAL_SIGNUP_INTENTS, ['intent_token_hash'], {
                name: 'social_signup_intents_token_hash_unique', unique: true,
            });
        }
    },

    async down(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        // FK가 users를 가리키므로 순서는 상관없지만(모두 users의 자식이고 서로 참조하지
        // 않는다), 생성 역순으로 정리한다.
        for (const table of [TABLE_NAMES.SOCIAL_SIGNUP_INTENTS, TABLE_NAMES.OAUTH_STATES, TABLE_NAMES.EXTERNAL_IDENTITIES]) {
            if (existingTables.has(table)) await queryInterface.dropTable(table);
        }
    },

    async verify(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        const missing = Object.values(TABLE_NAMES).filter((t) => !existingTables.has(t));
        if (missing.length > 0) {
            throw new Error(`0005-add-social-auth 적용 후에도 누락된 테이블: [${missing.join(', ')}]`);
        }
    },

    TABLE_NAMES,
};
