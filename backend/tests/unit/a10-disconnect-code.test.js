'use strict';

// 세션 검사로 끊을 때 실을 까닭·주기 검사 간격 시험 — 정지·비활성·탈퇴는 그대로, 나머지는 세션 끝, 간격 5초
// 목록 A10-B-004~009 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/unit/a10-disconnect-code.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// 모델이 DB에 안 붙게 (세션 확인 파일이 저장소를 같이 불러옴)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const { disconnectCodeOf, SESSION_CHECK_INTERVAL_MS } = require('../../socket/connection/sessionCheck');

// 화면 끊김 글(useSocket.js FORCE_DISCONNECT_MESSAGES)이 아는 까닭은 그대로 와야 그 글이 뜸
const CASES = [
    ['A10-B-004', "code 'ACCOUNT_BANNED'", { ok: false, code: 'ACCOUNT_BANNED' }, 'ACCOUNT_BANNED'],
    ['A10-B-005', "code 'ACCOUNT_INACTIVE'", { ok: false, code: 'ACCOUNT_INACTIVE' }, 'ACCOUNT_INACTIVE'],
    ['A10-B-006', "code 'ACCOUNT_WITHDRAWN'", { ok: false, code: 'ACCOUNT_WITHDRAWN' }, 'ACCOUNT_WITHDRAWN'],
    ['A10-B-007', "모르는 code 'X'", { ok: false, code: 'X' }, 'SESSION_EXPIRED'],
    ['A10-B-008', '결과 없음', undefined, 'SESSION_EXPIRED'],
];
for (const [id, label, result, expected] of CASES) {
    test(`${id} 검사 결과 ${label} → 끊김 까닭 ${expected}`, () => {
        assert.equal(disconnectCodeOf(result), expected);
    });
}

test('A10-B-009 세션 주기 검사 간격 = 5,000ms', () => {
    assert.equal(SESSION_CHECK_INTERVAL_MS, 5_000);
});
