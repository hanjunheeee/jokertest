'use strict';

// 이미 끝까지 올린 시험 DB에 또 올려도 오류 없고, 이력 줄·처음 값 줄·관리자가 바꾼 값을 안 덮는지 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-111~117 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, migrationRunner, MIGRATIONS, EXPECTED_TABLES, M, noDb } = h;

// 첫 번째 올린 뒤 이력 줄 (112가 견줌)
let firstRows = null;

test.before(async () => {
    if (!h.TEST_DB_URL) return;
    await h.restoreFull();
    firstRows = await h.historyRows();
});

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

const goldRow = async () => (await h.select('SELECT `key`, value_int, updated_by FROM game_settings'));

test('A16-B-111 두 번째 올리기는 아무것도 안 함 (적용 0개, 건너뜀 34줄, 표 49개)', async (t) => {
    if (noDb(t)) return;
    const logs = [];
    const result = await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS, logger: (line) => logs.push(line) });
    assert.deepEqual(result.applied, []);
    const skipped = logs.filter((line) => /^skip \S+ \(이미 적용됨\)$/.test(line));
    assert.equal(skipped.length, 34);
    assert.deepEqual(await h.listTables(), EXPECTED_TABLES);
});

test('A16-B-112 두 번째 올리기 뒤 이력 줄이 안 늘고 번호·시각·체크섬이 첫 번째와 같음', async (t) => {
    if (noDb(t)) return;
    // 111이 따로 돌았을 때도 두 번째 올리기가 있게 한 번 더
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
    const now = await h.historyRows();
    assert.equal(now.length, 34);
    const pick = (rows) => rows.map((row) => ({
        id: row.id, name: row.name, checksum: row.checksum,
        started_at: row.started_at.getTime(), finished_at: row.finished_at.getTime(),
    }));
    assert.deepEqual(pick(now), pick(firstRows));
});

test('A16-B-113 관리자가 바꾼 판 골드(5)는 다시 올려도 그대로', async (t) => {
    if (noDb(t)) return;
    const adminId = crypto.randomUUID();
    await h.select('UPDATE game_settings SET value_int = 5, updated_by = :adminId WHERE `key` = :key', { adminId, key: 'GAME_GOLD_REWARD' });
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
    assert.deepEqual(await goldRow(), [{ key: 'GAME_GOLD_REWARD', value_int: 5, updated_by: adminId }]);
});

test('A16-B-114 0034 up을 이력 없이 또 불러도 값(7)을 안 덮음', async (t) => {
    if (noDb(t)) return;
    await h.select('UPDATE game_settings SET value_int = 7 WHERE `key` = :key', { key: 'GAME_GOLD_REWARD' });
    await h.callStep(M('0034'), 'up');
    const rows = await goldRow();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].value_int, 7);
});

test('A16-B-115 처음 줄이 없을 때만 0034 up이 다시 넣음 (1, 바꾼 사람 빈 값)', async (t) => {
    if (noDb(t)) return;
    await h.select('DELETE FROM game_settings');
    await h.callStep(M('0034'), 'up');
    assert.deepEqual(await goldRow(), [{ key: 'GAME_GOLD_REWARD', value_int: 1, updated_by: null }]);
});

test('A16-B-116 0033: 목차 하나가 빠진 표에 up을 다시 부르면 채움, 탈주 줄 2개 그대로, verify 통과', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('rr');
    const at = new Date('2026-11-16T03:00:00Z');
    const until = new Date('2026-11-16T03:05:00Z');
    for (let i = 0; i < 2; i += 1) {
        await h.insert('game_desertions', { user_id: userId, game_id: crypto.randomUUID(), reason: 'LEFT_ALIVE', deserted_at: at, blocked_until: until });
    }
    await h.qi().removeIndex('game_desertions', 'game_desertions_blocked_until_idx');

    await h.callStep(M('0033'), 'up');

    const names = (await h.qi().showIndex('game_desertions')).map((index) => index.name);
    for (const name of ['game_desertions_user_game_unique', 'game_desertions_user_deserted_idx', 'game_desertions_blocked_until_idx']) {
        assert.equal(names.filter((n) => n === name).length, 1, `${name} 목차 수`);
    }
    assert.equal(await h.count('game_desertions', 'user_id = :userId', { userId }), 2);
    await h.callStep(M('0033'), 'verify');
});

test('A16-B-117 점검을 켜 둔 값도 0024 up을 다시 불러도 그대로', async (t) => {
    if (noDb(t)) return;
    await h.select("UPDATE maintenance_state SET is_enabled = 1, message = '점검 중' WHERE id = 1");
    await h.callStep(M('0024'), 'up');
    const rows = await h.select('SELECT id, is_enabled, message FROM maintenance_state');
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].is_enabled), 1);
    assert.equal(rows[0].message, '점검 중');
});
