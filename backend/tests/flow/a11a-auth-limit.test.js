'use strict';

// 인증 경로 요청 수 제한 시험(DB 없이): 인증번호 IP 1시간 30번, 로그인 10분 50번, 중복 확인 20번, refresh 600번, 소셜 가입 60번
// 목록 A11-B-113~124 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/flow/a11a-auth-limit.test.js
// DB에 안 닿게 막는 주소 (꼭 models require보다 먼저), 셀 때 보내는 요청은 DB 가기 전에 거절되는 것만 씀
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startAuthApp, nextIp, request } = require('./a11a-auth-app');

// 시험마다 새 서버·새 IP로 n번 보내고 마지막 답 돌려줌 (앞 답들도 같이)
async function hitTimes(t, n, method, path, options = {}) {
    const base = await startAuthApp(t);
    const ip = nextIp();
    const all = [];
    for (let i = 0; i < n; i += 1) all.push(await request(base, method, path, { ...options, ip }));
    return { last: all.at(-1), all };
}

// 인증번호 요청: 본문 배열(입력 거절)도 IP 셈엔 들어감 (IP 제한이 입력 검사 앞)
const codeBody = { raw: '[]' };
test('A11-B-113 인증번호 요청 같은 IP 29번째 → 429 아님', async (t) => {
    const { last } = await hitTimes(t, 29, 'POST', '/auth/signup/email-code', codeBody);
    assert.notEqual(last.status, 429);
});
test('A11-B-114 인증번호 요청 같은 IP 30번째 → 429 아님', async (t) => {
    const { last } = await hitTimes(t, 30, 'POST', '/auth/signup/email-code', codeBody);
    assert.notEqual(last.status, 429);
});
test('A11-B-115 인증번호 요청 같은 IP 31번째 → 429 RATE_LIMITED', async (t) => {
    const { last } = await hitTimes(t, 31, 'POST', '/auth/signup/email-code', codeBody);
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

// 로그인: 비번 빈 값(400, DB 안 감)으로 셈
const loginBody = { body: { email: 'b116@example.com', password: '' } };
test('A11-B-116 로그인 같은 IP 49번째 → 429 아님', async (t) => {
    const { last } = await hitTimes(t, 49, 'POST', '/auth/login', loginBody);
    assert.notEqual(last.status, 429);
});
test('A11-B-117 로그인 같은 IP 50번째 → 429 아님', async (t) => {
    const { last } = await hitTimes(t, 50, 'POST', '/auth/login', loginBody);
    assert.notEqual(last.status, 429);
});
test('A11-B-118 로그인 같은 IP 51번째 → 429 + 문구 있음', async (t) => {
    const { last } = await hitTimes(t, 51, 'POST', '/auth/login', loginBody);
    assert.equal(last.status, 429);
    assert.equal(typeof last.body.message, 'string');
    assert.ok(last.body.message.length > 0);
});

// 이메일 중복 확인: 모양 틀린 주소(400, DB 안 감)로 셈
const checkPath = `/auth/check-email?email=${encodeURIComponent('a@b@example.com')}`;
test('A11-B-119 이메일 중복 확인 같은 IP 20번째 → 429 아님', async (t) => {
    const { last } = await hitTimes(t, 20, 'GET', checkPath);
    assert.notEqual(last.status, 429);
});
test('A11-B-120 이메일 중복 확인 같은 IP 21번째 → 429', async (t) => {
    const { last } = await hitTimes(t, 21, 'GET', checkPath);
    assert.equal(last.status, 429);
});

// refresh: 쿠키 없음(401, DB 안 감)으로 셈
test('A11-B-121 refresh 같은 IP 600번째 → 401 (쿠키 없음)', async (t) => {
    const { last } = await hitTimes(t, 600, 'POST', '/auth/refresh');
    assert.equal(last.status, 401);
});
test('A11-B-122 refresh 같은 IP 601번째 → 429', async (t) => {
    const { last } = await hitTimes(t, 601, 'POST', '/auth/refresh');
    assert.equal(last.status, 429);
});

// 소셜 가입 의도 확인: 의도 토큰 없음(400, DB 안 감)으로 셈
test('A11-B-123 소셜 가입 의도 확인 같은 IP 60번째 → 400', async (t) => {
    const { last } = await hitTimes(t, 60, 'POST', '/auth/social/signup/intent', { body: {} });
    assert.equal(last.status, 400);
});
test('A11-B-124 소셜 가입 의도 확인 같은 IP 61번째 → 429', async (t) => {
    const { last } = await hitTimes(t, 61, 'POST', '/auth/social/signup/intent', { body: {} });
    assert.equal(last.status, 429);
});
