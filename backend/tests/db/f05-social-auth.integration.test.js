'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f05-social-auth-integration-test-secret';

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
const socialAuthService = require('../../services/auth/social');
const userRepository = require('../../repositories/user.repositories');
const { hashPassword } = require('../../utils/auth/credentials');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const REQ_INFO = { ip: '127.0.0.1', userAgent: 'f05-integration' };
const PASSWORD = 'correct-horse-battery-1';

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const email = `${label}-${uuid}@example.com`;
    await db.User.create({
        uuid,
        password_hash: await hashPassword(PASSWORD),
        nickname: `${label}${uuid.slice(0, 6)}`,
        email,
    });
    await db.UserStats.create({ user_id: uuid });
    return { uuid, email };
};

const sessionIdOf = (loginResult) => jwt.decode(loginResult.token).sessionId;

const issueLoginState = async (browserFingerprint = `fp-${crypto.randomUUID()}`) => {
    const { state } = await socialAuthService.issueOAuthState({ purpose: 'login', browserFingerprint });
    return { state, browserFingerprint };
};

test('AC-01: 같은 (provider, subject) 조합으로 두 번째 identity를 만들면 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const userA = await createLocalUser('ac01a');
    const userB = await createLocalUser('ac01b');
    const subject = `google-sub-${crypto.randomUUID()}`;

    await userRepository.createExternalIdentity({ provider: 'google', subject, user_id: userA.uuid });

    await assert.rejects(
        userRepository.createExternalIdentity({ provider: 'google', subject, user_id: userB.uuid }),
        (error) => error.status === 409,
    );

    const rows = await db.ExternalIdentity.findAll({ where: { provider: 'google', subject } });
    assert.equal(rows.length, 1, 'DB 유일 제약이 실제로 두 번째 행 생성을 막아야 한다');
});

test('AC-02: 소셜 가입 완료는 임의의 공용 비밀번호 없이 NOT NULL 제약을 만족시키고, 계정마다 다른 해시를 만든다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const email1 = `ac02-${crypto.randomUUID()}@example.com`;
    const email2 = `ac02-${crypto.randomUUID()}@example.com`;
    const { state, browserFingerprint } = await issueLoginState();
    const callback1 = await socialAuthService.handleOAuthCallback({
        provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: email1,
        rawState: state, browserFingerprint, reqInfo: REQ_INFO,
    });
    assert.equal(callback1.status, 'SIGNUP_REQUIRED');
    const signup1 = await socialAuthService.completeSocialSignup({
        intentToken: callback1.intentToken, nickname: '소셜닉1', birthDate: '1990-01-01', reqInfo: REQ_INFO,
    });

    const state2 = await issueLoginState();
    const callback2 = await socialAuthService.handleOAuthCallback({
        provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: email2,
        rawState: state2.state, browserFingerprint: state2.browserFingerprint, reqInfo: REQ_INFO,
    });
    const signup2 = await socialAuthService.completeSocialSignup({
        intentToken: callback2.intentToken, nickname: '소셜닉2', birthDate: '1990-01-02', reqInfo: REQ_INFO,
    });

    const stored1 = await db.User.findByPk(signup1.user.uuid);
    const stored2 = await db.User.findByPk(signup2.user.uuid);
    assert.ok(stored1.password_hash, 'password_hash는 NOT NULL이므로 값이 있어야 한다');
    assert.ok(stored2.password_hash);
    assert.notEqual(stored1.password_hash, stored2.password_hash,
        '서로 다른 소셜 계정이 같은(공용) 비밀번호 해시를 공유하면 안 된다(AC-02)');

    await assert.rejects(
        authService.login({ email: email1, password: '' }, REQ_INFO),
        (error) => error.status === 400,
    );
    for (const guess of ['password', '12345678', PASSWORD]) {
        await assert.rejects(
            authService.login({ email: email1, password: guess }, REQ_INFO),
            (error) => error.status === 401,
        );
    }
});

