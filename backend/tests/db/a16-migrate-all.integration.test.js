'use strict';

// 빈 시험 DB에 마이그레이션 0001~0034를 끝까지 올렸을 때 다 올라가고 표 49개·이력 34줄·처음 값 줄이 생기는지 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-101~108 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, migrationRunner, MIGRATIONS, NAMES, EXPECTED_TABLES, SEEDED_TABLES, noDb } = h;

let firstApply = null;

// 파일 처음: 빈 DB에 한 번 끝까지 올리고 돌려준 값 받아 둠 (101~107이 이 DB를 봄)
test.before(async () => {
    if (!h.TEST_DB_URL) return;
    await h.emptyDb();
    firstApply = await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
});

// 끝: 다음 사람이 쓰는 34개 처음 모양으로 되돌림
test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

test('A16-B-101 빈 DB에 34개가 다 올라가고 돌려준 목록이 차례 그대로, 마지막 0034', (t) => {
    if (noDb(t)) return;
    assert.ok(firstApply, '처음 올리기가 오류로 끝남');
    assert.deepEqual(firstApply.applied, NAMES);
    assert.equal(firstApply.applied.at(-1), '0034-add-game-settings');
});

test('A16-B-102 표가 정확히 49개 (탈주·판 설정·이력 표 있음, traffic_logs 없음)', async (t) => {
    if (noDb(t)) return;
    const tables = await h.listTables();
    assert.deepEqual(tables, EXPECTED_TABLES);
    assert.equal(tables.length, 49);
    for (const table of ['game_desertions', 'game_settings', 'schema_migrations']) assert.ok(tables.includes(table), table);
    assert.equal(tables.includes('traffic_logs'), false);
});

test('A16-B-103 이력 표 34줄이 다 applied, 체크섬 = 파일 값, 끝난 시각 있음, 오류 글 없음', async (t) => {
    if (noDb(t)) return;
    const rows = await h.historyRows();
    assert.equal(rows.length, 34);
    const byName = new Map(rows.map((row) => [row.name, row]));
    for (const migration of MIGRATIONS) {
        const row = byName.get(migration.name);
        assert.ok(row, `${migration.name} 줄 없음`);
        assert.equal(row.status, 'applied', migration.name);
        assert.equal(row.checksum, migrationRunner.checksumOf(migration), migration.name);
        assert.notEqual(row.finished_at, null, migration.name);
        assert.equal(row.error_message, null, migration.name);
    }
});

test('A16-B-104 판 골드 처음 줄 하나: GAME_GOLD_REWARD = 1, 바꾼 사람 빈 값', async (t) => {
    if (noDb(t)) return;
    const rows = await h.select('SELECT `key`, value_int, updated_by FROM game_settings');
    assert.deepEqual(rows, [{ key: 'GAME_GOLD_REWARD', value_int: 1, updated_by: null }]);
});

test('A16-B-105 점검 상태 줄은 처음부터 하나 (id 1, 꺼짐)', async (t) => {
    if (noDb(t)) return;
    const rows = await h.select('SELECT id, is_enabled FROM maintenance_state');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 1);
    assert.equal(Number(rows[0].is_enabled), 0);
});

test('A16-B-106 약관 자리 2개 (TERMS·PRIVACY 0.1-placeholder)', async (t) => {
    if (noDb(t)) return;
    const rows = await h.select('SELECT kind, version FROM terms_versions ORDER BY kind');
    assert.deepEqual(rows, [
        { kind: 'PRIVACY', version: '0.1-placeholder' },
        { kind: 'TERMS', version: '0.1-placeholder' },
    ]);
});

test('A16-B-107 처음 값 세 표·이력 표 말고 45개 표는 줄 0개', async (t) => {
    if (noDb(t)) return;
    const others = EXPECTED_TABLES.filter((table) => !SEEDED_TABLES.includes(table) && table !== 'schema_migrations');
    assert.equal(others.length, 45);
    const filled = [];
    for (const table of others) {
        const n = await h.count(table);
        if (n > 0) filled.push(`${table}=${n}`);
    }
    assert.deepEqual(filled, []);
});

test('A16-B-108 0032까지 올린 DB에 34개 목록으로 다시 올리면 새 두 개만, 앞 32줄 시각 그대로', async (t) => {
    if (noDb(t)) return;
    await h.migrateTo(32);
    const before = await h.historyRows();
    assert.equal(before.length, 32);

    const result = await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
    assert.deepEqual(result.applied, ['0033-add-game-desertions', '0034-add-game-settings']);

    const after = await h.historyRows();
    const afterByName = new Map(after.map((row) => [row.name, row]));
    for (const row of before) {
        const now = afterByName.get(row.name);
        assert.equal(now.started_at.getTime(), row.started_at.getTime(), `${row.name} 시작 시각이 바뀜`);
        assert.equal(now.finished_at.getTime(), row.finished_at.getTime(), `${row.name} 끝난 시각이 바뀜`);
    }
    assert.equal((await h.listTables()).length, 49);
});
