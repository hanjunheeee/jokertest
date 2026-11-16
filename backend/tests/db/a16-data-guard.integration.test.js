'use strict';

// 옛 마이그레이션이 "짐작하지 않고 멈춤"이라 적은 곳이 진짜로 멈추고 데이터를 안 건드리는지 봄 (기준선 일부만·모양 다름·고아 줄·지울 칸에 값)
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-281~285 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, Sequelize, migrationRunner, MIGRATIONS, M, iso, noDb } = h;

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

const apply = (migrations) => migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations });
const columnsOf = async (table) => Object.keys(await h.qi().describeTable(table));

// 0001만 올린 뒤 이력 표를 지워 "sync로 만든 DB"처럼 만듦 (회원 줄 하나 넣어 둠)
async function syncLikeBaseline() {
    await h.migrateTo(1);
    const userId = await h.createUser('dg');
    await iso.assertDedicatedTestDatabase(db.sequelize, h.TEST_DB_URL);
    await h.qi().dropTable('schema_migrations');
    return userId;
}

test('A16-B-281 기준선 14표 중 users·login_history만 있으면 0001이 멈춤, failed, 새 표 안 생김', async (t) => {
    if (noDb(t)) return;
    await h.emptyDb();
    const definitions = M('0001').buildDefinitions(Sequelize);
    for (const table of ['users', 'login_history']) await h.qi().createTable(table, definitions[table].columns);

    await assert.rejects(apply(MIGRATIONS), { message: /14개 테이블 중 일부\(2개\)만 존재/ });
    assert.equal((await h.historyRow('0001-legacy-baseline')).status, 'failed');
    assert.deepEqual(await h.listTables(), ['login_history', 'schema_migrations', 'users']);
});

test('A16-B-282 같은 모양 기준선 표가 이미 있으면 0001은 등록만, 줄 그대로, 끝까지 올라감', async (t) => {
    if (noDb(t)) return;
    const userId = await syncLikeBaseline();
    const result = await apply(MIGRATIONS);
    assert.equal(result.applied[0], '0001-legacy-baseline');
    assert.equal((await h.historyRow('0001-legacy-baseline')).status, 'applied');
    assert.equal(await h.count('users', 'uuid = :userId', { userId }), 1);
    const rows = await h.historyRows();
    assert.equal(rows.length, 34);
    assert.deepEqual([...new Set(rows.map((row) => row.status))], ['applied']);
});

test('A16-B-283 기준선과 모양이 다르면(회원 표 칸 하나 더) 0001이 멈춤, 칸·줄 그대로', async (t) => {
    if (noDb(t)) return;
    const userId = await syncLikeBaseline();
    await h.qi().addColumn('users', 'a16_extra', { type: Sequelize.STRING(10), allowNull: true });
    const columnsBefore = await columnsOf('users');

    // 멈춘 까닭에 더한 칸이 들어 있어야 함 (다른 까닭으로 멈춘 것과 구별)
    await assert.rejects(apply(MIGRATIONS), { message: /기존 DB 구조가 F-01 기준선과 다릅니다.*users: [^|]*a16_extra/ });
    assert.deepEqual(await columnsOf('users'), columnsBefore);
    assert.ok(columnsBefore.includes('a16_extra'));
    assert.equal(await h.count('users', 'uuid = :userId', { userId }), 1);
});

test('A16-B-284 0020: 없는 계정을 가리키는 oauth_states 줄이 있으면 멈춤, 그 줄 안 지움, 외래키 안 생김', async (t) => {
    if (noDb(t)) return;
    await h.migrateTo(19);
    await h.qi().removeConstraint('oauth_states', 'oauth_states_ibfk_1');
    const ghost = crypto.randomUUID();
    await h.insert('oauth_states', {
        state_hash: crypto.randomBytes(32).toString('hex'), purpose: 'LINK', user_id: ghost,
        browser_fingerprint_hash: crypto.randomBytes(32).toString('hex'), expires_at: new Date(), created_at: new Date(),
    });

    await assert.rejects(apply(MIGRATIONS.slice(0, 20)));
    assert.equal(await h.count('oauth_states', 'user_id = :ghost', { ghost }), 1);
    const references = await h.qi().getForeignKeyReferencesForTable('oauth_states');
    assert.equal(references.some((ref) => ref.columnName === 'user_id' && ref.referencedTableName === 'users'), false);
});

test('A16-B-285 0028: 지울 칸(users.phone)에 값이 있으면 아무것도 안 지움', async (t) => {
    if (noDb(t)) return;
    await h.migrateTo(27);
    const userId = await h.createUser('dg');
    await h.select("UPDATE users SET phone = '010-0000-0000' WHERE uuid = :userId", { userId });

    await assert.rejects(apply(MIGRATIONS.slice(0, 28)), { message: /값이 1개 있어 안 지움/ });
    assert.ok((await columnsOf('users')).includes('phone'));
    assert.ok((await columnsOf('user_sessions')).includes('last_ping_at'));
    assert.ok((await columnsOf('online_presence')).includes('current_room_id'));
    assert.ok((await h.listTables()).includes('traffic_logs'));
});
