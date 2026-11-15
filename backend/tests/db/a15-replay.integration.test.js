'use strict';

// 같은 요청 되풀이 시험(시험 DB) — 바로 전 refresh 30초 봐줌, 그 뒤 옛 refresh 재사용이면 세션 끊음, 로그아웃 뒤 refresh 거절, 같은 공지 번호 한 번만
// 목록 A15-B-207~210 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// 시험 전용 서명 값 (시험 환경값에 없으면 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-replay-test-only-secret-0123456789abc';

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
const { issueSessionForUser } = require('../../services/auth/account/session');
const { createInternalRouter } = require('../../routes/internal.routes');
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

// 가짜 시계 시작 시각 (초 단위로 딱 맞춤 — DB 시각 칸이 초까지만이어도 경계가 안 흔들리게)
const START_MS = Date.UTC(2026, 10, 16, 3, 0, 0);

// 시험마다 새 사람 (uuid가 달라 시험끼리 안 섞임)
async function createUser(label) {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'not-a-real-hash',
        nickname: `${label}${uuid.slice(0, 4)}`.slice(0, 8),
        email: `${label}-${uuid}@example.test`,
    });
    return uuid;
}

// 로그인 유지로 로그인 (진짜 세션 발급) → access 쿠키·refresh 쿠키
async function loginRemembered(uuid) {
    const user = await db.User.findByPk(uuid);
    const issued = await db.sequelize.transaction((transaction) => issueSessionForUser(user, { rememberMe: true }, { ip: '127.0.0.1' }, transaction));
    return { access: `accessToken=${issued.token}`, refresh: `refreshToken=${issued.refreshToken}` };
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

// 응답 Set-Cookie에서 값 있는 쿠키만 → { accessToken: 'accessToken=…', refreshToken: 'refreshToken=…' }
const cookiesOf = (res) => {
    const out = {};
    for (const line of res.headers.getSetCookie()) {
        const match = line.match(/^(accessToken|refreshToken)=([^;]+)/);
        if (match) out[match[1]] = `${match[1]}=${match[2]}`;
    }
    return out;
};
// access 쿠키 속 세션 번호
const sessionIdOf = (accessCookie) => JSON.parse(Buffer.from(accessCookie.split('=')[1].split('.')[1], 'base64url').toString()).sessionId;

const refresh = async (base, refreshCookie) => {
    const res = await send(base, 'POST', '/auth/refresh', { cookie: refreshCookie });
    const body = await json(res);
    return { ...body, cookies: cookiesOf(res) };
};
const profileStatus = async (base, accessCookie) => (await send(base, 'GET', '/user/me/profile', { cookie: accessCookie })).status;

test('A15-B-207 회전 직후 옛 refresh로 다시(29초) → 같은 세션 그대로, 끊김 없음', async (t) => {
    if (noDb(t)) return;
    t.mock.timers.enable({ apis: ['Date'], now: START_MS });
    const base = await startServer(t);
    const uuid = await createUser('a207');
    const first = await loginRemembered(uuid);
    const rotated = await refresh(base, first.refresh);
    assert.equal(rotated.status, 200, `준비: 첫 회전 실패 ${rotated.text}`);
    t.mock.timers.tick(29_000);
    const again = await refresh(base, first.refresh);
    assert.equal(again.status, 200);
    assert.ok(again.cookies.accessToken, '새 access 쿠키 없음');
    assert.equal(sessionIdOf(again.cookies.accessToken), sessionIdOf(first.access), '다른 세션이 됨');
    assert.equal(await profileStatus(base, rotated.cookies.accessToken), 200, '회전 때 받은 access가 끊김');
    assert.equal(await profileStatus(base, again.cookies.accessToken), 200, '다시 받은 access가 안 됨');
});

test('A15-B-208 회전 31초 뒤 옛 refresh → 401, 그 계정 세션 전부 끊김(두 기기 access 둘 다 401)', async (t) => {
    if (noDb(t)) return;
    t.mock.timers.enable({ apis: ['Date'], now: START_MS });
    const base = await startServer(t);
    const uuid = await createUser('a208');
    // 기기 1·2가 같은 세션 토큰을 쥠: 기기 1이 회전해 새 access를 받고, 기기 2는 옛 access·옛 refresh 그대로
    const device2 = await loginRemembered(uuid);
    const device1 = await refresh(base, device2.refresh);
    assert.equal(device1.status, 200, `준비: 첫 회전 실패 ${device1.text}`);
    assert.equal(await profileStatus(base, device1.cookies.accessToken), 200, '준비: 기기 1 access가 안 됨');
    t.mock.timers.tick(31_000);
    const reused = await refresh(base, device2.refresh);
    assert.equal(reused.status, 401);
    assert.equal(reused.cookies.accessToken, undefined, '재사용인데 새 access 쿠키가 나옴');
    assert.equal(await profileStatus(base, device1.cookies.accessToken), 401, '기기 1 access가 살아 있음');
    assert.equal(await profileStatus(base, device2.access), 401, '기기 2 access가 살아 있음');
});

test('A15-B-209 로그아웃 → 그 refresh로 POST /auth/refresh → 401, 새 쿠키 없음', async (t) => {
    if (noDb(t)) return;
    const base = await startServer(t);
    const uuid = await createUser('a209');
    const login = await loginRemembered(uuid);
    const out = await send(base, 'POST', '/auth/logout', { cookie: `${login.access}; ${login.refresh}` });
    assert.equal(out.status, 200, '준비: 로그아웃 실패');
    const res = await refresh(base, login.refresh);
    assert.equal(res.status, 401);
    assert.deepEqual(res.cookies, {}, '새 쿠키가 나옴');
});

test('A15-B-210 같은 announcementId로 POST /internal/announcements 두 번 → 한 사람 알림 한 줄, 둘째 답 duplicated', async (t) => {
    if (noDb(t)) return;
    // 시험 전용 안쪽 열쇠 (32자 넘는 가짜 글자, 진짜 값 아님)
    const key = 'a15-210-internal-key-for-test-only-000000';
    const base = await startRouterServer(t, [['/internal', createInternalRouter({ env: { INTERNAL_API_KEY: key } })]]);
    const uuid = await createUser('a210');
    const announcement = { announcementId: `a15-210-${uuid.slice(0, 8)}`, title: '점검 안내', body: '시험 공지 본문', target: 'users', userUuids: [uuid] };
    const headers = { 'x-internal-key': key };
    const first = await json(await send(base, 'POST', '/internal/announcements', { headers, body: announcement }));
    const second = await json(await send(base, 'POST', '/internal/announcements', { headers, body: announcement }));
    assert.equal(first.status, 200, `첫 공지 실패 ${first.text}`);
    assert.equal(first.body.created, 1);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicated, 1);
    assert.equal(second.body.created, 0);
    assert.equal(await db.Notification.count({ where: { user_id: uuid } }), 1);
});
