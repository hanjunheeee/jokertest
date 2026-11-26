'use strict';

// A11b 시험 틀 (a11b 파일만 씀) — 시험 DB 준비·진짜 경로(/auth·/user) 앱·메모리 메일·사람·세션·판 자리 만들기
// 경로 파일을 시험마다 새로 불러 요청 수 제한 셈이 시험끼리 안 섞이게 함, 가짜 시계는 Date만 (DB 연결 타이머는 진짜로)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 시험마다 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// 시험 전용 값 (시험 환경값에 없을 때만 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a11b-test-only-jwt-secret-value';
if (!process.env.SIGNUP_EMAIL_HMAC_SECRET) process.env.SIGNUP_EMAIL_HMAC_SECRET = 'a11b-test-only-signup-hmac-secret';
// 재설정 링크 앞 주소 (없으면 메일을 안 만들어서 시험용 값, 시험이 바꿀 땐 되돌림)
if (!process.env.PASSWORD_RESET_APP_URL) process.env.PASSWORD_RESET_APP_URL = 'http://localhost:5173';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');
// 약관 동의·만 14세 검사는 통과로 (그 검사는 가입 시험 몫)
require('../helpers/termsStub').passSignupTermsForFile();
const { prepareSignupProof } = require('../helpers/signupProof');

const db = require('../../models');
const express = require('express');
const cookieParser = require('cookie-parser');
const { bodyGuards } = require('../../middlewares/bodyGuard.middleware');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { TRUST_PROXY_HOPS } = require('../../utils/request');
const mailAdapterModule = require('../../utils/adapters/mail');
const authService = require('../../services/auth/account');
const { issueSessionForUser } = require('../../services/auth/account/session');
const { generateRefreshSecret, hashRefreshToken } = require('../../services/auth/account/tokens');
const { generateToken, hashPassword } = require('../../utils/auth/credentials');
const core = require('../../game-core/gameSession');

const AUTH_ROUTES = require.resolve('../../routes/auth.routes');
const USER_ROUTES = require.resolve('../../routes/user.routes');

// 시험 비번 (진짜 값 아님)
const PASSWORD = 'A11b-test-pw-1';

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// ── DB 준비 ──

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

// 파일 처음에 한 번: 시험 DB 비우고 마이그레이션 끝까지
async function prepareDb() {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
}

async function closeDb() {
    await db.sequelize.close();
}

// ── 메일: 진짜 발송기 대신 메모리 발송기 (진짜로 안 보냄) ──

const mail = mailAdapterModule.createMemoryMailAdapter();
mailAdapterModule.createHttpMailAdapter = () => mail;
// 그 주소로 간 메일 (목적으로 거름)
const mailsTo = (address, template = null) => mail.outbox
    .filter((m) => m.to === address && (template === null || m.template === template));
// 재설정 메일 링크에서 토큰 꺼냄
const tokenOf = (m) => new URL(m.params.resetUrl).searchParams.get('token');

// ── 진짜 경로 앱 ──

// 시험마다 앱 하나: 경로 파일 새로 불러 요청 수 제한 셈 0부터, clock이면 Date만 가짜 시계 (경로 부르기 전에 켬)
async function startApp(t, { clock = false } = {}) {
    let clockApi = null;
    if (clock) {
        // 0밀리초로 맞춘 지금 (DB 시각 칸이 초 단위라 반올림으로 경계가 밀리는 것 막기)
        t.mock.timers.enable({ apis: ['Date'], now: Math.floor(Date.now() / 1000) * 1000 });
        clockApi = { tick: (ms) => t.mock.timers.tick(ms) };
    }
    delete require.cache[AUTH_ROUTES];
    delete require.cache[USER_ROUTES];
    const authRouter = require(AUTH_ROUTES);
    const userRouter = require(USER_ROUTES);
    delete require.cache[AUTH_ROUTES];
    delete require.cache[USER_ROUTES];

    // 진짜 서버(index.js)와 같은 앞단 차례: 프록시 한 단계·본문 검사·쿠키 → 경로 → 404·오류 처리
    const app = express();
    app.set('trust proxy', TRUST_PROXY_HOPS);
    for (const middleware of bodyGuards()) app.use(middleware);
    app.use(cookieParser());
    app.use('/auth', authRouter);
    app.use('/user', userRouter);
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
    }));

    // 요청 하나 → { status, body, text, headers, cookies(이름→값) }
    async function call(method, path, { body, cookie, rawBody, contentType } = {}) {
        const headers = {};
        if (cookie) headers.cookie = cookie;
        let payload;
        if (rawBody !== undefined) {
            payload = rawBody;
            headers['content-type'] = contentType ?? 'application/json';
        } else if (body !== undefined) {
            payload = JSON.stringify(body);
            headers['content-type'] = 'application/json';
        }
        const res = await fetch(`${url}${path}`, { method, headers, body: payload });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { json = null; }
        return { status: res.status, body: json, text, headers: res.headers, setCookies: res.headers.getSetCookie() };
    }

    return {
        url,
        call,
        clock: clockApi,
        get: (path, opts) => call('GET', path, opts),
        post: (path, body, opts = {}) => call('POST', path, { ...opts, body }),
        patch: (path, body, opts = {}) => call('PATCH', path, { ...opts, body }),
    };
}

// ── 사람 ──

let seq = 0;
// 겹치지 않는 짧은 꼬리 (영문 소문자·숫자)
const tail = () => {
    seq += 1;
    return `${seq.toString(36)}${crypto.randomBytes(3).toString('hex')}`;
};

