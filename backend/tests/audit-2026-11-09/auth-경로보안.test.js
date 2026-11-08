'use strict';

// 인증 시험: HTTP로 /auth 경로 끝까지 (인증번호·가입·비번 재설정·아이디 찾기·로그인·refresh·소셜 가입 쿠키)
// 요청 수 제한·보안 헤더·오류 처리기 운영/개발 문구·필수 환경값·trust proxy IP
// DB 안 씀 (가짜 저장소), 메일은 메모리 발송기로 바꿔 끼움, 라우터는 시험마다 새로 불러 카운터 새로 받음
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-auth-route-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');

const mailAdapter = require('../../utils/adapters/mail');
const passwordReset = require('../../services/auth/passwordReset');
const accountRecovery = require('../../services/auth/accountRecovery');
const economyService = require('../../services/economy');
const social = require('../../services/auth/social');
const { securityHeaders } = require('../../middlewares/securityHeaders.middleware');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { createError } = require('../../utils/appError');
const { findMissingEnv, assertRequiredEnv } = require('../../config/requiredEnv');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { useAuthStore, swap } = require('./authFakes');
// 약관 동의·만 14세 검사는 통과로 (그 검사는 member-약관 시험 몫)
require('../helpers/termsStub').passSignupTermsForFile();

const SECRET = 'audit-route-hmac-secret-0123456789';
const PASSWORD = 'route-pass-123';
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const ROUTE_PATH = require.resolve('../../routes/auth.routes');

const withEnv = (t, values) => {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = process.env[key];
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
};

// 새 카운터 받은 /auth 라우터 + 보안 헤더 + 오류 처리기로 서버 띄우기
const startServer = async (t, env = {}) => {
    withEnv(t, { SIGNUP_EMAIL_HMAC_SECRET: SECRET, PASSWORD_RESET_APP_URL: 'https://play.example.com', ...env });
    const store = useAuthStore(t);
    const mail = mailAdapter.createMemoryMailAdapter();
    swap(t, mailAdapter, 'createHttpMailAdapter', () => mail);
    swap(t, economyService, 'ensureDefaultEntitlements', async () => ({}));
    delete require.cache[ROUTE_PATH];
    const router = require(ROUTE_PATH);
    const app = express();
    app.set('trust proxy', 1);
    app.use(securityHeaders);
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', router);
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const quietError = console.error;
    console.error = () => {};
    t.after(() => { console.error = quietError; });
    return { base: url, store, mail };
};

const send = (base, method, path, { body, cookie, headers = {} } = {}) => fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), Connection: 'close', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
});
const json = async (res) => ({ status: res.status, body: await res.json(), headers: res.headers });
const setCookies = (res) => res.headers.getSetCookie();

// ── 가입 인증번호 ──

test('HTTP 인증번호 요청: 200·캐시 금지, 응답에 번호는 없고 메일에만 있다', async (t) => {
    const { base, mail } = await startServer(t);
    const res = await json(await send(base, 'POST', '/auth/signup/email-code', { body: { email: 'Join@Example.com' } }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, resendAfterSec: 60, expiresInSec: 600 });
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(mail.outbox[0].to, 'join@example.com');
    assert.equal(JSON.stringify(res.body).includes(mail.outbox[0].params.code), false);
});

test('HTTP 인증번호 요청: 60초 안 다시 요청은 429 RESEND_TOO_SOON과 남은 초', async (t) => {
    const { base } = await startServer(t);
    await send(base, 'POST', '/auth/signup/email-code', { body: { email: 'a@example.com' } });
    const res = await json(await send(base, 'POST', '/auth/signup/email-code', { body: { email: 'a@example.com' } }));
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RESEND_TOO_SOON');
    assert.ok(res.body.resendAfterSec > 0 && res.body.resendAfterSec <= 60);
});

test('HTTP 인증번호 요청: 주소 모양 틀리면 400 INVALID_INPUT, 메일 없음', async (t) => {
    const { base, mail } = await startServer(t);
    for (const body of [{ email: 'no-at' }, { email: ['a@b.co'] }, [1, 2]]) {
        const res = await json(await send(base, 'POST', '/auth/signup/email-code', { body }));
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'INVALID_INPUT');
    }
    assert.equal(mail.outbox.length, 0);
});

