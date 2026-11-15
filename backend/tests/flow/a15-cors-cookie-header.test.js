'use strict';

// 다른 주소 요청 허용(CORS)·로그인 쿠키 속성·응답 머리말 시험 — 운영 값/개발 값으로 나눠 봄
// 목록 A15-B-212~221 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/flow/a15-cors-cookie-header.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 모델이 진짜 DB에 안 붙게
// 시험 전용 서명 값 (시험 환경값에 없을 때만, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-cors-cookie-test-only-signing-text';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');

const termsRepository = require('../../repositories/auth/terms');
const { securityHeaders } = require('../../middlewares/securityHeaders.middleware');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { getCorsOrigin } = require('../../config/frontendOrigins');
const { swap } = require('../audit-2026-11-09/authFakes');
const { startAuthServer, send, json, withEnv, listen } = require('../audit-2026-11-09/securityHttp');

// 시험 화면 주소 (진짜 주소 아님)
const PC = 'https://play.example.test';
const MOBILE = 'https://m.play.example.test';
const OUTSIDE = 'https://other-site.example.test';
const PASSWORD = 'a15-cookie-pass-9';

// 약관 목록은 가짜 저장소에서 (200 응답 하나 얻기용)
const fakeTerms = (t) => swap(t, termsRepository, 'findAllVersions', async () => [
    { id: 1, kind: 'TERMS', version: 'v1', title: '이용약관', body: '본문', url: null, effective_at: '2026-01-01T00:00:00Z', is_required: 1 },
]);

// index.js와 같은 앞 순서(보안 머리말 → CORS → 본문 → 쿠키) + 약관 경로 하나
const startCorsServer = async (t) => {
    withEnv(t, { FRONTEND_URL: PC, FRONTEND_MOBILE_URL: MOBILE });
    fakeTerms(t);
    const app = express();
    app.set('trust proxy', 1);
    app.use(securityHeaders);
    app.use(cors({ origin: getCorsOrigin(), credentials: true }));
    for (const middleware of require('../../middlewares/bodyGuard.middleware').bodyGuards()) app.use(middleware);
    app.use(cookieParser());
    const authRoute = require.resolve('../../routes/auth.routes');
    delete require.cache[authRoute];
    app.use('/auth', require(authRoute));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    return listen(t, app);
};

