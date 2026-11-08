'use strict';

// 보안 시험: 인증 (로그인 계정 열거·응답 시간 · 이메일 중복 확인 모양·제한 · 로그인 토큰 서명 방식·종류 섞임 · 약한 서명 키 · 쿠키 옵션)
// DB 안 씀 (가짜 저장소)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'security-auth-secret-0123456789abcdef';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const authService = require('../../services/auth/account');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const { verifyOAuthAttempt, signOAuthAttempt } = require('../../services/auth/social/attempt');
const { findWeakSecrets, assertStrongSecrets, SECRET_MIN_LENGTH } = require('../../config/requiredEnv');
const { buildAccountRateLimiters } = require('../../middlewares/authRateLimit.middleware');
const cookieOptions = require('../../utils/auth/cookieOptions');
const { useAuthStore } = require('./authFakes');
const { startAuthServer, send, json, withEnv } = require('./securityHttp');

const PASSWORD = 'correct-horse-9';
const REQ_INFO = { ip: '10.0.0.7', userAgent: 'security-agent', deviceType: 'PC' };
const SAME_MESSAGE = '이메일 또는 비밀번호가 일치하지 않습니다.';

let cachedHash;
const passwordHash = async () => { cachedHash ??= await bcrypt.hash(PASSWORD, 4); return cachedHash; };

// 가짜 저장소 + 계정 하나
const setUp = async (t, extra = {}) => {
    const store = useAuthStore(t);
    const user = {
        uuid: 'u-1', email: 'player@example.com', nickname: '탐정', role: 'USER', status: 'ACTIVE',
        password_hash: await passwordHash(), failed_login_count: 0, locked_until: null, ...extra,
    };
    store.data.users.push(user);
    return { store, user };
};
const login = (body) => authService.login({ email: 'player@example.com', password: PASSWORD, ...body }, REQ_INFO);
const errorOf = async (promise) => { try { await promise; } catch (error) { return error; } return null; };

// ── 로그인 계정 열거 ──

test('로그인: 없는 이메일과 틀린 비번은 상태·문구가 똑같다 (가입 여부 안 드러남)', async (t) => {
    await setUp(t);
    const unknown = await errorOf(login({ email: 'nobody@example.com' }));
    const wrong = await errorOf(login({ password: 'wrong-pass' }));
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.message, SAME_MESSAGE);
    assert.equal(wrong.message, SAME_MESSAGE);
    assert.equal(unknown.code, wrong.code);
});

test('로그인: 틀린 횟수는 문구에 안 실리고 계정에만 셈 (1~4번째 같은 문구)', async (t) => {
    const { user } = await setUp(t);
    for (let i = 1; i <= 4; i += 1) {
        const error = await errorOf(login({ password: `wrong-${i}` }));
        assert.equal(error.message, SAME_MESSAGE);
        assert.doesNotMatch(error.message, /\d\/5/);
        assert.equal(user.failed_login_count, i);
    }
});