// 발견한 버그: 주소 검사가 쉼표·@ 두 개를 통과시켜, 한 요청으로 인증번호 메일이 여러 곳에 감 (nodemailer가 쉼표를 받는 사람 여럿으로 읽음)
test('HTTP 인증번호 요청: 쉼표로 이은 여러 주소·@ 두 개 주소는 400 INVALID_INPUT, 메일 없음', async (t) => {
    const { base, mail } = await startServer(t);
    for (const email of ['victim@example.com,attacker@example.org', 'a@b@example.com']) {
        const res = await json(await send(base, 'POST', '/auth/signup/email-code', { body: { email } }));
        assert.equal(res.status, 400, `${email} → ${res.status}`);
    }
    assert.equal(mail.outbox.length, 0);
});

test('HTTP 인증번호 요청: 같은 주소 시간당 한도를 넘으면 대소문자가 달라도 429 RATE_LIMITED', async (t) => {
    const { base } = await startServer(t, { SIGNUP_EMAIL_HOUR_MAX: '2' });
    await send(base, 'POST', '/auth/signup/email-code', { body: { email: 'limit@example.com' } });
    await send(base, 'POST', '/auth/signup/email-code', { body: { email: 'LIMIT@example.com' } });
    const res = await json(await send(base, 'POST', '/auth/signup/email-code', { body: { email: 'Limit@Example.com' } }));
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

test('HTTP 인증번호 요청: HMAC 설정이 없으면 내부 코드 없이 500 SERVER_ERROR', async (t) => {
    const { base } = await startServer(t, { SIGNUP_EMAIL_HMAC_SECRET: undefined });
    const res = await json(await send(base, 'POST', '/auth/signup/email-code', { body: { email: 'a@example.com' } }));
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { ok: false, code: 'SERVER_ERROR' });
});

test('HTTP 번호 확인: 틀리면 400 + 남은 횟수, 5번째 429 TOO_MANY_ATTEMPTS', async (t) => {
    const { base, mail } = await startServer(t);
    await send(base, 'POST', '/auth/signup/email-code', { body: { email: 'v@example.com' } });
    const wrong = mail.outbox[0].params.code === '000000' ? '111111' : '000000';
    const first = await json(await send(base, 'POST', '/auth/signup/email-code/verify', { body: { email: 'v@example.com', code: wrong } }));
    assert.equal(first.status, 400);
    assert.deepEqual(first.body, { ok: false, code: 'CODE_INVALID', attemptsRemaining: 4 });
    for (let i = 0; i < 3; i += 1) await send(base, 'POST', '/auth/signup/email-code/verify', { body: { email: 'v@example.com', code: wrong } });
    const fifth = await json(await send(base, 'POST', '/auth/signup/email-code/verify', { body: { email: 'v@example.com', code: wrong } }));
    assert.equal(fifth.status, 429);
    assert.equal(fifth.body.code, 'TOO_MANY_ATTEMPTS');
});

test('HTTP 번호 확인: 맞으면 200 signupProof, 자리 수 틀린 번호는 400 INVALID_INPUT', async (t) => {
    const { base, mail } = await startServer(t);
    await send(base, 'POST', '/auth/signup/email-code', { body: { email: 'v@example.com' } });
    const bad = await json(await send(base, 'POST', '/auth/signup/email-code/verify', { body: { email: 'v@example.com', code: '12345' } }));
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'INVALID_INPUT');
    const ok = await json(await send(base, 'POST', '/auth/signup/email-code/verify', { body: { email: 'v@example.com', code: mail.outbox[0].params.code } }));
    assert.equal(ok.status, 200);
    assert.equal(typeof ok.body.signupProof, 'string');
});

// ── 이메일 가입 ──

const SIGNUP = { email: 'join@example.com', password: PASSWORD, passwordConfirm: PASSWORD, nickname: '가입자', birthDate: '1999-09-09' };

const proofOverHttp = async (base, mail, email) => {
    await send(base, 'POST', '/auth/signup/email-code', { body: { email } });
    const res = await json(await send(base, 'POST', '/auth/signup/email-code/verify', { body: { email, code: mail.outbox.at(-1).params.code } }));
    return res.body.signupProof;
};

test('HTTP 가입: 증명 없으면 401 SIGNUP_PROOF_REQUIRED 고정 문구·캐시 금지', async (t) => {
    const { base } = await startServer(t);
    const res = await json(await send(base, 'POST', '/auth/signup', { body: SIGNUP }));
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { success: false, message: '이메일 인증이 필요합니다.', code: 'SIGNUP_PROOF_REQUIRED' });
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('HTTP 가입: 입력 검사 400은 어느 칸인지 문구 없이 INVALID_INPUT만', async (t) => {
    const { base } = await startServer(t);
    const res = await json(await send(base, 'POST', '/auth/signup', { body: { ...SIGNUP, passwordConfirm: 'different-1' } }));
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, code: 'INVALID_INPUT' });
});

