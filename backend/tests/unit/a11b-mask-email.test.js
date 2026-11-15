'use strict';

// 아이디 찾기 결과 이메일 가리기 시험 — 앞 첫·끝 글자만, 별 3개 고정, 도메인은 첫 글자 + 끝 점 뒤, 이상한 값은 원문 안 나옴
// 목록 A11-B-518~526 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), DB 안 씀
const test = require('node:test');
const assert = require('node:assert/strict');

const { maskEmail } = require('../../utils/auth/maskEmail');

// [번호, 넣는 값, 기대 결과(null이면 "원문 안 나옴"만 봄)]
const CASES = [
    ['A11-B-518', 'a@example.com', '*@e***.com'],
    ['A11-B-519', 'ab@example.com', 'a*@e***.com'],
    ['A11-B-520', 'abc@example.com', 'a***c@e***.com'],
    ['A11-B-521', 'abcdefghij@example.com', 'a***j@e***.com'],
    ['A11-B-522', 'abc@example.co.kr', 'a***c@e***.kr'],
    ['A11-B-523', 'abc@localhost', null],
    ['A11-B-524', 'user.name+tag@example.com', 'u***g@e***.com'],
    ['A11-B-525', '@example.com', null],
    ['A11-B-526', 12345, null],
];

for (const [id, value, expected] of CASES) {
    test(`${id} 이메일 가리기: ${String(value)}`, () => {
        const masked = maskEmail(value);
        assert.equal(typeof masked, 'string');
        if (expected !== null) assert.equal(masked, expected);
        // 모든 값: 원문 그대로 안 나옴, 원래 @ 앞 부분 전체도 안 나옴
        assert.ok(!masked.includes(String(value)), `원문이 그대로 나옴: ${masked}`);
        const local = String(value).split('@')[0];
        if (local.length > 0) assert.ok(!masked.includes(local), `@ 앞 원문이 나옴: ${masked}`);
    });
}
