'use strict';

// 새 표 두 개(0033 탈주 기록 game_desertions·0034 판 설정 값 game_settings)의 칸·빈 값·기본값·목차·겹치면 안 되는 묶음을 진짜 표에서 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-181~192 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, noDb } = h;

test.before(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
});

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

// 탈주 줄 하나 (빠진 칸은 기본으로 채움, undefined면 그 칸을 아예 안 넣음)
function desertionRow(userId, overrides = {}) {
    const row = {
        user_id: userId, game_id: crypto.randomUUID(), reason: 'LEFT_ALIVE',
        deserted_at: new Date('2026-11-16T03:00:00Z'), blocked_until: new Date('2026-11-16T03:05:00Z'), ...overrides,
    };
    for (const key of Object.keys(row)) if (row[key] === undefined) delete row[key];
    return row;
}

// 칸 모양 줄이기: 종류(대문자)·빈 값·기본 키·자동 번호
const shapeOf = (column) => ({
    type: String(column.type).toUpperCase(), allowNull: column.allowNull, primaryKey: column.primaryKey, autoIncrement: Boolean(column.autoIncrement),
});

test('A16-B-181 탈주 기록 표 칸이 정확히 6개 (종류·기본 키·자동 번호)', async (t) => {
    if (noDb(t)) return;
    const described = await h.qi().describeTable('game_desertions');
    assert.deepEqual(Object.keys(described), ['id', 'user_id', 'game_id', 'reason', 'deserted_at', 'blocked_until']);
    const id = shapeOf(described.id);
    assert.equal(id.type, 'BIGINT');
    assert.equal(id.primaryKey, true);
    assert.equal(id.autoIncrement, true);
    assert.equal(shapeOf(described.user_id).type, 'CHAR(36)');
    assert.equal(shapeOf(described.game_id).type, 'CHAR(36)');
    assert.equal(shapeOf(described.reason).type, 'VARCHAR(30)');
    assert.equal(shapeOf(described.deserted_at).type, 'DATETIME');
    assert.equal(shapeOf(described.blocked_until).type, 'DATETIME');
});

test('A16-B-182 탈주 기록 칸은 다 꼭 있어야 함 (사람 빈 값·막힘 시각 뺌·이유 빈 값 → 거절)', async (t) => {
    if (noDb(t)) return;
    const described = await h.qi().describeTable('game_desertions');
    for (const [name, column] of Object.entries(described)) assert.equal(column.allowNull, false, `${name} 빈 값 허용`);

    const userId = await h.createUser('nt');
    await h.expectDbReject(h.insert('game_desertions', desertionRow(null)));
    await h.expectDbReject(h.insert('game_desertions', desertionRow(userId, { blocked_until: undefined })));
    await h.expectDbReject(h.insert('game_desertions', desertionRow(userId, { reason: null })));
    assert.equal(await h.count('game_desertions', 'user_id = :userId', { userId }), 0);
});

test('A16-B-183 [지금 동작] 탈주 시각을 안 주면 넣은 순간 시각 (±5초)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('nt');
    await h.insert('game_desertions', desertionRow(userId, { deserted_at: undefined }));
    // DB 시계끼리 견줌 (시간대 차이 없게)
    const rows = await h.select('SELECT ABS(TIMESTAMPDIFF(SECOND, deserted_at, NOW())) AS gap FROM game_desertions WHERE user_id = :userId', { userId });
    assert.equal(rows.length, 1);
    assert.ok(Number(rows[0].gap) <= 5, `차이 ${rows[0].gap}초`);
});

test('A16-B-184 이유 칸은 30자까지 (LEFT_ALIVE 들어감, 31자 거절)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('nt');
    await h.insert('game_desertions', desertionRow(userId, { reason: 'LEFT_ALIVE' }));
    await h.expectDbReject(h.insert('game_desertions', desertionRow(userId, { reason: 'R'.repeat(31) })));
    assert.equal(await h.count('game_desertions', 'user_id = :userId', { userId }), 1);
});

test('A16-B-185 탈주 기록 목차 3개 (칸 차례·유일 여부)', async (t) => {
    if (noDb(t)) return;
    const indexes = await h.qi().showIndex('game_desertions');
    const pick = (name) => {
        const found = indexes.find((index) => index.name === name);
        assert.ok(found, `${name} 없음`);
        return { fields: found.fields.map((field) => field.attribute), unique: found.unique === true };
    };
    assert.deepEqual(pick('game_desertions_user_game_unique'), { fields: ['user_id', 'game_id'], unique: true });
    assert.deepEqual(pick('game_desertions_user_deserted_idx'), { fields: ['user_id', 'deserted_at'], unique: false });
    assert.deepEqual(pick('game_desertions_blocked_until_idx'), { fields: ['blocked_until'], unique: false });
});

