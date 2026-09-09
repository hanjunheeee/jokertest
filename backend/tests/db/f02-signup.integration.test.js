'use strict';

// F-02 AC-05/AC-06 격리 DB 검증 — 실제 MySQL 격리 DB에서만 의미 있는 두 가지를 확인한다:
//   1) AC-05: 같은 이메일로 동시에 가입을 시도하면 DB 유일 제약에 의해 하나만 성공하고
//      나머지는 409를 받는다(서비스 계층의 사전 findByEmail만으로는 경합을 못 막는다).
//   2) AC-06: 관리 필드(role/status/email_verified)를 얹어 가입해도 저장되지 않고,
//      가입 후 같은 자격증명으로 재로그인이 성공한다.
//
// backend/tests/db/f01-migrations.integration.test.js와 같은 원칙을 따른다: 전용 격리
// DB(F01_TEST_DATABASE_URL)가 없거나 연결에 실패하면 실패로 표시하지 않고 t.skip으로
// "미검증"임을 남긴다 — .env.test의 더미 DATABASE_URL은 이 용도로 재사용하지 않는다.

const test = require('node:test');
const assert = require('node:assert/strict');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
if (TEST_DB_URL) process.env.DATABASE_URL = TEST_DB_URL;

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');

const MIGRATIONS = [baseline, expandNicknameSnapshot];
const MANAGED_TABLES = [...baseline.TABLE_ORDER, migrationRunner.META_TABLE];
const DROP_ORDER = [...baseline.TABLE_ORDER].reverse().concat([migrationRunner.META_TABLE]);

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
            `격리 DB에 F-01이 모르는 테이블이 있습니다: [${unknown.join(', ')}]. ` +
            `전용 테스트 DB가 맞는지 확인하세요 — 안전을 위해 진행을 거부합니다.`,
        );
    }
    for (const table of DROP_ORDER) {
        if (existing.has(table)) await queryInterface.dropTable(table);
    }
};

const VALID_SIGNUP_BASE = {
    password: 'pw12345678',
    passwordConfirm: 'pw12345678',
    birthDate: '2000-01-01',
};

// backend/models와 auth.service.js/user.repositories.js는 require 캐시 싱글턴이라, 파일
// 맨 위에서 이미 맞춰둔 process.env.DATABASE_URL(F01_TEST_DATABASE_URL)로 처음 require되는
// 이 시점에 격리 DB에 연결된다 — 실제 저장 경로(auth.service → user.repositories → Sequelize)를
// 그대로 태운다.
const db = require('../../models');
const authService = require('../../service/auth.service');

// ── AC-05 ───────────────────────────────────────────────────────────────────

test('AC-05: 같은 이메일로 동시에 가입을 시도하면 하나만 성공하고 나머지는 409를 받는다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    t.after(async () => { await db.sequelize.close(); });

    const email = 'concurrent-signup@example.com';
    const attempts = await Promise.allSettled([
        authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: '동시가입1' }),
        authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: '동시가입2' }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');

    assert.equal(fulfilled.length, 1, '정확히 하나만 성공해야 한다');
    assert.equal(rejected.length, 1, '나머지 하나는 실패해야 한다');
    assert.equal(rejected[0].reason.status, 409, '실패 원인은 409 유일 제약 충돌이어야 한다');

    const [rows] = await sequelize.query('SELECT COUNT(*) AS cnt FROM users WHERE email = :email', {
        replacements: { email },
    });
    assert.equal(Number(rows[0].cnt), 1, 'users 테이블에는 정확히 한 행만 남아야 한다');
});

// ── AC-06 ───────────────────────────────────────────────────────────────────

test('AC-06: role/status/email_verified를 실어 보내도 저장되지 않고, 가입 후 재로그인이 성공한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    t.after(async () => { await db.sequelize.close(); });

    const email = 'ac06-signup@example.com';
    const created = await authService.signup({
        ...VALID_SIGNUP_BASE,
        email,
        nickname: 'AC06유저',
        role: 'ADMIN',
        status: 'BANNED',
        email_verified: true,
    });

    const [rows] = await sequelize.query(
        'SELECT role, status, email_verified FROM users WHERE uuid = :uuid',
        { replacements: { uuid: created.uuid } },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'USER', '관리 필드로 보낸 role이 아니라 기본값이어야 한다');
    assert.equal(rows[0].status, 'ACTIVE', '관리 필드로 보낸 status가 아니라 기본값이어야 한다');
    assert.equal(Number(rows[0].email_verified), 0, '관리 필드로 보낸 email_verified가 아니라 기본값(false)이어야 한다');

    const { user, token } = await authService.login(
        { email, password: VALID_SIGNUP_BASE.password },
        { ip: '127.0.0.1', userAgent: 'test-agent', deviceType: 'desktop' },
    );
    assert.equal(user.uuid, created.uuid);
    assert.ok(token, '재로그인은 토큰을 발급해야 한다');
});
