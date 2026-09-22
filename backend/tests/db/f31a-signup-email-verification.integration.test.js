'use strict';

// F-31a 가입 이메일 인증(인증번호·가입 증명·단일 가입) — 실제 격리 MySQL DB 검증. f01~f29b와
// 완전히 같은 원칙: F01_TEST_DATABASE_URL이 없거나 연결에 실패하면 실패로 표시하지 않고
// t.skip으로 "미검증"임을 남긴다. f01-migrations 다음, 다른 DB 스위트와 겹치지 않게 순차
// 실행되어야 한다.

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f31a-signup-email-verification-test-secret';
process.env.SIGNUP_EMAIL_HMAC_SECRET = process.env.SIGNUP_EMAIL_HMAC_SECRET
    || 'f31a-signup-email-verification-test-hmac-secret';
// 이 파일의 여러 케이스가 같은 프로세스(같은 auth.routes.js 모듈, 같은 메모리 카운터)를
// 공유한다 — 요청 제한기 자체는 signupEmailVerification.api.test.js가 이미 전용으로
// 검증했으므로 실제 DB 왕복 케이스가 우연히 429에 걸려 오염되지 않도록 한도를 넉넉히 올린다.
process.env.SIGNUP_EMAIL_HOUR_MAX = '1000';
process.env.SIGNUP_EMAIL_DAY_MAX = '1000';
process.env.SIGNUP_IP_HOUR_MAX = '1000';
process.env.SIGNUP_IP_DAY_MAX = '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const cookieParser = require('cookie-parser');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const { MIGRATIONS } = require('../../scripts/migrate-db');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
const addAchievementGrants = require('../../db/migrations/0009-add-achievement-grants');
const addNotifications = require('../../db/migrations/0012-add-notifications');
const addF19FriendsInvites = require('../../db/migrations/0013-f19-friends-invites');
const addSignupEmailVerification = require('../../db/migrations/0016-signup-email-verification');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, addNotifications, addF19FriendsInvites,
    migrationRunner,
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

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

const rebuildFullSchema = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const db = require('../../models');
const authService = require('../../service/auth.service');
const mailAdapterModule = require('../../mail/mailAdapter');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

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

const useMemoryMailAdapter = (t) => {
    const memory = mailAdapterModule.createMemoryMailAdapter();
    t.mock.method(mailAdapterModule, 'createHttpMailAdapter', () => memory);
    return memory;
};

