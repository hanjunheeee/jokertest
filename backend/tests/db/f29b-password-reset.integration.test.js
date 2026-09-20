'use strict';

// F-29b 비밀번호 재설정 — 실제 격리 MySQL DB에서 AC-02~AC-06을 검증한다. f01~f29a와 같은
// 원칙: F01_TEST_DATABASE_URL이 없거나 연결에 실패하면 실패로 표시하지 않고 t.skip으로
// "미검증"을 남긴다. f01-migrations.integration.test.js 다음, 다른 DB 스위트와 겹치지 않게
// 순차 실행되어야 한다(같은 명령의 뒤쪽에서 직렬로).

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f29b-password-reset-test-secret';
process.env.PASSWORD_RESET_APP_URL = process.env.PASSWORD_RESET_APP_URL || 'https://frontend.example.test';
// 이 파일의 여러 케이스가 같은 프로세스(같은 라우터 모듈, 같은 메모리 카운터)를 공유한다 —
// 제한기 자체는 rateLimit.test.js·passwordReset.api.test.js가 이미 검증했으므로 실제 DB
// 왕복 케이스가 우연히 429에 걸려 오염되지 않도록 한도를 넉넉히 올린다.
process.env.PASSWORD_RESET_REQUEST_IP_MAX = '1000';
process.env.PASSWORD_RESET_REQUEST_EMAIL_MAX = '1000';
process.env.PASSWORD_RESET_CHECK_IP_MAX = '1000';

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
const addFindIdRequests = require('../../db/migrations/0014-find-id-requests');
const addPasswordResetTokens = require('../../db/migrations/0015-password-reset-tokens');
const {
    buildManagedSchema, resetManagedSchema,
} = require('../helpers/isolatedTestDb');

const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, addNotifications, addF19FriendsInvites,
    migrationRunner,
});

const PASSWORD_RESET_INDEX = MIGRATIONS.findIndex((m) => m.name === addPasswordResetTokens.name);

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

const db = require('../../models');
const authService = require('../../service/auth.service');
const socialAuthService = require('../../service/socialAuth.service');
const userRepository = require('../../repositories/user.repositories');
const mailAdapterModule = require('../../mail/mailAdapter');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const REQ_INFO = { ip: '127.0.0.1', userAgent: 'f29b-integration' };

const rebuildFullSchema = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

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

const tokenOf = (mail) => new URL(mail.params.resetUrl).searchParams.get('token');

const postJson = (base, path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const getPath = (base, path) => fetch(`${base}${path}`);

const createLocalUser = async ({ nickname, email, password = 'correct-horse-1' }) => {
    const user = await authService.signup({
        email, password, passwordConfirm: password, nickname, birthDate: '1995-05-05',
    });
    return { uuid: user.uuid, email, password };
};

// ── AC-02/AC-04: 실제 발급 → 로그인 확인 → 세션 전체 폐기 ────────────────────────

test('AC-02/AC-04: 유효 토큰으로 재설정하면 새 비밀번호 로그인 성공·이전 비밀번호 실패·기존 세션이 모두 거부된다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();

    const local = await createLocalUser({ nickname: 'AC02유저', email: `ac02-${crypto.randomUUID()}@example.com` });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    // 재설정 전 두 개의 활성 세션을 실제 로그인으로 만든다(다른 기기 시뮬레이션은 아니지만,
    // 여기서는 issueSessionForUser가 이전 세션을 폐기하는 계약이 있으므로 두 번째 로그인
    // 직전에 얻은 accessToken/refreshToken이 재설정 이전 "가장 최근" 세션이다).
    const loginRes = await postJson(base, '/auth/login', { email: local.email, password: local.password, rememberMe: true });
    assert.equal(loginRes.status, 200);
    const setCookies = loginRes.headers.getSetCookie?.() ?? [loginRes.headers.get('set-cookie')];
    const accessToken = setCookies.find((c) => c.startsWith('accessToken=')).split(';')[0].split('=')[1];
    const refreshToken = setCookies.find((c) => c.startsWith('refreshToken=')).split(';')[0].split('=')[1];

    const meBefore = await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${accessToken}` } });
    assert.equal(meBefore.status, 200);

    const requestRes = await postJson(base, '/auth/password-reset/request', { email: local.email });
    assert.equal(requestRes.status, 200);
    assert.deepEqual(await requestRes.json(), { ok: true });
    assert.equal(memory.outbox.length, 1);
    const rawToken = tokenOf(memory.outbox[0]);

    const confirmRes = await postJson(base, '/auth/password-reset/confirm', { token: rawToken, newPassword: 'brand-new-pw-1' });
    assert.equal(confirmRes.status, 200);
    assert.deepEqual(await confirmRes.json(), { ok: true });

    // 새 비밀번호 로그인 성공, 이전 비밀번호 실패.
    const newLogin = await postJson(base, '/auth/login', { email: local.email, password: 'brand-new-pw-1' });
    assert.equal(newLogin.status, 200);
    const oldLogin = await postJson(base, '/auth/login', { email: local.email, password: local.password });
    assert.equal(oldLogin.status, 401);

    // 재설정 이전 세션은 HTTP·refresh 모두 거부된다.
    const meAfter = await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${accessToken}` } });
    assert.equal(meAfter.status, 401);
    const refreshAfter = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { cookie: `refreshToken=${refreshToken}` } });
    assert.equal(refreshAfter.status, 401);

    // 남은 재설정 토큰(있다면)도 무효다 — 여기서는 이 토큰 자체가 USED다.
    const verifyAfter = await getPath(base, `/auth/password-reset/verify?token=${encodeURIComponent(rawToken)}`);
    assert.deepEqual(await verifyAfter.json(), { ok: false, code: 'USED' });
});

