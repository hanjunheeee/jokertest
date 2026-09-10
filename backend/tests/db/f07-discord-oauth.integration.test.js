'use strict';

// F-07 AC-02/AC-03/AC-04 — Discord 로그인의 "실제" 신규 계정 생성·가입 완료·기존 identity
// 조회·이메일 미제공 거부·명시적 연결을 스텁이 아니라 실제 격리 DB + 실제
// discordOAuth.service.js(fetch 목적지만 로컬 Discord fixture로 리다이렉트, 나머지 로직은
// 전혀 스텁하지 않음) + 실제 Express 라우터(auth.routes.js, 아무것도 스텁하지 않음)로
// 검증한다. F01_TEST_DATABASE_URL이 없으면 f01~f05와 같은 원칙으로 skip한다("미검증"으로
// 남긴다, 실패로 위장하지 않는다).
//
// CODEX-1 재검토 지적(AC-02/AC-03/AC-04):
// - AC-02: backend/__tests__/discordAuth.route.test.js는 socialAuthService.resolveOAuthAccount를
//   스텁으로 대체해 컨트롤러 계약(순서·쿠키·리다이렉트)만 검증한다 — 실제 Discord 신규 계정
//   생성·가입 완료·기존 identity 조회 근거가 없었다.
// - AC-03: discordOAuth.service.js가 이메일을 null로 반환한 뒤 공통 서비스가 EMAIL_MISSING으로
//   거부하는 실행 경로를 실제로 잇는 테스트가 없었다(discordOAuth.service.test.js는
//   exchangeCodeForProfile 단독만, discordAuth.route.test.js는 resolveOAuthAccount를 스텁해
//   실제 거부 로직을 태우지 않는다).
// - AC-04: auth.routes.js에 명시적 연결(link) 라우트가 아예 등록되어 있지 않아, 로그인 후
//   동의·제공자 소유권 검증을 통한 실제 연결 경로 자체가 존재하지 않았다.
//
// backend/tests/db/f05-social-auth.integration.test.js는 이 실행 경로 자체(provider가
// 무엇이든 동일하게 동작하는 공통 계약)를 이미 실제 DB로 검증하지만, provider 값으로
// 'google'/'kakao'만 쓰고 'discord'는 한 번도 쓰지 않는다 — 이 파일은 그 틈을 discord로 직접
// 메운다. 그리고 AC-04 지적에 따라 backend/routes/auth.routes.js·backend/controller/
// user.controller.js에 새로 추가한 GET /auth/discord/link·/auth/discord/link/callback도
// 아무것도 스텁하지 않은 실제 HTTP 왕복으로 검증한다.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const cookieParser = require('cookie-parser');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f07-discord-oauth-integration-test-secret';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontend.example.test';
process.env.DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID     || 'f07-integration-client-id';
process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'f07-integration-client-secret';
process.env.DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI  || 'https://backend.example.test/auth/discord/callback';
// R-IMPL #2(AC-04): 연결(link)은 로그인과 별도로 등록된 콜백을 쓴다 — 같은 값을 쓰면 실제
// Discord는 그 한 콜백으로만 돌려주므로 link로 시작한 왕복도 로그인 콜백(purpose:link를
// 거부한다)으로 떨어진다(discordOAuth.service.js resolveRedirectUri 참고).
process.env.DISCORD_LINK_REDIRECT_URI = process.env.DISCORD_LINK_REDIRECT_URI || 'https://backend.example.test/auth/discord/link/callback';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory, addSocialAuth];
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner,
});

