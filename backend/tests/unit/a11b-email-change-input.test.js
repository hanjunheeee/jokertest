'use strict';

// 이메일 바꾸기 입력 시험 — 새 주소는 소문자로 맞추고 여러 곳·모양 틀림 거절, 옛 주소로 가는 알림 값은 새 주소를 가림
// 목록 A11-B-545~550 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), DB 안 씀
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseNewEmail, maskEmail } = require('../../services/auth/emailChange');

test('A11-B-545 새 주소 New@Example.com → 소문자 주소', () => {
    assert.equal(parseNewEmail('New@Example.com'), 'new@example.com');
});

test('A11-B-546 새 주소 쉼표로 두 주소 → 거절', () => {
    assert.equal(parseNewEmail('new@example.com,other@example.com'), null);
});

test('A11-B-547 새 주소 @ 두 개 → 거절', () => {
    assert.equal(parseNewEmail('new@other@example.com'), null);
});

test('A11-B-548 새 주소 abc(모양 틀림) → 거절', () => {
    assert.equal(parseNewEmail('abc'), null);
});

test('A11-B-549 알림 값 가리기 abcdef@example.com → 결과에 abcdef 없음', () => {
    const masked = maskEmail('abcdef@example.com');
    assert.equal(typeof masked, 'string');
    assert.ok(!masked.includes('abcdef'), `가린 값에 원문이 남음: ${masked}`);
});

test('A11-B-550 알림 값 가리기 짧은 ab@example.com → 결과가 원문과 다름', () => {
    const masked = maskEmail('ab@example.com');
    assert.equal(typeof masked, 'string');
    assert.notEqual(masked, 'ab@example.com');
});
