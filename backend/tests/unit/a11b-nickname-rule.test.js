'use strict';

// 닉네임 바꾸기 규칙 시험 — 가입과 같은 규칙(2~8자, 한글·영문·숫자, 앞뒤 빈칸 다듬기)과 문구
// 목록 A11-B-537~544 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), DB 안 씀
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateNickname } = require('../../validations/auth/signup');

const LENGTH_TEXT = '닉네임은 2~8자여야 합니다.';
const CHAR_TEXT = '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.';
const EMPTY_TEXT = '닉네임을 입력해주세요.';

// [번호, 넣는 값, 기대: { value } 통과 / { message } 거절]
const CASES = [
    ['A11-B-537', '가', { message: LENGTH_TEXT }],
    ['A11-B-538', '가면', { value: '가면' }],
    ['A11-B-539', '가면무도회살인사', { value: '가면무도회살인사' }],
    ['A11-B-540', '가면무도회살인사건', { message: LENGTH_TEXT }],
    ['A11-B-541', '닉네임!', { message: CHAR_TEXT }],
    ['A11-B-542', '   ', { message: EMPTY_TEXT }],
    ['A11-B-543', ' 가면 ', { value: '가면' }],
    ['A11-B-544', '가a1', { value: '가a1' }],
];

for (const [id, value, expected] of CASES) {
    test(`${id} 닉네임 규칙: "${value}"`, () => {
        // 준비 확인: 글자 수가 이름대로 (2자·8자·9자 경계)
        if (id === 'A11-B-539') assert.equal(value.length, 8);
        if (id === 'A11-B-540') assert.equal(value.length, 9);
        const result = validateNickname(value);
        if (expected.message) {
            assert.equal(result.ok, false);
            assert.equal(result.message, expected.message);
            return;
        }
        assert.equal(result.ok, true);
        assert.equal(result.value, expected.value);
    });
}