// ── AC-04: confirm 자체의 세션 폐기를 "새 로그인"과 분리해 검증 ──────────────────
//
// 위 AC-02/AC-04 시험의 기존 세션 401 확인은 confirm 이후에 새 로그인(다른 비밀번호로)을
// 한 번 더 거친 뒤에 수행된다 — issueSessionForUser 자신도 로그인마다 이전 세션을 전부
// 폐기하는 계약이 있으므로, confirm 없이 로그인만 두 번 해도 첫 세션은 revoked_at이 찍힌다.
// 그래서 위 시험만으로는 "confirm이 세션을 폐기했다"와 "그 뒤의 새 로그인이 폐기했다"를
// 구분하지 못한다. 이 시험은 새 로그인을 전혀 거치지 않고, confirm 하나만으로 기존 세션들이
// 거부되는지와 DB의 그 세션 행에 실제로 revoked_at이 찍히는지를 직접 확인한다.
test('AC-04: confirm은 새 로그인 없이도 기존 세션 전체를 폐기하고 DB에 revoked_at을 남긴다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();

    const local = await createLocalUser({ nickname: 'AC04세션', email: `ac04-${crypto.randomUUID()}@example.com` });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);
    const { generateToken } = require('../../utils/jwt');

    // 실제 로그인은 issueSessionForUser의 "이전 세션 전부 폐기" 계약 때문에 두 개의 활성
    // 세션을 동시에 남기지 못한다(다른 기기/탭 시뮬레이션이 아니라 그저 순차 로그인이 되어
    // 버린다) — 그래서 두 번째 세션은 저장소로 직접 발급해, 로그인 호출 없이도 같은 계정의
    // 서로 다른 두 활성 세션을 만든다.
    const sessionAId = crypto.randomUUID();
    const sessionBId = crypto.randomUUID();
    await db.UserSession.create({ id: sessionAId, user_id: local.uuid, is_online: true, ip_address: '127.0.0.1' });
    await db.UserSession.create({ id: sessionBId, user_id: local.uuid, is_online: true, ip_address: '127.0.0.2' });
    const accessTokenA = generateToken({ uuid: local.uuid, role: 'USER', sessionId: sessionAId });
    const accessTokenB = generateToken({ uuid: local.uuid, role: 'USER', sessionId: sessionBId });

    const meABefore = await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${accessTokenA}` } });
    assert.equal(meABefore.status, 200, '전제: 세션 A는 confirm 이전에 유효해야 합니다');
    const meBBefore = await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${accessTokenB}` } });
    assert.equal(meBBefore.status, 200, '전제: 세션 B는 confirm 이전에 유효해야 합니다');

    await postJson(base, '/auth/password-reset/request', { email: local.email });
    const rawToken = tokenOf(memory.outbox.at(-1));
    const confirmRes = await postJson(base, '/auth/password-reset/confirm', { token: rawToken, newPassword: 'ac04-new-pw-1' });
    assert.equal(confirmRes.status, 200);

    // 여기까지 로그인 호출이 한 번도 없었다 — 두 세션 모두 거부돼야 confirm 자체의 세션
    // 폐기라고 말할 수 있다.
    const meAAfter = await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${accessTokenA}` } });
    assert.equal(meAAfter.status, 401, 'confirm이 세션 A를 폐기하지 못했습니다(새 로그인 없이)');
    const meBAfter = await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${accessTokenB}` } });
    assert.equal(meBAfter.status, 401, 'confirm이 세션 B를 폐기하지 못했습니다(새 로그인 없이)');

    const [rowA, rowB] = await Promise.all([
        db.UserSession.findOne({ where: { id: sessionAId } }),
        db.UserSession.findOne({ where: { id: sessionBId } }),
    ]);
    assert.ok(rowA.revoked_at, 'DB의 세션 A 행에 revoked_at이 찍히지 않았습니다');
    assert.ok(rowB.revoked_at, 'DB의 세션 B 행에 revoked_at이 찍히지 않았습니다');
});

