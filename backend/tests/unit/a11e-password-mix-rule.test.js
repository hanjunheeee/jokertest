'use strict';

// 비번 영문+숫자 섞기 규칙 시험: 영문만·숫자만·한글만 거절, 영문+숫자가 있으면 기호·한글이 섞여도 통과
// 목록 A11-B-380~385 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/unit/a11e-password-mix-rule.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { validatePassword } = require('../../validations/auth/signup');

const MIX_MESSAGE = '비밀번호는 영문과 숫자를 모두 포함해야 합니다.';

// 길이·바이트는 다 맞고 글자 종류만 다른 값
const CASES = [
    { id: 'A11-B-380', name: '영문만 8자', value: 'abcdefgh', ok: false },
    { id: 'A11-B-381', name: '숫자만 8자', value: '12345678', ok: false },
    { id: 'A11-B-382', name: '영문+숫자 8자', value: 'abcdefg1', ok: true },
    { id: 'A11-B-383', name: '영문+숫자+기호', value: 'Mask-2026!', ok: true },
    { id: 'A11-B-384', name: '한글+영문 1+숫자 1', value: '가면무도회살a1', ok: true },
    { id: 'A11-B-385', name: '한글만 8자', value: '가면무도회살인사', ok: false },
];

for (const { id, name, value, ok } of CASES) {
    test(`${id} ${name} → ${ok ? '통과' : '거절 "영문과 숫자를 모두"'}`, () => {
        const result = validatePassword(value);
        assert.equal(result.ok, ok);
        if (ok) assert.equal(result.value, value);
        else assert.equal(result.message, MIX_MESSAGE);
    });
}