test('HTTP 가입: 인증 끝낸 주소로 가입 200, 같은 닉네임 두 번째는 409 문구 그대로', async (t) => {
    const { base, mail } = await startServer(t);
    const proof = await proofOverHttp(base, mail, 'join@example.com');
    const ok = await json(await send(base, 'POST', '/auth/signup', { body: { ...SIGNUP, signupProof: proof } }));
    assert.equal(ok.status, 200);
    const proof2 = await proofOverHttp(base, mail, 'other@example.com');
    const dup = await json(await send(base, 'POST', '/auth/signup', { body: { ...SIGNUP, email: 'other@example.com', signupProof: proof2 } }));
    assert.equal(dup.status, 409);
    assert.equal(dup.body.message, '이미 사용 중인 닉네임입니다.');
});

// ── 비번 재설정 ──

test('HTTP 재설정 요청: 있는 주소·없는 주소 모두 같은 200 {ok:true}·캐시 금지', async (t) => {
    const { base, store, mail } = await startServer(t);
    store.data.users.push({ uuid: 'u-1', email: 'me@example.com', has_local_password: true });
    const a = await json(await send(base, 'POST', '/auth/password-reset/request', { body: { email: 'me@example.com' } }));
    const b = await json(await send(base, 'POST', '/auth/password-reset/request', { body: { email: 'ghost@example.com' } }));
    assert.deepEqual([a.status, a.body], [200, { ok: true }]);
    assert.deepEqual([b.status, b.body], [200, { ok: true }]);
    assert.equal(a.headers.get('cache-control'), 'no-store');
    assert.equal(mail.outbox.length, 1);
});

test('HTTP 재설정 요청: 서비스가 던져도 200 {ok:true} (가입 여부 숨김)', async (t) => {
    const { base } = await startServer(t);
    swap(t, passwordReset, 'requestPasswordReset', async () => { throw new Error('DB 죽음'); });
    const res = await json(await send(base, 'POST', '/auth/password-reset/request', { body: { email: 'me@example.com' } }));
    assert.deepEqual([res.status, res.body], [200, { ok: true }]);
});

