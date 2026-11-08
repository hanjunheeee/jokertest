'use strict';

// user_sessions.refresh_token_hash · refresh_previous_hash 인덱스 추가 (DB 전수조사 D-03)
// 로그인 유지 갱신마다 두 칸 OR로 세션을 찾고 잠금(FOR UPDATE)까지 함 → 인덱스 없으면 표 전체를 훑고 훑은 줄을 다 잠금
// 세션 줄은 로그인마다 늘고 지우는 곳 없음 → 갈수록 느려지고 동시 갱신끼리 서로 기다림
// 유일 제약은 안 검: 지금 데이터·코드로는 겹칠 일 없지만, 겹치는 줄이 생기면 갱신이 오류로 바뀌어 로그인이 풀림 → 빠르기만 챙김

const TABLE_NAME = 'user_sessions';
const INDEXES = Object.freeze([
    { column: 'refresh_token_hash', name: 'user_sessions_refresh_token_hash' },
    { column: 'refresh_previous_hash', name: 'user_sessions_refresh_previous_hash' },
]);

module.exports = {
    name: '0021-add-user-sessions-refresh-indexes',

    async up(queryInterface) {
        const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
        const existing = await queryInterface.showIndex(TABLE_NAME);
        for (const { column, name } of INDEXES) {
            // 그 칸으로 시작하는 인덱스가 이미 있으면 안 만듦 (다시 돌림·손으로 만든 경우)
            const has = (existing || []).some((index) => !index.primary && same(index.fields?.[0]?.attribute, column));
            if (!has) await queryInterface.addIndex(TABLE_NAME, [column], { name });
        }
    },

    // 되돌리기: 이 파일이 만든 이름만 뺌
    async down(queryInterface) {
        const existing = await queryInterface.showIndex(TABLE_NAME);
        for (const { name } of INDEXES) {
            if ((existing || []).some((index) => index.name === name)) await queryInterface.removeIndex(TABLE_NAME, name);
        }
    },

    async verify(queryInterface) {
        const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
        const existing = await queryInterface.showIndex(TABLE_NAME);
        const missing = INDEXES.filter(({ column }) => !(existing || []).some((index) => !index.primary
            && same(index.fields?.[0]?.attribute, column)));
        if (missing.length > 0) {
            throw new Error(`${TABLE_NAME} 인덱스 없음: [${missing.map((m) => m.column).join(', ')}]`);
        }
    },

    TABLE_NAME,
    INDEXES,
};
