'use strict';

// 인증 경로 입력 거절 시험(DB 없이): 로그인 빈 값, 이메일 중복 확인 모양, 인증번호 요청·확인 입력
// 목록 A11-B-101~112 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/flow/a11a-auth-input.test.js
// DB에 안 닿게 막는 주소 (꼭 models require보다 먼저), 거절이 DB 가기 전에 끝나는지 같이 봄
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startAuthApp, nextIp, request } = require('./a11a-auth-app');

const LOGIN_EMPTY_MESSAGE = '이메일과 비밀번호를 입력해주세요.';

// 로그인 빈 값·글자 아닌 값 → 400 (DB·bcrypt 가기 전)
const loginCases = [
    { id: 'A11-B-101', label: '본문 없음', body: undefined },
    { id: 'A11-B-102', label: '이메일 ""', body: { email: '', password: 'pass1234' } },
    { id: 'A11-B-103', label: '비번 ""', body: { email: 'b103@example.com', password: '' } },
    { id: 'A11-B-104', label: '이메일 숫자 123', body: { email: 123, password: 'pass1234' } },
];
for (const { id, label, body } of loginCases) {
    test(`${id} 로그인 ${label} → 400 입력 안내`, async (t) => {
        const base = await startAuthApp(t);
        const res = await request(base, 'POST', '/auth/login', { body, ip: nextIp() });
        assert.equal(res.status, 400);
        assert.equal(res.body.message, LOGIN_EMPTY_MESSAGE);
    });
}

test('A11-B-105 이메일 중복 확인 a@b@example.com → 400 형식 문구', async (t) => {
    const base = await startAuthApp(t);
    const res = await request(base, 'GET', `/auth/check-email?email=${encodeURIComponent('a@b@example.com')}`, { ip: nextIp() });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '이메일 형식이 올바르지 않습니다.');
});

// 인증번호 요청: 본문 배열 · 이메일 없음 · 쉼표 두 주소 → INVALID_INPUT
const codeRequestCases = [
    { id: 'A11-B-106', label: '본문 배열', raw: JSON.stringify([{ email: 'b106@example.com' }]) },
    { id: 'A11-B-107', label: '이메일 없음', body: {} },
    { id: 'A11-B-108', label: '쉼표 두 주소', body: { email: 'a@example.com,b@example.com' } },
];
for (const { id, label, body, raw } of codeRequestCases) {
    test(`${id} 인증번호 요청 ${label} → 400 INVALID_INPUT`, async (t) => {
        const base = await startAuthApp(t);
        const res = await request(base, 'POST', '/auth/signup/email-code', { body, raw, ip: nextIp() });
        assert.equal(res.status, 400);
        assert.deepEqual(res.body, { ok: false, code: 'INVALID_INPUT' });
    });
}

// 인증번호 확인: 6자리 숫자 글자만
const codeVerifyCases = [
    { id: 'A11-B-109', label: '번호 5자리', code: '12345' },
    { id: 'A11-B-110', label: '번호 7자리', code: '1234567' },
    { id: 'A11-B-111', label: '번호 "12a456"', code: '12a456' },
    { id: 'A11-B-112', label: '번호가 숫자 123456', code: 123456 },
];
for (const { id, label, code } of codeVerifyCases) {
    test(`${id} 인증번호 확인 ${label} → 400 INVALID_INPUT`, async (t) => {
        const base = await startAuthApp(t);
        const res = await request(base, 'POST', '/auth/signup/email-code/verify', {
            body: { email: 'b109@example.com', code }, ip: nextIp(),
        });
        assert.equal(res.status, 400);
        assert.deepEqual(res.body, { ok: false, code: 'INVALID_INPUT' });
    });
}