let sequelize;
let connectionError = null;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
    } catch (error) {
        connectionError = error;
    }
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    if (connectionError) {
        t.skip(`격리 DB(${TEST_DB_URL.replace(/:[^:@]*@/, ':***@')})에 연결할 수 없습니다 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

// backend/models과 service/repository는 require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔
// process.env.DATABASE_URL(F01_TEST_DATABASE_URL)로 처음 require되는 이 시점에 격리 DB에
// 연결된다(f05-social-auth.integration.test.js와 같은 원칙).
const db = require('../../models');
const authService = require('../../service/auth.service');
const discordOAuthService = require('../../service/discordOAuth.service');
const userRepository = require('../../repositories/user.repositories');
const { hashPassword } = require('../../utils/hash');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const REQ_INFO = { ip: '127.0.0.1', userAgent: 'f07-discord-integration' };
const PASSWORD = 'correct-horse-battery-2';

// ── 로컬 Discord fixture 서버 — discordOAuth.service.test.js와 같은 패턴, 프로필만 매 테스트가 지정한다 ──

// tokenRequests: 실제 토큰 교환 요청 본문을 순서대로 모아 둔다 — AC-04 링크 테스트가
// "인가 URL 발급 때와 정확히 같은 redirect_uri로 교환했는지"를 실제 네트워크 요청에서
// 확인하는 데 쓴다(R-IMPL #2, CODEX-2 재검토 지적).
const startMockDiscord = async (t, { profile }) => {
    const tokenRequests = [];
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            if (req.url.startsWith('/token')) {
                tokenRequests.push(Buffer.concat(chunks).toString('utf8'));
                res.writeHead(200, { 'content-type': 'application/json' });
                return res.end(JSON.stringify({ access_token: `token-${crypto.randomUUID()}` }));
            }
            if (req.url.startsWith('/me')) {
                res.writeHead(200, { 'content-type': 'application/json' });
                return res.end(JSON.stringify(profile));
            }
            res.writeHead(404).end();
        });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
        server.closeAllConnections?.();
        return new Promise((resolve) => server.close(resolve));
    });
    return { base: `http://127.0.0.1:${server.address().port}`, tokenRequests };
};

const withFetchRedirectedTo = (t, base) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
        const urlStr = String(url);
        if (urlStr.startsWith(discordOAuthService.DISCORD_TOKEN_ENDPOINT)) return originalFetch(`${base}/token`, init);
        if (urlStr.startsWith(discordOAuthService.DISCORD_USERINFO_ENDPOINT)) return originalFetch(`${base}/me`, init);
        return originalFetch(urlStr, init);
    };
    t.after(() => { globalThis.fetch = originalFetch; });
};

// ── 실제 Express 서버 — auth.routes.js를 아무것도 스텁하지 않고 그대로 마운트한다 ──────

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', require('../../routes/auth.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));

    return `http://127.0.0.1:${server.address().port}`;
};

const rawGet = (base, path, { cookie } = {}) => new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = http.request(url, { method: 'GET', headers: cookie ? { cookie } : {} }, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
});

const setCookies = (headers) => headers['set-cookie'] ?? [];
const findSetCookie = (headers, name) => setCookies(headers).filter((c) => c.startsWith(`${name}=`)).at(-1);
const cookieHeader = (raw) => raw.split(';')[0];

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const email = `${label}-${uuid}@example.com`;
    await db.User.create({ uuid, password_hash: await hashPassword(PASSWORD), nickname: `${label}${uuid.slice(0, 6)}`, email });
    await db.UserStats.create({ user_id: uuid });
    return { uuid, email };
};

const stateOf = (headers) => new URL(headers.location).searchParams.get('state');