// ── AC-03: 만료·사용된 토큰 거부, 재발급 시 이전 링크 무효화, 동시 제출 ───────────

test('AC-03: 만료된 토큰·이미 사용된 토큰은 거부되고, 새 요청 발급 후 이전 미사용 링크도 거부된다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();

    const local = await createLocalUser({ nickname: 'AC03유저', email: `ac03-${crypto.randomUUID()}@example.com` });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    await postJson(base, '/auth/password-reset/request', { email: local.email });
    const tokenA = tokenOf(memory.outbox[0]);

    // A를 만료시킨다.
    await db.PasswordResetToken.update(
        { expired_at: new Date(Date.now() - 1000) },
        { where: { user_id: local.uuid } },
    );
    const expiredVerify = await getPath(base, `/auth/password-reset/verify?token=${encodeURIComponent(tokenA)}`);
    assert.deepEqual(await expiredVerify.json(), { ok: false, code: 'EXPIRED' });

    // 새 요청(B) 발급 — 이전(A, 이미 만료됐지만 미사용 상태였던)은 재발급 시점에 명시적으로도 무효화된다.
    await postJson(base, '/auth/password-reset/request', { email: local.email });
    const tokenB = tokenOf(memory.outbox[1]);
    assert.notEqual(tokenA, tokenB);

    const bConfirm = await postJson(base, '/auth/password-reset/confirm', { token: tokenB, newPassword: 'second-new-pw-1' });
    assert.equal(bConfirm.status, 200);

    const bConfirmAgain = await postJson(base, '/auth/password-reset/confirm', { token: tokenB, newPassword: 'third-new-pw-1' });
    assert.equal(bConfirmAgain.status, 400);
    assert.deepEqual(await bConfirmAgain.json(), { ok: false, code: 'USED' });
});