test('AC-02: completeSocialSignup은 계정마다 crypto.randomBytes로 서로 다른 원문 비밀번호를 생성한다(공용 값 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const original = crypto.randomBytes;
    const generatedSecrets = [];
    t.mock.method(crypto, 'randomBytes', (...args) => {
        const result = original(...args);
        if (args[0] === 32) generatedSecrets.push(Buffer.from(result));
        return result;
    });

    const { state, browserFingerprint } = await issueLoginState();
    const callback1 = await socialAuthService.handleOAuthCallback({
        provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: `ac02b-${crypto.randomUUID()}@example.com`,
        rawState: state, browserFingerprint, reqInfo: REQ_INFO,
    });
    await socialAuthService.completeSocialSignup({ intentToken: callback1.intentToken, nickname: '소셜닉3', birthDate: '1990-01-03', reqInfo: REQ_INFO });

    const state2 = await issueLoginState();
    const callback2 = await socialAuthService.handleOAuthCallback({
        provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: `ac02c-${crypto.randomUUID()}@example.com`,
        rawState: state2.state, browserFingerprint: state2.browserFingerprint, reqInfo: REQ_INFO,
    });
    await socialAuthService.completeSocialSignup({ intentToken: callback2.intentToken, nickname: '소셜닉4', birthDate: '1990-01-04', reqInfo: REQ_INFO });

    assert.ok(generatedSecrets.length >= 2, 'crypto.randomBytes(32) 호출을 잡아내지 못했습니다');
    const unique = new Set(generatedSecrets.map((buf) => buf.toString('hex')));
    assert.equal(unique.size, generatedSecrets.length,
        '생성된 32바이트 원문 중 중복이 있으면 안 된다(공용/예측 가능한 비밀번호 없음)');
});

test('AC-03: 최초 소셜 로그인은 가입 보완을 요구하고, 재로그인은 동일 계정을 조회해 재사용한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const provider = 'kakao';
    const subject = `sub-${crypto.randomUUID()}`;
    const email = `ac03-${crypto.randomUUID()}@example.com`;

    const first = await issueLoginState();
    const firstCallback = await socialAuthService.handleOAuthCallback({
        provider, subject, email, rawState: first.state, browserFingerprint: first.browserFingerprint, reqInfo: REQ_INFO,
    });
    assert.equal(firstCallback.status, 'SIGNUP_REQUIRED');
    assert.ok(firstCallback.intentToken);

    const completed = await socialAuthService.completeSocialSignup({
        intentToken: firstCallback.intentToken, nickname: '재사용닉', birthDate: '1999-12-31', reqInfo: REQ_INFO,
    });
    assert.ok(completed.token);
    assert.equal((await db.User.findByPk(completed.user.uuid)).nickname, '재사용닉');

    const second = await issueLoginState();
    const secondCallback = await socialAuthService.handleOAuthCallback({
        provider, subject, email, rawState: second.state, browserFingerprint: second.browserFingerprint, reqInfo: REQ_INFO,
    });
    assert.equal(secondCallback.status, 'LOGIN');
    assert.equal(secondCallback.user.uuid, completed.user.uuid, '재로그인은 방금 가입 완료한 계정을 그대로 재사용해야 한다');
    assert.ok(secondCallback.token);

    const identities = await db.ExternalIdentity.findAll({ where: { provider, subject } });
    assert.equal(identities.length, 1, '재로그인이 identity를 또 만들면 안 된다');
    assert.equal(await db.User.count({ where: { email } }), 1, '재로그인이 users 행을 또 만들면 안 된다');
});

test('AC-04: 동일 이메일 소셜 로그인은 기존 계정에 자동 병합되지 않고, 로그인 후 명시적 연결만 허용된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const local = await createLocalUser('ac04');
    const provider = 'google';
    const subject = `sub-${crypto.randomUUID()}`;

    const attempt = await issueLoginState();
    await assert.rejects(
        socialAuthService.handleOAuthCallback({
            provider, subject, email: local.email,
            rawState: attempt.state, browserFingerprint: attempt.browserFingerprint, reqInfo: REQ_INFO,
        }),
        (error) => error.status === 409 && error.code === 'EMAIL_CONFLICT',
    );
    assert.equal(await db.User.count({ where: { email: local.email } }), 1);
    assert.equal(await db.ExternalIdentity.count({ where: { provider, subject } }), 0);

    await assert.rejects(
        socialAuthService.consumeOAuthState(attempt.state, { browserFingerprint: attempt.browserFingerprint, purpose: 'login' }),
        (error) => error.status === 409 && error.code === 'STATE_REUSED',
    );

    const loginResult = await authService.login({ email: local.email, password: PASSWORD }, REQ_INFO);
    const sessionId = sessionIdOf(loginResult);
    const linkFingerprint = `fp-${crypto.randomUUID()}`;
    const { state: linkState } = await socialAuthService.issueOAuthState({
        purpose: 'link', userId: loginResult.user.uuid, sessionId, browserFingerprint: linkFingerprint,
    });
    const linked = await socialAuthService.linkExternalIdentity({
        userId: loginResult.user.uuid, sessionId, provider, subject, email: local.email,
        rawState: linkState, browserFingerprint: linkFingerprint,
    });
    assert.equal(linked.user_id, loginResult.user.uuid);

    const relogin = await issueLoginState();
    const reloginCallback = await socialAuthService.handleOAuthCallback({
        provider, subject, email: local.email,
        rawState: relogin.state, browserFingerprint: relogin.browserFingerprint, reqInfo: REQ_INFO,
    });
    assert.equal(reloginCallback.status, 'LOGIN');
    assert.equal(reloginCallback.user.uuid, loginResult.user.uuid);

    const other = await createLocalUser('ac04other');
    const otherLogin = await authService.login({ email: other.email, password: PASSWORD }, REQ_INFO);
    const otherSessionId = sessionIdOf(otherLogin);
    const otherFingerprint = `fp-${crypto.randomUUID()}`;
    const { state: otherLinkState } = await socialAuthService.issueOAuthState({
        purpose: 'link', userId: otherLogin.user.uuid, sessionId: otherSessionId, browserFingerprint: otherFingerprint,
    });
    await assert.rejects(
        socialAuthService.linkExternalIdentity({
            userId: otherLogin.user.uuid, sessionId: otherSessionId, provider, subject, email: other.email,
            rawState: otherLinkState, browserFingerprint: otherFingerprint,
        }),
        (error) => error.status === 409 && error.code === 'IDENTITY_ALREADY_LINKED',
    );
});