test('HTTP 재설정 요청: 같은 주소 한도(3)를 넘으면 대소문자·공백이 달라도 429', async (t) => {
    const { base } = await startServer(t);
    for (const email of ['me@example.com', 'ME@example.com', ' Me@Example.com ']) {
        assert.equal((await send(base, 'POST', '/auth/password-reset/request', { body: { email } })).status, 200);
    }
    const res = await json(await send(base, 'POST', '/auth/password-reset/request', { body: { email: 'me@EXAMPLE.com' } }));
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

test('HTTP 링크 확인: ?token= 을 두 번 넣으면(배열) 200 INVALID', async (t) => {
    const { base } = await startServer(t);
    const token = crypto.randomBytes(32).toString('base64url');
    const res = await json(await send(base, 'GET', `/auth/password-reset/verify?token=${token}&token=${token}`));
    assert.deepEqual([res.status, res.body], [200, { ok: false, code: 'INVALID' }]);
});

test('HTTP 새 비번: 본문 값이 글자가 아니면 400 INVALID, 서비스가 던지면 500 SERVER_ERROR', async (t) => {
    const { base } = await startServer(t);
    const bad = await json(await send(base, 'POST', '/auth/password-reset/confirm', { body: { token: 123, newPassword: ['x'] } }));
    assert.deepEqual([bad.status, bad.body], [400, { ok: false, code: 'INVALID' }]);
    swap(t, passwordReset, 'confirmPasswordReset', async () => { throw new Error('boom'); });
    const boom = await json(await send(base, 'POST', '/auth/password-reset/confirm', { body: { token: 'x', newPassword: 'y' } }));
    assert.deepEqual([boom.status, boom.body], [500, { ok: false, code: 'SERVER_ERROR' }]);
});

test('HTTP 재설정 확인 한도: 링크 확인과 새 비번 저장이 한 카운터를 같이 쓴다', async (t) => {
    const { base } = await startServer(t, { PASSWORD_RESET_CHECK_IP_MAX: '3' });
    await send(base, 'GET', '/auth/password-reset/verify?token=a');
    await send(base, 'GET', '/auth/password-reset/verify?token=b');
    await send(base, 'POST', '/auth/password-reset/confirm', { body: {} });
    const res = await send(base, 'POST', '/auth/password-reset/confirm', { body: {} });
    assert.equal(res.status, 429);
});

test('HTTP 재설정: 메일 링크 토큰으로 새 비번 저장까지 끝나면 같은 링크 확인은 USED', async (t) => {
    const { base, store, mail } = await startServer(t);
    store.data.users.push({ uuid: 'u-1', email: 'me@example.com', has_local_password: true, password_hash: 'x' });
    await send(base, 'POST', '/auth/password-reset/request', { body: { email: 'me@example.com' } });
    const token = new URL(mail.outbox[0].params.resetUrl).searchParams.get('token');
    const ok = await json(await send(base, 'POST', '/auth/password-reset/confirm', { body: { token, newPassword: 'reset-route-pass-1' } }));
    assert.deepEqual([ok.status, ok.body], [200, { ok: true }]);
    const again = await json(await send(base, 'GET', `/auth/password-reset/verify?token=${token}`));
    assert.deepEqual(again.body, { ok: false, code: 'USED' });
});

// ── 아이디 찾기 ──

test('HTTP 아이디 찾기: 찾으면 가린 이메일, 서비스가 던지면 500 SERVER_ERROR·캐시 금지', async (t) => {
    const { base, store } = await startServer(t);
    store.data.users.push({ uuid: 'u-f', email: 'finder@example.com', nickname: '찾는이', birth_date: '2000-01-02' });
    const found = await json(await send(base, 'POST', '/auth/find-id', { body: { nickname: '찾는이', birthDate: '2000-01-02' } }));
    assert.equal(found.status, 200);
    assert.equal(found.body.ok, true);
    assert.equal(found.body.maskedEmail.includes('finder@'), false);
    swap(t, accountRecovery, 'findId', async () => { throw new Error('DB 죽음'); });
    const boom = await json(await send(base, 'POST', '/auth/find-id', { body: { nickname: '찾는이', birthDate: '2000-01-02' } }));
    assert.deepEqual([boom.status, boom.body], [500, { ok: false, code: 'SERVER_ERROR' }]);
    assert.equal(boom.headers.get('cache-control'), 'no-store');
});

// ── 로그인·refresh·로그아웃 쿠키 ──

const addLoginUser = async (store) => {
    store.data.users.push({ uuid: 'u-1', email: 'login@example.com', nickname: '로그인', role: 'USER', status: 'ACTIVE', password_hash: await bcrypt.hash(PASSWORD, 4), failed_login_count: 0, locked_until: null });
};
const cookieHeaderFrom = (res) => setCookies(res).map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('HTTP 로그인: 로그인 유지 아니면 access는 브라우저 닫으면 사라지는 쿠키, refresh 쿠키는 지움, 본문에 토큰 없음', async (t) => {
    const { base, store } = await startServer(t);
    await addLoginUser(store);
    const res = await send(base, 'POST', '/auth/login', { body: { email: 'login@example.com', password: PASSWORD } });
    const cookies = setCookies(res);
    const access = cookies.find((c) => c.startsWith('accessToken='));
    assert.match(access, /HttpOnly/i);
    assert.match(access, /SameSite=Lax/i);
    assert.doesNotMatch(access, /Max-Age/i);
    assert.ok(cookies.some((c) => /^refreshToken=;/.test(c) && /Expires=Thu, 01 Jan 1970/.test(c)));
    const body = await res.json();
    assert.deepEqual(Object.keys(body.data.user).sort(), ['nickname', 'role', 'uuid']);
    assert.equal(JSON.stringify(body).includes('eyJ'), false);
});

test('HTTP 로그인: 로그인 유지면 access·refresh 쿠키 둘 다 30일짜리', async (t) => {
    const { base, store } = await startServer(t);
    await addLoginUser(store);
    const res = await send(base, 'POST', '/auth/login', { body: { email: 'login@example.com', password: PASSWORD, rememberMe: true } });
    const cookies = setCookies(res);
    for (const name of ['accessToken', 'refreshToken']) {
        const cookie = cookies.find((c) => c.startsWith(`${name}=`));
        const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)[1]);
        assert.ok(maxAge > 30 * 24 * 3600 - 60 && maxAge <= 30 * 24 * 3600, `${name} Max-Age=${maxAge}`);
    }
});

