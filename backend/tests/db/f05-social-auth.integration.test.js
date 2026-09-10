'use strict';

// F-05 소셜 계정 공통 기반 — 격리 DB 검증. f01~f04와 같은 원칙을 따른다:
// F01_TEST_DATABASE_URL이 없거나 연결에 실패하면 실패가 아니라 t.skip으로 "미검증"을
// 남긴다(.env.test의 더미 DATABASE_URL은 이 용도로 재사용하지 않는다).
//
// AC-01(유일 제약)·AC-02(NOT NULL 비밀번호)·AC-03(최초 가입 보완/재로그인 재사용)·
// AC-04(이메일 자동 병합 금지, 명시적 연결)·AC-05(state 만료·위조·재사용·취소·이메일
// 미제공/충돌)를 실제 MySQL 격리 DB와 실제 트랜잭션 경로로 검증한다.

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

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory, addSocialAuth];
const SOCIAL_TABLES = Object.values(addSocialAuth.TABLE_NAMES);
const MANAGED_TABLES = [...baseline.TABLE_ORDER, addRefreshTokenHistory.TABLE_NAME, ...SOCIAL_TABLES, migrationRunner.META_TABLE];
// social 테이블은 users를 참조하므로 baseline(users 포함) 앞에 지워야 한다.
const DROP_ORDER = [...SOCIAL_TABLES, addRefreshTokenHistory.TABLE_NAME, ...[...baseline.TABLE_ORDER].reverse(), migrationRunner.META_TABLE];

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
    const queryInterface = sequelize.getQueryInterface();
    const existing = new Set(await queryInterface.showAllTables());
    const unknown = [...existing].filter((t) => !MANAGED_TABLES.includes(t));
    if (unknown.length > 0) {
        throw new Error(
            `격리 DB에 F-01/F-05가 모르는 테이블이 있습니다: [${unknown.join(', ')}]. ` +
            `전용 테스트 DB가 맞는지 확인하세요 — 안전을 위해 진행을 거부합니다.`,
        );
    }
    for (const table of DROP_ORDER) {
        if (existing.has(table)) await queryInterface.dropTable(table);
    }
};

// backend/models과 service/repository는 require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔
// process.env.DATABASE_URL(F01_TEST_DATABASE_URL)로 처음 require되는 이 시점에 격리 DB에
// 연결된다 — 실제 프로덕션 경로(socialAuth.service → user.repositories → Sequelize,
// auth.service.issueSessionForUser)를 그대로 태운다(A-04).
const db = require('../../models');
const authService = require('../../service/auth.service');
const socialAuthService = require('../../service/socialAuth.service');
const userRepository = require('../../repositories/user.repositories');
const { hashPassword } = require('../../utils/hash');

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

// authService.login()은 sessionId를 직접 돌려주지 않고 발급한 accessToken(JWT) 안에만
// 싣는다(auth.service.js issueSessionForUser 참고) — 명시적 연결(link)이 요구하는
// sessionId는 여기서 그 토큰을 디코드해 꺼낸다.
const sessionIdOf = (loginResult) => jwt.decode(loginResult.token).sessionId;

const issueLoginState = async (browserFingerprint = `fp-${crypto.randomUUID()}`) => {
    const { state } = await socialAuthService.issueOAuthState({ purpose: 'login', browserFingerprint });
    return { state, browserFingerprint };
};

// ── AC-01: (provider, subject) 유일 제약 ─────────────────────────────────────

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