const postJson = (base, path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

const VALID_SIGNUP_FIELDS = { password: 'pw12345678', passwordConfirm: 'pw12345678', birthDate: '2000-01-01' };

/** 실제 HTTP 발송→확인 왕복으로 signupProof를 얻는다. */
const requestAndVerifyProof = async (base, memory, email) => {
    const codeRes = await postJson(base, '/auth/signup/email-code', { email });
    const codeBody = await codeRes.json();
    assert.equal(codeRes.status, 200, JSON.stringify(codeBody));
    const code = memory.outbox.at(-1).params.code;

    const verifyRes = await postJson(base, '/auth/signup/email-code/verify', { email, code });
    const verifyBody = await verifyRes.json();
    assert.equal(verifyRes.status, 200, JSON.stringify(verifyBody));
    const { signupProof } = verifyBody;
    assert.ok(signupProof);
    return { code, signupProof };
};

// ── AC-01: 발송→확인→가입 실제 DB 상태 ────────────────────────────────────────

test('AC-01: 발송→확인→가입 후 사용자·통계·경제 행과 인증 상태가 실제 DB에 정확히 남는다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();

    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);
    const email = `f31a-ac01-${crypto.randomUUID()}@example.com`;

    const { code, signupProof } = await requestAndVerifyProof(base, memory, email);

    const signupRes = await postJson(base, '/auth/signup', {
        email, nickname: 'F31A가입', ...VALID_SIGNUP_FIELDS, signupProof,
    });
    const signupBody = await signupRes.json();
    assert.equal(signupRes.status, 200, JSON.stringify(signupBody));
    assert.equal(signupBody.success, true);

    const [userRows] = await sequelize.query(
        'SELECT uuid, email_verified FROM users WHERE email = :email', { replacements: { email } },
    );
    assert.equal(userRows.length, 1);
    assert.equal(Number(userRows[0].email_verified), 1, '실제 인증을 거친 가입은 email_verified=true로 저장되어야 한다');
    const userId = userRows[0].uuid;

    const [statsRows] = await sequelize.query(
        'SELECT user_id FROM user_stats WHERE user_id = :userId', { replacements: { userId } },
    );
    assert.equal(statsRows.length, 1);

    const [entitlementRows] = await sequelize.query(
        'SELECT item_id FROM economy_entitlements WHERE user_id = :userId', { replacements: { userId } },
    );
    assert.equal(entitlementRows.length, 25, '기본 프로필 16종 + 평민 테두리 1종 + 기본 이모티콘 8종이 지급되어야 한다');

    const [walletRows] = await sequelize.query(
        'SELECT balance_gold, balance_diamond FROM economy_wallets WHERE user_id = :userId', { replacements: { userId } },
    );
    assert.equal(walletRows.length, 1);
    assert.equal(Number(walletRows[0].balance_gold), 0);
    assert.equal(Number(walletRows[0].balance_diamond), 0);

    const [verificationRows] = await sequelize.query(
        `SELECT code_hash, code_consumed_at, proof_hash, proof_consumed_at
         FROM signup_email_verifications WHERE email = :email AND purpose = 'SIGNUP'`,
        { replacements: { email } },
    );
    assert.equal(verificationRows.length, 1);
    const row = verificationRows[0];
    assert.ok(row.code_consumed_at, '번호는 소비된 상태로 남아야 한다');
    assert.ok(row.proof_consumed_at, '가입 성공 후 증명도 소비된 상태로 남아야 한다');
    // AC-06: 저장값은 해시(64자 hex)일 뿐 원문 번호·증명이 아니다.
    assert.match(row.code_hash, /^[0-9a-f]{64}$/);
    assert.match(row.proof_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(row.code_hash, code);
    assert.notEqual(row.proof_hash, signupProof);
});

// ── AC-04: 동시 HTTP 제출·지급 실패 롤백·재시도 ───────────────────────────────

test('AC-04: 같은 증명으로 동시에 HTTP 가입을 제출해도 계정 생성은 정확히 한 번만 성공한다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();

    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);
    const email = `f31a-ac04-${crypto.randomUUID()}@example.com`;
    const { signupProof } = await requestAndVerifyProof(base, memory, email);

    const [first, second, third] = await Promise.all([
        postJson(base, '/auth/signup', { email, nickname: 'AC04닉네임1', ...VALID_SIGNUP_FIELDS, signupProof }),
        postJson(base, '/auth/signup', { email, nickname: 'AC04닉네임2', ...VALID_SIGNUP_FIELDS, signupProof }),
        postJson(base, '/auth/signup', { email, nickname: 'AC04닉네임3', ...VALID_SIGNUP_FIELDS, signupProof }),
    ]);
    const results = await Promise.all([first, second, third].map(async (res) => ({ status: res.status, body: await res.json() })));

    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status !== 200);
    assert.equal(successes.length, 1, '정확히 하나만 성공해야 한다');
    assert.equal(failures.length, 2);
    for (const failure of failures) {
        assert.equal(failure.status, 401);
        assert.equal(failure.body.code, 'SIGNUP_PROOF_INVALID');
    }

    const [userRows] = await sequelize.query('SELECT uuid FROM users WHERE email = :email', { replacements: { email } });
    assert.equal(userRows.length, 1, 'users 테이블에는 정확히 한 행만 남아야 한다');

    const [entitlementRows] = await sequelize.query(
        'SELECT item_id FROM economy_entitlements WHERE user_id = :userId', { replacements: { userId: userRows[0].uuid } },
    );
    assert.equal(entitlementRows.length, 25, '기본 지급도 정확히 한 번만 이루어져야 한다');
    const [[ledgerCount]] = await sequelize.query(
        `SELECT COUNT(*) AS c FROM economy_ledger_entries WHERE user_id = :userId AND reason = 'DEFAULT_GRANT'`,
        { replacements: { userId: userRows[0].uuid } },
    );
    assert.equal(Number(ledgerCount.c), 25, 'DEFAULT_GRANT 원장도 정확히 25건이어야 한다');
});

