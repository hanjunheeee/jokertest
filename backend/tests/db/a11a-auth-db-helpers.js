'use strict';

// A11a DB 시험 공용 준비 (a11a-*.integration 시험만 씀, 시험 파일 아님): 시험 DB 비우고 올리기 · /auth 서버 · 계정·증명·로그인 · 가짜 소셜 제공자
// 부르는 시험 파일이 맨 위에서 DATABASE_URL을 시험 DB로 바꾼 뒤 불러야 함 (모델이 불러올 때 주소를 읽음)
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { applyFrontMiddlewares, send, json } = require('../audit-2026-11-09/securityHttp');
const db = require('../../models');
const mailAdapter = require('../../utils/adapters/mail');
const { hashPassword } = require('../../utils/auth/credentials');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
const ROUTE_PATH = require.resolve('../../routes/auth.routes');

// 시험 전용 비밀 값 (진짜 값 아님), 환경값에 없을 때만 넣음
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a11a-auth-db-test-only-jwt-secret';
if (!process.env.SIGNUP_EMAIL_HMAC_SECRET) process.env.SIGNUP_EMAIL_HMAC_SECRET = 'a11a-auth-db-test-only-hmac-secret';

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

// 파일 처음에 한 번: 시험 DB 비우고 마이그레이션 끝까지 (잠금 쥔 동안만 돌아 남과 안 섞임)
const prepareDb = async () => {
    if (!TEST_DB_URL) return;
    const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
};

// 보낸 메일 모으는 곳 (진짜로 안 보냄), 서비스가 부를 때마다 이 발송기를 받음
const mailbox = mailAdapter.createMemoryMailAdapter();
const originalCreateHttpMailAdapter = mailAdapter.createHttpMailAdapter;
let nextMailThrows = false;
mailAdapter.createHttpMailAdapter = () => (nextMailThrows
    ? { sendMail: async () => { nextMailThrows = false; throw new Error('a11a 가짜 발송 실패'); } }
    : mailbox);
const failNextMail = () => { nextMailThrows = true; };
const mailsTo = (email) => mailbox.outbox.filter((mail) => mail.to === email);

// 시험 동안만 환경값 바꾸기 (t.after로 되돌림)
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

// /auth 서버 띄우기: 경로 파일을 다시 불러 요청 수 세기를 새로 받음 (env는 불러올 때 읽어서 먼저 넣음)
const startApp = async (env = {}) => {
    const saved = {};
    for (const [key, value] of Object.entries(env)) {
        saved[key] = process.env[key];
        process.env[key] = value;
    }
    delete require.cache[ROUTE_PATH];
    const router = require(ROUTE_PATH);
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    const app = express();
    applyFrontMiddlewares(app);
    app.use('/auth', router);
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    return { base: url, close: () => new Promise((resolve) => server.close(resolve)) };
};

// 파일 끝 정리: 발송기 되돌리고 DB 닫기
const closeAll = async (...apps) => {
    for (const app of apps) if (app) await app.close();
    mailAdapter.createHttpMailAdapter = originalCreateHttpMailAdapter;
    await db.sequelize.close();
};