test('로그인: 없는 이메일도 비번 비교 한 번 해서 응답 시간이 짧게 튀지 않는다', async (t) => {
    await setUp(t);
    await errorOf(login({ email: 'warm@example.com' })); // 처음 한 번은 비교용 해시 만들기
    const times = [];
    for (let i = 0; i < 3; i += 1) {
        const started = process.hrtime.bigint();
        await errorOf(login({ email: `nobody-${i}@example.com` }));
        times.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    times.sort((a, b) => a - b);
    assert.ok(times[1] >= 5, `없는 이메일 응답 ${times[1]}ms (bcrypt 비교를 건너뛴 듯)`);
});

test('로그인: 없는 이메일은 로그인 기록·실패 횟수 쓰기를 안 함', async (t) => {
    const { store } = await setUp(t);
    await errorOf(login({ email: 'nobody@example.com' }));
    assert.equal(store.data.history.length, 0);
    assert.equal(store.names().includes('updateUser'), false);
});

test('로그인: 글자 아닌 이메일·비번(객체·배열)은 400, DB 조회 없음 (Sequelize 연산자 끼워 넣기 막기)', async (t) => {
    const { store } = await setUp(t);
    for (const body of [{ email: { $ne: '' } }, { email: ['player@example.com'] }, { password: { $gt: '' } }]) {
        const error = await errorOf(authService.login({ email: 'player@example.com', password: PASSWORD, ...body }, REQ_INFO));
        assert.equal(error.status, 400);
    }
    assert.equal(store.names().includes('findByEmail'), false);
});

// ── 이메일 중복 확인 ──

test('이메일 중복 확인: 여러 곳·끼워 넣기 모양은 DB 묻기 전에 400', async (t) => {
    const { store } = await setUp(t);
    for (const email of ['a@x.io,b@y.io', 'a@b@x.io', '%', 'player@example.com\r\nBcc: x@y.io']) {
        const error = await errorOf(authService.checkEmailAvailability(email));
        assert.equal(error?.status, 400, JSON.stringify(email));
    }
    assert.equal(store.names().includes('findByEmail'), false);
});

test('이메일 중복 확인: 기본 제한은 ip당 10분 20번 (훑기 막기)', () => {
    const made = [];
    buildAccountRateLimiters({}, (options) => { made.push(options); return () => {}; });
    const checkEmail = made.find((options) => options.keyOf({ ip: '1.2.3.4' }).startsWith('check-email-ip:'));
    assert.equal(checkEmail.max, 20);
    assert.equal(checkEmail.windowMs, 10 * 60 * 1000);
});

test('HTTP 이메일 중복 확인: 21번째는 429 RATE_LIMITED', async (t) => {
    const { base } = await startAuthServer(t);
    for (let i = 0; i < 20; i += 1) {
        assert.equal((await send(base, 'GET', `/auth/check-email?email=a${i}%40example.com`)).status, 200);
    }
    const res = await json(await send(base, 'GET', '/auth/check-email?email=z%40example.com'));
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
});

test('HTTP 로그인: 없는 이메일·틀린 비번 응답 본문이 같다', async (t) => {
    const { base, store } = await startAuthServer(t);
    store.data.users.push({
        uuid: 'u-9', email: 'real@example.com', nickname: '진짜', role: 'USER', status: 'ACTIVE',
        password_hash: await passwordHash(), failed_login_count: 0, locked_until: null,
    });
    const unknown = await json(await send(base, 'POST', '/auth/login', { body: { email: 'ghost@example.com', password: 'x-pass-123' } }));
    const wrong = await json(await send(base, 'POST', '/auth/login', { body: { email: 'real@example.com', password: 'x-pass-123' } }));
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(unknown.body, wrong.body);
});

// ── 로그인 토큰 ──

const ACCESS_PAYLOAD = { uuid: 'u-1', role: 'USER', sessionId: 's-1' };

test('로그인 토큰: 서명 없는 토큰(alg none)은 거절', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...ACCESS_PAYLOAD, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
    assert.throws(() => sessionLifecycle.verifyAccessToken(`${header}.${body}.`));
});

test('로그인 토큰: 같은 키라도 HS512 등 다른 방식으로 서명한 토큰은 거절 (HS256만)', () => {
    const forged = jwt.sign(ACCESS_PAYLOAD, process.env.JWT_SECRET, { algorithm: 'HS512' });
    assert.throws(() => sessionLifecycle.verifyAccessToken(forged), /invalid algorithm/);
    const ok = jwt.sign(ACCESS_PAYLOAD, process.env.JWT_SECRET, { algorithm: 'HS256' });
    assert.equal(sessionLifecycle.verifyAccessToken(ok).uuid, 'u-1');
});

