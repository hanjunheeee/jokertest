'use strict';

// 견본(도우미 쓰는 법 본보기) — 백엔드 DB 붙는 시험: 시험 DB를 비우고 마이그레이션 전부 올린 뒤 탈주 기록 표에 진짜로 쓰고 읽음
// 돌리기(저장소 쪽 잠금으로 한 줄 세움): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a09-sample-desertion.integration.test.js
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

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
const desertionRepository = require('../../repositories/game/desertion');

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음), 있으면 파일 처음에 한 번 비우고 끝까지 올림
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

// 시험마다 새 사람 (uuid가 달라 같은 파일 시험끼리 안 섞임)
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

test('견본-1 마이그레이션 34개가 다 올라가고 판 골드 값 첫 줄이 있음', async (t) => {
    if (noDb(t)) return;
    const rows = await migrationRunner.getStatus({ sequelize: db.sequelize, migrations: MIGRATIONS });
    assert.equal(rows.length, 34);
    assert.deepEqual(rows.filter((r) => r.status !== 'applied').map((r) => r.name), []);
    const [settings] = await db.sequelize.query('SELECT COUNT(*) AS n FROM game_settings');
    assert.ok(Number(settings[0].n) >= 1);
});

test('견본-2 같은 사람 같은 판 탈주 두 번째 줄은 DB가 막아 한 줄만 남음', async (t) => {
    if (noDb(t)) return;
    const userId = await createUser('smp');
    const gameId = crypto.randomUUID();
    const desertedAt = new Date('2026-11-16T03:00:00Z');
    const blockedUntil = new Date(desertedAt.getTime() + 5 * 60_000);

    const first = await desertionRepository.insertDesertion({ userId, gameId, reason: 'LEFT_ALIVE', desertedAt, blockedUntil });
    assert.equal(first.created, true);
    // 같은 판 두 번째 줄: 유일 찾기 목차(0033)가 막음
    await assert.rejects(
        db.GameDesertion.create({ user_id: userId, game_id: gameId, reason: 'DISCONNECT_TIMEOUT', deserted_at: desertedAt, blocked_until: blockedUntil }),
        { name: 'SequelizeUniqueConstraintError' },
    );
    // 겉으로 보이는 결과 = DB에 남은 줄
    const saved = await db.GameDesertion.findAll({ where: { user_id: userId }, raw: true });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].reason, 'LEFT_ALIVE');
});
