'use strict';

// 문의 요청 모양 검사 시험 — 제목 100자·본문 2000자 경계
// 목록 A13-B-017~020 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --env-file=.env.test --test tests/unit/a13-inquiry-shape.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateInquiry } = require('../../services/inquiry/write');

// 맞는 문의 하나 (칸만 바꿔 씀)
const valid = (patch = {}) => ({ category: 'BUG', title: '버튼이 안 눌림', body: '로비에서 설정 버튼이 안 눌림', ...patch });

// 거절 문구 (통과면 null)
const messageOf = (body) => {
    try {
        validateInquiry(body);
        return null;
    } catch (error) {
        return error.message;
    }
};

test('A13-B-017 문의 제목 100자 → 통과', () => {
    const title = '제'.repeat(100);
    assert.equal(validateInquiry(valid({ title })).title, title);
});

test('A13-B-018 문의 제목 101자 → "제목은 100자까지예요."', () => {
    assert.equal(messageOf(valid({ title: '제'.repeat(101) })), '제목은 100자까지예요.');
});

test('A13-B-019 문의 본문 2000자 → 통과', () => {
    const body = '본'.repeat(2000);
    assert.equal(validateInquiry(valid({ body })).body, body);
});

test('A13-B-020 문의 본문 2001자 → "내용은 2000자까지예요."', () => {
    assert.equal(messageOf(valid({ body: '본'.repeat(2001) })), '내용은 2000자까지예요.');
});