test('AC-04: 지급 실패 후 롤백 — 증명이 미소비로 남아 같은 증명으로 재시도하면 성공한다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();

    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);
    const email = `f31a-ac04-rollback-${crypto.randomUUID()}@example.com`;
    const { signupProof } = await requestAndVerifyProof(base, memory, email);

    const models = db.sequelize.models;
    const originalCreate = models.EconomyEntitlement.create;
    let createCount = 0;
    models.EconomyEntitlement.create = function patched(...args) {
        createCount += 1;
        if (createCount === 16) return Promise.reject(new Error('시뮬레이션된 지급 실패'));
        return originalCreate.apply(this, args);
    };
    t.after(() => { models.EconomyEntitlement.create = originalCreate; });

    const failedRes = await postJson(base, '/auth/signup', {
        email, nickname: 'AC04롤백닉', ...VALID_SIGNUP_FIELDS, signupProof,
    });
    assert.equal(failedRes.status, 500);

    const [userRowsAfterFailure] = await sequelize.query('SELECT uuid FROM users WHERE email = :email', { replacements: { email } });
    assert.equal(userRowsAfterFailure.length, 0, '지급 실패는 계정 생성 자체도 롤백해야 한다');

    // AC-04 재검토: 계정 생성뿐 아니라 같은 트랜잭션 안에서 만들어졌을 통계·지갑·원장·
    // 소유권·장착도 전부 남지 않아야 한다(지급이 16번째 항목에서 실패하므로, 그 이전
    // 15개 소유권·원장과 지갑·장착 생성이 이미 일어난 뒤였다 — 그것들이 살아남으면
    // "부분 지급된 계정 없는 데이터"가 고아로 남는다). users가 롤백되어 uuid를 알 수
    // 없으므로 테이블 전체 행 수로 확인한다 — rebuildFullSchema가 이 테스트 시작 시
    // 스키마를 통째로 새로 만들어 다른 테스트의 데이터와 섞이지 않는다.
    const [[userStatsCount]] = await sequelize.query('SELECT COUNT(*) AS c FROM user_stats');
    assert.equal(Number(userStatsCount.c), 0, '지급 실패는 통계 생성도 롤백해야 한다');
    const [[walletCount]] = await sequelize.query('SELECT COUNT(*) AS c FROM economy_wallets');
    assert.equal(Number(walletCount.c), 0, '지급 실패는 지갑 생성도 롤백해야 한다');
    const [[entitlementCount]] = await sequelize.query('SELECT COUNT(*) AS c FROM economy_entitlements');
    assert.equal(Number(entitlementCount.c), 0, '지급 실패 이전에 성공한 소유권도 함께 롤백되어야 한다');
    const [[ledgerCount]] = await sequelize.query('SELECT COUNT(*) AS c FROM economy_ledger_entries');
    assert.equal(Number(ledgerCount.c), 0, '지급 실패 이전에 성공한 원장도 함께 롤백되어야 한다');
    const [[loadoutCount]] = await sequelize.query('SELECT COUNT(*) AS c FROM economy_loadouts');
    assert.equal(Number(loadoutCount.c), 0, '지급 실패는 기본 장착 생성도 롤백해야 한다');

    const [verificationRows] = await sequelize.query(
        `SELECT proof_consumed_at FROM signup_email_verifications WHERE email = :email AND purpose = 'SIGNUP'`,
        { replacements: { email } },
    );
    assert.equal(verificationRows.length, 1);
    assert.equal(verificationRows[0].proof_consumed_at, null, '실패한 가입은 증명 소비를 커밋하면 안 된다');

    models.EconomyEntitlement.create = originalCreate;
    const retryRes = await postJson(base, '/auth/signup', {
        email, nickname: 'AC04롤백닉', ...VALID_SIGNUP_FIELDS, signupProof,
    });
    const retryBody = await retryRes.json();
    assert.equal(retryRes.status, 200, JSON.stringify(retryBody));

    const [userRowsAfterRetry] = await sequelize.query('SELECT uuid FROM users WHERE email = :email', { replacements: { email } });
    assert.equal(userRowsAfterRetry.length, 1);
    const [entitlementRows] = await sequelize.query(
        'SELECT item_id FROM economy_entitlements WHERE user_id = :userId', { replacements: { userId: userRowsAfterRetry[0].uuid } },
    );
    assert.equal(entitlementRows.length, 25, '재시도가 성공하면 기본 지급 25종이 모두 있어야 한다');
});