// Set-Cookie 줄 중 이름이 맞는 것
const cookieLine = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`));

// 가짜 저장소에 사람 하나 넣고 로그인 유지로 로그인
const loginOnce = async (t, nodeEnv) => {
    withEnv(t, { NODE_ENV: nodeEnv });
    const { base, store } = await startAuthServer(t);
    store.data.users.push({
        uuid: `a15-cookie-${nodeEnv}`, email: `a15-cookie-${nodeEnv}@example.test`, nickname: '쿠키', role: 'USER', status: 'ACTIVE',
        password_hash: await bcrypt.hash(PASSWORD, 4), failed_login_count: 0, locked_until: null,
    });
    const res = await send(base, 'POST', '/auth/login', {
        body: { email: `a15-cookie-${nodeEnv}@example.test`, password: PASSWORD, rememberMe: true },
    });
    assert.equal(res.status, 200, '로그인이 안 됨 (준비 실패)');
    return res;
};

test('A15-B-212 Origin = PC 화면 주소 → Access-Control-Allow-Origin = 그 주소, Allow-Credentials true', async (t) => {
    const base = await startCorsServer(t);
    const res = await send(base, 'GET', '/auth/terms', { headers: { Origin: PC } });
    assert.equal(res.headers.get('access-control-allow-origin'), PC);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
});

test('A15-B-213 Origin = 모바일 화면 주소 → Access-Control-Allow-Origin = 그 주소, Allow-Credentials true', async (t) => {
    const base = await startCorsServer(t);
    const res = await send(base, 'GET', '/auth/terms', { headers: { Origin: MOBILE } });
    assert.equal(res.headers.get('access-control-allow-origin'), MOBILE);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
});

test('A15-B-214 목록 밖 Origin으로 미리 묻기(OPTIONS)·GET → Access-Control-Allow-Origin 없음, * 없음', async (t) => {
    const base = await startCorsServer(t);
    const preflight = await send(base, 'OPTIONS', '/auth/login', {
        headers: { Origin: OUTSIDE, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    const get = await send(base, 'GET', '/auth/terms', { headers: { Origin: OUTSIDE } });
    for (const res of [preflight, get]) {
        const allowed = res.headers.get('access-control-allow-origin');
        assert.equal(allowed, null, `허용 머리말이 붙음: ${allowed}`);
        assert.ok(!String(allowed ?? '').includes('*'));
    }
});

test('A15-B-215 운영 값으로 로그인 → accessToken·refreshToken 둘 다 HttpOnly·SameSite=Lax·Secure', async (t) => {
    const res = await loginOnce(t, 'production');
    for (const name of ['accessToken', 'refreshToken']) {
        const line = cookieLine(res, name);
        assert.ok(line, `${name} 쿠키 없음`);
        assert.match(line, /;\s*HttpOnly/i, `${name} HttpOnly 없음`);
        assert.match(line, /;\s*SameSite=Lax/i, `${name} SameSite=Lax 없음`);
        assert.match(line, /;\s*Secure/i, `${name} Secure 없음`);
    }
});

test('A15-B-216 개발 값으로 로그인 → HttpOnly·SameSite=Lax, Secure 없음', async (t) => {
    const res = await loginOnce(t, 'development');
    for (const name of ['accessToken', 'refreshToken']) {
        const line = cookieLine(res, name);
        assert.ok(line, `${name} 쿠키 없음`);
        assert.match(line, /;\s*HttpOnly/i, `${name} HttpOnly 없음`);
        assert.match(line, /;\s*SameSite=Lax/i, `${name} SameSite=Lax 없음`);
        assert.doesNotMatch(line, /;\s*Secure/i, `${name} Secure 붙음`);
    }
});

test('A15-B-217 운영 값 GET /auth/google → oauthAttempt 쿠키 HttpOnly·SameSite=Lax·Secure', async (t) => {
    // 구글 앱 값은 시험 글자 (주소만 만들고 따라가지 않음)
    withEnv(t, {
        NODE_ENV: 'production', FRONTEND_URL: PC,
        GOOGLE_CLIENT_ID: 'a15-test-client', GOOGLE_REDIRECT_URI: 'https://api.example.test/auth/google/callback',
    });
    const { base } = await startAuthServer(t);
    const res = await send(base, 'GET', '/auth/google');
    const line = cookieLine(res, 'oauthAttempt');
    assert.ok(line, `oauthAttempt 쿠키 없음 (상태 ${res.status}, 주소 ${res.headers.get('location')})`);
    assert.match(line, /;\s*HttpOnly/i);
    assert.match(line, /;\s*SameSite=Lax/i);
    assert.match(line, /;\s*Secure/i);
});

// 모든 응답에 붙어야 할 보안 머리말 (값까지 정한 것만 값 비교)
const assertSecurityHeaders = (res, label) => {
    const h = (name) => res.headers.get(name);
    assert.equal(h('x-content-type-options'), 'nosniff', label);
    assert.equal(h('x-frame-options'), 'DENY', label);
    assert.ok(h('referrer-policy'), `${label} Referrer-Policy 없음`);
    assert.ok(h('content-security-policy'), `${label} Content-Security-Policy 없음`);
    assert.ok(h('permissions-policy'), `${label} Permissions-Policy 없음`);
    assert.ok(h('cross-origin-opener-policy'), `${label} Cross-Origin-Opener-Policy 없음`);
    assert.equal(h('cache-control'), 'no-store', label);
};

test('A15-B-218 200(약관)·404(없는 경로)·429 응답 셋 다 보안 머리말', async (t) => {
    fakeTerms(t);
    const { base } = await startAuthServer(t);
    const ok = await send(base, 'GET', '/auth/terms');
    assert.equal(ok.status, 200);
    const missing = await send(base, 'GET', '/a15-no-such-path');
    assert.equal(missing.status, 404);
    // 이메일 중복 확인 한도(10분 20번)를 넘겨 429 하나 얻음
    let limited;
    for (let i = 0; i < 21; i += 1) limited = await send(base, 'GET', `/auth/check-email?email=a15-h${i}%40example.test`);
    assert.equal(limited.status, 429);
    assertSecurityHeaders(ok, '200');
    assertSecurityHeaders(missing, '404');
    assertSecurityHeaders(limited, '429');
});

test('A15-B-219 아무 응답 → X-Powered-By 없음', async (t) => {
    fakeTerms(t);
    const { base } = await startAuthServer(t);
    const ok = await send(base, 'GET', '/auth/terms');
    const missing = await send(base, 'GET', '/a15-no-such-path');
    assert.equal(ok.headers.get('x-powered-by'), null);
    assert.equal(missing.headers.get('x-powered-by'), null);
});

test('A15-B-220 운영 값 → Strict-Transport-Security: max-age=31536000; includeSubDomains', async (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    fakeTerms(t);
    const { base } = await startAuthServer(t);
    const res = await send(base, 'GET', '/auth/terms');
    assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
});

test('A15-B-221 개발 값 → Strict-Transport-Security 없음', async (t) => {
    withEnv(t, { NODE_ENV: 'development' });
    fakeTerms(t);
    const { base } = await startAuthServer(t);
    const res = await json(await send(base, 'GET', '/auth/terms'));
    assert.equal(res.headers.get('strict-transport-security'), null);
});
