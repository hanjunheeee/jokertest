'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f07-discord-oauth-integration-test-secret';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontend.example.test';
process.env.DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID     || 'f07-integration-client-id';
process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'f07-integration-client-secret';
process.env.DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI  || 'https://backend.example.test/auth/discord/callback';
process.env.DISCORD_LINK_REDIRECT_URI = process.env.DISCORD_LINK_REDIRECT_URI || 'https://backend.example.test/auth/discord/link/callback';
process.env.SIGNUP_EMAIL_HMAC_SECRET = process.env.SIGNUP_EMAIL_HMAC_SECRET || 'f07-signup-email-hmac-secret';
process.env.SIGNUP_EMAIL_HOUR_MAX = '1000';
process.env.SIGNUP_EMAIL_DAY_MAX = '1000';
process.env.SIGNUP_IP_HOUR_MAX = '1000';
process.env.SIGNUP_IP_DAY_MAX = '1000';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addLoadoutRevision = require('../../db/migrations/0010-add-economy-loadout-revision');
const addEconomyLoadoutJobSkins = require('../../db/migrations/0011-add-economy-loadout-job-skins');
const addPasswordResetTokens = require('../../db/migrations/0015-password-reset-tokens');
const addSignupEmailVerification = require('../../db/migrations/0016-signup-email-verification');
const addSocialSignupEmail = require('../../db/migrations/0017-social-signup-email');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory, addSocialAuth, addEconomy, addLoadoutRevision, addEconomyLoadoutJobSkins, addPasswordResetTokens, addSignupEmailVerification, addSocialSignupEmail];
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

const db = require('../../models');
const authService = require('../../services/auth/account');
const discordOAuthService = require('../../services/auth/oauth/discord');
const userRepository = require('../../repositories/user.repositories');
const mailAdapterModule = require('../../mail/mailAdapter');
const { hashPassword } = require('../../utils/hash');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const REQ_INFO = { ip: '127.0.0.1', userAgent: 'f07-discord-integration' };
const PASSWORD = 'correct-horse-battery-2';

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
    const { url } = await listenOnFetchablePort(server);
    t.after(() => {
        server.closeAllConnections?.();
        return new Promise((resolve) => server.close(resolve));
    });
    return { base: url, tokenRequests };
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

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', require('../../routes/auth.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => {
        server.closeAllConnections?.();
        return new Promise((resolve) => server.close(resolve));
    });

    return url;
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

const setCookies = (headers) => {
    if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
    const raw = headers['set-cookie'] ?? [];
    return Array.isArray(raw) ? raw : [raw];
};
const findSetCookie = (headers, name) => setCookies(headers).filter((c) => c.startsWith(`${name}=`)).at(-1);
const cookieHeader = (raw) => raw.split(';')[0];

test('setCookies는 node:http 헤더와 fetch(WHATWG) Headers 양쪽에서 여러 Set-Cookie를 배열로 읽고, Expires의 쉼표를 쿠키 경계로 쪼개지 않는다', () => {
    const expiresCookie = 'sessionId=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/';
    const otherCookie = 'refreshToken=xyz; HttpOnly';

    const nodeHeaders = { 'set-cookie': [expiresCookie, otherCookie] };
    assert.deepEqual(setCookies(nodeHeaders), [expiresCookie, otherCookie]);
    assert.equal(findSetCookie(nodeHeaders, 'sessionId'), expiresCookie);

    const fetchHeaders = new Headers();
    fetchHeaders.append('set-cookie', expiresCookie);
    fetchHeaders.append('set-cookie', otherCookie);
    assert.deepEqual(setCookies(fetchHeaders), [expiresCookie, otherCookie]);
    assert.equal(findSetCookie(fetchHeaders, 'sessionId'), expiresCookie);

    assert.deepEqual(setCookies({ 'set-cookie': otherCookie }), [otherCookie]);

    assert.deepEqual(setCookies({}), []);
    assert.deepEqual(setCookies(new Headers()), []);
});

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const email = `${label}-${uuid}@example.com`;
    await db.User.create({ uuid, password_hash: await hashPassword(PASSWORD), nickname: `${label}${uuid.slice(0, 6)}`, email });
    await db.UserStats.create({ user_id: uuid });
    return { uuid, email };
};

