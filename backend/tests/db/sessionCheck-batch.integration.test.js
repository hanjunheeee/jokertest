'use strict';

// 진짜 DB 시험: 소켓 세션 확인 묶음 질의(SQL 하나)가 옛 두 질의(세션·정지)와 같은 판정을 내는지 + 여럿을 질의 하나로 묻는지
// 근거: docs/부하시험.md 11번 (세션·정지 확인이 DB 질의 96%), F01_TEST_DATABASE_URL 없으면 건너뜀
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'session-check-batch-integration-secret';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addPasswordResetTokens = require('../../db/migrations/0015-password-reset-tokens');
// 정지 모델이 0031 해제 칸(lifted_at 등)까지 읽음 → 0031과 그 앞 표(0024 관리자 계정·기록)·0032 같이 올림
const addOperationsTables = require('../../db/migrations/0024-add-operations-tables');
const addAdminPageTables = require('../../db/migrations/0031-add-admin-page-tables');
const addInquiries = require('../../db/migrations/0032-add-inquiries');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory, addSocialAuth, addPasswordResetTokens, addOperationsTables, addAdminPageTables, addInquiries];
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
        t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 DB 없이는 못 봄 (미검증)');
        return true;
    }
    if (connectionError) {
        t.skip(`격리 DB 연결 실패 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

const db = require('../../models');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const sessionCheckRepository = require('../../repositories/user/sessionCheck');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

// 사람 하나 + 세션 하나 (덧붙일 칸은 바꿔 넣음)
const makeUserWithSession = async (label, { user = {}, session = {} } = {}) => {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid, password_hash: 'x', nickname: `${label}${uuid.slice(0, 6)}`, email: `${label}-${uuid}@example.com`, ...user,
    });
    const sessionId = crypto.randomUUID();
    await db.UserSession.create({ id: sessionId, user_id: uuid, is_online: true, ...session });
    return { uuid, sessionId };
};

// 옛 길(http)과 묶음 길(소켓) 판정이 같은지, 판정 결과 돌려줌
const bothPaths = async (decoded) => {
    const http = await sessionLifecycle.resolveSession(decoded);
    const socket = await sessionLifecycle.resolveSession(decoded, { batch: true });
    assert.deepEqual(socket, http, `묶음 길 판정이 옛 길과 다름: ${JSON.stringify({ http, socket })}`);
    return socket;
};

test('묶음 질의: 살아 있음·끊김·남의 세션·정지(지금·예약·끝남)·비활성·지운 계정·refresh 만료 판정이 옛 두 질의와 같음', async (t) => {
    if (unavailable(t)) return;
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    const hour = 60 * 60 * 1000;

    const alive = await makeUserWithSession('alive');
    assert.deepEqual(await bothPaths(alive), { ok: true });

    const revoked = await makeUserWithSession('revoked', { session: { is_online: false, revoked_at: new Date() } });
    assert.equal((await bothPaths(revoked)).status, 401);

    // 세션 id는 맞는데 토큰 uuid가 남의 것
    assert.equal((await bothPaths({ uuid: revoked.uuid, sessionId: alive.sessionId })).status, 401);

    const futureBan = await makeUserWithSession('futureban');
    await db.UserBan.create({ user_id: futureBan.uuid, reason: '예약', start_at: new Date(Date.now() + hour), end_at: new Date(Date.now() + 2 * hour) });
    assert.deepEqual(await bothPaths(futureBan), { ok: true });

    const endedBan = await makeUserWithSession('endedban');
    await db.UserBan.create({ user_id: endedBan.uuid, reason: '끝남', start_at: new Date(Date.now() - 2 * hour), end_at: new Date(Date.now() - hour) });
    assert.deepEqual(await bothPaths(endedBan), { ok: true });

    const inactive = await makeUserWithSession('inactive', { user: { status: 'SUSPENDED' } });
    assert.equal((await sessionLifecycle.resolveSession(inactive, { batch: true })).code, 'ACCOUNT_INACTIVE');

    const deletedUser = await makeUserWithSession('deleted', { user: { status: 'WITHDRAWN' } });
    await db.User.destroy({ where: { uuid: deletedUser.uuid } });
    assert.deepEqual(await bothPaths(deletedUser), { ok: true }, '지운 계정은 상태 없음 → 세션만 봄 (옛 길과 같음, 탈퇴는 세션을 따로 끊음)');

    const refreshExpired = await makeUserWithSession('refreshexp', { session: { refresh_token_expires_at: new Date(Date.now() - 1000) } });
    assert.equal((await bothPaths(refreshExpired)).status, 401);
    const refreshAlive = await makeUserWithSession('refreshok', { session: { refresh_token_expires_at: new Date(Date.now() + hour) } });
    assert.deepEqual(await bothPaths(refreshAlive), { ok: true });

    // 지금 정지: 묶음 길도 403 + 세션 끊음 (끊은 뒤엔 옛 길도 401)
    const banned = await makeUserWithSession('banned');
    await db.UserBan.create({ user_id: banned.uuid, reason: '욕설', is_permanent: true });
    const bannedResult = await sessionLifecycle.resolveSession(banned, { batch: true });
    assert.equal(bannedResult.code, 'ACCOUNT_BANNED');
    assert.match(bannedResult.message, /욕설/);
    const after = await db.UserSession.findByPk(banned.sessionId);
    assert.equal(Number(after.is_online), 0);
});

test('묶음 질의: 같은 차례에 온 확인 여럿(주기 검사)은 SELECT 하나로 묻고 사람마다 맞는 답', async (t) => {
    if (unavailable(t)) return;
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const people = [];
    for (let i = 0; i < 6; i += 1) people.push(await makeUserWithSession(`many${i}`));
    await db.UserSession.update({ is_online: false, revoked_at: new Date() }, { where: { id: people[2].sessionId } });

    const queries = [];
    const original = db.sequelize.options.logging;
    db.sequelize.options.logging = (sql) => queries.push(sql);
    t.after(() => { db.sequelize.options.logging = original; });

    const results = await Promise.all(people.map((p) => sessionLifecycle.resolveSession(p, { batch: true })));
    db.sequelize.options.logging = original;

    assert.equal(queries.length, 1, `질의 수: ${queries.length}`);
    assert.deepEqual(results.map((r) => r.ok), [true, true, false, true, true, true]);
    assert.ok(sessionCheckRepository.MAX_IDS_PER_QUERY >= 100);
});
