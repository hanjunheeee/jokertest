'use strict';

// 신고 요청 모양 검사 시험 — 사유 6개 통과, 틀린 모양은 INVALID_REPORT, 자기 자신 SELF_REPORT, 메모 경계
// 목록 A13-B-001~016 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --env-file=.env.test --test tests/unit/a13-report-shape.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateReport } = require('../../services/ops/report');

const ME = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const GAME = '33333333-3333-4333-8333-333333333333';
// 맞는 신고 하나 (칸만 바꿔 씀)
const valid = (patch = {}) => ({ targetUuid: TARGET, gameId: GAME, reasonCode: 'ABUSE', memo: '욕을 함', ...patch });

// 거절이면 { status, code, message }, 통과면 null
const rejectionOf = (body, reporter = ME) => {
    try {
        validateReport(body, reporter);
        return null;
    } catch (error) {
        return { status: error.status, code: error.code, message: error.message };
    }
};

// A13-B-001~006 사유 6개는 통과
for (const [no, reasonCode] of [
    ['A13-B-001', 'ABUSE'], ['A13-B-002', 'SPAM'], ['A13-B-003', 'GRIEFING'],
    ['A13-B-004', 'CHEATING'], ['A13-B-005', 'NICKNAME'], ['A13-B-006', 'ETC'],
]) {
    test(`${no} 신고 사유 ${reasonCode} → 통과`, () => {
        const report = validateReport(valid({ reasonCode }), ME);
        assert.equal(report.reasonCode, reasonCode);
        assert.equal(report.targetUuid, TARGET);
    });
}

// A13-B-007~012 모양이 틀리면 400 INVALID_REPORT
for (const [no, label, body] of [
    ['A13-B-007', '모르는 칸 extra', valid({ extra: 1 })],
    ['A13-B-008', 'targetUuid "abc"', valid({ targetUuid: 'abc' })],
    ['A13-B-009', 'gameId 35자', valid({ gameId: 'a'.repeat(35) })],
    ['A13-B-010', 'reasonCode "SPAM2"', valid({ reasonCode: 'SPAM2' })],
    ['A13-B-011', '메모 501자', valid({ memo: '가'.repeat(501) })],
    ['A13-B-012', '메모 숫자 123', valid({ memo: 123 })],
]) {
    test(`${no} 신고 모양 틀림(${label}) → 400 INVALID_REPORT`, () => {
        const rejected = rejectionOf(body);
        assert.ok(rejected, '통과해 버림');
        assert.equal(rejected.status, 400);
        assert.equal(rejected.code, 'INVALID_REPORT');
    });
}

test('A13-B-013 자기 자신 신고(대문자로 바꾼 내 uuid) → 400 SELF_REPORT "자기 자신은 신고할 수 없습니다."', () => {
    const rejected = rejectionOf(valid({ targetUuid: ME.toUpperCase() }), ME);
    assert.deepEqual(rejected, { status: 400, code: 'SELF_REPORT', message: '자기 자신은 신고할 수 없습니다.' });
});

test('A13-B-014 신고 메모 500자 → 통과', () => {
    const memo = '나'.repeat(500);
    assert.equal(validateReport(valid({ memo }), ME).memo, memo);
});

test('A13-B-015 신고 메모 null → 통과', () => {
    assert.equal(validateReport(valid({ memo: null }), ME).memo, null);
});

test('A13-B-016 신고 메모 공백 3칸 → 통과, 메모 빈 값', () => {
    assert.equal(validateReport(valid({ memo: '   ' }), ME).memo, null);
});