test('AC-04: 로그아웃(세션 폐기) 이후에는 그 세션이 발급한 link state로 연결을 완료할 수 없다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const local = await createLocalUser('ac04logout');
    const provider = 'kakao';
    const subject = `sub-${crypto.randomUUID()}`;

    const loginResult = await authService.login({ email: local.email, password: PASSWORD }, REQ_INFO);
    const sessionId = sessionIdOf(loginResult);
    const browserFingerprint = `fp-${crypto.randomUUID()}`;
    const { state: linkState } = await socialAuthService.issueOAuthState({
        purpose: 'link', userId: loginResult.user.uuid, sessionId, browserFingerprint,
    });

    await userRepository.recordLogout(loginResult.user.uuid, sessionId);

    await assert.rejects(
        socialAuthService.linkExternalIdentity({
            userId: loginResult.user.uuid, sessionId, provider, subject, email: local.email,
            rawState: linkState, browserFingerprint,
        }),
        (error) => error.status === 401 && error.code === 'SESSION_REVOKED',
    );
    assert.equal(await db.ExternalIdentity.count({ where: { provider, subject } }), 0,
        '폐기된 세션으로는 연결이 실제로 만들어지면 안 된다');

    await assert.rejects(
        socialAuthService.issueOAuthState({
            purpose: 'link', userId: loginResult.user.uuid, sessionId, browserFingerprint: `fp-${crypto.randomUUID()}`,
        }),
        (error) => error.status === 401 && error.code === 'SESSION_INVALID',
    );
});

test('AC-05: 만료된 state는 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { state, browserFingerprint } = await issueLoginState();
    const row = await db.OAuthState.findOne({ where: { state_hash: crypto.createHash('sha256').update(state).digest('hex') } });
    await row.update({ expires_at: new Date(Date.now() - 1000) });

    await assert.rejects(
        socialAuthService.consumeOAuthState(state, { browserFingerprint, purpose: 'login' }),
        (error) => error.status === 400 && error.code === 'STATE_EXPIRED',
    );
});

test('AC-05: 발급된 적 없는(위조된) state는 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const forged = crypto.randomBytes(32).toString('base64url');
    await assert.rejects(
        socialAuthService.consumeOAuthState(forged, { browserFingerprint: 'fp-anything', purpose: 'login' }),
        (error) => error.status === 400 && error.code === 'STATE_INVALID',
    );
});

test('AC-05: 다른 브라우저 지문으로 소비하려 하면 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { state } = await issueLoginState('fp-original');
    await assert.rejects(
        socialAuthService.consumeOAuthState(state, { browserFingerprint: 'fp-different', purpose: 'login' }),
        (error) => error.status === 400 && error.code === 'STATE_FINGERPRINT_MISMATCH',
    );
});

test('AC-05: 정상 소비 이후 같은 state를 다시 쓰면 거부된다(순차 재사용)', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { state, browserFingerprint } = await issueLoginState();
    const first = await socialAuthService.consumeOAuthState(state, { browserFingerprint, purpose: 'login' });
    assert.equal(first.purpose, 'login');

    await assert.rejects(
        socialAuthService.consumeOAuthState(state, { browserFingerprint, purpose: 'login' }),
        (error) => error.status === 409 && error.code === 'STATE_REUSED',
    );
});

