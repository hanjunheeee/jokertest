'use strict';

// 옛 소켓 밀어낸 까닭 고르기 시험 — 같은 로그인 세션이면 "같은 브라우저 다른 창", 아니면 "다른 기기 로그인"
// 목록 A10-B-001~003 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/unit/a10-replace-reason.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// 모델이 DB에 안 붙게 (cluster 쪽이 모델을 같이 불러옴)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const { describeReplacementBySession } = require('../../socket/connection/replace');

const SAME = { code: 'REPLACED_BY_SAME_SESSION', message: '같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.' };
const OTHER = { code: 'REPLACED_BY_OTHER_LOGIN', message: '다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.' };

const CASES = [
    ['A10-B-001', '옛·새 세션 id 같음', 'sess-1', 'sess-1', SAME],
    ['A10-B-002', '옛·새 세션 id 다름', 'sess-1', 'sess-2', OTHER],
    ['A10-B-003', '새 세션 id 없음', 'sess-1', undefined, OTHER],
];
for (const [id, label, oldId, newId, expected] of CASES) {
    test(`${id} ${label} → ${expected.code}`, () => {
        assert.deepEqual(describeReplacementBySession(oldId, newId), expected);
    });
}