test('로그인 토큰: 다른 키로 서명한 토큰·만료 토큰은 거절 (만료 무시는 부를 때만)', () => {
    assert.throws(() => sessionLifecycle.verifyAccessToken(jwt.sign(ACCESS_PAYLOAD, 'other-secret')));
    const expired = jwt.sign({ ...ACCESS_PAYLOAD, exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET);
    assert.throws(() => sessionLifecycle.verifyAccessToken(expired), /jwt expired/);
    assert.equal(sessionLifecycle.verifyAccessToken(expired, { ignoreExpiration: true }).uuid, 'u-1');
});

test('로그인 토큰: 소셜 시도 표(purpose 칸)는 같은 키로 서명돼도 로그인 토큰으로 안 받음', () => {
    const attempt = signOAuthAttempt({ ...ACCESS_PAYLOAD, purpose: 'link', provider: 'discord' }, 600);
    assert.throws(() => sessionLifecycle.verifyAccessToken(attempt), /access token expected/);
    assert.throws(() => sessionLifecycle.verifyAccessToken(attempt, { ignoreExpiration: true }), /access token expected/);
});

test('소셜 시도 표: purpose 없는 로그인 토큰·HS512 토큰은 시도 표로 안 봄', () => {
    assert.equal(verifyOAuthAttempt(jwt.sign(ACCESS_PAYLOAD, process.env.JWT_SECRET)), null);
    assert.equal(verifyOAuthAttempt(jwt.sign({ purpose: 'login' }, process.env.JWT_SECRET, { algorithm: 'HS512' })), null);
    assert.equal(verifyOAuthAttempt(signOAuthAttempt({ purpose: 'login', provider: 'google' }, 600)).purpose, 'login');
});

test('HTTP 로그인 확인: 시도 표를 accessToken 쿠키로 넣어도 401', async (t) => {
    const { base } = await startAuthServer(t);
    const attempt = signOAuthAttempt({ ...ACCESS_PAYLOAD, purpose: 'link', provider: 'discord' }, 600);
    const res = await send(base, 'GET', '/auth/me', { cookie: `accessToken=${attempt}` });
    assert.equal(res.status, 401);
});

// ── 서명 키 ──

test('서명 키: 32자 미만·예시 값(change…·your…·placeholder)은 약한 키', () => {
    assert.equal(SECRET_MIN_LENGTH, 32);
    const strong = crypto.randomBytes(32).toString('hex');
    assert.deepEqual(findWeakSecrets({ JWT_SECRET: strong }), []);
    assert.deepEqual(findWeakSecrets({ JWT_SECRET: 'short' }), ['JWT_SECRET']);
    assert.deepEqual(findWeakSecrets({ JWT_SECRET: 'change-this-to-a-long-random-value' }), ['JWT_SECRET']);
    assert.deepEqual(findWeakSecrets({ JWT_SECRET: `your-${strong}` }), ['JWT_SECRET']);
    assert.deepEqual(findWeakSecrets({ JWT_SECRET: strong, SIGNUP_EMAIL_HMAC_SECRET: 'abc' }), ['SIGNUP_EMAIL_HMAC_SECRET']);
});

test('서명 키: 빈 값은 빠진 값 검사 몫이라 여기선 안 셈, 약하면 이름만 실은 오류 (값은 안 실음)', () => {
    assert.deepEqual(findWeakSecrets({ JWT_SECRET: '' }), []);
    assert.throws(() => assertStrongSecrets({ JWT_SECRET: 'tiny-value' }), (error) => {
        assert.match(error.message, /JWT_SECRET/);
        assert.doesNotMatch(error.message, /tiny-value/);
        return true;
    });
});

test('서명 키: 운영으로 약한 키로 켜면 시작 거부 (index.js가 assertStrongSecrets를 부름)', () => {
    const source = require('node:fs').readFileSync(require.resolve('../../index.js'), 'utf8');
    assert.match(source, /assertStrongSecrets\(\)/);
    const { isStartupFatal } = require('../../config/requiredEnv');
    assert.equal(isStartupFatal(new Error('x'), { NODE_ENV: 'production' }), true);
});

// ── 쿠키 ──

test('쿠키: 로그인 쿠키는 httpOnly·SameSite=Lax, 운영에서만 Secure', (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    const prod = cookieOptions.buildRefreshCookieOptions(new Date(Date.now() + 60_000));
    assert.equal(prod.httpOnly, true);
    assert.equal(prod.secure, true);
    assert.equal(prod.sameSite, 'Lax');
    process.env.NODE_ENV = 'development';
    assert.equal(cookieOptions.buildSessionCookieOptions(false).secure, false);
    assert.equal(cookieOptions.buildSessionCookieOptions(false).httpOnly, true);
});

test('HTTP 로그인 성공: 토큰은 쿠키로만, 응답 본문엔 토큰·비번 해시 없음', async (t) => {
    const { base, store } = await startAuthServer(t);
    store.data.users.push({
        uuid: 'u-7', email: 'ok@example.com', nickname: '성공', role: 'USER', status: 'ACTIVE',
        password_hash: await passwordHash(), failed_login_count: 0, locked_until: null,
    });
    const res = await json(await send(base, 'POST', '/auth/login', { body: { email: 'ok@example.com', password: PASSWORD } }));
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /password|hash|token/i);
    const cookies = res.headers.getSetCookie();
    assert.ok(cookies.some((c) => /^accessToken=/.test(c) && /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)));
});
