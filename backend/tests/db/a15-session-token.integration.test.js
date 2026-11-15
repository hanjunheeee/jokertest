'use strict';

// 끝난 세션·계정의 토큰 시험(시험 DB) — 로그아웃한 세션·탈퇴 계정 토큰은 401, 정지 계정 토큰은 403 "정지된 계정입니다."
// 목록 A15-B-143~145 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// 시험 전용 서명 값 (시험 환경값에 없으면 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-session-token-test-only-secret-012345';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const db = require('../../models');
const { hashPassword } = require('../../utils/auth/credentials');
const { issueSessionForUser } = require('../../services/auth/account/session');
const { withdrawAccount } = require('../../services/auth/account/withdraw');
const { startRouterServer, send, json } = require('../audit-2026-11-09/securityHttp');

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

test.before(async () => {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
});

test.after(async () => {
    await db.sequelize.close();
});

// 시험 전용 비번 (탈퇴 본인 확인에 씀, 진짜 값 아님)
const PASSWORD = 'a15-session-pw-1';
let passwordHash = null;

// 시험마다 새 사람 (uuid가 달라 시험끼리 안 섞임)
async function createUser(label) {
    passwordHash ??= await hashPassword(PASSWORD);
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: passwordHash,
        nickname: `${label}${uuid.slice(0, 4)}`.slice(0, 8),
        email: `${label}-${uuid}@example.test`,
    });
    return uuid;
}

// 로그인 = 세션 발급 (진짜 서비스, 진짜 DB) → access 쿠키
async function login(uuid) {
    const user = await db.User.findByPk(uuid);
    const issued = await db.sequelize.transaction((transaction) => issueSessionForUser(user, {}, { ip: '127.0.0.1' }, transaction));
    return `accessToken=${issued.token}`;
}

// 진짜 /auth·/user 라우터 (라우터 새로 불러 요청 수 장부도 새로)
const freshRouter = (relative) => {
    const resolved = require.resolve(relative);
    delete require.cache[resolved];
    return require(resolved);
};
const startServer = (t) => startRouterServer(t, [
    ['/auth', freshRouter('../../routes/auth.routes')],
    ['/user', freshRouter('../../routes/user.routes')],
]);

// 프로필 읽기 → { status, body, text }
const profile = async (base, cookie) => json(await send(base, 'GET', '/user/me/profile', { cookie }));

// 끝나기 전엔 그 토큰으로 프로필이 열림 (준비 확인)
const assertWorksBefore = async (base, cookie) => {
    const before = await profile(base, cookie);
    assert.equal(before.status, 200, `준비: 로그인 토큰이 처음부터 안 됨 ${before.text}`);
};

test('A15-B-143 로그아웃한 세션 토큰 → 401, 프로필 값 없음', async (t) => {
    if (noDb(t)) return;
    const base = await startServer(t);
    const uuid = await createUser('a143');
    const cookie = await login(uuid);
    await assertWorksBefore(base, cookie);
    const out = await send(base, 'POST', '/auth/logout', { cookie });
    assert.equal(out.status, 200, '준비: 로그아웃 실패');
    const res = await profile(base, cookie);
    assert.equal(res.status, 401);
    assert.equal(res.body.data, undefined);
    assert.doesNotMatch(res.text, /a143/);
});

test('A15-B-144 탈퇴 계정 토큰 → 401, 프로필 값 없음', async (t) => {
    if (noDb(t)) return;
    const base = await startServer(t);
    const uuid = await createUser('a144');
    const cookie = await login(uuid);
    await assertWorksBefore(base, cookie);
    assert.deepEqual(await withdrawAccount({ uuid, password: PASSWORD }), { ok: true }, '준비: 탈퇴 실패');
    const res = await profile(base, cookie);
    assert.equal(res.status, 401);
    assert.equal(res.body.data, undefined);
});

test('A15-B-145 정지 계정 토큰 → 403 "정지된 계정입니다.", 프로필 값 없음', async (t) => {
    if (noDb(t)) return;
    const base = await startServer(t);
    const uuid = await createUser('a145');
    const cookie = await login(uuid);
    await assertWorksBefore(base, cookie);
    await db.UserBan.create({ user_id: uuid, reason: '시험 정지', is_permanent: true });
    const res = await profile(base, cookie);
    assert.equal(res.status, 403);
    // 문구는 "정지된 계정입니다."로 시작 (뒤에 사유가 붙을 수 있음)
    assert.ok(String(res.body.message).startsWith('정지된 계정입니다.'), `문구: ${res.body.message}`);
    assert.equal(res.body.data, undefined);
});