const stateOf = (headers) => new URL(headers.location).searchParams.get('state');

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

        const startRes = await rawGet(base, `/auth/discord?rememberMe=${rememberMe}`);
        assert.equal(startRes.statusCode, 302);
        const state = stateOf(startRes.headers);
        const attemptCookie = findSetCookie(startRes.headers, 'oauthAttempt');
        assert.ok(attemptCookie);

        const callbackRes = await rawGet(base, `/auth/discord/callback?code=real-code-1&state=${state}`, {
            cookie: cookieHeader(attemptCookie),
        });
        assert.equal(callbackRes.statusCode, 302);
        const callbackUrl = new URL(callbackRes.headers.location);
        assert.equal(callbackUrl.pathname, '/login');
        const intentToken = callbackUrl.searchParams.get('socialIntent');
        assert.ok(intentToken, 'SIGNUP_REQUIRED면 intentToken이 실려야 한다');
        assert.equal(await db.User.count({ where: { email } }), 0, '가입 보완 전에는 아직 계정이 생기면 안 된다');

        const signupAttemptCookie = findSetCookie(callbackRes.headers, 'oauthAttempt');
        assert.ok(signupAttemptCookie, 'SIGNUP_REQUIRED는 rememberMe를 들고 갈 서명된 가입 보완 쿠키를 다시 세팅해야 한다');
        const signupCookieHeader = cookieHeader(signupAttemptCookie);

        const nickname = `f0${subject.slice(-6)}`;

        const rejectedRes = await fetch(`${base}/auth/social/signup/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: signupCookieHeader },
            body: JSON.stringify({ intentToken, nickname: 'a', birthDate: '1996-05-05' }),
        });
        assert.equal(rejectedRes.status, 400, `닉네임 검증 실패는 400이어야 합니다: ${await rejectedRes.text()}`);
        assert.equal(await db.User.count({ where: { email } }), 0, '검증 실패 재시도 전에는 계정이 생기면 안 된다');

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

        const completeAccessCookie = findSetCookie(completeRes.headers, 'accessToken');
        const completeRefreshCookie = findSetCookie(completeRes.headers, 'refreshToken');
        if (rememberMe) {
            assert.match(completeAccessCookie, /Max-Age/i, 'rememberMe:true는 영속 세션 쿠키여야 한다');
            assert.ok(completeRefreshCookie && !/^refreshToken=;/.test(completeRefreshCookie),
                'rememberMe:true는 재시도 이후에도 refreshToken이 발급되어야 한다');
        } else {
            assert.doesNotMatch(completeAccessCookie, /Max-Age/i, 'rememberMe:false는 세션 쿠키(비영속)여야 한다');
        }

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

test('F-31 AC-02: 검증되지 않은 이메일(verified:false)은 intent만 남기고, 증명 없는 완료는 거절되며, 기존 발송·확인 API로 받은 증명으로만 단일 계정이 만들어진다(실제 DB, 스텁 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const memory = mailAdapterModule.createMemoryMailAdapter();
    t.mock.method(mailAdapterModule, 'createHttpMailAdapter', () => memory);

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
    const beforeSessions = await db.UserSession.count();

    const callbackRes = await rawGet(base, `/auth/discord/callback?code=real-code-x&state=${state}`, {
        cookie: cookieHeader(attemptCookie),
    });

    assert.equal(callbackRes.statusCode, 302);
    const callbackUrl = new URL(callbackRes.headers.location);
    assert.equal(callbackUrl.pathname, '/login');
    assert.equal(callbackUrl.searchParams.get('socialError'), null, '미인증 이메일은 더 이상 거부로 끝나지 않는다');
    const intentToken = callbackUrl.searchParams.get('socialIntent');
    assert.ok(intentToken, 'SIGNUP_REQUIRED면 intentToken이 실려야 한다');
    assert.equal(findSetCookie(callbackRes.headers, 'accessToken'), undefined);
    assert.equal(await db.User.count(), beforeUsers, '인증 완료 전에는 계정이 생기면 안 된다');
    assert.equal(await db.ExternalIdentity.count(), beforeIdentities);
    assert.equal(await db.UserSession.count(), beforeSessions);
    const intentRow = await db.SocialSignupIntent.findOne({ where: { provider: 'discord', subject } });
    assert.equal(intentRow.email, null, '제공자가 검증하지 않은 주소는 intent에 저장되면 안 된다');
    assert.equal(intentRow.consumed_at, null);

    const signupCookieHeader = cookieHeader(findSetCookie(callbackRes.headers, 'oauthAttempt'));
    const postComplete = (body) => fetch(`${base}/auth/social/signup/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: signupCookieHeader },
        body: JSON.stringify(body),
    });
    const email = `f07-self-${crypto.randomUUID()}@example.com`;
    const nickname = `f0${subject.slice(-6)}`;

    const noProofRes = await postComplete({ intentToken, nickname, birthDate: '1996-05-05', email, email_verified: true, verified: true });
    const noProofBody = await noProofRes.json();
    assert.equal(noProofRes.status, 401, JSON.stringify(noProofBody));
    assert.equal(noProofBody.code, 'SIGNUP_PROOF_REQUIRED');
    assert.equal(await db.User.count(), beforeUsers);
    assert.equal((await intentRow.reload()).consumed_at, null, '거절된 완료는 intent를 소비하면 안 된다');

    const codeRes = await fetch(`${base}/auth/signup/email-code`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
    });
    assert.equal(codeRes.status, 200, await codeRes.text());
    const code = memory.outbox.at(-1).params.code;
    const verifyRes = await fetch(`${base}/auth/signup/email-code/verify`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, code }),
    });
    const { signupProof } = await verifyRes.json();
    assert.ok(signupProof);

    const completeRes = await postComplete({ intentToken, nickname, birthDate: '1996-05-05', email, signupProof });
    const completeBodyRaw = await completeRes.text();
    assert.equal(completeRes.status, 200, completeBodyRaw);
    const newUuid = JSON.parse(completeBodyRaw).data.user.uuid;

    const storedUser = await db.User.findByPk(newUuid);
    assert.equal(storedUser.email, email);
    assert.equal(storedUser.email_verified, true);
    const identity = await db.ExternalIdentity.findOne({ where: { provider: 'discord', subject } });
    assert.equal(identity.user_id, newUuid);
    assert.equal(identity.email_snapshot, null, '제공자가 주지 않은 주소를 제공자 스냅샷으로 남기면 안 된다');
    assert.equal(await db.User.count(), beforeUsers + 1);
    assert.equal(await db.ExternalIdentity.count({ where: { provider: 'discord', subject } }), 1);
});