// 비번 있는 계정: 진짜 가입 길(이메일 인증 증명 → 가입 서비스)로 만듦 → { uuid, email, password, nickname, birthDate }
async function createLocalUser({ prefix = 'u', password = PASSWORD, birthDate = '1995-05-05', nickname, email } = {}) {
    const end = tail();
    const finalEmail = email ?? `a11b-${prefix}-${end}@example.com`;
    const finalNickname = nickname ?? `${prefix}${end}`.slice(0, 8);
    const { signupProof } = await prepareSignupProof(finalEmail.trim().toLowerCase());
    const user = await authService.signup({
        email: finalEmail, password, passwordConfirm: password, nickname: finalNickname, birthDate, signupProof,
    });
    return { uuid: user.uuid, email: user.email, password, nickname: user.nickname, birthDate };
}

// 소셜 전용 계정: 가입 뒤 시험 DB에서 칸만 바꿈 (has_local_password=false, 아무도 모르는 비번 해시)
async function createSocialUser({ prefix = 's', birthDate = '1992-02-02' } = {}) {
    const user = await createLocalUser({ prefix, birthDate });
    const unknown = crypto.randomBytes(24).toString('base64url');
    await db.User.update(
        { has_local_password: false, password_hash: await hashPassword(unknown) },
        { where: { uuid: user.uuid } },
    );
    return { ...user, password: null };
}

const userRow = (uuid) => db.User.findOne({ where: { uuid }, raw: true, paranoid: false });
const hashOf = async (uuid) => (await userRow(uuid)).password_hash;

// ── 세션 ──

const cookieOf = (access, refresh) => [
    access ? `accessToken=${access}` : null,
    refresh ? `refreshToken=${refresh}` : null,
].filter(Boolean).join('; ');

// 응답 Set-Cookie에서 이름→값 (지우는 쿠키는 빈 값)
function cookiesFrom(setCookies) {
    const out = {};
    for (const line of setCookies ?? []) {
        const [pair] = line.split(';');
        const at = pair.indexOf('=');
        out[pair.slice(0, at).trim()] = pair.slice(at + 1);
    }
    return out;
}

// 로그인한 세션 (로그인 서비스가 쓰는 세션 발급 그대로: 그 사람 옛 세션 끊고 새 세션) → { access, refresh, cookie, sessionId }
async function sessionFor(uuid, { rememberMe = false } = {}) {
    const user = await db.User.findByPk(uuid);
    const issued = await db.sequelize.transaction((transaction) => issueSessionForUser(
        user, { rememberMe }, { ip: '127.0.0.1' }, transaction,
    ));
    const decoded = JSON.parse(Buffer.from(issued.token.split('.')[1], 'base64url').toString());
    return {
        access: issued.token,
        refresh: issued.refreshToken,
        cookie: cookieOf(issued.token, issued.refreshToken),
        sessionId: decoded.sessionId,
    };
}

// 다른 기기 세션 하나 더 (로그인 발급은 옛 세션을 끊어서 줄을 직접 넣음, 로그인 유지 refresh 있음)
async function otherDeviceSession(uuid) {
    const user = await db.User.findByPk(uuid);
    const sessionId = crypto.randomUUID();
    const refresh = generateRefreshSecret();
    await db.UserSession.create({
        id: sessionId,
        user_id: uuid,
        ip_address: '127.0.0.2',
        is_online: true,
        refresh_token_hash: hashRefreshToken(refresh),
        refresh_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    const access = generateToken({ uuid, role: user.role, sessionId }, { expiresIn: '1d' });
    return { access, refresh, cookie: cookieOf(access, refresh), sessionId };
}

// HTTP 로그인 → { status, body, cookie }
async function login(app, email, password, { rememberMe = false } = {}) {
    const res = await app.post('/auth/login', { email, password, rememberMe });
    const jar = cookiesFrom(res.setCookies);
    return { ...res, cookie: cookieOf(jar.accessToken, jar.refreshToken) };
}

// 그 세션 refresh → { status, cookie(새 쿠키) }
async function refreshWith(app, session) {
    const res = await app.call('POST', '/auth/refresh', { cookie: `refreshToken=${session.refresh}` });
    const jar = cookiesFrom(res.setCookies);
    return { ...res, refresh: jar.refreshToken ?? null, access: jar.accessToken ?? null };
}

// ── 판 자리 (탈퇴 판 중 거절 시험) ──

// 진짜 계정 하나 + 채우는 사람으로 n명 판을 장부에 열고 첫 낮까지 (직업은 무작위 0 고정)
function seatInGame(uuid, n, id) {
    const players = [{ uuid, nickname: `a11b${id}`, isReady: true }];
    for (let i = 1; i < n; i += 1) players.push({ uuid: `a11b-${id}-fill-${i}`, nickname: `채움${i}`, isReady: true });
    const room = { id: `a11b-room-${id}`, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount: 1 } };
    const candidate = core.__testables.buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => `a11b-game-${id}` });
    assert.equal(candidate.ok, true, `준비: 판 만들기 거절 ${candidate.reason}`);
    core.commitGameSession(candidate.session);
    const reveal = core.forceCompleteRoleReveal(candidate.session);
    assert.equal(reveal.ok, true, `준비: 첫 낮 실패 ${reveal.code}`);
    return candidate.session;
}

const resetGames = () => core.__resetStateForTests();

module.exports = {
    TEST_DB_URL,
    PASSWORD,
    db,
    noDb,
    prepareDb,
    closeDb,
    mail,
    mailsTo,
    tokenOf,
    startApp,
    tail,
    createLocalUser,
    createSocialUser,
    userRow,
    hashOf,
    cookieOf,
    cookiesFrom,
    sessionFor,
    otherDeviceSession,
    login,
    refreshWith,
    seatInGame,
    resetGames,
};
