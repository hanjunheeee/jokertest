'use strict';

// 로그인 없이 되는 길 시험 — 로그인 전에 쓰는 길은 열려 있고, 가입 여부는 안 새는지 봄
// 목록 A15-B-131~137 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/flow/a15-public-routes.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 모델이 진짜 DB에 안 붙게
// 시험 전용 서명 값 (시험 환경값에 없을 때만, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-public-routes-test-only-signing-text';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const db = require('../../models');
const termsRepository = require('../../repositories/auth/terms');
const { swap } = require('../audit-2026-11-09/authFakes');
const { startAuthServer, startRouterServer, send, json, withEnv } = require('../audit-2026-11-09/securityHttp');

const PASSWORD = 'a15-right-pass-9';
const FRONT = 'https://play.example.test';
const SAME_LOGIN_MESSAGE = '이메일 또는 비밀번호가 일치하지 않습니다.';

let cachedHash;
const passwordHash = async () => { cachedHash ??= await bcrypt.hash(PASSWORD, 4); return cachedHash; };

// 가짜 저장소에 가입한 사람 하나
const addUser = async (store, email) => {
    const user = {
        uuid: `a15-user-${email}`, email, nickname: '탐정', role: 'USER', status: 'ACTIVE',
        password_hash: await passwordHash(), failed_login_count: 0, locked_until: null,
    };
    store.data.users.push(user);
    return user;
};

test('A15-B-131 쿠키 없이 GET /health → 200', async (t) => {
    // DB는 살아 있다고 봄 (SELECT 1에 답함)
    swap(t, db.sequelize, 'query', async () => [[{ 1: 1 }]]);
    const base = await startRouterServer(t, [['/health', require('../../routes/health.routes')]]);
    const res = await json(await send(base, 'GET', '/health'));
    assert.equal(res.status, 200);
});

test('A15-B-132 쿠키 없이 GET /auth/terms → 200 약관 목록', async (t) => {
    swap(t, termsRepository, 'findAllVersions', async () => [
        { id: 1, kind: 'TERMS', version: 'v1', title: '이용약관', body: '본문', url: null, effective_at: '2026-01-01T00:00:00Z', is_required: 1 },
        { id: 2, kind: 'PRIVACY', version: 'v1', title: '개인정보', body: '본문', url: null, effective_at: '2026-01-01T00:00:00Z', is_required: 1 },
    ]);
    const { base } = await startAuthServer(t);
    const res = await json(await send(base, 'GET', '/auth/terms'));
    assert.equal(res.status, 200);
    const terms = res.body?.data?.terms;
    assert.ok(Array.isArray(terms), '약관 목록이 없음');
    assert.deepEqual(terms.map((x) => x.title).sort(), ['개인정보', '이용약관']);
});

test('A15-B-133 쿠키 없이 POST /auth/logout → 200 + accessToken·refreshToken 지우는 Set-Cookie 둘', async (t) => {
    const { base } = await startAuthServer(t);
    const res = await json(await send(base, 'POST', '/auth/logout'));
    assert.equal(res.status, 200);
    const cookies = res.headers.getSetCookie();
    // 지우는 쿠키 = 빈 값 + 지난 만료
    const cleared = (name) => cookies.some((c) => c.startsWith(`${name}=;`) && /Expires=Thu, 01 Jan 1970/i.test(c));
    assert.ok(cleared('accessToken'), `accessToken 지우기 없음: ${cookies.join(' | ')}`);
    assert.ok(cleared('refreshToken'), `refreshToken 지우기 없음: ${cookies.join(' | ')}`);
});

test('A15-B-134 쿠키 없이 모양 맞는 새 주소로 GET /auth/check-email → 200', async (t) => {
    const { base } = await startAuthServer(t);
    const res = await json(await send(base, 'GET', '/auth/check-email?email=a15-new%40example.test'));
    assert.equal(res.status, 200);
});

test('A15-B-135 없는 주소·있는 주소로 POST /auth/password-reset/request → 상태·본문이 같음', async (t) => {
    const { base, store, mail } = await startAuthServer(t);
    await addUser(store, 'a15-real@example.test');
    const unknown = await json(await send(base, 'POST', '/auth/password-reset/request', { body: { email: 'a15-ghost@example.test' } }));
    const known = await json(await send(base, 'POST', '/auth/password-reset/request', { body: { email: 'a15-real@example.test' } }));
    assert.equal(unknown.status, known.status);
    assert.deepEqual(unknown.body, known.body);
    // 속으론 다르게 처리됐는데도 겉 답이 같은지 (있는 주소에만 메일 감)
    assert.deepEqual(mail.outbox.map((m) => m.to), ['a15-real@example.test']);
});

test('A15-B-136 없는 이메일·있는 이메일 틀린 비번 → 둘 다 401 같은 문구, 횟수 없음', async (t) => {
    const { base, store } = await startAuthServer(t);
    await addUser(store, 'a15-login@example.test');
    const unknown = await json(await send(base, 'POST', '/auth/login', { body: { email: 'a15-nobody@example.test', password: 'wrong-pass-1' } }));
    const wrong = await json(await send(base, 'POST', '/auth/login', { body: { email: 'a15-login@example.test', password: 'wrong-pass-1' } }));
    for (const res of [unknown, wrong]) {
        assert.equal(res.status, 401);
        assert.equal(res.body.message, SAME_LOGIN_MESSAGE);
        assert.doesNotMatch(res.text, /\(\s*\d+\s*\/\s*5\s*\)/, '본문에 틀린 횟수가 실림');
    }
});

test('A15-B-137 쿠키 없이 GET /auth/discord/link → 화면 /account?socialLinkError=SESSION_EXPIRED로, 디스코드로 안 감', async (t) => {
    withEnv(t, { FRONTEND_URL: FRONT, FRONTEND_MOBILE_URL: undefined });
    const { base } = await startAuthServer(t);
    const res = await send(base, 'GET', '/auth/discord/link');
    assert.ok(res.status >= 300 && res.status < 400, `돌려보내기 아님: ${res.status}`);
    const location = res.headers.get('location') ?? '';
    assert.equal(location, `${FRONT}/account?socialLinkError=SESSION_EXPIRED`);
    assert.doesNotMatch(location, /discord/i);
});
