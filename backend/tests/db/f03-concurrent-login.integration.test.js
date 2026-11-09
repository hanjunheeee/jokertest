'use strict';
// 새 계정 여럿 동시 첫 로그인 교착 시험 (브라우저 시험 E2·로그인 500, 2026-11-09)
// 세션 표 첫 문장 뒤 두 로그인을 맞춰 세워 두고 같이 다음 문장으로 보냄 (옛 순서면 늘 교착)

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'f03-concurrent-login-test-secret';

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
const addUserSessionsRefreshIndexes = require('../../db/migrations/0021-add-user-sessions-refresh-indexes');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const MIGRATIONS = [
    baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory,
    addSocialAuth, addPasswordResetTokens, addUserSessionsRefreshIndexes,
];
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

const db = require('../../models');
const userRepository = require('../../repositories/user');
const authService = require('../../services/auth/account');
const { hashPassword } = require('../../utils/auth/credentials');

test.after(async () => {
    if (sequelize) await sequelize.close();
    if (TEST_DB_URL) await db.sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) { t.skip('F01_TEST_DATABASE_URL 없음 (미검증)'); return true; }
    if (connectionError) { t.skip(`격리 DB 연결 실패 (미검증): ${connectionError.message}`); return true; }
    return false;
};

const PASSWORD = 'correct-horse-battery-1';
const REQ_INFO = { ip: '127.0.0.1', userAgent: 'f03-concurrent', deviceType: 'PC' };

const createUser = async (label) => {
    const uuid = crypto.randomUUID();
    const email = `${label}-${uuid}@example.com`;
    await db.User.create({
        uuid, password_hash: await hashPassword(PASSWORD), nickname: `${label}${uuid.slice(0, 6)}`, email,
    });
    await db.UserStats.create({ user_id: uuid });
    return { uuid, email };
};

// 정한 수만큼 모일 때까지 기다리는 문 (마지막 도착이 모두 풀어 줌)
const makeGate = (size) => {
    let arrived = 0;
    let open;
    const opened = new Promise((resolve) => { open = resolve; });
    return async () => {
        arrived += 1;
        if (arrived >= size) open();
        // 같은 계정 둘은 행 잠금으로 줄 서서 못 모임 → 오래 안 기다리고 지나감
        await Promise.race([opened, new Promise((resolve) => setTimeout(resolve, 1_500))]);
    };
};

// 트랜잭션마다 세션 표 첫 문장(끊기든 넣기든) 뒤에 문에서 기다리게 함
const holdAfterFirstSessionStatement = (t, size) => {
    const gate = makeGate(size);
    const seen = new WeakSet();
    const wrap = (name) => {
        const original = userRepository[name];
        t.mock.method(userRepository, name, async (...args) => {
            const result = await original(...args);
            const transaction = args[args.length - 1]?.transaction;
            if (transaction && !seen.has(transaction)) {
                seen.add(transaction);
                await gate();
            }
            return result;
        });
    };
    wrap('markOnlineSessionsOffline');
    wrap('createUserSession');
};

const setup = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

test('새 계정 둘이 같은 순간 첫 로그인해도 교착 없이 둘 다 세션 받음', async (t) => {
    if (unavailable(t)) return;
    await setup();
    const a = await createUser('ca');
    const b = await createUser('cb');
    holdAfterFirstSessionStatement(t, 2);

    const results = await Promise.allSettled([
        authService.login({ email: a.email, password: PASSWORD }, REQ_INFO),
        authService.login({ email: b.email, password: PASSWORD }, REQ_INFO),
    ]);
    const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
    assert.deepEqual(failed, []);

    for (const user of [a, b]) {
        const online = await db.UserSession.count({ where: { user_id: user.uuid, is_online: true, revoked_at: null } });
        assert.equal(online, 1);
    }
});

test('새 계정 여덟이 한꺼번에 로그인해도 전부 성공 (재시도 없이)', async (t) => {
    if (unavailable(t)) return;
    await setup();
    const users = [];
    for (let i = 0; i < 8; i += 1) users.push(await createUser(`m${i}`));
    holdAfterFirstSessionStatement(t, users.length);

    const results = await Promise.allSettled(
        users.map((u) => authService.login({ email: u.email, password: PASSWORD }, REQ_INFO)),
    );
    const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
    assert.deepEqual(failed, []);
    const online = await db.UserSession.count({ where: { is_online: true, revoked_at: null } });
    assert.equal(online, users.length);
});

test('이미 세션 있는 계정 둘이 동시에 다시 로그인해도 교착 없고, 사람마다 새 세션 하나만 남음', async (t) => {
    if (unavailable(t)) return;
    await setup();
    const a = await createUser('ra');
    const b = await createUser('rb');
    await authService.login({ email: a.email, password: PASSWORD }, REQ_INFO);
    await authService.login({ email: b.email, password: PASSWORD }, REQ_INFO);
    holdAfterFirstSessionStatement(t, 2);

    const results = await Promise.allSettled([
        authService.login({ email: a.email, password: PASSWORD }, REQ_INFO),
        authService.login({ email: b.email, password: PASSWORD }, REQ_INFO),
    ]);
    const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
    assert.deepEqual(failed, []);

    for (const [index, user] of [a, b].entries()) {
        const rows = await db.UserSession.findAll({ where: { user_id: user.uuid } });
        assert.equal(rows.length, 2);
        const online = rows.filter((row) => Number(row.is_online) === 1 && row.revoked_at === null);
        assert.equal(online.length, 1);
        // 남은 하나가 방금 받은 토큰의 세션
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(results[index].value.token, process.env.JWT_SECRET);
        assert.equal(online[0].id, decoded.sessionId);
    }
});

test('같은 계정 동시 로그인 둘 — 교착 없이 둘 다 성공, 살아 있는 세션은 마지막 하나', async (t) => {
    if (unavailable(t)) return;
    await setup();
    const a = await createUser('sa');
    holdAfterFirstSessionStatement(t, 2);

    const results = await Promise.allSettled([
        authService.login({ email: a.email, password: PASSWORD }, REQ_INFO),
        authService.login({ email: a.email, password: PASSWORD }, REQ_INFO),
    ]);
    const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
    assert.deepEqual(failed, []);
    const online = await db.UserSession.count({ where: { user_id: a.uuid, is_online: true, revoked_at: null } });
    assert.equal(online, 1);
});