test('F-31 AC-05: email_verified=false인 기존 Discord identity 계정은 제공자 이메일 미제공 재로그인에서도 자체 인증 없이 같은 UUID로 로그인되고 값이 보존된다(실제 DB, 스텁 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const local = await createLocalUser('f07legacy');
    await db.User.update({ email_verified: false }, { where: { uuid: local.uuid } });
    const subject = `discord-legacy-${crypto.randomUUID()}`;
    await userRepository.createExternalIdentity({ provider: 'discord', subject, user_id: local.uuid });

    const { base: fixtureBase } = await startMockDiscord(t, { profile: { id: subject, verified: false } });
    withFetchRedirectedTo(t, fixtureBase);
    const base = await startServer(t);

    const startRes = await rawGet(base, '/auth/discord');
    const callbackRes = await rawGet(base, `/auth/discord/callback?code=legacy-code&state=${stateOf(startRes.headers)}`, {
        cookie: cookieHeader(findSetCookie(startRes.headers, 'oauthAttempt')),
    });
    assert.equal(callbackRes.headers.location, `${process.env.FRONTEND_URL}/lobby`, '기존 identity는 자체 인증 화면으로 가면 안 된다');
    assert.ok(findSetCookie(callbackRes.headers, 'accessToken'));
    assert.equal(await db.SocialSignupIntent.count({ where: { subject } }), 0);
    assert.equal(await db.User.count(), 1);
    const after = await db.User.findByPk(local.uuid);
    assert.equal(after.email_verified, false, '로그인이 email_verified를 허위로 true로 바꾸면 안 된다');
});

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

test('AC-04: 로그인 후 실제 /auth/discord/link 왕복으로만 계정이 연결되고, 서버가 검증한 subject/email만 저장된다(실제 DB, 스텁 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const local = await createLocalUser('f07link');
    const loginResult = await authService.login({ email: local.email, password: PASSWORD }, REQ_INFO);
    const accessTokenCookie = `accessToken=${loginResult.token}`;

    const subject = `discord-link-${crypto.randomUUID()}`;
    const discordEmail = `discord-only-${crypto.randomUUID()}@example.com`;
    const { base: fixtureBase, tokenRequests } = await startMockDiscord(t, { profile: { id: subject, email: discordEmail, verified: true } });
    withFetchRedirectedTo(t, fixtureBase);
    const base = await startServer(t);

    const startRes = await rawGet(base, '/auth/discord/link', { cookie: accessTokenCookie });
    assert.equal(startRes.statusCode, 302, '인증된 사용자만 연결을 시작할 수 있어야 한다');
    const state = stateOf(startRes.headers);
    const attemptCookie = findSetCookie(startRes.headers, 'oauthAttempt');

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

    assert.equal(tokenRequests.length, 1);
    assert.equal(new URLSearchParams(tokenRequests[0]).get('redirect_uri'), emittedRedirectUri,
        'AC-04: 토큰 교환은 인가 URL 발급 때와 정확히 같은 redirect_uri를 써야 한다(R-IMPL #2)');

    const identity = await db.ExternalIdentity.findOne({ where: { provider: 'discord', subject } });
    assert.ok(identity, '실제 링크 라우트 왕복 이후 external_identities 행이 생겨야 한다');
    assert.equal(identity.user_id, local.uuid);
    assert.equal(identity.email_snapshot, discordEmail);

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
