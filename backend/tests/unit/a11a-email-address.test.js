'use strict';

// 이메일 주소 한 곳 검사 시험: 받는 사람 하나짜리만 통과, 여러 곳·머리말 끼워 넣기 거절, @ 앞·도메인 칸 길이 경계
// 목록 A11-B-032~043 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/unit/a11a-email-address.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { isSingleEmailAddress } = require('../../utils/auth/emailAddress');

const cases = [
    { id: 'A11-B-032', value: 'user@example.com', ok: true, label: '보통 주소' },
    { id: 'A11-B-033', value: 'a.b+tag@example.co.kr', ok: true, label: '점·더하기 든 주소' },
    { id: 'A11-B-034', value: "o'neil_9%@example.com", ok: true, label: "따옴표·밑줄·% 든 주소" },
    { id: 'A11-B-035', value: 'a@example.com,b@example.com', ok: false, label: '쉼표로 두 주소' },
    { id: 'A11-B-036', value: 'a@b@example.com', ok: false, label: '@ 두 개' },
    { id: 'A11-B-037', value: '<a@example.com>', ok: false, label: '꺾쇠' },
    { id: 'A11-B-038', value: 'a b@example.com', ok: false, label: '가운데 빈칸' },
    { id: 'A11-B-039', value: 'a@example.com\nBcc:b@example.com', ok: false, label: '줄바꿈 + 숨은 받는 사람' },
    // @ 앞 64자 통과 · 65자 거절
    { id: 'A11-B-040', value: `${'a'.repeat(64)}@example.com`, ok: true, label: '@ 앞 64자' },
    { id: 'A11-B-041', value: `${'a'.repeat(65)}@example.com`, ok: false, label: '@ 앞 65자' },
    // 도메인 한 칸 63자 통과 · 64자 거절
    { id: 'A11-B-042', value: `a@${'b'.repeat(63)}.com`, ok: true, label: '도메인 한 칸 63자' },
    { id: 'A11-B-043', value: `a@${'b'.repeat(64)}.com`, ok: false, label: '도메인 한 칸 64자' },
];
for (const { id, value, ok, label } of cases) {
    test(`${id} ${label} → ${ok ? '통과' : '거절'}`, () => {
        assert.equal(isSingleEmailAddress(value), ok);
    });
}