// ── AC-02: 실제 신규 Discord 계정 생성 → 가입 완료 → 재로그인은 기존 identity를 재사용한다 ──
//
// R-IMPL 재검토 지적: 이전 회차의 가입 완료 닉네임(`f07가입${subject.slice(-6)}`)이 11자여서
// 승인된 닉네임 상한(2~8자, backend/validation/signupValidation.js NICKNAME_MAX_LENGTH)을
// 넘겨 완료 요청 자체가 400으로 실패했다 — "가입 완료" 계약을 증명하지 못하고 있었다. 아래는
// (1) 2~8자 유효 닉네임(`f0` + subject 뒤 6자, 항상 8자)으로 고치고, (2) 예상 밖 상태코드가
// 나오면 응답 본문을 함께 실어 원인을 바로 알 수 있게 하고, (3) 콜백이 SIGNUP_REQUIRED에서
// 다시 세팅하는 서명된 가입 보완 쿠키(rememberMe 포함, user.controller.js
// googleAuthCallback/discordAuthCallback 주석 참고)를 실제로 완료 요청까지 들고 가서
// rememberMe:false/true 양쪽과, 검증 실패 후 같은 쿠키로 재시도해도 rememberMe가 조용히
// 사라지지 않는지(completeSocialSignup 주석 — "재시도 가능한 실패에도 쿠키가 사라지면
// 안 된다")까지 실제 HTTP·DB로 검증한다.
for (const rememberMe of [false, true]) {
    test(`AC-02(rememberMe=${rememberMe}): 실제 HTTP 왕복 — 신규 Discord 계정은 가입 보완을 요구하고, 서명된 가입 보완 쿠키가 재시도까지 rememberMe 선택을 그대로 들고 가며, 가입 완료 후 재로그인은 같은 계정을 재사용한다(실제 DB, 스텁 없음)`, async (t) => {
        if (unavailable(t)) return;
        await resetSchema();
        await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

        const subject = `discord-${crypto.randomUUID()}`;
        const email = `f07-signup-${crypto.randomUUID()}@example.com`;
        const { base: fixtureBase } = await startMockDiscord(t, { profile: { id: subject, email, verified: true } });
        withFetchRedirectedTo(t, fixtureBase);
        const base = await startServer(t);

        // 1) 시작 — 실제 state를 실제 DB(oauth_states)에 발급한다.
        const startRes = await rawGet(base, `/auth/discord?rememberMe=${rememberMe}`);
        assert.equal(startRes.statusCode, 302);
        const state = stateOf(startRes.headers);
        const attemptCookie = findSetCookie(startRes.headers, 'oauthAttempt');
        assert.ok(attemptCookie);

        // 2) 콜백 — 실제 discordOAuthService(fixture로 리다이렉트된 fetch)가 검증한 subject/email로
        // 실제 socialAuthService.resolveOAuthAccount가 SIGNUP_REQUIRED를 반환해야 한다.
        const callbackRes = await rawGet(base, `/auth/discord/callback?code=real-code-1&state=${state}`, {
            cookie: cookieHeader(attemptCookie),
        });
        assert.equal(callbackRes.statusCode, 302);
        const callbackUrl = new URL(callbackRes.headers.location);
        assert.equal(callbackUrl.pathname, '/login');
        const intentToken = callbackUrl.searchParams.get('socialIntent');
        assert.ok(intentToken, 'SIGNUP_REQUIRED면 intentToken이 실려야 한다');
        assert.equal(await db.User.count({ where: { email } }), 0, '가입 보완 전에는 아직 계정이 생기면 안 된다');

        // SIGNUP_REQUIRED가 다시 세팅한 가입 보완용 서명 쿠키 — rememberMe 선택이 여기 실려
        // 있고, 완료 요청까지 그대로 들고 가야 한다.
        const signupAttemptCookie = findSetCookie(callbackRes.headers, 'oauthAttempt');
        assert.ok(signupAttemptCookie, 'SIGNUP_REQUIRED는 rememberMe를 들고 갈 서명된 가입 보완 쿠키를 다시 세팅해야 한다');
        const signupCookieHeader = cookieHeader(signupAttemptCookie);

        const nickname = `f0${subject.slice(-6)}`; // 항상 8자 — 승인된 닉네임 상한(2~8자) 안.

        // 3) 재시도: 먼저 닉네임 검증 실패(1자, 최소 2자 미달)로 거부되게 하고, 같은 가입
        // 보완 쿠키로 다시 제출해도 rememberMe 선택이 살아있는지 확인한다.
        const rejectedRes = await fetch(`${base}/auth/social/signup/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: signupCookieHeader },
            body: JSON.stringify({ intentToken, nickname: 'a', birthDate: '1996-05-05' }),
        });
        assert.equal(rejectedRes.status, 400, `닉네임 검증 실패는 400이어야 합니다: ${await rejectedRes.text()}`);
        assert.equal(await db.User.count({ where: { email } }), 0, '검증 실패 재시도 전에는 계정이 생기면 안 된다');

        // 4) 가입 완료 — 같은 가입 보완 쿠키로 재시도한다. 실제 POST /auth/social/signup/complete로
        // 실제 users/external_identities 행을 만든다.
        const completeRes = await fetch(`${base}/auth/social/signup/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: signupCookieHeader },
            body: JSON.stringify({ intentToken, nickname, birthDate: '1996-05-05' }),
        });
        const completeBodyRaw = await completeRes.text();
        assert.equal(completeRes.status, 200, `가입 완료 응답이 실패했습니다(status=${completeRes.status}): ${completeBodyRaw}`);
        const completeBody = JSON.parse(completeBodyRaw);
        const newUuid = completeBody.data.user.uuid;

        const storedUser = await db.User.findByPk(newUuid);
        assert.ok(storedUser, '실제 users 행이 생성되어야 한다');
        assert.equal(storedUser.email, email);
        const identity = await db.ExternalIdentity.findOne({ where: { provider: 'discord', subject } });
        assert.ok(identity, '실제 external_identities 행(provider=discord)이 생성되어야 한다');
        assert.equal(identity.user_id, newUuid);

        // rememberMe 선택이 재시도를 거치고도 조용히 사라지지 않고 그대로 세션 발급에
        // 반영되어야 한다(가입 보완 쿠키는 계정 생성 성공 전까지 지워지지 않는다).
        const completeAccessCookie = findSetCookie(completeRes.headers, 'accessToken');
        const completeRefreshCookie = findSetCookie(completeRes.headers, 'refreshToken');
        if (rememberMe) {
            assert.match(completeAccessCookie, /Max-Age/i, 'rememberMe:true는 영속 세션 쿠키여야 한다');
            assert.ok(completeRefreshCookie && !/^refreshToken=;/.test(completeRefreshCookie),
                'rememberMe:true는 재시도 이후에도 refreshToken이 발급되어야 한다');
        } else {
            assert.doesNotMatch(completeAccessCookie, /Max-Age/i, 'rememberMe:false는 세션 쿠키(비영속)여야 한다');
        }

        // 5) 재로그인 — 같은 Discord subject로 전체 HTTP 왕복을 다시 돌리면, 새 계정을 만들지
        // 않고 방금 만든 계정으로 즉시 로그인되어야 한다(기존 identity 조회).
        const start2 = await rawGet(base, '/auth/discord?rememberMe=false');
        const state2 = stateOf(start2.headers);
        const attemptCookie2 = findSetCookie(start2.headers, 'oauthAttempt');
        const callback2 = await rawGet(base, `/auth/discord/callback?code=real-code-2&state=${state2}`, {
            cookie: cookieHeader(attemptCookie2),
        });
        assert.equal(callback2.statusCode, 302);
        assert.equal(callback2.headers.location, `${process.env.FRONTEND_URL}/lobby`, '기존 identity가 있으면 즉시 로그인되어야 한다');
        assert.ok(findSetCookie(callback2.headers, 'accessToken'));

        assert.equal(await db.User.count({ where: { email } }), 1, '재로그인이 계정을 또 만들면 안 된다');
        assert.equal(await db.ExternalIdentity.count({ where: { provider: 'discord', subject } }), 1, '재로그인이 identity를 또 만들면 안 된다');
    });
}