test('HTTP 로그인: 프록시 한 단계(trust proxy 1)면 X-Forwarded-For 맨 오른쪽 주소가 로그인 기록 IP', async (t) => {
    const { base, store } = await startServer(t);
    await addLoginUser(store);
    await send(base, 'POST', '/auth/login', { body: { email: 'login@example.com', password: PASSWORD }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } });
    assert.equal(store.data.history[0].ip_address, '203.0.113.9');
});

test('HTTP refresh: 쿠키 없으면 401이고 access·refresh 쿠키를 둘 다 지운다', async (t) => {
    const { base } = await startServer(t);
    const res = await send(base, 'POST', '/auth/refresh');
    assert.equal(res.status, 401);
    const cleared = setCookies(res).filter((c) => /Expires=Thu, 01 Jan 1970/.test(c)).map((c) => c.split('=')[0]);
    assert.deepEqual(cleared.sort(), ['accessToken', 'refreshToken']);
});

test('HTTP refresh: 로그인 유지 쿠키로 새 access·refresh 쿠키, 옛 refresh 값과 다르다', async (t) => {
    const { base, store } = await startServer(t);
    await addLoginUser(store);
    const login = await send(base, 'POST', '/auth/login', { body: { email: 'login@example.com', password: PASSWORD, rememberMe: true } });
    const cookie = cookieHeaderFrom(login);
    const oldRefresh = /refreshToken=([^;]+)/.exec(cookie)[1];
    const res = await send(base, 'POST', '/auth/refresh', { cookie });
    assert.equal(res.status, 200);
    const newRefresh = setCookies(res).find((c) => c.startsWith('refreshToken=')).split(';')[0].split('=')[1];
    assert.notEqual(newRefresh, oldRefresh);
    assert.equal(store.data.sessions[0].refresh_token_hash, sha256(decodeURIComponent(newRefresh)));
});

test('HTTP refresh: 같은 IP 한도를 넘으면 429와 화면 문구', async (t) => {
    const { base } = await startServer(t, { REFRESH_IP_MAX: '2' });
    await send(base, 'POST', '/auth/refresh');
    await send(base, 'POST', '/auth/refresh');
    const res = await json(await send(base, 'POST', '/auth/refresh'));
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
    assert.match(res.body.message, /잠시 후/);
});

test('HTTP 내 정보: access 쿠키 없으면 401', async (t) => {
    const { base } = await startServer(t);
    assert.equal((await send(base, 'GET', '/auth/me')).status, 401);
});

// ── 소셜 가입 마무리 쿠키 ──

const addIntentRow = (store) => {
    const raw = `intent-${crypto.randomBytes(8).toString('hex')}`;
    store.data.intents.push({ id: 'i-1', intent_token_hash: sha256(raw), provider: 'google', subject: 'g-1', email: 'soc@example.com', expires_at: new Date(Date.now() + 600_000), consumed_at: null });
    return raw;
};

