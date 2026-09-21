'use strict';

// F-31 소셜 가입 이메일 인증 — 실제 격리 MySQL DB + 실제 Express 라우터(auth.routes.js,
// 스텁 없음) + 실제 googleOAuth/discordOAuth 어댑터(fetch 목적지만 로컬 제공자 fixture로
// 돌린다) + 메모리 메일 어댑터로 검증한다. f01~f31a와 같은 원칙: F01_TEST_DATABASE_URL이
// 없거나 연결에 실패하면 실패로 위장하지 않고 t.skip으로 "미검증"을 남긴다.
//
// 기존 f31a 스위트는 로컬 가입의 원자성을 검증한다. 이 파일은 소셜 intent와 F-31a 가입
// 증명이 같은 트랜잭션에서 함께 소비되는 경로를 검증한다 — 제공자별 인증 분기(AC-01/AC-02),
// 클라이언트 주장·콜백 변조 무력화(AC-03), 증명 주소 불일치·만료·동시 완료·지급 실패 롤백
// (AC-04), 0017 마이그레이션의 반복 적용·기존 행 보존·down 거절(AC-06).
//
// 메모리 메일·로컬 OAuth fixture의 성공은 실제 메일 수신·외부 OAuth 성공이 아니다.

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f31-social-email-integration-test-secret';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontend.example.test';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'f31-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'f31-google-client-secret';
process.env.GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://backend.example.test/auth/google/callback';
process.env.DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'f31-discord-client-id';
process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'f31-discord-client-secret';
process.env.DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://backend.example.test/auth/discord/callback';
process.env.DISCORD_LINK_REDIRECT_URI = process.env.DISCORD_LINK_REDIRECT_URI || 'https://backend.example.test/auth/discord/link/callback';
process.env.SIGNUP_EMAIL_HMAC_SECRET = process.env.SIGNUP_EMAIL_HMAC_SECRET || 'f31-social-email-hmac-secret';
// 같은 프로세스가 같은 제한기 카운터를 공유한다 — 제한기 자체는 전용 시험이 검증하므로
// 실제 DB 왕복 케이스가 우연히 429에 걸리지 않도록 한도를 넉넉히 올린다(f31a와 같은 이유).
process.env.SIGNUP_EMAIL_HOUR_MAX = '1000';
process.env.SIGNUP_EMAIL_DAY_MAX = '1000';
process.env.SIGNUP_IP_HOUR_MAX = '1000';
process.env.SIGNUP_IP_DAY_MAX = '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const cookieParser = require('cookie-parser');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const { MIGRATIONS } = require('../../scripts/migrate-db');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addSocialSignupEmail = require('../../db/migrations/0017-social-signup-email');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

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
        t.skip(`격리 DB에 연결할 수 없습니다 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

const rebuildFullSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const db = require('../../models');
const googleOAuthService = require('../../service/googleOAuth.service');
const discordOAuthService = require('../../service/discordOAuth.service');
const userRepository = require('../../repositories/user.repositories');
const mailAdapterModule = require('../../mail/mailAdapter');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

// ── fixture: 로컬 제공자 서버 + fetch 목적지 리다이렉트 ─────────────────────────

// Fetch 표준의 "bad port" 목록 — undici(전역 fetch)는 이 포트로의 요청을 거부하므로,
// listen(0)이 우연히 이 중 하나를 받으면 다시 고른다(불안정 실패 방지).
const FETCH_BAD_PORTS = new Set([1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513,
    514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
    3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);

const listenOnFetchablePort = async (server) => {
    for (;;) {
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        if (!FETCH_BAD_PORTS.has(server.address().port)) return;
        await new Promise((resolve) => server.close(resolve));
    }
};

const startMockProvider = async (t, { profile }) => {
    const server = http.createServer((req, res) => {
        req.on('data', () => {});
        req.on('end', () => {
            if (req.url.startsWith('/token')) {
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
    await listenOnFetchablePort(server);
    t.after(() => {
        server.closeAllConnections?.();
        return new Promise((resolve) => server.close(resolve));
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
        const urlStr = String(url);
        if (urlStr.startsWith(googleOAuthService.GOOGLE_TOKEN_ENDPOINT)
            || urlStr.startsWith(discordOAuthService.DISCORD_TOKEN_ENDPOINT)) return originalFetch(`${base}/token`, init);
        if (urlStr.startsWith(googleOAuthService.GOOGLE_USERINFO_ENDPOINT)
            || urlStr.startsWith(discordOAuthService.DISCORD_USERINFO_ENDPOINT)) return originalFetch(`${base}/me`, init);
        return originalFetch(urlStr, init);
    };
    t.after(() => { globalThis.fetch = originalFetch; });
};

const useMemoryMailAdapter = (t) => {
    const memory = mailAdapterModule.createMemoryMailAdapter();
    t.mock.method(mailAdapterModule, 'createHttpMailAdapter', () => memory);
    return memory;
};

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', require('../../routes/auth.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = http.createServer(app);
    await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const rawGet = (base, path, { cookie } = {}) => new Promise((resolve, reject) => {
    const req = http.request(new URL(path, base), { method: 'GET', headers: cookie ? { cookie } : {} }, (res) => {
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

const postJson = (base, path, body, { cookie } = {}) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
});

/**
 * 실제 OAuth 시작 → 제공자 콜백까지 돌리고, SIGNUP_REQUIRED면 intentToken과 가입 보완
 * 쿠키를 돌려준다. extraQuery는 콜백 쿼리 변조(AC-03)에 쓴다.
 */
const runOAuthToIntent = async (base, provider, { extraQuery = '' } = {}) => {
    const startRes = await rawGet(base, `/auth/${provider}?rememberMe=false`);
    assert.equal(startRes.statusCode, 302);
    const state = new URL(startRes.headers.location).searchParams.get('state');
    const attemptCookie = findSetCookie(startRes.headers, 'oauthAttempt');

    const callbackRes = await rawGet(base, `/auth/${provider}/callback?code=f31-code-${crypto.randomUUID()}&state=${state}${extraQuery}`, {
        cookie: cookieHeader(attemptCookie),
    });
    assert.equal(callbackRes.statusCode, 302);
    const location = new URL(callbackRes.headers.location);
    const signupAttempt = findSetCookie(callbackRes.headers, 'oauthAttempt');
    return {
        location,
        intentToken: location.searchParams.get('socialIntent'),
        cookie: signupAttempt ? cookieHeader(signupAttempt) : undefined,
    };
};

const requestAndVerifyProof = async (base, memory, email) => {
    const codeRes = await postJson(base, '/auth/signup/email-code', { email });
    assert.equal(codeRes.status, 200, await codeRes.text());
    const code = memory.outbox.at(-1).params.code;
    const verifyRes = await postJson(base, '/auth/signup/email-code/verify', { email, code });
    const verifyBody = await verifyRes.json();
    assert.equal(verifyRes.status, 200, JSON.stringify(verifyBody));
    assert.ok(verifyBody.signupProof);
    return verifyBody.signupProof;
};

const readIntent = async (intentToken) => db.SocialSignupIntent.findOne({
    where: { intent_token_hash: crypto.createHash('sha256').update(intentToken).digest('hex') },
});

const countRows = async (table) => {
    const [[row]] = await sequelize.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
    return Number(row.c);
};

const BIRTH_DATE = '1998-03-03';

// ── AC-01: 제공자가 이메일을 검증한 경우에만 자체 메일 인증을 건너뛴다 ────────────

const VERIFIED_PROFILES = {
    google: (subject, email) => ({ sub: subject, email, email_verified: true }),
    discord: (subject, email) => ({ id: subject, email, verified: true }),
};

for (const provider of ['google', 'discord']) {
    test(`AC-01(${provider}): 제공자 검증 이메일은 메일 발송 없이 가입되고, 완료 요청의 다른 email은 계정 주소를 바꾸지 못한다`, async (t) => {
        if (unavailable(t)) return;
        await rebuildFullSchema();
        const memory = useMemoryMailAdapter(t);
        const subject = `${provider}-verified-${crypto.randomUUID()}`;
        const providerEmail = `f31-${provider}-${crypto.randomUUID()}@example.com`;
        await startMockProvider(t, { profile: VERIFIED_PROFILES[provider](subject, providerEmail) });
        const base = await startServer(t);

        const { intentToken, cookie } = await runOAuthToIntent(base, provider);
        assert.ok(intentToken);

        const intentRes = await postJson(base, '/auth/social/signup/intent', { intentToken });
        const intentBody = await intentRes.json();
        assert.equal(intentRes.status, 200, JSON.stringify(intentBody));
        assert.deepEqual(intentBody, { success: true, data: { emailVerificationRequired: false } });
        assert.equal(intentRes.headers.get('cache-control'), 'no-store');

        const otherEmail = `attacker-${crypto.randomUUID()}@example.com`;
        const completeRes = await postJson(base, '/auth/social/signup/complete', {
            intentToken, nickname: `${provider.slice(0, 2)}검증`, birthDate: BIRTH_DATE, email: otherEmail,
        }, { cookie });
        const completeBody = await completeRes.json();
        assert.equal(completeRes.status, 200, JSON.stringify(completeBody));

        const user = await db.User.findByPk(completeBody.data.user.uuid);
        assert.equal(user.email, providerEmail, '계정 이메일은 제공자가 검증한 주소여야 한다');
        assert.equal(user.email_verified, true);
        assert.equal(await db.User.count({ where: { email: otherEmail } }), 0);
        const identity = await db.ExternalIdentity.findOne({ where: { provider, subject } });
        assert.equal(identity.email_snapshot, providerEmail);
        assert.equal(memory.outbox.length, 0, '제공자 검증 분기에서는 메일 API를 호출하면 안 된다');
    });
}

// ── AC-02: 미인증·미제공 이메일은 자체 메일 인증을 거친다 ────────────────────────

const UNVERIFIED_PROFILES = {
    'google email_verified:false': ['google', (subject) => ({ sub: subject, email: 'unverified@example.com', email_verified: false })],
    'google email_verified:"true"(문자열)': ['google', (subject) => ({ sub: subject, email: 'string-true@example.com', email_verified: 'true' })],
    'google 이메일 미제공': ['google', (subject) => ({ sub: subject })],
    'discord verified:false': ['discord', (subject) => ({ id: subject, email: 'unverified@example.com', verified: false })],
    'discord 이메일 미제공': ['discord', (subject) => ({ id: subject, verified: true })],
};

for (const [label, [provider, buildProfile]] of Object.entries(UNVERIFIED_PROFILES)) {
    test(`AC-02(${label}): intent는 email=null로 남고, 증명 없는 완료는 거절되며, 자체 인증 증명으로만 단일 계정이 생긴다`, async (t) => {
        if (unavailable(t)) return;
        await rebuildFullSchema();
        const memory = useMemoryMailAdapter(t);
        const subject = `${provider}-unverified-${crypto.randomUUID()}`;
        await startMockProvider(t, { profile: buildProfile(subject) });
        const base = await startServer(t);

        const { location, intentToken, cookie } = await runOAuthToIntent(base, provider);
        assert.equal(location.searchParams.get('socialError'), null);
        assert.ok(intentToken);
        const intentRow = await readIntent(intentToken);
        assert.equal(intentRow.email, null);

        const intentRes = await postJson(base, '/auth/social/signup/intent', { intentToken });
        assert.deepEqual(await intentRes.json(), { success: true, data: { emailVerificationRequired: true } });
        assert.equal((await intentRow.reload()).consumed_at, null, '조회는 intent를 소비하면 안 된다');

        const email = `f31-self-${crypto.randomUUID()}@example.com`;
        const noProof = await postJson(base, '/auth/social/signup/complete', {
            intentToken, nickname: '자체인증', birthDate: BIRTH_DATE, email,
        }, { cookie });
        assert.equal(noProof.status, 401);
        assert.equal((await noProof.json()).code, 'SIGNUP_PROOF_REQUIRED');
        assert.equal(await countRows('users'), 0);

        const signupProof = await requestAndVerifyProof(base, memory, email);
        const completeRes = await postJson(base, '/auth/social/signup/complete', {
            intentToken, nickname: '자체인증', birthDate: BIRTH_DATE, email, signupProof,
        }, { cookie });
        const completeBody = await completeRes.json();
        assert.equal(completeRes.status, 200, JSON.stringify(completeBody));

        const user = await db.User.findByPk(completeBody.data.user.uuid);
        assert.equal(user.email, email);
        assert.equal(user.email_verified, true);
        const identity = await db.ExternalIdentity.findOne({ where: { provider, subject } });
        assert.equal(identity.user_id, user.uuid);
        assert.equal(identity.email_snapshot, null);
        assert.ok((await intentRow.reload()).consumed_at);
        const [[proofRow]] = await sequelize.query(
            `SELECT proof_consumed_at FROM signup_email_verifications WHERE email = :email AND purpose = 'SIGNUP'`,
            { replacements: { email } },
        );
        assert.ok(proofRow.proof_consumed_at, '가입 성공 시 증명도 소비되어야 한다');
    });
}

test('AC-02: 비소비 intent 조회는 부재·소비·만료를 기존 코드로 거절한다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    useMemoryMailAdapter(t);
    const subject = `google-intent-${crypto.randomUUID()}`;
    await startMockProvider(t, { profile: { sub: subject } });
    const base = await startServer(t);

    const missing = await postJson(base, '/auth/social/signup/intent', { intentToken: 'never-issued' });
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).code, 'INTENT_INVALID');

    const { intentToken } = await runOAuthToIntent(base, 'google');
    const intentRow = await readIntent(intentToken);
    await intentRow.update({ expires_at: new Date(Date.now() - 1000) });
    const expired = await postJson(base, '/auth/social/signup/intent', { intentToken });
    assert.equal((await expired.json()).code, 'INTENT_EXPIRED');

    await intentRow.update({ expires_at: new Date(Date.now() + 60_000), consumed_at: new Date() });
    const consumed = await postJson(base, '/auth/social/signup/intent', { intentToken });
    assert.equal(consumed.status, 409);
    assert.equal((await consumed.json()).code, 'INTENT_CONSUMED');
});

// ── AC-03: 클라이언트 주장·콜백 변조로 우회할 수 없다 ────────────────────────────

test('AC-03: 콜백 쿼리의 email·verified 변조는 제공자 응답을 대체하지 못하고, 완료 요청의 인증 주장도 무시된다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    useMemoryMailAdapter(t);
    const subject = `google-tamper-${crypto.randomUUID()}`;
    await startMockProvider(t, { profile: { sub: subject, email: 'unverified@example.com', email_verified: false } });
    const base = await startServer(t);

    const claimed = `claimed-${crypto.randomUUID()}@example.com`;
    const { intentToken, cookie } = await runOAuthToIntent(base, 'google', {
        extraQuery: `&email=${encodeURIComponent(claimed)}&email_verified=true&verified=true`,
    });
    const intentRow = await readIntent(intentToken);
    assert.equal(intentRow.email, null, '콜백 쿼리의 이메일 주장이 intent에 저장되면 안 된다');

    const res = await postJson(base, '/auth/social/signup/complete', {
        intentToken, nickname: '주장시도', birthDate: BIRTH_DATE, email: claimed,
        email_verified: true, emailVerified: true, verified: true,
        provider: 'google', subject: 'other-subject', rememberMe: true,
        signupProof: 'forged-proof',
    }, { cookie });
    const body = await res.json();
    assert.equal(res.status, 401, JSON.stringify(body));
    assert.equal(body.code, 'SIGNUP_PROOF_INVALID');
    assert.equal(await countRows('users'), 0);
    assert.equal(await countRows('external_identities'), 0);
    assert.equal(await countRows('user_sessions'), 0);
    assert.equal(await countRows('economy_entitlements'), 0);
    assert.equal((await intentRow.reload()).consumed_at, null, '거절된 완료는 intent를 소비하면 안 된다');
});

test('AC-03: 다른 주소로 발급된 정상 증명·만료된 증명·이미 쓴 증명은 거절된다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    const memory = useMemoryMailAdapter(t);
    await startMockProvider(t, { profile: { sub: `google-proof-${crypto.randomUUID()}` } });
    const base = await startServer(t);

    const { intentToken, cookie } = await runOAuthToIntent(base, 'google');
    const emailA = `f31-a-${crypto.randomUUID()}@example.com`;
    const emailB = `f31-b-${crypto.randomUUID()}@example.com`;
    const proofA = await requestAndVerifyProof(base, memory, emailA);

    const mismatch = await postJson(base, '/auth/social/signup/complete', {
        intentToken, nickname: '불일치', birthDate: BIRTH_DATE, email: emailB, signupProof: proofA,
    }, { cookie });
    assert.equal(mismatch.status, 401);
    assert.equal((await mismatch.json()).code, 'SIGNUP_PROOF_INVALID');

    const [expiredCount] = await db.SignupEmailVerification.update(
        { proof_expires_at: new Date(Date.now() - 60_000) },
        { where: { email: emailA, purpose: 'SIGNUP' } },
    );
    assert.equal(expiredCount, 1, '만료 처리할 증명 행이 있어야 한다');
    const expiredRow = await db.SignupEmailVerification.findOne({ where: { email: emailA, purpose: 'SIGNUP' } });
    assert.ok(new Date(expiredRow.proof_expires_at).getTime() < Date.now(), `증명 만료 시각이 과거여야 한다: ${expiredRow.proof_expires_at}`);
    const expired = await postJson(base, '/auth/social/signup/complete', {
        intentToken, nickname: '만료증명', birthDate: BIRTH_DATE, email: emailA, signupProof: proofA,
    }, { cookie });
    assert.equal(expired.status, 401);
    assert.equal((await expired.json()).code, 'SIGNUP_PROOF_INVALID');
    assert.equal(await countRows('users'), 0);

    // 새 증명으로 가입한 뒤 같은 증명을 다른 intent에 재사용하면 거절된다. 재발송 대기(60초)는
    // 이 시험의 대상이 아니므로 발송 시각만 과거로 돌린다.
    await db.SignupEmailVerification.update(
        { sent_at: new Date(Date.now() - 10 * 60_000) },
        { where: { email: emailA, purpose: 'SIGNUP' } },
    );
    const proofA2 = await requestAndVerifyProof(base, memory, emailA);
    const ok = await postJson(base, '/auth/social/signup/complete', {
        intentToken, nickname: '정상가입', birthDate: BIRTH_DATE, email: emailA, signupProof: proofA2,
    }, { cookie });
    assert.equal(ok.status, 200, await ok.text());

    await startMockProvider(t, { profile: { sub: `google-proof2-${crypto.randomUUID()}` } });
    const second = await runOAuthToIntent(base, 'google');
    const reused = await postJson(base, '/auth/social/signup/complete', {
        intentToken: second.intentToken, nickname: '재사용', birthDate: BIRTH_DATE, email: emailA, signupProof: proofA2,
    }, { cookie: second.cookie });
    assert.equal(reused.status, 401);
    assert.equal((await reused.json()).code, 'SIGNUP_PROOF_INVALID');
    assert.equal(await countRows('users'), 1);
});

// ── AC-04: 동시 완료·지급 실패 롤백·로컬/소셜 경합 ──────────────────────────────

test('AC-04: 같은 intent·증명으로 동시에 완료해도 계정·identity·기본 지급은 정확히 한 번만 생긴다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    const memory = useMemoryMailAdapter(t);
    const subject = `discord-race-${crypto.randomUUID()}`;
    await startMockProvider(t, { profile: { id: subject, verified: false } });
    const base = await startServer(t);

    const { intentToken, cookie } = await runOAuthToIntent(base, 'discord');
    const email = `f31-race-${crypto.randomUUID()}@example.com`;
    const signupProof = await requestAndVerifyProof(base, memory, email);

    const responses = await Promise.all(['동시일', '동시이', '동시삼'].map((nickname) => postJson(base, '/auth/social/signup/complete', {
        intentToken, nickname, birthDate: BIRTH_DATE, email, signupProof,
    }, { cookie })));
    const results = await Promise.all(responses.map(async (res) => ({ status: res.status, body: await res.json() })));
    assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results));
    for (const failure of results.filter((r) => r.status !== 200)) {
        assert.equal(failure.status, 409);
        assert.equal(failure.body.code, 'INTENT_CONSUMED');
    }

    const [users] = await sequelize.query('SELECT uuid FROM users WHERE email = :email', { replacements: { email } });
    assert.equal(users.length, 1);
    const userId = users[0].uuid;
    assert.equal(await db.ExternalIdentity.count({ where: { provider: 'discord', subject } }), 1);
    const [[entitlements]] = await sequelize.query('SELECT COUNT(*) AS c FROM economy_entitlements WHERE user_id = :userId', { replacements: { userId } });
    assert.equal(Number(entitlements.c), 17);
    const [[ledger]] = await sequelize.query(
        `SELECT COUNT(*) AS c FROM economy_ledger_entries WHERE user_id = :userId AND reason = 'DEFAULT_GRANT'`, { replacements: { userId } },
    );
    assert.equal(Number(ledger.c), 17);
    const [[wallet]] = await sequelize.query('SELECT balance_gold, balance_diamond FROM economy_wallets WHERE user_id = :userId', { replacements: { userId } });
    assert.equal(Number(wallet.balance_gold), 0);
    assert.equal(Number(wallet.balance_diamond), 0);
});

test('AC-04: 기본 지급 도중 실패하면 intent·증명·사용자·identity·경제·세션이 모두 롤백되고, 같은 자격으로 재시도하면 성공한다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    const memory = useMemoryMailAdapter(t);
    const subject = `google-rollback-${crypto.randomUUID()}`;
    await startMockProvider(t, { profile: { sub: subject, email: 'x@example.com', email_verified: false } });
    const base = await startServer(t);

    const { intentToken, cookie } = await runOAuthToIntent(base, 'google');
    const email = `f31-rollback-${crypto.randomUUID()}@example.com`;
    const signupProof = await requestAndVerifyProof(base, memory, email);

    const models = db.sequelize.models;
    const originalCreate = models.EconomyEntitlement.create;
    let createCount = 0;
    models.EconomyEntitlement.create = function patched(...args) {
        createCount += 1;
        if (createCount === 16) return Promise.reject(new Error('시뮬레이션된 지급 실패'));
        return originalCreate.apply(this, args);
    };
    t.after(() => { models.EconomyEntitlement.create = originalCreate; });

    const failed = await postJson(base, '/auth/social/signup/complete', {
        intentToken, nickname: '롤백가입', birthDate: BIRTH_DATE, email, signupProof,
    }, { cookie });
    assert.equal(failed.status, 500);

    for (const table of ['users', 'user_stats', 'external_identities', 'user_sessions', 'economy_wallets',
        'economy_entitlements', 'economy_ledger_entries', 'economy_loadouts']) {
        assert.equal(await countRows(table), 0, `지급 실패는 ${table}도 롤백해야 한다`);
    }
    assert.equal((await readIntent(intentToken)).consumed_at, null, '실패한 가입은 intent 소비를 커밋하면 안 된다');
    const [[proofRow]] = await sequelize.query(
        `SELECT proof_consumed_at FROM signup_email_verifications WHERE email = :email AND purpose = 'SIGNUP'`,
        { replacements: { email } },
    );
    assert.equal(proofRow.proof_consumed_at, null, '실패한 가입은 증명 소비를 커밋하면 안 된다');

    models.EconomyEntitlement.create = originalCreate;
    const retry = await postJson(base, '/auth/social/signup/complete', {
        intentToken, nickname: '롤백가입', birthDate: BIRTH_DATE, email, signupProof,
    }, { cookie });
    assert.equal(retry.status, 200, await retry.text());
    assert.equal(await countRows('users'), 1);
    assert.equal(await countRows('economy_entitlements'), 17);
    assert.equal(await db.ExternalIdentity.count({ where: { provider: 'google', subject } }), 1);
});

test('AC-04: 로컬 가입과 소셜 가입이 같은 증명을 동시에 소비해도 계정은 하나만 생긴다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    const memory = useMemoryMailAdapter(t);
    await startMockProvider(t, { profile: { id: `discord-mixed-${crypto.randomUUID()}`, verified: false } });
    const base = await startServer(t);

    const { intentToken, cookie } = await runOAuthToIntent(base, 'discord');
    const email = `f31-mixed-${crypto.randomUUID()}@example.com`;
    const signupProof = await requestAndVerifyProof(base, memory, email);

    const [localRes, socialRes] = await Promise.all([
        postJson(base, '/auth/signup', {
            email, nickname: '로컬경합', password: 'pw12345678', passwordConfirm: 'pw12345678', birthDate: BIRTH_DATE, signupProof,
        }),
        postJson(base, '/auth/social/signup/complete', {
            intentToken, nickname: '소셜경합', birthDate: BIRTH_DATE, email, signupProof,
        }, { cookie }),
    ]);
    const statuses = [localRes.status, socialRes.status];
    assert.equal(statuses.filter((s) => s === 200).length, 1, `정확히 하나만 성공해야 한다: ${statuses}`);
    assert.equal(await db.User.count({ where: { email } }), 1);
});

// ── AC-05: 기존 계정은 추가 인증 없이 로그인되고 값이 이관되지 않는다 ─────────────

test('AC-05: email_verified=false인 기존 Google identity는 제공자 이메일 미제공 재로그인에서 같은 계정으로 로그인되고 값이 보존된다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    useMemoryMailAdapter(t);
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid, email: `legacy-${uuid}@example.com`, password_hash: 'x'.repeat(60), nickname: '기존구글', email_verified: false,
    });
    await db.UserStats.create({ user_id: uuid });
    const subject = `google-legacy-${crypto.randomUUID()}`;
    await userRepository.createExternalIdentity({ provider: 'google', subject, user_id: uuid });
    await startMockProvider(t, { profile: { sub: subject } });
    const base = await startServer(t);

    const { location } = await runOAuthToIntent(base, 'google');
    assert.equal(location.toString(), `${process.env.FRONTEND_URL}/lobby`);
    assert.equal(await countRows('social_signup_intents'), 0);
    assert.equal(await countRows('users'), 1);
    assert.equal((await db.User.findByPk(uuid)).email_verified, false);
});

// ── AC-06: 0017 마이그레이션 ─────────────────────────────────────────────────

test('AC-06: 0017 up·verify 반복은 멱등하고 기존 intent 행을 보존하며, email이 NULL인 행이 있으면 down을 거절한다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    const queryInterface = sequelize.getQueryInterface();

    const table = await queryInterface.describeTable('social_signup_intents');
    assert.equal(table.email.allowNull, true);
    assert.equal(table.intent_token_hash.allowNull, false);

    const expiresAt = new Date(Date.now() + 60_000);
    await db.SocialSignupIntent.create({ intent_token_hash: 'a'.repeat(64), provider: 'google', subject: 's1', email: 'kept@example.com', expires_at: expiresAt });
    await db.SocialSignupIntent.create({ intent_token_hash: 'b'.repeat(64), provider: 'discord', subject: 's2', email: null, expires_at: expiresAt });

    await addSocialSignupEmail.up(queryInterface, Sequelize, sequelize);
    await addSocialSignupEmail.verify(queryInterface, Sequelize, sequelize);
    await addSocialSignupEmail.up(queryInterface, Sequelize, sequelize);
    await addSocialSignupEmail.verify(queryInterface, Sequelize, sequelize);

    const kept = await db.SocialSignupIntent.findOne({ where: { subject: 's1' } });
    assert.equal(kept.email, 'kept@example.com', '기존 intent의 이메일은 바뀌면 안 된다');
    assert.equal(await db.SocialSignupIntent.count(), 2);

    await assert.rejects(addSocialSignupEmail.down(queryInterface, Sequelize, sequelize), /NULL인 행/);
    assert.equal(await db.SocialSignupIntent.count(), 2, 'down 거절은 행을 지우면 안 된다');
    assert.equal((await queryInterface.describeTable('social_signup_intents')).email.allowNull, true);

    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied, [], '이미 적용된 마이그레이션은 재적용되면 안 된다');
});