// ── AC-03: discordOAuth.service.js의 email:null이 실제로 공통 서비스의 EMAIL_MISSING 거부까지 이어진다 ──

test('AC-03: 검증되지 않은 이메일(verified:false)은 discordOAuthService가 null로 반환하고, 실제 콜백 라우트가 세션 발급 없이 EMAIL_MISSING으로 거부하며 아무 것도 생성하지 않는다(실제 DB, 스텁 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const subject = `discord-unverified-${crypto.randomUUID()}`;
    const { base: fixtureBase } = await startMockDiscord(t, {
        profile: { id: subject, email: 'unverified@example.com', verified: false },
    });
    withFetchRedirectedTo(t, fixtureBase);
    const base = await startServer(t);

    const startRes = await rawGet(base, '/auth/discord');
    const state = stateOf(startRes.headers);
    const attemptCookie = findSetCookie(startRes.headers, 'oauthAttempt');

    const beforeUsers = await db.User.count();
    const beforeIdentities = await db.ExternalIdentity.count();

    const callbackRes = await rawGet(base, `/auth/discord/callback?code=real-code-x&state=${state}`, {
        cookie: cookieHeader(attemptCookie),
    });

    assert.equal(callbackRes.statusCode, 302);
    assert.equal(callbackRes.headers.location, `${process.env.FRONTEND_URL}/login?socialError=EMAIL_MISSING`,
        'discordOAuth.service.js가 verified:false를 email:null로 넘긴 뒤, 실제 socialAuthService.resolveOAuthAccount가 EMAIL_MISSING으로 거부해야 한다');
    assert.equal(findSetCookie(callbackRes.headers, 'accessToken'), undefined);
    assert.equal(await db.User.count(), beforeUsers, '이메일 미제공으로는 계정이 생기면 안 된다');
    assert.equal(await db.ExternalIdentity.count(), beforeIdentities);
});

