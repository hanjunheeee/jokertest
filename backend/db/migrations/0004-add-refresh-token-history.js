'use strict';

// F-03 R-IMPL #11 — 갱신 자격 재사용 감지 확장: 2세대 이상 전(previous보다 더 오래된)
// 자격의 재사용도 잡아낸다.
//
// user_sessions.refresh_previous_hash는 딱 한 세대(방금 대체된 자격)만 기억한다. 회전이
// 두 번 이상 일어나면 그 이전 세대의 해시는 어디에도 남지 않아, 그 자격이 나중에 다시
// 제시돼도 "이 세션 소유였던 자격"인지 알 수 없고 그냥 "모르는 자격"(무효)으로만 처리돼
// 세션 전체를 폐기하지 못했다(f03-session.integration.test.js의 R-IMPL #8 실패 지점).
//
// 이 테이블은 회전으로 대체되어 refresh_previous_hash에서 밀려나는 해시를 세션에 연결해
// 보존한다(backend/repositories/user.repositories.js의 applyRefreshRotation). 원문 비밀값은
// 어디에도 저장하지 않고 해시만 담는다 — user_sessions와 같은 원칙이다. 세션이 절대
// 만료·폐기되기 전까지 그 세션이 실제로 소비한 모든 세대의 해시를 여기서 조회할 수 있다.
//
// 0003과 같은 패턴으로 재실행 시 이미 테이블이 있으면 아무 것도 하지 않는 멱등한 형태다.
// 기존에 적용된 0001~0003의 내용·체크섬은 건드리지 않는다 — 이 파일은 완전히 새로운
// 테이블만 추가한다.

const TABLE_NAME = 'refresh_token_history';

module.exports = {
    name: '0004-add-refresh-token-history',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());
        if (existingTables.has(TABLE_NAME)) return; // 이미 적용됨 — 재실행 시 건너뛴다.

        await queryInterface.createTable(TABLE_NAME, {
            id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
            // 세션이 삭제될 일은 없지만(폐기는 revoked_at으로만 표시한다), FK는 참조 무결성을
            // 명시적으로 보장해 재사용 감지 조회가 존재하지 않는 세션을 가리키지 않게 한다.
            session_id: {
                type: Sequelize.STRING(255), allowNull: false,
                references: { model: 'user_sessions', key: 'id' },
            },
            // sha256 해시(user.repositories.js의 hashRefreshToken)만 저장한다. 같은 해시가
            // 두 세션에 동시에 속할 수 없으므로(HMAC/난수 출력의 사실상 유일성) unique로
            // 두어, 임의 입력이 우연히도 두 세션과 동시에 매치되는 경우를 원천 차단한다.
            token_hash: { type: Sequelize.STRING(64), allowNull: false },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        });
        await queryInterface.addIndex(TABLE_NAME, ['token_hash'], {
            name: 'refresh_token_history_token_hash_unique', unique: true,
        });
        await queryInterface.addIndex(TABLE_NAME, ['session_id'], {
            name: 'refresh_token_history_session_id',
        });
    },

    async down(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        if (existingTables.has(TABLE_NAME)) await queryInterface.dropTable(TABLE_NAME);
    },

    async verify(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        if (!existingTables.has(TABLE_NAME)) {
            throw new Error(`${TABLE_NAME} 테이블이 생성되지 않았습니다`);
        }
    },

    TABLE_NAME,
};