test('AC-05: 동시에 들어온 같은 state 소비 요청은 하나만 성공하고 나머지는 재사용으로 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { state, browserFingerprint } = await issueLoginState();
    const results = await Promise.allSettled([
        socialAuthService.consumeOAuthState(state, { browserFingerprint, purpose: 'login' }),
        socialAuthService.consumeOAuthState(state, { browserFingerprint, purpose: 'login' }),
        socialAuthService.consumeOAuthState(state, { browserFingerprint, purpose: 'login' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, '동시 요청 중 정확히 하나만 성공해야 한다(행 잠금으로 직렬화)');
    assert.equal(rejected.length, 2);
    for (const r of rejected) {
        assert.equal(r.reason.code, 'STATE_REUSED');
    }
});

test('AC-05: 사용자가 취소하면 즉시 거부되고 아무 것도 생성되지 않으며, 소비된 state는 재사용할 수 없다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const beforeUsers = await db.User.count();
    const beforeIdentities = await db.ExternalIdentity.count();

    const { state, browserFingerprint } = await issueLoginState();

    await assert.rejects(
        socialAuthService.handleOAuthCallback({
            provider: 'google', subject: 'cancelled-subject', cancelled: true,
            rawState: state, browserFingerprint, reqInfo: REQ_INFO,
        }),
        (error) => error.status === 400 && error.code === 'OAUTH_CANCELLED',
    );

    assert.equal(await db.User.count(), beforeUsers);
    assert.equal(await db.ExternalIdentity.count(), beforeIdentities);

    await assert.rejects(
        socialAuthService.consumeOAuthState(state, { browserFingerprint, purpose: 'login' }),
        (error) => error.status === 409 && error.code === 'STATE_REUSED',
    );
});

test('AC-05: 제공자가 이메일을 주지 않으면 계정 없이 자체 인증이 필요한 intent만 남고, 소비된 state는 재사용할 수 없다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { state, browserFingerprint } = await issueLoginState();
    const beforeUsers = await db.User.count();
    const beforeIdentities = await db.ExternalIdentity.count();
    const beforeSessions = await db.UserSession.count();

    const result = await socialAuthService.handleOAuthCallback({
        provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: null,
        rawState: state, browserFingerprint, reqInfo: REQ_INFO,
    });
    assert.equal(result.status, 'SIGNUP_REQUIRED');
    assert.equal(result.emailVerificationRequired, true);
    assert.equal(result.email, null);
    const intentRow = await db.SocialSignupIntent.findOne({
        where: { intent_token_hash: crypto.createHash('sha256').update(result.intentToken).digest('hex') },
    });
    assert.ok(intentRow, 'intent 행이 생겨야 한다');
    assert.equal(intentRow.email, null, '제공자가 주지 않은 이메일을 임의 값으로 채우면 안 된다');
    assert.equal(intentRow.consumed_at, null);
    assert.equal(await db.User.count(), beforeUsers, '이메일 없이 임의의 값으로 계정을 만들면 안 된다');
    assert.equal(await db.ExternalIdentity.count(), beforeIdentities);
    assert.equal(await db.UserSession.count(), beforeSessions, '인증 완료 전에는 세션을 발급하면 안 된다');

    await assert.rejects(
        socialAuthService.consumeOAuthState(state, { browserFingerprint, purpose: 'login' }),
        (error) => error.status === 409 && error.code === 'STATE_REUSED',
    );
});

test('AC-05: 만료된 가입 보완 자격(intent)으로는 완료할 수 없다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { state, browserFingerprint } = await issueLoginState();
    const callback = await socialAuthService.handleOAuthCallback({
        provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: `expired-${crypto.randomUUID()}@example.com`,
        rawState: state, browserFingerprint, reqInfo: REQ_INFO,
    });
    const intentRow = await db.SocialSignupIntent.findOne({
        where: { intent_token_hash: crypto.createHash('sha256').update(callback.intentToken).digest('hex') },
    });
    await intentRow.update({ expires_at: new Date(Date.now() - 1000) });

    await assert.rejects(
        socialAuthService.completeSocialSignup({ intentToken: callback.intentToken, nickname: '만료테스트', birthDate: '1990-01-05', reqInfo: REQ_INFO }),
        (error) => error.status === 400 && error.code === 'INTENT_EXPIRED',
    );
});