// ── AC-04 전제: 실제 Discord 이메일이 기존 로컬 계정과 같아도 자동 병합되지 않는다 ────────

test('AC-04 전제: 실제 discordOAuthService가 반환한 이메일이 기존 로컬 계정과 같으면 자동 병합 없이 EMAIL_CONFLICT로 거부된다(실제 DB, 스텁 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const local = await createLocalUser('f07conflict');
    const subject = `discord-conflict-${crypto.randomUUID()}`;
    const { base: fixtureBase } = await startMockDiscord(t, { profile: { id: subject, email: local.email, verified: true } });
    withFetchRedirectedTo(t, fixtureBase);
    const base = await startServer(t);

    const startRes = await rawGet(base, '/auth/discord');
    const state = stateOf(startRes.headers);
    const attemptCookie = findSetCookie(startRes.headers, 'oauthAttempt');

    const callbackRes = await rawGet(base, `/auth/discord/callback?code=real-code-y&state=${state}`, {
        cookie: cookieHeader(attemptCookie),
    });

    assert.equal(callbackRes.headers.location, `${process.env.FRONTEND_URL}/login?socialError=EMAIL_CONFLICT`);
    assert.equal(await db.ExternalIdentity.count({ where: { provider: 'discord', subject } }), 0);
    assert.equal(await db.User.count({ where: { email: local.email } }), 1);
});

// ── AC-04: 로그인 후 실제 /auth/discord/link 왕복으로만 계정이 연결된다 ──────────────