// ── AC-06: 마이그레이션 재실행 안전성·기존 계정 로그인 ────────────────────────

test('AC-06: 0016 up·verify를 반복해도 같은 스키마·인덱스로 수렴하고, CLI 재실행은 빈 배열이다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    const queryInterface = sequelize.getQueryInterface();

    await addSignupEmailVerification.up(queryInterface, Sequelize, sequelize);
    await addSignupEmailVerification.verify(queryInterface, Sequelize, sequelize);
    await addSignupEmailVerification.up(queryInterface, Sequelize, sequelize);
    await addSignupEmailVerification.verify(queryInterface, Sequelize, sequelize);

    const table = await queryInterface.describeTable('signup_email_verifications');
    assert.equal(table.email.allowNull, false);
    assert.equal(table.code_hash.allowNull, true);

    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied, [], '이미 적용된 마이그레이션은 재적용되면 안 된다(CLI 재실행 안전성)');
});

test('AC-06: 기존 email_verified:false 계정은 0016 적용 이후에도 컬럼값이 바뀌지 않고 로그인은 정상 동작한다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();

    // signup_email_verifications를 전혀 거치지 않은 "이관 이전" 계정을 직접 만든다 —
    // F-29 이전 소셜 전용 계정 등 email_verified가 애초에 false로 남아있던 실제 사례를
    // 흉내 낸다(A-03: 이 마이그레이션은 users.email_verified를 갱신하지 않는다).
    const uuid = crypto.randomUUID();
    const email = `f31a-ac06-legacy-${crypto.randomUUID()}@example.com`;
    const password = 'legacy-pw-12345';
    const password_hash = await hashPassword(password);
    await db.User.create({
        uuid, email, password_hash, nickname: 'AC06기존', birth_date: new Date('1990-01-01'),
        email_verified: false,
    });
    await db.UserStats.create({ user_id: uuid });

    const [beforeRows] = await sequelize.query('SELECT email_verified FROM users WHERE uuid = :uuid', { replacements: { uuid } });
    assert.equal(Number(beforeRows[0].email_verified), 0);

    // 0016을 한 번 더(멱등하게) 적용해 "이 계정이 이미 존재하던 상태에서 마이그레이션이
    // 실행된" 순서를 재현한다.
    const queryInterface = sequelize.getQueryInterface();
    await addSignupEmailVerification.up(queryInterface, Sequelize, sequelize);
    await addSignupEmailVerification.verify(queryInterface, Sequelize, sequelize);

    const [afterRows] = await sequelize.query('SELECT email_verified FROM users WHERE uuid = :uuid', { replacements: { uuid } });
    assert.equal(Number(afterRows[0].email_verified), 0, '기존 계정의 email_verified 값이 이 마이그레이션으로 바뀌면 안 된다');

    const loggedIn = await authService.login(
        { email, password }, { ip: '127.0.0.1', userAgent: 'f31a-integration', deviceType: 'desktop' },
    );
    assert.ok(loggedIn.token, '기존 계정은 이 슬라이스 이후에도 정상적으로 로그인할 수 있어야 한다');
});