// 시험마다 다른 IP (요청 수 세기가 IP별이라 시험끼리 안 섞임)
let ipSeq = 0;
const nextIp = () => {
    ipSeq += 1;
    return `10.111.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
};

// 요청 하나 → { status, body, headers, cookies } (IP는 믿는 프록시가 붙인 머리말로, 쿠키는 객체로 줘도 됨)
const request = async (base, method, path, { ip = nextIp(), cookies, ...options } = {}) => {
    const headers = { ...(options.headers ?? {}), 'x-forwarded-for': ip };
    const cookie = cookies ? cookieHeader(cookies) : options.cookie;
    const res = await json(await send(base, method, path, { ...options, cookie, headers }));
    return { ...res, cookies: cookiesOf(res.headers), location: res.headers.get('location') };
};

// Set-Cookie 줄을 이름별로 → { accessToken: { value, attrs } } (attrs 이름은 소문자)
const cookiesOf = (headers) => {
    const result = {};
    for (const line of headers.getSetCookie()) {
        const [pair, ...rest] = line.split(';').map((part) => part.trim());
        const at = pair.indexOf('=');
        const attrs = {};
        for (const item of rest) {
            const eq = item.indexOf('=');
            if (eq === -1) attrs[item.toLowerCase()] = true;
            else attrs[item.slice(0, eq).toLowerCase()] = item.slice(eq + 1);
        }
        result[pair.slice(0, at)] = { value: decodeURIComponent(pair.slice(at + 1)), attrs };
    }
    return result;
};

// 쿠키 객체 → 머리말 (값이 빈 쿠키는 뺌) 예: { accessToken: 'x' } → "accessToken=x"
const cookieHeader = (cookies) => Object.entries(cookies)
    .map(([name, value]) => [name, typeof value === 'object' && value !== null ? value.value : value])
    .filter(([, value]) => typeof value === 'string' && value !== '')
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');

// 지우는 쿠키인지 (값 비고 끝 시각이 1970년)
const isCleared = (cookie) => Boolean(cookie) && cookie.value === ''
    && typeof cookie.attrs.expires === 'string' && new Date(cookie.attrs.expires).getTime() <= 0;

// 토큰 몸통 풀기 (서명 확인 없이 값만) 예: → { uuid, role, sessionId, exp, iat }
const decodeJwt = (token) => JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());

// 시험만의 머리글자 (다른 에이전트 줄과 안 겹치게) 예: 'b261' → 'b261x3k9'
const tag = (label) => `${label}${crypto.randomBytes(3).toString('hex').slice(0, 4)}`;
const emailOf = (label) => `a11a-${tag(label)}@example.com`;
// 닉네임 2~8자 영문·숫자
const nicknameOf = (label) => `${label}${crypto.randomBytes(2).toString('hex')}`.slice(0, 8);

// DB에 바로 계정 한 줄 (비번은 bcrypt 해시) → { uuid, email, password, nickname }
const createUser = async ({ label = 'u', password = 'pass1234', email = emailOf(label), nickname = nicknameOf(label), ...rest } = {}) => {
    const row = await db.User.create({
        password_hash: await hashPassword(password),
        email, nickname, email_verified: true, ...rest,
    });
    return { uuid: row.uuid, email, password, nickname };
};

// 지금 약관 id 전부 (가입 본문 동의 칸에 넣음)
const currentTermIds = async () => {
    const termsService = require('../../services/auth/terms');
    return (await termsService.getCurrentTerms()).map((terms) => terms.id);
};

// 만 14세 넘은 생일 (2000-01-01) 기본, 동의는 지금 약관 전부
const signupBody = async ({ email, signupProof, nickname, password = 'pass1234', birthDate = '2000-01-01', ...rest }) => ({
    email, signupProof, nickname, password, passwordConfirm: password, birthDate,
    agreedTermsVersionIds: await currentTermIds(), ageConfirmed: true, ...rest,
});

// 인증번호 요청 → 메일 번호 → 확인까지 진짜 경로로 → 가입 증명
const proofOverHttp = async (base, email, { ip = nextIp() } = {}) => {
    const sent = await request(base, 'POST', '/auth/signup/email-code', { body: { email }, ip });
    if (sent.status !== 200) throw new Error(`준비: 인증번호 요청 ${sent.status} ${JSON.stringify(sent.body)}`);
    const code = mailsTo(email.trim().toLowerCase()).at(-1)?.params.code;
    const verified = await request(base, 'POST', '/auth/signup/email-code/verify', { body: { email, code }, ip });
    if (verified.status !== 200) throw new Error(`준비: 인증번호 확인 ${verified.status} ${JSON.stringify(verified.body)}`);
    return verified.body.signupProof;
};

// 증명 받아 가입까지 진짜 경로로 → { email, password, nickname, uuid }
const signupOverHttp = async (base, { label = 'su', email = emailOf(label), nickname = nicknameOf(label), password = 'pass1234', ip = nextIp() } = {}) => {
    const signupProof = await proofOverHttp(base, email, { ip });
    const res = await request(base, 'POST', '/auth/signup', { body: await signupBody({ email, signupProof, nickname, password }), ip });
    if (res.status !== 200) throw new Error(`준비: 가입 ${res.status} ${JSON.stringify(res.body)}`);
    const row = await db.User.findOne({ where: { email }, raw: true });
    return { email, password, nickname, uuid: row.uuid };
};

// 로그인 → { res, cookies(이름→값), sessionId }
const loginOverHttp = async (base, { email, password, rememberMe, ip = nextIp(), userAgent } = {}) => {
    const body = rememberMe === undefined ? { email, password } : { email, password, rememberMe };
    const headers = userAgent ? { 'user-agent': userAgent } : {};
    const res = await request(base, 'POST', '/auth/login', { body, ip, headers });
    const cookies = Object.fromEntries(Object.entries(res.cookies).map(([name, c]) => [name, c.value]));
    const sessionId = cookies.accessToken ? decodeJwt(cookies.accessToken).sessionId : null;
    return { res, cookies, sessionId };
};

// 표 읽기 (raw)
const userRow = (uuid) => db.User.findOne({ where: { uuid }, raw: true, paranoid: false });
const sessionsOf = (uuid) => db.UserSession.findAll({ where: { user_id: uuid }, raw: true });
const liveSessionsOf = (uuid) => db.UserSession.findAll({ where: { user_id: uuid, is_online: true, revoked_at: null }, raw: true });
const historyOf = (uuid) => db.LoginHistory.findAll({ where: { user_id: uuid }, order: [['id', 'ASC']], raw: true });

// 초 단위로 맞춘 시각 (DB 시각 칸이 소수 초를 반올림해 경계가 0.5초 흔들리는 것 막기)
// 예: 지금 12:00:00.300, +1초 위로 → 12:00:02.000 (남은 시간 1~2초)
const secondsFromNow = (seconds) => {
    const target = Date.now() + seconds * 1000;
    return new Date((seconds >= 0 ? Math.ceil(target / 1000) : Math.floor(target / 1000)) * 1000);
};

// ── 가짜 소셜 제공자 (코드 → 토큰 → 프로필 두 주소만, 인가 화면은 시험이 콜백을 바로 부름) ──
// 사람 = 구글 { sub, email, email_verified } / 디스코드 { id, email, verified }
const startFakeProvider = async () => {
    const codes = new Map();
    const tokens = new Map();
    const readBody = (req) => new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => resolve(body));
    });
    const sendJson = (res, status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
    };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fake.local');
        // 토큰 주소 (구글 /token, 디스코드 /api/oauth2/token): 코드 한 번만 씀
        if (req.method === 'POST' && (url.pathname === '/token' || url.pathname === '/api/oauth2/token')) {
            const form = new URLSearchParams(await readBody(req));
            const person = codes.get(form.get('code'));
            codes.delete(form.get('code'));
            if (!person) return sendJson(res, 400, { error: 'invalid_grant' });
            const accessToken = `at-${crypto.randomBytes(8).toString('hex')}`;
            tokens.set(accessToken, person);
            return sendJson(res, 200, { access_token: accessToken, token_type: 'Bearer' });
        }
        // 프로필 주소 (구글 /v1/userinfo, 디스코드 /api/users/@me)
        if (req.method === 'GET' && (url.pathname === '/v1/userinfo' || url.pathname === '/api/users/@me')) {
            const person = tokens.get(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
            if (!person) return sendJson(res, 401, { error: 'invalid_token' });
            return sendJson(res, 200, person);
        }
        return sendJson(res, 404, { error: 'not_found' });
    });
    const { url } = await listenOnFetchablePort(server);
    return {
        url,
        // 다음 콜백에 쓸 인가 코드 하나 (그 사람 프로필이 나옴)
        codeFor: (person) => {
            const code = `code-${crypto.randomBytes(8).toString('hex')}`;
            codes.set(code, person);
            return code;
        },
        close: () => new Promise((resolve) => server.close(resolve)),
    };
};

// 가짜 제공자를 쓰게 환경값 넣기 (oauth 주소 상수는 경로 파일 처음 불러올 때 읽음 → startApp 전에 부름)
const FRONT = 'http://front.a11a.test';
const useFakeProviderEnv = (fakeUrl) => {
    Object.assign(process.env, {
        E2E_HOOKS: '1',
        GOOGLE_OAUTH_BASE_URL: fakeUrl,
        DISCORD_OAUTH_BASE_URL: fakeUrl,
        GOOGLE_CLIENT_ID: 'a11a-google-client',
        GOOGLE_CLIENT_SECRET: 'a11a-google-secret',
        GOOGLE_REDIRECT_URI: 'http://api.a11a.test/auth/google/callback',
        DISCORD_CLIENT_ID: 'a11a-discord-client',
        DISCORD_CLIENT_SECRET: 'a11a-discord-secret',
        DISCORD_REDIRECT_URI: 'http://api.a11a.test/auth/discord/callback',
        DISCORD_LINK_REDIRECT_URI: 'http://api.a11a.test/auth/discord/link/callback',
        FRONTEND_URL: FRONT,
    });
    delete process.env.FRONTEND_MOBILE_URL;
};

// 소셜 시작 → { state, attempt(시도 쿠키 값), res }
const startSocial = async (base, provider, { rememberMe, cookies, path } = {}) => {
    const query = rememberMe === undefined ? '' : `?rememberMe=${rememberMe}`;
    const res = await request(base, 'GET', `${path ?? `/auth/${provider}`}${query}`, { cookies });
    const state = res.location ? new URL(res.location).searchParams.get('state') : null;
    return { res, state, attempt: res.cookies.oauthAttempt?.value ?? null };
};

// 소셜 콜백 → { res, url(돌아간 화면 주소), cookies(이름→값) }
const socialCallback = async (base, provider, { state, code, error, attempt, extraCookies = {}, path } = {}) => {
    const params = new URLSearchParams();
    if (state !== undefined && state !== null) params.set('state', state);
    if (code) params.set('code', code);
    if (error) params.set('error', error);
    const cookies = { ...extraCookies, ...(attempt ? { oauthAttempt: attempt } : {}) };
    const res = await request(base, 'GET', `${path ?? `/auth/${provider}/callback`}?${params}`, { cookies });
    const values = Object.fromEntries(Object.entries(res.cookies).map(([name, c]) => [name, c.value]));
    return { res, url: res.location ? new URL(res.location) : null, cookies: values };
};

module.exports = {
    TEST_DB_URL, db, noDb, prepareDb, startApp, closeAll, withEnv,
    mailbox, mailsTo, failNextMail,
    nextIp, request, cookiesOf, cookieHeader, isCleared, decodeJwt,
    tag, emailOf, nicknameOf, createUser, currentTermIds, signupBody, proofOverHttp, signupOverHttp, loginOverHttp,
    userRow, sessionsOf, liveSessionsOf, historyOf, secondsFromNow,
    startFakeProvider, useFakeProviderEnv, FRONT, startSocial, socialCallback,
};