test('HTTP 소셜 가입: 이 브라우저의 가입 시도 쿠키가 없으면 400 INTENT_EXPIRED, 계정 안 만듦', async (t) => {
    const { base, store } = await startServer(t);
    const intentToken = addIntentRow(store);
    const res = await json(await send(base, 'POST', '/auth/social/signup/complete', { body: { intentToken, nickname: '소셜', birthDate: '2000-01-01' } }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INTENT_EXPIRED');
    assert.equal(store.data.users.length, 0);
});

test('HTTP 소셜 가입: 같은 의도의 시도 쿠키면 200, 시도 쿠키를 지우고 시도 표의 로그인 유지를 따른다', async (t) => {
    const { base, store } = await startServer(t);
    const intentToken = addIntentRow(store);
    const attempt = social.signOAuthAttempt({ intentToken, rememberMe: true, purpose: 'signup', provider: 'google' }, 1800);
    const res = await send(base, 'POST', '/auth/social/signup/complete', {
        body: { intentToken, nickname: '소셜', birthDate: '2000-01-01', rememberMe: false }, cookie: `oauthAttempt=${attempt}`,
    });
    assert.equal(res.status, 200);
    const cookies = setCookies(res);
    assert.ok(cookies.some((c) => /^oauthAttempt=;/.test(c)));
    assert.ok(cookies.some((c) => /^refreshToken=[^;]+;/.test(c) && /Max-Age/i.test(c)));
});

test('HTTP 소셜 가입 의도: 다른 의도 토큰의 시도 쿠키면 400 INTENT_EXPIRED', async (t) => {
    const { base, store } = await startServer(t);
    const intentToken = addIntentRow(store);
    const attempt = social.signOAuthAttempt({ intentToken: 'other', purpose: 'signup' }, 1800);
    const res = await json(await send(base, 'POST', '/auth/social/signup/intent', { body: { intentToken }, cookie: `oauthAttempt=${attempt}` }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INTENT_EXPIRED');
});

// ── 보안 헤더·오류 처리기·필수 환경값 ──

test('HTTP 보안 헤더: 없는 경로 404 응답에도 보안 헤더가 붙고 X-Powered-By가 없다', async (t) => {
    const { base } = await startServer(t);
    const res = await send(base, 'GET', '/auth/nope');
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    assert.equal(res.headers.get('x-powered-by'), null);
});

const runHandler = (err, url = '/user/me') => {
    const res = {
        statusCode: 200, headersSent: false, headers: {},
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    };
    const quiet = console.error;
    console.error = () => {};
    try { globalErrorHandler(err, { method: 'GET', url, originalUrl: url }, res, () => {}); } finally { console.error = quiet; }
    return res;
};

test('오류 처리기: 운영에서 앱 오류 500은 문구만 숨기고 앱이 정한 code는 남긴다', (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    const res = runHandler(createError('users 표 제약 uq_email 위반', 500, 'PROFILE_SAVE_FAILED'));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, '서버 내부에서 에러가 발생했습니다.');
    assert.equal(res.body.code, 'PROFILE_SAVE_FAILED');
    assert.equal(res.body.error, undefined);
});

test('오류 처리기: 운영에서 라이브러리 오류의 code(ER_DUP_ENTRY 등)는 안 내보낸다', (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    const res = runHandler(Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }));
    assert.equal(res.body.code, undefined);
    assert.equal(res.body.message, '서버 내부에서 에러가 발생했습니다.');
});

test('오류 처리기: 모르는 NODE_ENV(staging)도 운영처럼 숨긴다, development만 원래 문구·스택', (t) => {
    withEnv(t, { NODE_ENV: 'staging' });
    assert.equal(runHandler(new Error('secret-db-host')).body.message, '서버 내부에서 에러가 발생했습니다.');
    process.env.NODE_ENV = 'development';
    const dev = runHandler(new Error('secret-db-host'));
    assert.equal(dev.body.message, 'secret-db-host');
    assert.match(dev.body.error, /secret-db-host/);
});

test('오류 처리기: 소셜 가입 경로(/auth/social/signup)는 가입 범위가 아니라 코드가 그대로 나간다', () => {
    const res = runHandler(createError('만료', 400, 'INTENT_EXPIRED'), '/auth/social/signup/complete');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INTENT_EXPIRED');
});

test('오류 처리기: 가입 범위는 대소문자·끝 슬래시가 달라도 같고 캐시 금지', () => {
    const res = runHandler(createError('x', 401, 'SIGNUP_PROOF_INVALID'), '/AUTH/Signup/?a=1');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'SIGNUP_PROOF_INVALID');
    assert.equal(res.headers['cache-control'], 'no-store');
});

test('필수 환경값: 공백뿐인 값도 빠진 것, 빠진 이름만 정한 순서로 돌려준다', () => {
    assert.deepEqual(findMissingEnv({ DATABASE_URL: '  ', JWT_SECRET: 'x', FRONTEND_URL: '' }), ['DATABASE_URL', 'FRONTEND_URL']);
    assert.deepEqual(findMissingEnv({ DATABASE_URL: 'a', JWT_SECRET: 'b', FRONTEND_URL: 'c' }), []);
    assert.deepEqual(findMissingEnv({ DATABASE_URL: 1, JWT_SECRET: 'b', FRONTEND_URL: 'c' }), ['DATABASE_URL']);
});

test('필수 환경값: NODE_ENV가 없으면 통과, 대문자 PRODUCTION은 거절', () => {
    const env = { DATABASE_URL: 'a', JWT_SECRET: 'b', FRONTEND_URL: 'c' };
    assert.doesNotThrow(() => assertRequiredEnv(env));
    assert.throws(() => assertRequiredEnv({ ...env, NODE_ENV: 'PRODUCTION' }), /NODE_ENV/);
});