// ── AC-02: 비밀번호 없는 최초 가입, NOT NULL은 유지되지만 계정마다 다른 값 ────────

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
        intentToken: callback1.intentToken, nickname: '소셜닉1', reqInfo: REQ_INFO,
    });

    const state2 = await issueLoginState();
    const callback2 = await socialAuthService.handleOAuthCallback({
        provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: email2,
        rawState: state2.state, browserFingerprint: state2.browserFingerprint, reqInfo: REQ_INFO,
    });
    const signup2 = await socialAuthService.completeSocialSignup({
        intentToken: callback2.intentToken, nickname: '소셜닉2', reqInfo: REQ_INFO,
    });

    const stored1 = await db.User.findByPk(signup1.user.uuid);
    const stored2 = await db.User.findByPk(signup2.user.uuid);
    assert.ok(stored1.password_hash, 'password_hash는 NOT NULL이므로 값이 있어야 한다');
    assert.ok(stored2.password_hash);
    assert.notEqual(stored1.password_hash, stored2.password_hash,
        '서로 다른 소셜 계정이 같은(공용) 비밀번호 해시를 공유하면 안 된다(AC-02)');

    // 빈 비밀번호는 자격 불일치(401)가 아니라 필수 입력 누락으로 400을 반환한다 — 이는
    // 이 슬라이스가 새로 만든 규칙이 아니라 auth.service.js login()의 기존 계약이다
    // (DB 조회 전에 거부, backend/__tests__/auth.login.regression.test.js "빈 로그인
    // payload는 DB 조회 없이 400이다"). 재검토 지적: 이전 버전은 이 케이스도 401을
    // 기대해 실패했다.
    await assert.rejects(
        authService.login({ email: email1, password: '' }, REQ_INFO),
        (error) => error.status === 400,
    );
    // 소셜 전용 계정은 로그인 화면의 비밀번호 로그인 경로로 뚫리면 안 된다 — 흔히 쓰이는
    // 값이나 다른 계정의 실제 비밀번호로 시도해도 authService.login이 401로 실패해야 한다.
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

    // bcrypt는 매 호출마다 새 salt를 쓰므로, 같은 평문을 넣어도 저장된 해시는 항상 다르게
    // 나온다 — 그래서 "해시가 다르다"는 사실만으로는 서로 다른 평문(공용/예측 가능한
    // 비밀번호 부재)을 증명하지 못한다(재검토 지적). crypto.randomBytes(32)를 스파이해
    // completeSocialSignup이 실제로 매 계정마다 새로운 32바이트 원문을 만드는지 소스
    // 수준에서 직접 확인한다 — 이 파일은 socialAuth.service.js와 같은 crypto 모듈
    // 인스턴스를 공유하므로 스파이가 실제 호출을 그대로 가로챈다.
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
    await socialAuthService.completeSocialSignup({ intentToken: callback1.intentToken, nickname: '소셜닉3', reqInfo: REQ_INFO });

    const state2 = await issueLoginState();
    const callback2 = await socialAuthService.handleOAuthCallback({
        provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: `ac02c-${crypto.randomUUID()}@example.com`,
        rawState: state2.state, browserFingerprint: state2.browserFingerprint, reqInfo: REQ_INFO,
    });
    await socialAuthService.completeSocialSignup({ intentToken: callback2.intentToken, nickname: '소셜닉4', reqInfo: REQ_INFO });

    // state/intent 토큰 발급도 같은 함수를 32바이트로 쓰므로 여러 값이 잡히지만, 그중
    // 어떤 두 값도 겹치지 않아야 한다 — 하나라도 겹치면 예측 가능하거나 재사용된 원문이
    // 섞여 있다는 뜻이다.
    assert.ok(generatedSecrets.length >= 2, 'crypto.randomBytes(32) 호출을 잡아내지 못했습니다');
    const unique = new Set(generatedSecrets.map((buf) => buf.toString('hex')));
    assert.equal(unique.size, generatedSecrets.length,
        '생성된 32바이트 원문 중 중복이 있으면 안 된다(공용/예측 가능한 비밀번호 없음)');
});

// ── AC-03: 최초 가입 보완 필요, 재로그인은 기존 계정 재사용 ──────────────────────

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

// ── AC-04: 이메일 자동 병합 금지, 명시적 연결만 허용 ─────────────────────────────

