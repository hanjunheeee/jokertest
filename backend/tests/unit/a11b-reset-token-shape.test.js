'use strict';

// 비번 재설정 입력 모양 시험 — 링크 토큰 모양(43자 base64url, 같은 32바이트 다른 표기 거절)·재설정 메일 요청 주소 모양
// 목록 A11-B-501~517 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), DB 안 씀
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { validateResetToken, validateResetEmail } = require('../../validations/auth/passwordReset');

// base64url 글자 차례 (같은 바이트 다른 표기 만들 때 씀)
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// 진짜 링크와 같은 모양: 무작위 32바이트 → 43자
const realToken = () => crypto.randomBytes(32).toString('base64url');

// 끝 글자 아래 2비트는 버려지는 자리 → 그 자리만 바꾸면 풀면 같은 32바이트, 다시 쓰면 다른 글자
function sameBytesOtherSpelling() {
    const token = realToken();
    const last = B64URL.indexOf(token.at(-1));
    const other = B64URL[(last & ~3) | 1];
    return token.slice(0, -1) + other;
}

// 값 하나 = 시험 하나: [번호, 이름, 값, 통과해야 하나]
const TOKEN_CASES = [
    ['A11-B-501', '올바른 43자 base64url → 통과', () => realToken(), true],
    ['A11-B-502', '42자 → 거절', () => realToken().slice(0, 42), false],
    ['A11-B-503', '44자 → 거절', () => `${realToken()}A`, false],
    ['A11-B-504', '+·/ 섞인 43자 → 거절', () => `+/${realToken().slice(2)}`, false],
    ['A11-B-505', '끝에 = → 거절', () => `${realToken().slice(0, 42)}=`, false],
    ['A11-B-506', '같은 32바이트 다른 표기 43자 → 거절', () => sameBytesOtherSpelling(), false],
    ['A11-B-507', '숫자 값 → 거절', () => 1234567890, false],
    ['A11-B-508', '빈 글자 → 거절', () => '', false],
];

for (const [id, name, make, pass] of TOKEN_CASES) {
    test(`${id} 재설정 토큰 모양: ${name}`, () => {
        const value = make();
        // 준비 확인: 다른 표기는 진짜로 같은 32바이트로 풀림
        if (id === 'A11-B-506') {
            assert.equal(value.length, 43);
            assert.equal(Buffer.from(value, 'base64url').length, 32);
            assert.notEqual(Buffer.from(value, 'base64url').toString('base64url'), value);
        }
        assert.equal(validateResetToken(value).ok, pass);
    });
}

// 재설정 메일 요청 주소: 받는 사람 하나짜리만, 앞뒤 빈칸만 다듬음
const EMAIL_CASES = [
    ['A11-B-509', '앞뒤 빈칸 붙은 주소 → 다듬어 통과', '  user@example.com  ', 'user@example.com'],
    ['A11-B-510', '쉼표로 두 주소 → 거절', 'user@example.com,other@example.com', null],
    ['A11-B-511', ';로 두 주소 → 거절', 'user@example.com;other@example.com', null],
    ['A11-B-512', '@ 두 개 → 거절', 'user@other@example.com', null],
    ['A11-B-513', '주소 안 줄바꿈 → 거절', 'user\n@example.com', null],
    ['A11-B-514', '꺾쇠 <주소> → 거절', '<user@example.com>', null],
    ['A11-B-515', '따옴표 섞임 → 거절', '"user"@example.com', null],
    ['A11-B-516', '숫자 값 → 거절', 12345, null],
    ['A11-B-517', '빈 글자 → 거절', '', null],
];

for (const [id, name, value, expected] of EMAIL_CASES) {
    test(`${id} 재설정 요청 주소 모양: ${name}`, () => {
        const result = validateResetEmail(value);
        if (expected === null) {
            assert.equal(result.ok, false);
            return;
        }
        assert.equal(result.ok, true);
        assert.equal(result.value, expected);
    });
}