test('AC-04: 로그인 후 실제 /auth/discord/link 왕복으로만 계정이 연결되고, 서버가 검증한 subject/email만 저장된다(실제 DB, 스텁 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const local = await createLocalUser('f07link');
    const loginResult = await authService.login({ email: local.email, password: PASSWORD }, REQ_INFO);
    const accessTokenCookie = `accessToken=${loginResult.token}`;

    const subject = `discord-link-${crypto.randomUUID()}`;
    // 로컬 계정과 다른 이메일을 일부러 쓴다 — 연결이 이메일 일치가 아니라 명시적 동의(로그인
    // 상태에서 이 왕복을 직접 시작)로만 이루어진다는 것을 보인다.
    const discordEmail = `discord-only-${crypto.randomUUID()}@example.com`;
    const { base: fixtureBase, tokenRequests } = await startMockDiscord(t, { profile: { id: subject, email: discordEmail, verified: true } });
    withFetchRedirectedTo(t, fixtureBase);
    const base = await startServer(t);

    const startRes = await rawGet(base, '/auth/discord/link', { cookie: accessTokenCookie });
    assert.equal(startRes.statusCode, 302, '인증된 사용자만 연결을 시작할 수 있어야 한다');
    const state = stateOf(startRes.headers);
    const attemptCookie = findSetCookie(startRes.headers, 'oauthAttempt');

    // CODEX-2 재검토 지적 #2: 연결 시작이 실제로 내보낸 redirect_uri를 그대로 따라가 실제
    // 제공자 왕복이 끊기지 않는지 확인한다 — 로그인용 DISCORD_REDIRECT_URI를 그대로 썼다면
    // 실제 Discord는 로그인 콜백으로 돌려주므로(그 콜백은 purpose:link를 거부한다) 이 값은
    // 반드시 DISCORD_LINK_REDIRECT_URI와 같아야 하고, 로그인용 값과는 달라야 한다.
    const emittedRedirectUri = new URL(startRes.headers.location).searchParams.get('redirect_uri');
    assert.equal(emittedRedirectUri, process.env.DISCORD_LINK_REDIRECT_URI,
        'AC-04: 연결 시작은 실제로 DISCORD_LINK_REDIRECT_URI를 인가 URL에 실어야 한다');
    assert.notEqual(emittedRedirectUri, process.env.DISCORD_REDIRECT_URI,
        'login과 link는 Discord Developer Portal에 서로 다른 콜백으로 등록되어야 한다');

    const callbackRes = await rawGet(base, `/auth/discord/link/callback?code=real-link-code&state=${state}`, {
        cookie: `${accessTokenCookie}; ${cookieHeader(attemptCookie)}`,
    });
    assert.equal(callbackRes.statusCode, 302);
    assert.equal(callbackRes.headers.location, `${process.env.FRONTEND_URL}/account?socialLinkSuccess=discord`);

    // 실제 토큰 교환 요청이 인가 URL 발급 때와 정확히 같은 redirect_uri를 썼는지 확인한다
    // (OAuth 명세 — 둘이 다르면 실제 Discord는 invalid_grant로 거부한다).
    assert.equal(tokenRequests.length, 1);
    assert.equal(new URLSearchParams(tokenRequests[0]).get('redirect_uri'), emittedRedirectUri,
        'AC-04: 토큰 교환은 인가 URL 발급 때와 정확히 같은 redirect_uri를 써야 한다(R-IMPL #2)');

    const identity = await db.ExternalIdentity.findOne({ where: { provider: 'discord', subject } });
    assert.ok(identity, '실제 링크 라우트 왕복 이후 external_identities 행이 생겨야 한다');
    assert.equal(identity.user_id, local.uuid);
    assert.equal(identity.email_snapshot, discordEmail);

    // 연결 이후에는 같은 Discord 식별자로 재로그인하면(자동 병합이 아니라 방금 명시적으로
    // 연결한 결과로) 같은 계정이 재사용된다.
    const relogin = await rawGet(base, '/auth/discord');
    const reloginState = stateOf(relogin.headers);
    const reloginAttempt = findSetCookie(relogin.headers, 'oauthAttempt');
    const reloginCallback = await rawGet(base, `/auth/discord/callback?code=real-relogin-code&state=${reloginState}`, {
        cookie: cookieHeader(reloginAttempt),
    });
    assert.equal(reloginCallback.headers.location, `${process.env.FRONTEND_URL}/lobby`);
    assert.equal(await db.ExternalIdentity.count({ where: { provider: 'discord', subject } }), 1);
});