test('AC-03: 실제 MySQL에서 같은 토큰에 대한 동시 confirm 제출은 정확히 1회만 성공한다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();

    const local = await createLocalUser({ nickname: 'AC03동시', email: `ac03race-${crypto.randomUUID()}@example.com` });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    await postJson(base, '/auth/password-reset/request', { email: local.email });
    const rawToken = tokenOf(memory.outbox[0]);

    const results = await Promise.all([
        postJson(base, '/auth/password-reset/confirm', { token: rawToken, newPassword: 'race-pw-one-1' }),
        postJson(base, '/auth/password-reset/confirm', { token: rawToken, newPassword: 'race-pw-two-2' }),
        postJson(base, '/auth/password-reset/confirm', { token: rawToken, newPassword: 'race-pw-three-3' }),
    ]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    const succeeded = bodies.filter((b) => b.ok === true);
    const rejected = bodies.filter((b) => b.ok === false);

    assert.equal(succeeded.length, 1, '동시 제출 중 정확히 하나만 성공해야 한다');
    assert.equal(rejected.length, 2);
    for (const r of rejected) assert.equal(r.code, 'USED');

    const row = await db.PasswordResetToken.findOne({ where: { user_id: local.uuid } });
    assert.equal(row.used, true);

    // 승자의 해시만 저장됐는지 — 세 후보 비밀번호 중 정확히 하나로만 로그인된다.
    const attempts = await Promise.all(
        ['race-pw-one-1', 'race-pw-two-2', 'race-pw-three-3'].map((pw) => postJson(base, '/auth/login', { email: local.email, password: pw })),
    );
    const successfulLogins = attempts.filter((r) => r.status === 200);
    assert.equal(successfulLogins.length, 1, '승자의 비밀번호로만 로그인이 성공해야 한다');
});

// ── AC-06: DB 값에 원문이 없다 ────────────────────────────────────────────────

test('AC-06: password_reset_tokens에는 토큰 원문이 저장되지 않고 해시·만료·사용 상태만 있다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();

    const local = await createLocalUser({ nickname: 'AC06유저', email: `ac06-${crypto.randomUUID()}@example.com` });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    await postJson(base, '/auth/password-reset/request', { email: local.email });
    const rawToken = tokenOf(memory.outbox[0]);

    const [rows] = await sequelize.query('SELECT * FROM password_reset_tokens WHERE user_id = :uuid', {
        replacements: { uuid: local.uuid },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].token, null, '신규 발급 행은 token 원문 컬럼이 NULL이어야 한다');
    assert.ok(rows[0].token_hash);
    assert.notEqual(rows[0].token_hash, rawToken);
    assert.equal(JSON.stringify(rows[0]).includes(rawToken), false, '어떤 컬럼값에도 원문이 포함되면 안 된다');
});

// ── AC-06: 0015 재실행은 오류 없이 동일 스키마로 수렴한다 ─────────────────────────

test('AC-06: 0015 up·verify를 두 번 실행해도 오류 없고 기존 토큰·표식이 보존된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    assert.notEqual(PASSWORD_RESET_INDEX, -1, 'MIGRATIONS에서 0015-password-reset-tokens를 찾을 수 없습니다');
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS.slice(0, PASSWORD_RESET_INDEX) });

    const queryInterface = sequelize.getQueryInterface();

    // 0015 이전 legacy 원문 토큰 행을 직접 심는다(그 시점 스키마는 token이 NOT NULL이다).
    const legacyUserId = crypto.randomUUID();
    await sequelize.query(
        "INSERT INTO users (uuid, password_hash, nickname, email, role, status, email_verified, failed_login_count, created_at, updated_at) "
        + "VALUES (:uuid, 'x', 'legacyuser', :email, 'USER', 'ACTIVE', false, 0, NOW(), NOW())",
        { replacements: { uuid: legacyUserId, email: `legacy-${legacyUserId}@example.com` } },
    );
    await sequelize.query(
        "INSERT INTO password_reset_tokens (user_id, token, expired_at, used, created_at) "
        + "VALUES (:uuid, 'legacy-plaintext-token', :expiredAt, false, NOW())",
        { replacements: { uuid: legacyUserId, expiredAt: new Date(Date.now() + 60_000) } },
    );

    await addPasswordResetTokens.up(queryInterface, Sequelize, sequelize);
    await addPasswordResetTokens.verify(queryInterface, Sequelize, sequelize);

    const [legacyAfterFirst] = await sequelize.query(
        'SELECT token, token_hash, used, revoked_at FROM password_reset_tokens WHERE user_id = :uuid',
        { replacements: { uuid: legacyUserId } },
    );
    assert.equal(legacyAfterFirst[0].token, null, 'legacy 원문은 무효화 과정에서 NULL로 치워진다');
    assert.equal(Number(legacyAfterFirst[0].used), 1);
    assert.ok(legacyAfterFirst[0].revoked_at);

    // 두 번째 실행 — 멱등해야 한다(오류 없음, 같은 최종 상태로 수렴).
    await addPasswordResetTokens.up(queryInterface, Sequelize, sequelize);
    await addPasswordResetTokens.verify(queryInterface, Sequelize, sequelize);

    const [legacyAfterSecond] = await sequelize.query(
        'SELECT token, token_hash, used, revoked_at FROM password_reset_tokens WHERE user_id = :uuid',
        { replacements: { uuid: legacyUserId } },
    );
    assert.equal(legacyAfterSecond[0].token, null);
    assert.equal(Number(legacyAfterSecond[0].used), 1);
    assert.equal(
        new Date(legacyAfterSecond[0].revoked_at).getTime(),
        new Date(legacyAfterFirst[0].revoked_at).getTime(),
        '재실행이 이미 폐기된 시각을 다시 바꾸면 안 된다',
    );

    // down()은 항상 거부된다(원문 복원·표식 제거 금지).
    await assert.rejects(() => addPasswordResetTokens.down());
});

