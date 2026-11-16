'use strict';

// 가입 비번 규칙 시험: 글자 수·바이트 수 경계, 앞뒤 빈칸 안 자름, 비번 확인 칸
// 목록 A11-B-001~010 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/unit/a11a-password-rule.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { validatePassword, validatePasswordConfirm } = require('../../validations/auth/signup');

const LENGTH_MESSAGE = '비밀번호는 8~64자여야 합니다.';
const BYTES_MESSAGE = '비밀번호는 72바이트를 넘을 수 없습니다.';

// 글자 수 경계: 7 거절 · 8 통과 · 64 통과 · 65 거절 (끝 한 자는 숫자 — 영문+숫자 규칙엔 안 걸리고 길이만 보게)
const lengthCases = [
    { id: 'A11-B-001', length: 7, ok: false },
    { id: 'A11-B-002', length: 8, ok: true },
    { id: 'A11-B-003', length: 64, ok: true },
    { id: 'A11-B-004', length: 65, ok: false },
];
for (const { id, length, ok } of lengthCases) {
    test(`${id} 영문+숫자 비번 ${length}자 → ${ok ? '통과' : '거절'}`, () => {
        const result = validatePassword(`${'a'.repeat(length - 1)}1`);
        assert.equal(result.ok, ok);
        if (!ok) assert.equal(result.message, LENGTH_MESSAGE);
    });
}

// 바이트 경계: 한글 한 자 3바이트 + 영문·숫자 a1b 3바이트 → 한글 23자 72바이트 통과 · 24자 75바이트 거절
test('A11-B-005 한글 23자 + a1b(72바이트) → 통과', () => {
    const result = validatePassword(`${'가'.repeat(23)}a1b`);
    assert.equal(result.ok, true);
});

test('A11-B-006 한글 24자 + a1b(75바이트) → 바이트 문구로 거절', () => {
    const result = validatePassword(`${'가'.repeat(24)}a1b`);
    assert.equal(result.ok, false);
    assert.equal(result.message, BYTES_MESSAGE);
});

// 빈칸도 글자로 셈, 값은 그대로 (자르면 로그인 때 다른 비번이 됨)
test('A11-B-007 " abcdef1"(빈칸 포함 8자) → 통과, 앞 빈칸 그대로', () => {
    const result = validatePassword(' abcdef1');
    assert.equal(result.ok, true);
    assert.equal(result.value, ' abcdef1');
});

test('A11-B-008 "abcdef1"(7자) → 거절', () => {
    const result = validatePassword('abcdef1');
    assert.equal(result.ok, false);
    assert.equal(result.message, LENGTH_MESSAGE);
});

test('A11-B-009 비번 확인 칸이 같음 → 통과', () => {
    assert.equal(validatePasswordConfirm('pass1234', 'pass1234').ok, true);
});

test('A11-B-010 비번 확인 칸 끝 글자 하나 다름 → 거절 문구', () => {
    const result = validatePasswordConfirm('pass1234', 'pass1235');
    assert.equal(result.ok, false);
    assert.equal(result.message, '비밀번호 확인이 일치하지 않습니다.');
});