test('A16-B-186 한 판에 한 사람 탈주 줄 하나 (두 번째 겹침 거절, 줄 1개)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('nt');
    const gameId = crypto.randomUUID();
    await h.insert('game_desertions', desertionRow(userId, { game_id: gameId }));
    await h.expectDuplicate(h.insert('game_desertions', desertionRow(userId, { game_id: gameId, reason: 'DISCONNECT_TIMEOUT' })), 'game_desertions_user_game_unique');
    assert.equal(await h.count('game_desertions', 'user_id = :userId', { userId }), 1);
});

test('A16-B-187 같은 사람이라도 다른 판이면 줄 둘', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('nt');
    await h.insert('game_desertions', desertionRow(userId));
    await h.insert('game_desertions', desertionRow(userId));
    assert.equal(await h.count('game_desertions', 'user_id = :userId', { userId }), 2);
});

test('A16-B-188 탈주 기록 사람 칸은 회원 표와 이어짐 (없는 회원 → 외래키 거절)', async (t) => {
    if (noDb(t)) return;
    const ghost = crypto.randomUUID();
    await h.expectForeignKeyReject(h.insert('game_desertions', desertionRow(ghost)));
    assert.equal(await h.count('game_desertions', 'user_id = :ghost', { ghost }), 0);
});

test('A16-B-189 판 칸은 판 기록 표와 안 이음 (없는 판도 들어감)', async (t) => {
    if (noDb(t)) return;
    const userId = await h.createUser('nt');
    const gameId = crypto.randomUUID();
    assert.equal(await h.count('game_results', 'id = :gameId', { gameId }), 0);
    await h.insert('game_desertions', desertionRow(userId, { game_id: gameId }));
    assert.equal(await h.count('game_desertions', 'game_id = :gameId', { gameId }), 1);
});

test('A16-B-190 판 설정 값 표 칸 4개·빈 값 (값 빈 채 넣기 거절)', async (t) => {
    if (noDb(t)) return;
    const described = await h.qi().describeTable('game_settings');
    assert.deepEqual(Object.keys(described), ['key', 'value_int', 'updated_at', 'updated_by']);
    assert.deepEqual(shapeOf(described.key), { type: 'VARCHAR(60)', allowNull: false, primaryKey: true, autoIncrement: false });
    assert.equal(shapeOf(described.value_int).type, 'INT');
    assert.equal(described.value_int.allowNull, false);
    assert.equal(shapeOf(described.updated_at).type, 'DATETIME');
    assert.equal(described.updated_at.allowNull, false);
    assert.equal(shapeOf(described.updated_by).type, 'CHAR(36)');
    assert.equal(described.updated_by.allowNull, true);

    await h.expectDbReject(h.insert('game_settings', { key: 'A16_NULL_VALUE', value_int: null, updated_at: new Date() }));
    assert.equal(await h.count('game_settings', "`key` = 'A16_NULL_VALUE'"), 0);
});

test('A16-B-191 같은 값 이름은 한 줄만 (GAME_GOLD_REWARD 하나 더 → 기본 키 겹침, 값 1 그대로)', async (t) => {
    if (noDb(t)) return;
    await h.expectDuplicate(h.insert('game_settings', { key: 'GAME_GOLD_REWARD', value_int: 9, updated_at: new Date() }), 'PRIMARY');
    assert.deepEqual(await h.select("SELECT value_int FROM game_settings WHERE `key` = 'GAME_GOLD_REWARD'"), [{ value_int: 1 }]);
});

test('A16-B-192 바꾼 관리자 칸은 관리자 표와 안 이음 (없는 관리자 uuid도 들어감)', async (t) => {
    if (noDb(t)) return;
    const ghostAdmin = crypto.randomUUID();
    await h.select("UPDATE game_settings SET updated_by = :ghostAdmin WHERE `key` = 'GAME_GOLD_REWARD'", { ghostAdmin });
    assert.deepEqual(await h.select("SELECT updated_by FROM game_settings WHERE `key` = 'GAME_GOLD_REWARD'"), [{ updated_by: ghostAdmin }]);
});