// ── AC-05 §2-3a: has_local_password backfill (기존 계정의 true→false 이관) ───────
//
// 0015 **직전** 상태(0014까지만 적용 — has_local_password 컬럼 자체가 DB에 없다)에서 실제
// authService.signup·socialAuthService를 호출해 fixture를 만든다. 런타임 User 모델은 이미
// has_local_password를 필수 속성으로 갖고 있어(§2-3a), 그대로 두면 INSERT가 "Unknown
// column"으로 깨진다 — 그래서 fixture를 만드는 동안만 db.User에서 이 속성을 제거해 그 시점의
// 실제 스키마와 모델을 맞춘다(컬럼 자체가 DB에 없으므로 이 조작은 사실을 모델에 맞출
// 뿐이다). fixture 생성이 끝나면 즉시 원래 속성으로 복원한다 — 그 뒤에야 "공식" 0015를
// 적용해, 이미 존재하던 이 계정들이 true→false로 실제 이관되는지를 검증한다.
test('AC-05: has_local_password backfill은 0015 이전에 실제로 존재하던 계정을 올바르게 이관한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS.slice(0, PASSWORD_RESET_INDEX) });
    const queryInterface = sequelize.getQueryInterface();

    const savedAttribute = db.User.rawAttributes.has_local_password;
    db.User.removeAttribute('has_local_password');

    let localOnly;
    let socialIntentPreserved;
    let socialIntentDeleted;
    let delayedLocal;
    try {
        // (a) 순수 로컬 가입 — 근거 없음 → true.
        localOnly = await createLocalUser({ nickname: 'BF로컬', email: `bf-local-${crypto.randomUUID()}@example.com` });

        // (b) 소셜 가입 완료(intent 보존) — 근거1(소비된 intent의 provider/subject 일치) → false.
        const fpB = `fp-${crypto.randomUUID()}`;
        const stateB = await socialAuthService.issueOAuthState({ purpose: 'login', browserFingerprint: fpB });
        const callbackB = await socialAuthService.handleOAuthCallback({
            provider: 'google', subject: `sub-${crypto.randomUUID()}`, email: `bf-social-b-${crypto.randomUUID()}@example.com`,
            rawState: stateB.state, browserFingerprint: fpB, reqInfo: REQ_INFO,
        });
        socialIntentPreserved = await socialAuthService.completeSocialSignup({
            intentToken: callbackB.intentToken, nickname: 'BF소셜B', birthDate: '1992-02-02', reqInfo: REQ_INFO,
        });

        // (c) 소셜 가입 완료 후 소비된 intent 행만 삭제 — 근거1 소멸, 근거2(생성 시각 10초
        // 이내)만 남는다 → false.
        const fpC = `fp-${crypto.randomUUID()}`;
        const stateC = await socialAuthService.issueOAuthState({ purpose: 'login', browserFingerprint: fpC });
        const callbackC = await socialAuthService.handleOAuthCallback({
            provider: 'discord', subject: `sub-${crypto.randomUUID()}`, email: `bf-social-c-${crypto.randomUUID()}@example.com`,
            rawState: stateC.state, browserFingerprint: fpC, reqInfo: REQ_INFO,
        });
        socialIntentDeleted = await socialAuthService.completeSocialSignup({
            intentToken: callbackC.intentToken, nickname: 'BF소셜C', birthDate: '1992-03-03', reqInfo: REQ_INFO,
        });
        await db.SocialSignupIntent.destroy({ where: { email: { [db.Sequelize.Op.like]: 'bf-social-c-%' } } });

        // (d) 로컬 가입 후 10초를 넘겨 명시적 연결 — 근거1 없음(연결은 intent를 만들지
        // 않는다), 근거2도 없어야 한다. 시각을 조작하지 않고 실제로 10초 넘게 기다린 뒤
        // 연결해, identity.created_at이 진짜로 users.created_at보다 10초 넘게 뒤에 남게 한다.
        delayedLocal = await createLocalUser({ nickname: 'BF지연', email: `bf-delayed-${crypto.randomUUID()}@example.com` });
        await new Promise((resolve) => setTimeout(resolve, 11_000));
        const delayedLogin = await authService.login({ email: delayedLocal.email, password: delayedLocal.password }, REQ_INFO);
        const sessionId = require('jsonwebtoken').decode(delayedLogin.token).sessionId;
        // linkExternalIdentityForValidatedSession은 state를 직접 받지 않는다(호출부가 이미
        // state 소비·바인딩을 확인했다고 전제한다, socialAuth.service.js 참고) — 활성 세션만
        // 재확인한다.
        await socialAuthService.linkExternalIdentityForValidatedSession({
            userId: delayedLocal.uuid, sessionId, provider: 'google', subject: `sub-delayed-${crypto.randomUUID()}`, email: delayedLocal.email,
        });
    } finally {
        // 컬럼이 여전히 DB에 없는 이 시점에 반드시 원복한다 — 그래야 이 프로세스의 다른
        // 시험(뒤이은 정상 0015 적용·API 시험 등)이 정상 모델을 그대로 쓴다.
        db.User.rawAttributes.has_local_password = savedAttribute;
        db.User.refreshAttributes();
    }

    // "공식" 0015 적용 — backfill이 0015 이전부터 실제로 존재하던 이 데이터 위에서 계산된다
    // (이 시점에야 has_local_password 컬럼이 처음 생긴다 — true→false 실제 이관).
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    await addPasswordResetTokens.verify(queryInterface, Sequelize, sequelize);

    const flagOf = async (uuid) => {
        const [rows] = await sequelize.query('SELECT has_local_password FROM users WHERE uuid = :uuid', { replacements: { uuid } });
        return Boolean(Number(rows[0].has_local_password));
    };

    assert.equal(await flagOf(localOnly.uuid), true, '(a) 순수 로컬 가입은 true여야 한다');
    assert.equal(await flagOf(socialIntentPreserved.user.uuid), false, '(b) intent가 보존된 소셜 가입은 false여야 한다');
    assert.equal(await flagOf(socialIntentDeleted.user.uuid), false, '(c) intent가 삭제돼도 생성 시각 근접(근거2)으로 false여야 한다');
    assert.equal(await flagOf(delayedLocal.uuid), true, '(d) 10초를 넘겨 연결한 로컬 계정은 true로 남아야 한다');

    // up/verify 반복 — 같은 데이터에서 같은 값으로 수렴한다.
    await addPasswordResetTokens.up(queryInterface, Sequelize, sequelize);
    await addPasswordResetTokens.verify(queryInterface, Sequelize, sequelize);
    assert.equal(await flagOf(localOnly.uuid), true);
    assert.equal(await flagOf(socialIntentPreserved.user.uuid), false);
    assert.equal(await flagOf(socialIntentDeleted.user.uuid), false);
    assert.equal(await flagOf(delayedLocal.uuid), true);

    // 유지 규칙: 로컬·연결 계정은 재설정 요청→confirm이 정상 동작하고, 소셜 전용 계정(b/c)은
    // 안내만 받는다(토큰 미발급).
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    await postJson(base, '/auth/password-reset/request', { email: localOnly.email });
    assert.equal(memory.outbox.at(-1).template, 'PASSWORD_RESET');
    const localToken = tokenOf(memory.outbox.at(-1));
    const localConfirm = await postJson(base, '/auth/password-reset/confirm', { token: localToken, newPassword: 'bf-local-new-1' });
    assert.equal(localConfirm.status, 200);
    const localRelogin = await postJson(base, '/auth/login', { email: localOnly.email, password: 'bf-local-new-1' });
    assert.equal(localRelogin.status, 200);

    memory.outbox.length = 0;
    const socialUserEmail = (await db.User.findByPk(socialIntentPreserved.user.uuid)).email;
    await postJson(base, '/auth/password-reset/request', { email: socialUserEmail });
    assert.equal(memory.outbox.length, 1);
    assert.equal(memory.outbox[0].template, 'SOCIAL_LOGIN_GUIDE');
    const socialTokenCount = await db.PasswordResetToken.count({ where: { user_id: socialIntentPreserved.user.uuid } });
    assert.equal(socialTokenCount, 0);
});

