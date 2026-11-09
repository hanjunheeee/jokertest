'use strict';

// 관리자 표 마이그레이션 시험 (AD-001·002), 진짜 MySQL 시험 DB에 0031·0032 올리기·다시 돌리기·내리기 + 정지 판정 그대로
// npm run test:with-db -- tests/admin (F01_TEST_DATABASE_URL 없으면 건너뜀)
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
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { MIGRATIONS } = require('../../scripts/migrate-db');

const adminTables = require('../../db/migrations/0031-add-admin-page-tables');
const inquiries = require('../../db/migrations/0032-add-inquiries');

const { managedTables, dropOrder } = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

let sequelize;
test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    await sequelize.authenticate();
});
test.after(async () => {
    if (sequelize) await sequelize.close();
    if (TEST_DB_URL) await require('../../models').sequelize.close();
});

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

// 표·칸·인덱스 지금 모양 (비교용)
const snapshot = async () => {
    const qi = sequelize.getQueryInterface();
    const tables = new Set(await qi.showAllTables());
    const shape = {};
    for (const table of ['admin_users', 'admin_audit_logs', 'user_bans', 'admin_sessions', 'admin_login_attempts', 'inquiries', 'inquiry_replies']) {
        if (!tables.has(table)) { shape[table] = null; continue; }
        const columns = Object.keys(await qi.describeTable(table)).sort();
        const indexes = (await qi.showIndex(table)).map((i) => `${i.name}:${i.unique ? 'U' : ''}:${i.fields.map((f) => f.attribute).join(',')}`).sort();
        shape[table] = { columns, indexes };
    }
    return shape;
};

const freshSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables, dropOrder });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

test('AD-001: 0031·0032 적용 뒤 새 표·칸·인덱스·외래 키 있음 (목록 끝에 이 순서)', async (t) => {
    if (skipWithoutDb(t)) return;
    const names = MIGRATIONS.map((m) => m.name);
    assert.deepEqual(names.slice(-2), ['0031-add-admin-page-tables', '0032-add-inquiries']);
    await freshSchema();
    const shape = await snapshot();
    for (const column of ['email', 'totp_last_step', 'password_changed_at']) assert.ok(shape.admin_users.columns.includes(column), column);
    assert.ok(shape.admin_users.indexes.includes('admin_users_email_unique:U:email'));
    for (const column of ['reason', 'access_email', 'request_id']) assert.ok(shape.admin_audit_logs.columns.includes(column), column);
    assert.ok(shape.admin_audit_logs.indexes.includes('admin_audit_logs_action_created_idx::action,created_at'));
    for (const column of ['lifted_at', 'lifted_by', 'lift_reason']) assert.ok(shape.user_bans.columns.includes(column), column);
    assert.deepEqual(shape.admin_sessions.columns, ['access_email', 'admin_id', 'created_at', 'expires_at', 'id', 'ip', 'last_seen_at', 'revoked_at', 'user_agent']);
    assert.ok(shape.admin_sessions.indexes.includes('admin_sessions_admin_revoked_idx::admin_id,revoked_at'));
    assert.ok(shape.admin_sessions.indexes.includes('admin_sessions_expires_idx::expires_at'));
    assert.deepEqual(shape.admin_login_attempts.columns, ['access_email', 'admin_id', 'created_at', 'failure_code', 'id', 'ip', 'login_id', 'ok']);
    assert.ok(shape.admin_login_attempts.indexes.includes('admin_login_attempts_login_created_idx::login_id,created_at'));
    assert.ok(shape.admin_login_attempts.indexes.includes('admin_login_attempts_ip_created_idx::ip,created_at'));
    assert.deepEqual(shape.inquiries.columns, ['answered_at', 'body', 'category', 'created_at', 'id', 'status', 'title', 'updated_at', 'user_id']);
    assert.ok(shape.inquiries.indexes.includes('inquiries_status_created_idx::status,created_at'));
    assert.ok(shape.inquiries.indexes.includes('inquiries_user_created_idx::user_id,created_at'));
    assert.deepEqual(shape.inquiry_replies.columns, ['admin_id', 'body', 'created_at', 'id', 'inquiry_id', 'request_id']);
    assert.ok(shape.inquiry_replies.indexes.includes('inquiry_replies_request_id_unique:U:request_id'));
    assert.ok(shape.inquiry_replies.indexes.includes('inquiry_replies_inquiry_created_idx::inquiry_id,created_at'));
    // 문의 기본 상태 OPEN, 세션 id는 64자 글자 (쿠키 sha256)
    const described = await sequelize.getQueryInterface().describeTable('inquiries');
    assert.equal(described.status.defaultValue, 'OPEN');
    const sessions = await sequelize.getQueryInterface().describeTable('admin_sessions');
    assert.match(sessions.id.type, /CHAR\(64\)/i);
});

