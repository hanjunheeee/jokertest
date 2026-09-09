'use strict';

// F-03 회전형 갱신 자격 컬럼 추가.
//
// 로그인 유지(rememberMe) 세션의 갱신 자격을 서버가 해시로만 저장하고, 회전·응답유실
// 유예·절대 만료·폐기를 판단할 수 있도록 user_sessions에 컬럼을 추가한다. 원문 비밀값은
// 어디에도 저장하지 않는다(backend/service/auth.service.js, backend/repositories/user.repositories.js).
//
// 0002와 같은 패턴으로 재실행 시 이미 컬럼이 있으면 아무 것도 하지 않는 멱등한 형태다.

const COLUMN_NAMES = [
    'refresh_token_hash',
    'refresh_previous_hash',
    'refresh_previous_expires_at',
    'refresh_token_expires_at',
    'revoked_at',
];

const buildColumnDefs = (Sequelize) => ({
    refresh_token_hash: { type: Sequelize.STRING(64), allowNull: true },
    refresh_previous_hash: { type: Sequelize.STRING(64), allowNull: true },
    refresh_previous_expires_at: { type: Sequelize.DATE, allowNull: true },
    refresh_token_expires_at: { type: Sequelize.DATE, allowNull: true },
    revoked_at: { type: Sequelize.DATE, allowNull: true },
});

module.exports = {
    name: '0003-add-refresh-token-rotation',

    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable('user_sessions');
        const defs = buildColumnDefs(Sequelize);

        for (const columnName of COLUMN_NAMES) {
            if (table[columnName]) continue; // 이미 적용됨 — 재실행 시 건너뛴다.
            await queryInterface.addColumn('user_sessions', columnName, defs[columnName]);
        }
    },

    async down(queryInterface) {
        const table = await queryInterface.describeTable('user_sessions');
        for (const columnName of COLUMN_NAMES) {
            if (!table[columnName]) continue;
            await queryInterface.removeColumn('user_sessions', columnName);
        }
    },

    async verify(queryInterface) {
        const table = await queryInterface.describeTable('user_sessions');
        const missing = COLUMN_NAMES.filter((columnName) => !table[columnName]);
        if (missing.length > 0) {
            throw new Error(`user_sessions에 다음 컬럼이 추가되지 않았습니다: ${missing.join(', ')}`);
        }
    },
};
