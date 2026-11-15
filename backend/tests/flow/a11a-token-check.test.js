'use strict';

// 로그인 토큰 확인 시험(DB 없이): 쿠키 없음·만료·위조 토큰, 쿠키 없이 로그아웃·refresh
// 목록 A11-B-125~130 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/flow/a11a-token-check.test.js
// DB에 안 닿게 막는 주소 (꼭 models require보다 먼저), 거절이 DB 가기 전에 끝나는지 같이 봄
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { ensureTestSecrets, startAuthApp, nextIp, request, cookiesOf, isCleared } = require('./a11a-auth-app');

ensureTestSecrets();

// 로그인 토큰 모양 (uuid·role·세션 id), 지난 시각으로 만료시킴
const loginPayload = () => ({ uuid: 'b126-user', role: 'USER', sessionId: 'b126-session' });
const BAD_TOKEN_MESSAGE = '유효하지 않거나 만료된 토큰입니다.';

test('A11-B-125 쿠키 없이 /auth/me → 401 로그인 필요', async (t) => {
    const base = await startAuthApp(t);
    const res = await request(base, 'GET', '/auth/me', { ip: nextIp() });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, '로그인이 필요합니다.');
});

// 화면이 이 코드를 보고 refresh로 다시 받음
test('A11-B-126 만료된 access로 /auth/me → 401 ACCESS_TOKEN_EXPIRED', async (t) => {
    const base = await startAuthApp(t);
    const expired = jwt.sign({ ...loginPayload(), exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    const res = await request(base, 'GET', '/auth/me', { cookie: `accessToken=${expired}`, ip: nextIp() });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'ACCESS_TOKEN_EXPIRED');
});

test('A11-B-127 다른 키로 서명한 토큰 → 401 위조 문구', async (t) => {
    const base = await startAuthApp(t);
    const forged = jwt.sign(loginPayload(), 'a11a-not-the-server-key', { expiresIn: '1h' });
    const res = await request(base, 'GET', '/auth/me', { cookie: `accessToken=${forged}`, ip: nextIp() });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, BAD_TOKEN_MESSAGE);
});

// 같은 키로 서명한 소셜 시도 표(purpose 칸)는 로그인 토큰이 아님
test('A11-B-128 purpose 칸 든 토큰 → 401 위조 문구', async (t) => {
    const base = await startAuthApp(t);
    const attemptLike = jwt.sign({ ...loginPayload(), purpose: 'login' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await request(base, 'GET', '/auth/me', { cookie: `accessToken=${attemptLike}`, ip: nextIp() });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, BAD_TOKEN_MESSAGE);
});

test('A11-B-129 쿠키 없이 로그아웃 → 200 + 두 쿠키 지움', async (t) => {
    const base = await startAuthApp(t);
    const res = await request(base, 'POST', '/auth/logout', { ip: nextIp() });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, '성공적으로 로그아웃 되었습니다.');
    const cookies = cookiesOf(res.headers);
    assert.ok(isCleared(cookies.accessToken), 'accessToken 지우는 Set-Cookie 없음');
    assert.ok(isCleared(cookies.refreshToken), 'refreshToken 지우는 Set-Cookie 없음');
});

test('A11-B-130 쿠키 없이 refresh → 401 + 두 쿠키 지움', async (t) => {
    const base = await startAuthApp(t);
    const res = await request(base, 'POST', '/auth/refresh', { ip: nextIp() });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, '갱신 자격이 없습니다. 다시 로그인해주세요.');
    const cookies = cookiesOf(res.headers);
    assert.ok(isCleared(cookies.accessToken), 'accessToken 지우는 Set-Cookie 없음');
    assert.ok(isCleared(cookies.refreshToken), 'refreshToken 지우는 Set-Cookie 없음');
});