test('AC-04: 인증 없이 /auth/discord/link를 호출하면 401이고 state는 발급되지 않는다(실제 DB, 스텁 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const base = await startServer(t);
    const beforeStates = await db.OAuthState.count();

    const res = await rawGet(base, '/auth/discord/link');
    assert.equal(res.statusCode, 401);
    assert.equal(await db.OAuthState.count(), beforeStates);
});

test('AC-04: 이미 다른 계정에 연결된 Discord 식별자는 명시적 연결 시도에서도 자동 병합되지 않고 거부된다(실제 DB, 스텁 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const owner = await createLocalUser('f07linkowner');
    const ownerLogin = await authService.login({ email: owner.email, password: PASSWORD }, REQ_INFO);
    const subject = `discord-owned-${crypto.randomUUID()}`;
    await userRepository.createExternalIdentity({ provider: 'discord', subject, user_id: ownerLogin.user.uuid });

    const other = await createLocalUser('f07linkother');
    const otherLogin = await authService.login({ email: other.email, password: PASSWORD }, REQ_INFO);
    const accessTokenCookie = `accessToken=${otherLogin.token}`;

    const { base: fixtureBase } = await startMockDiscord(t, { profile: { id: subject, email: `x-${crypto.randomUUID()}@example.com`, verified: true } });
    withFetchRedirectedTo(t, fixtureBase);
    const base = await startServer(t);

    const startRes = await rawGet(base, '/auth/discord/link', { cookie: accessTokenCookie });
    const state = stateOf(startRes.headers);
    const attemptCookie = findSetCookie(startRes.headers, 'oauthAttempt');

    const callbackRes = await rawGet(base, `/auth/discord/link/callback?code=real-link-code-2&state=${state}`, {
        cookie: `${accessTokenCookie}; ${cookieHeader(attemptCookie)}`,
    });
    assert.equal(callbackRes.headers.location, `${process.env.FRONTEND_URL}/account?socialLinkError=IDENTITY_ALREADY_LINKED`);
    assert.equal(await db.ExternalIdentity.count({ where: { provider: 'discord', subject } }), 1, '이미 연결된 identity가 다른 계정으로 옮겨지면 안 된다');
});

test('AC-04: 연결을 취소하면(error 파라미터) state는 소비되지만 계정은 연결되지 않고, 같은 state는 재사용할 수 없다(실제 DB, 스텁 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const local = await createLocalUser('f07linkcancel');
    const loginResult = await authService.login({ email: local.email, password: PASSWORD }, REQ_INFO);
    const accessTokenCookie = `accessToken=${loginResult.token}`;
    const base = await startServer(t);

    const startRes = await rawGet(base, '/auth/discord/link', { cookie: accessTokenCookie });
    const state = stateOf(startRes.headers);
    const attemptCookie = findSetCookie(startRes.headers, 'oauthAttempt');

    const first = await rawGet(base, `/auth/discord/link/callback?error=access_denied&state=${state}`, {
        cookie: `${accessTokenCookie}; ${cookieHeader(attemptCookie)}`,
    });
    assert.equal(first.headers.location, `${process.env.FRONTEND_URL}/account?socialLinkError=OAUTH_CANCELLED`);
    assert.equal(await db.ExternalIdentity.count({ where: { user_id: local.uuid } }), 0);

    const replay = await rawGet(base, `/auth/discord/link/callback?error=access_denied&state=${state}`, {
        cookie: `${accessTokenCookie}; ${cookieHeader(attemptCookie)}`,
    });
    assert.equal(replay.headers.location, `${process.env.FRONTEND_URL}/account?socialLinkError=STATE_REUSED`,
        '취소된 콜백도 state를 소비해야 같은 state로의 재시도가 막힌다');
});
