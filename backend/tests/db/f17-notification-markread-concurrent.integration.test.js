'use strict';
// 같은 알림 읽음 요청 둘이 동시에 올 때 시험 (바깥 화면 시험, 2026-11-09)
// 늦은 쪽이 옛 스냅샷으로 다시 읽어 readAt 빈 값을 돌려주던 문제: 둘 다 같은 읽음 시각을 받아야 함

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addNotifications = require('../../db/migrations/0012-add-notifications');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { MIGRATIONS } = require('../../scripts/migrate-db');

const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addNotifications, migrationRunner,
});

let sequelize;
let connectionError = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try { await sequelize.authenticate(); } catch (error) { connectionError = error; }
});

const db = require('../../models');
const notificationService = require('../../services/notification');
const notificationRepository = require('../../repositories/notification');

test.after(async () => {
    if (sequelize) await sequelize.close();
    if (TEST_DB_URL) await db.sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) { t.skip('F01_TEST_DATABASE_URL 없음 (미검증)'); return true; }
    if (connectionError) { t.skip(`격리 DB 연결 실패 (미검증): ${connectionError.message}`); return true; }
    return false;
};

// 두 요청이 첫 읽기를 마칠 때까지 서로 기다림 (잠금으로 줄 서면 못 모여 1.5초 뒤 그냥 감)
const holdAfterFirstRead = (t) => {
    let arrived = 0;
    let open;
    const opened = new Promise((resolve) => { open = resolve; });
    const seen = new WeakSet();
    const original = notificationRepository.findForUser;
    t.mock.method(notificationRepository, 'findForUser', async (...args) => {
        const result = await original(...args);
        const transaction = args[2];
        if (transaction && !seen.has(transaction)) {
            seen.add(transaction);
            arrived += 1;
            if (arrived >= 2) open();
            await Promise.race([opened, new Promise((resolve) => setTimeout(resolve, 1_500))]);
        }
        return result;
    });
};

test('같은 알림 읽음 요청 둘이 동시에 와도 둘 다 같은 readAt (빈 값 없음)', async (t) => {
    if (unavailable(t)) return;
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const userId = crypto.randomUUID();
    await db.User.create({ uuid: userId, password_hash: 'x', nickname: `mr${userId.slice(0, 6)}`, email: `mr-${userId}@example.com` });
    const { notification } = await notificationService.ensureSystemWelcome(userId);
    holdAfterFirstRead(t);

    const results = await Promise.all([
        notificationService.markRead(userId, notification.id),
        notificationService.markRead(userId, notification.id),
    ]);

    for (const result of results) {
        assert.ok(result.readAt, `readAt 비어 있음: ${JSON.stringify(result)}`);
    }
    assert.equal(new Date(results[0].readAt).getTime(), new Date(results[1].readAt).getTime());
    const stored = await db.Notification.findByPk(notification.id);
    assert.equal(new Date(stored.read_at).getTime(), new Date(results[0].readAt).getTime());
});
