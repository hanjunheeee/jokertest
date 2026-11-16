'use strict';

// 마이그레이션 파일의 down(되돌리기)이 그 파일이 만든 것만 지우는지, 데이터를 잃는 되돌리기는 거절하는지 봄 (뜻 있는 9개만)
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-171~179 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, M, noDb } = h;

// down은 DB 모양을 바꿈 → 시험마다 처음 모양에서 시작, 끝에도 되돌림
test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

const columnsOf = async (table) => Object.keys(await h.qi().describeTable(table));
const indexNames = async (table) => (await h.qi().showIndex(table)).map((index) => index.name);

test('A16-B-171 0034 down은 판 설정 표만 지움, 표 48개, 다른 표 줄 그대로', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const userId = await h.createUser('dn');
    await h.insert('game_desertions', { user_id: userId, game_id: crypto.randomUUID(), reason: 'LEFT_ALIVE', deserted_at: new Date(), blocked_until: new Date() });
    await h.insert('notifications', { id: crypto.randomUUID(), user_id: userId, type: 'TEST', source_key: 'a16:171', title: '시험', body: '시험', created_at: new Date() });

    await h.callStep(M('0034'), 'down');

    const tables = await h.listTables();
    assert.equal(tables.includes('game_settings'), false);
    assert.equal(tables.length, 48);
    assert.equal(await h.count('users', 'uuid = :userId', { userId }), 1);
    assert.equal(await h.count('game_desertions', 'user_id = :userId', { userId }), 1);
    assert.equal(await h.count('notifications', 'user_id = :userId', { userId }), 1);
});

test('A16-B-172 0033 down은 탈주 기록 표만 지움, 회원 줄·판 골드 줄 그대로, 표 48개', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const userId = await h.createUser('dn');

    await h.callStep(M('0033'), 'down');

    const tables = await h.listTables();
    assert.equal(tables.includes('game_desertions'), false);
    assert.equal(tables.length, 48);
    assert.equal(await h.count('users', 'uuid = :userId', { userId }), 1);
    assert.equal(await h.count('game_settings', "`key` = 'GAME_GOLD_REWARD'"), 1);
});

test('A16-B-173 0034 down 뒤 up이면 처음 값 1로 (관리자가 바꾼 5는 사라짐)', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await h.select("UPDATE game_settings SET value_int = 5, updated_by = :adminId WHERE `key` = 'GAME_GOLD_REWARD'", { adminId: crypto.randomUUID() });

    await h.callStep(M('0034'), 'down');
    await h.callStep(M('0034'), 'up');

    assert.deepEqual(await h.select('SELECT `key`, value_int, updated_by FROM game_settings'), [{ key: 'GAME_GOLD_REWARD', value_int: 1, updated_by: null }]);
});

test('A16-B-174 0033 down 뒤 up이면 칸·목차·외래키까지 다시 (verify 통과)', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await h.callStep(M('0033'), 'down');
    await h.callStep(M('0033'), 'up');

    await h.callStep(M('0033'), 'verify');
    assert.equal((await columnsOf('game_desertions')).length, 6);
    const names = await indexNames('game_desertions');
    for (const name of ['game_desertions_user_game_unique', 'game_desertions_user_deserted_idx', 'game_desertions_blocked_until_idx']) {
        assert.ok(names.includes(name), name);
    }
    const references = await h.qi().getForeignKeyReferencesForTable('game_desertions');
    assert.ok(references.some((ref) => ref.columnName === 'user_id' && ref.referencedTableName === 'users' && ref.referencedColumnName === 'uuid'));
});

test('A16-B-175 0031 down은 자기가 만든 것만: 새 두 표·더한 칸·목차만 빠지고 0024 것은 남음', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await h.callStep(M('0031'), 'down');

    const tables = await h.listTables();
    assert.equal(tables.includes('admin_sessions'), false);
    assert.equal(tables.includes('admin_login_attempts'), false);
    for (const table of ['admin_users', 'admin_audit_logs', 'user_bans']) assert.ok(tables.includes(table), table);

    const adminColumns = await columnsOf('admin_users');
    assert.equal(adminColumns.includes('email'), false);
    assert.ok(adminColumns.includes('login_id'));
    const adminIndexes = await indexNames('admin_users');
    assert.equal(adminIndexes.includes('admin_users_email_unique'), false);
    assert.ok(adminIndexes.includes('admin_users_login_id_unique'));
});

test('A16-B-176 0018 down은 결제 이력 표 되돌리기 거절, 두 표 그대로', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await assert.rejects(h.callStep(M('0018'), 'down'), { message: /down\(\)은 지원하지 않습니다 — 결제 이력을 지우는 파괴적 변경/ });
    const tables = await h.listTables();
    assert.ok(tables.includes('economy_currency_products'));
    assert.ok(tables.includes('economy_topup_orders'));
});

test('A16-B-177 0015 down(비번 재설정 토큰)도 거절, 칸 그대로', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await assert.rejects(h.callStep(M('0015'), 'down'), { message: /down\(\)은 지원하지 않습니다/ });
    assert.ok((await columnsOf('password_reset_tokens')).includes('token_hash'));
    assert.ok((await columnsOf('users')).includes('has_local_password'));
});

test('A16-B-178 0028 down은 칸·표 모양만 되살림, 회원 줄 phone은 빈 값', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const userId = await h.createUser('dn');

    await h.callStep(M('0028'), 'down');

    assert.ok((await columnsOf('users')).includes('phone'));
    assert.ok((await columnsOf('user_sessions')).includes('last_ping_at'));
    assert.ok((await columnsOf('online_presence')).includes('current_room_id'));
    assert.ok((await h.listTables()).includes('traffic_logs'));
    assert.deepEqual(await h.select('SELECT phone FROM users WHERE uuid = :userId', { userId }), [{ phone: null }]);
});

test('A16-B-179 닉네임 칸 줄이기(0002 down)는 31자 값이 있으면 거절, 칸 50·값 31자 그대로', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const userId = await h.createUser('dn');
    const gameId = crypto.randomUUID();
    await h.insert('game_results', { id: gameId, started_at: new Date(), ended_at: new Date(), winner: 'CITIZEN', day_index: 1, player_count: 5 });
    const nickname = 'n'.repeat(31);
    await h.insert('game_result_players', { game_id: gameId, user_id: userId, nickname_snapshot: nickname, role: 'CITIZEN', team: 'CITIZEN', is_alive: true });

    await assert.rejects(h.callStep(M('0002'), 'down'));

    const described = await h.qi().describeTable('game_result_players');
    assert.match(String(described.nickname_snapshot.type), /^varchar\(50\)$/i);
    const rows = await h.select('SELECT nickname_snapshot FROM game_result_players WHERE game_id = :gameId', { gameId });
    assert.equal(rows[0].nickname_snapshot.length, 31);
});