test('AD-001: 두 번 돌려도 같음 (up 다시 → 모양 그대로, verify 통과)', async (t) => {
    if (skipWithoutDb(t)) return;
    await freshSchema();
    const before = await snapshot();
    const qi = sequelize.getQueryInterface();
    for (const migration of [adminTables, inquiries]) {
        await migration.up(qi, Sequelize, sequelize);
        await migration.verify(qi, Sequelize, sequelize);
    }
    assert.deepEqual(await snapshot(), before);
});

test('AD-001: down 되돌림 (0032 → 0031 순서, 기존 칸은 남음) 뒤 다시 올리면 같은 모양', async (t) => {
    if (skipWithoutDb(t)) return;
    await freshSchema();
    const migrated = await snapshot();
    const qi = sequelize.getQueryInterface();
    await inquiries.down(qi, Sequelize, sequelize);
    await adminTables.down(qi, Sequelize, sequelize);
    const reverted = await snapshot();
    for (const table of ['admin_sessions', 'admin_login_attempts', 'inquiries', 'inquiry_replies']) assert.equal(reverted[table], null, table);
    assert.ok(!reverted.admin_users.columns.includes('email'));
    assert.ok(reverted.admin_users.columns.includes('login_id'));
    assert.ok(!reverted.admin_users.indexes.some((i) => i.startsWith('admin_users_email_unique')));
    assert.ok(!reverted.admin_audit_logs.columns.includes('request_id'));
    assert.ok(!reverted.admin_audit_logs.indexes.some((i) => i.startsWith('admin_audit_logs_action_created_idx')));
    assert.ok(!reverted.user_bans.columns.includes('lifted_at'));
    assert.ok(reverted.user_bans.columns.includes('is_permanent'));
    // down 두 번도 안전
    await inquiries.down(qi, Sequelize, sequelize);
    await adminTables.down(qi, Sequelize, sequelize);
    await adminTables.up(qi, Sequelize, sequelize);
    await inquiries.up(qi, Sequelize, sequelize);
    await adminTables.verify(qi, Sequelize, sequelize);
    await inquiries.verify(qi, Sequelize, sequelize);
    assert.deepEqual(await snapshot(), migrated);
});

// 사용자 한 명 넣기 → uuid
const insertUser = async () => {
    const uuid = crypto.randomUUID();
    await sequelize.query(
        'INSERT INTO users (uuid, password_hash, nickname, email, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        { replacements: [uuid, 'x', `ad002-${uuid.slice(0, 8)}`, `${uuid.slice(0, 8)}@ad002.test`] },
    );
    return uuid;
};

test('AD-002: 0031 뒤 기존 정지 판정 그대로 (해제 칸 비어도 걸림, 해제 = end_at 지금·영구 0이면 안 걸림)', async (t) => {
    if (skipWithoutDb(t)) return;
    await freshSchema();
    const { checkActiveBan } = require('../../repositories/user/loginGuard');
    const banned = await insertUser();
    const permanent = await insertUser();
    const lifted = await insertUser();
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 1000);
    // 앱과 같은 길(모델)로 넣음 (시각 바꾸는 규칙이 같게)
    const db = require('../../models');
    await db.UserBan.create({ user_id: banned, reason: '기간 정지', is_permanent: false, end_at: future });
    await db.UserBan.create({ user_id: permanent, reason: '영구 정지', is_permanent: true });
    await db.UserBan.create({
        user_id: lifted, reason: '영구였음', is_permanent: false, end_at: past,
        lifted_at: past, lifted_by: crypto.randomUUID(), lift_reason: '오해였음',
    });
    assert.equal((await checkActiveBan(banned))?.reason, '기간 정지');
    assert.equal((await checkActiveBan(permanent))?.reason, '영구 정지');
    assert.equal(await checkActiveBan(lifted), null);
    const [rows] = await sequelize.query('SELECT lifted_at, lifted_by, lift_reason FROM user_bans WHERE user_id = ?', { replacements: [banned] });
    assert.deepEqual(rows, [{ lifted_at: null, lifted_by: null, lift_reason: null }]);
    // 모델로 읽어도 새 칸이 보임 (해제 칸 이름)
    const row = await db.UserBan.findOne({ where: { user_id: lifted } });
    assert.equal(row.lift_reason, '오해였음');
});