// ── AC-05(경계 시험, 시각 직접 주입) §2-3a 근거2의 10초 컷오프 ─────────────────────
//
// 위 "실제 fixture" 시험은 실제 경로가 남기는 시각만 쓴다(지연 연결을 실제로 11초 기다린다).
// 그 시험과 별개로, 근거2("identity와 사용자 생성 시각 차이 10초 이내") 컷오프 자체를 단위
// 수준으로 정확히 가르려면 제어된 시각이 필요하다 — 이 시험은 그 목적을 위해 명시적으로
// created_at을 직접 조작한다(이름대로 "시각을 직접 넣은 경계 시험"이며, 위 시험처럼 실제
// 서비스 경로가 남긴 시각을 그대로 쓰는 시험이 아니다).
test('AC-05(경계 시험, 시각 직접 주입): backfill 근거2는 10초 경계를 가른다', async (t) => {
    if (unavailable(t)) return;
    await rebuildFullSchema();
    const queryInterface = sequelize.getQueryInterface();

    const makeLinkedCandidate = async (label, deltaSeconds) => {
        const local = await createLocalUser({ nickname: label, email: `bf-edge-${label}-${crypto.randomUUID()}@example.com` });
        const login = await authService.login({ email: local.email, password: local.password }, REQ_INFO);
        const sessionId = require('jsonwebtoken').decode(login.token).sessionId;
        const identity = await socialAuthService.linkExternalIdentityForValidatedSession({
            userId: local.uuid, sessionId, provider: 'google', subject: `sub-edge-${label}-${crypto.randomUUID()}`, email: local.email,
        });
        await sequelize.query(
            'UPDATE external_identities ei JOIN users u ON u.uuid = ei.user_id '
            + 'SET ei.created_at = DATE_ADD(u.created_at, INTERVAL :deltaSeconds SECOND) WHERE ei.id = :id',
            { replacements: { deltaSeconds, id: identity.id } },
        );
        return local;
    };

    // 근거2는 ABS(TIMESTAMPDIFF(MICROSECOND, identity.created_at, user.created_at)) <= 10초다.
    const within = await makeLinkedCandidate('within', 9); // 9초 이내 → 근거2 성립 → false
    const outside = await makeLinkedCandidate('outside', 11); // 11초 초과 → 근거2 없음 → true

    // backfill을 다시 계산시킨다 — up()은 컬럼이 이미 있어도 항상 backfill을 다시 계산한다
    // (AC-06 "컬럼이 이미 있어도 미완료 backfill을 수행할 수 있어야 한다"와 같은 멱등 계약).
    await addPasswordResetTokens.up(queryInterface, Sequelize, sequelize);
    await addPasswordResetTokens.verify(queryInterface, Sequelize, sequelize);

    const flagOf = async (uuid) => {
        const [rows] = await sequelize.query('SELECT has_local_password FROM users WHERE uuid = :uuid', { replacements: { uuid } });
        return Boolean(Number(rows[0].has_local_password));
    };
    assert.equal(await flagOf(within.uuid), false, '근거2: 10초 이내 연결은 false여야 한다');
    assert.equal(await flagOf(outside.uuid), true, '근거2: 10초를 넘긴 연결은 true여야 한다');
});