test('AC-04: 동일 이메일 소셜 로그인은 기존 계정에 자동 병합되지 않고, 로그인 후 명시적 연결만 허용된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const local = await createLocalUser('ac04');
    const provider = 'google';
    const subject = `sub-${crypto.randomUUID()}`;

    // 자동 병합 금지: 같은 이메일로 처음 보는 identity가 콜백에 들어와도 거부되고, users/
    // external_identities 어느 쪽도 만들어지지 않는다.
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

    // EMAIL_CONFLICT로 계정 생성이 실패해도 state 소비 자체는 이미 커밋되어 유지된다 —
    // 그렇지 않으면 같은 state로 다시 시도(재생)할 수 있다(재검토 지적, AC-05와 공유되는
    // 결함).
    await assert.rejects(
        socialAuthService.consumeOAuthState(attempt.state, { browserFingerprint: attempt.browserFingerprint, purpose: 'login' }),
        (error) => error.status === 409 && error.code === 'STATE_REUSED',
    );

    // 명시적 연결(D-01 승인 절차): 로그인한 사용자가 purpose="link" state를 발급받아 연결한다.
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

    // 연결 이후에는 같은 identity로 로그인하면(자동 병합이 아니라 방금 명시적으로 연결한
    // 결과로) 같은 계정이 재사용된다.
    const relogin = await issueLoginState();
    const reloginCallback = await socialAuthService.handleOAuthCallback({
        provider, subject, email: local.email,
        rawState: relogin.state, browserFingerprint: relogin.browserFingerprint, reqInfo: REQ_INFO,
    });
    assert.equal(reloginCallback.status, 'LOGIN');
    assert.equal(reloginCallback.user.uuid, loginResult.user.uuid);

    // 이미 다른 계정에 연결된 identity를 또 다른 계정에 연결하려 하면 거부된다.
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

    // 재검토 지적: linkExternalIdentity는 전달된 userId만 신뢰했다 — 시작 세션(state 발급
    // 시점)과 콜백 시점(state 소비 시점) 모두 유효한 인증이었는지 보장하는 실행 경로가
    // 없었다. 이제 link state는 특정 세션(sessionId)에 결합되고, 소비 시점에 그 세션이
    // 여전히 활성 상태인지 다시 확인한다 — 로그아웃(세션 폐기)이 그 사이에 있었다면
    // state 자체가 유효해도 연결이 거부되어야 한다.
    const local = await createLocalUser('ac04logout');
    const provider = 'kakao';
    const subject = `sub-${crypto.randomUUID()}`;

    const loginResult = await authService.login({ email: local.email, password: PASSWORD }, REQ_INFO);
    const sessionId = sessionIdOf(loginResult);
    const browserFingerprint = `fp-${crypto.randomUUID()}`;
    const { state: linkState } = await socialAuthService.issueOAuthState({
        purpose: 'link', userId: loginResult.user.uuid, sessionId, browserFingerprint,
    });

    // 실제 로그아웃과 같은 방식으로 이 세션을 폐기한다(auth.service.js/user.controller.js의
    // logout()이 쓰는 것과 같은 저장소 함수, user.repositories.js recordLogout 참고).
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

    // 로그아웃 시점에 발급 자체를 거부하는 경로도 함께 확인한다 — 이미 폐기된 세션으로는
    // link state 발급조차 되지 않아야 한다(AC-04, "시작 세션의 유효한 인증").
    await assert.rejects(
        socialAuthService.issueOAuthState({
            purpose: 'link', userId: loginResult.user.uuid, sessionId, browserFingerprint: `fp-${crypto.randomUUID()}`,
        }),
        (error) => error.status === 401 && error.code === 'SESSION_INVALID',
    );
});

// ── AC-05: state 만료/위조/재사용, 취소, 이메일 미제공/충돌 ──────────────────────

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

    // 제공자는 사용자가 동의 화면에서 취소했을 때도 원래 발급했던 state를 그대로
    // 리다이렉트에 실어 돌려준다 — 취소 콜백도 실제 발급된 state/지문을 들고 온다.
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

    // 재검토 지적: 취소는 이전에 state 검증·소비 전에 반환되어, 취소된 콜백 이후에도
    // 같은 state를 재사용(재생)할 수 있었다. 지금은 취소 여부 판정보다 소비가 먼저
    // 커밋되므로 같은 state를 다시 쓰면 거부되어야 한다.
    await assert.rejects(
        socialAuthService.consumeOAuthState(state, { browserFingerprint, purpose: 'login' }),
        (error) => error.status === 409 && error.code === 'STATE_REUSED',
    );
});

test('AC-05: 제공자가 이메일을 주지 않으면 거부되고 계정이 만들어지지 않으며, 소비된 state는 재사용할 수 없다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { state, browserFingerprint } = await issueLoginState();
    const beforeUsers = await db.User.count();

    await assert.rejects(
        socialAuthService.handleOAuthCallback({
            provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: null,
            rawState: state, browserFingerprint, reqInfo: REQ_INFO,
        }),
        (error) => error.status === 400 && error.code === 'EMAIL_MISSING',
    );
    assert.equal(await db.User.count(), beforeUsers, '이메일 없이 임의의 값으로 계정을 만들면 안 된다');

    // 재검토 지적: 이메일 미제공으로 계정 생성이 실패하면 이전 버전은 state 소비까지
    // 같은 트랜잭션으로 묶어 롤백해, 같은 state를 다시 시도(재생)할 수 있었다.
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
        socialAuthService.completeSocialSignup({ intentToken: callback.intentToken, nickname: '만료테스트', reqInfo: REQ_INFO }),
        (error) => error.status === 400 && error.code === 'INTENT_EXPIRED',
    );
});
