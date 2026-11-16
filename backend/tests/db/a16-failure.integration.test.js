'use strict';

// 올리다 실패했을 때 이력 표에 running·applied·failed가 어떻게 남고, 정리한 뒤 다시 할 수 있는지 + 명령 status·migrate 종료 코드 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-121~132 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, migrationRunner, MIGRATIONS, noDb } = h;

const FAIL_NAME = '9901-test-fail';

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

const apply = (migrations) => migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations });

// 끝까지 올린 DB + 시험용 실패 하나 (121·123·126·144 상태)
async function failedState() {
    await h.restoreFull();
    await assert.rejects(apply([...MIGRATIONS, h.failingMigration(FAIL_NAME)]), { message: '시험 실패' });
}

// 끝까지 올린 DB + running으로 멈춘 시험용 줄 직접 넣음 (124·127 상태)
async function runningState(name) {
    await h.restoreFull();
    await h.insert('schema_migrations', { name, checksum: '0'.repeat(64), status: 'running', started_at: new Date() });
}

test('A16-B-121 up이 오류 나면 같은 오류를 던지고 failed로 남음, 앞 34줄은 applied', async (t) => {
    if (noDb(t)) return;
    await failedState();
    const row = await h.historyRow(FAIL_NAME);
    assert.equal(row.status, 'failed');
    assert.equal(row.error_message, '시험 실패');
    assert.notEqual(row.finished_at, null);
    const others = (await h.historyRows()).filter((r) => r.name !== FAIL_NAME);
    assert.equal(others.length, 34);
    assert.deepEqual([...new Set(others.map((r) => r.status))], ['applied']);
});

test('A16-B-122 표는 만들고 verify에서 실패하면 failed + DDL 성공 표시, 만든 표는 남음', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const half = {
        name: '9902-test-half',
        async up(queryInterface, S) { await queryInterface.createTable('zz_a16_half', { id: { type: S.INTEGER, primaryKey: true } }); },
        async verify() { throw new Error('시험 verify 실패'); },
    };
    await assert.rejects(apply([...MIGRATIONS, half]), { message: '시험 verify 실패' });
    const row = await h.historyRow('9902-test-half');
    assert.equal(row.status, 'failed');
    assert.ok(row.error_message.startsWith('[DDL은 성공, 이후 단계(verify 또는 이력 기록)에서 실패]'), row.error_message);
    assert.ok((await h.listTables()).includes('zz_a16_half'));
});

test('A16-B-123 실패 이력이 있으면 다음 올리기를 거부, 뒤 시험용 표는 안 생김', async (t) => {
    if (noDb(t)) return;
    await failedState();
    const fixed = { name: FAIL_NAME, async up() {} };
    await assert.rejects(
        apply([...MIGRATIONS, fixed, h.tableMakingMigration('9903-test-make', 'zz_a16_after')]),
        { message: /실패 이력이 있어 무조건 재적용할 수 없습니다/ },
    );
    assert.equal((await h.historyRow(FAIL_NAME)).status, 'failed');
    assert.equal((await h.listTables()).includes('zz_a16_after'), false);
});

test('A16-B-124 running으로 남은 줄이 있으면 거부, 그 시험용 up은 안 돎', async (t) => {
    if (noDb(t)) return;
    const name = '9904-test-running';
    await runningState(name);
    let ran = false;
    await assert.rejects(
        apply([...MIGRATIONS, { name, async up() { ran = true; } }]),
        { message: /running 상태로 남아 있습니다/ },
    );
    assert.equal(ran, false);
    assert.equal((await h.historyRow(name)).status, 'running');
});

test('A16-B-125 도는 동안엔 자기 줄이 running(끝난 시각 빈 값), 끝나면 applied', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const name = '9905-test-peek';
    let seen = null;
    const peek = {
        name,
        async up(queryInterface, S, sequelize) {
            const [rows] = await sequelize.query('SELECT status, finished_at FROM schema_migrations WHERE name = :name', { replacements: { name } });
            seen = rows[0];
        },
    };
    await apply([...MIGRATIONS, peek]);
    assert.deepEqual(seen, { status: 'running', finished_at: null });
    assert.equal((await h.historyRow(name)).status, 'applied');
});

test('A16-B-126 실패 이력 정리 뒤 다시 올리면 applied', async (t) => {
    if (noDb(t)) return;
    await failedState();
    const cleared = await migrationRunner.resolveFailure({ sequelize: db.sequelize, name: FAIL_NAME, confirmRecovered: true });
    assert.deepEqual(cleared, { cleared: FAIL_NAME, previousStatus: 'failed' });
    assert.equal(await h.historyRow(FAIL_NAME), null);

    const result = await apply([...MIGRATIONS, { name: FAIL_NAME, async up() {} }]);
    assert.deepEqual(result.applied, [FAIL_NAME]);
    assert.equal((await h.historyRow(FAIL_NAME)).status, 'applied');
});

test('A16-B-127 running으로 멈춘 줄도 정리됨', async (t) => {
    if (noDb(t)) return;
    const name = '9904-test-running';
    await runningState(name);
    const cleared = await migrationRunner.resolveFailure({ sequelize: db.sequelize, name, confirmRecovered: true });
    assert.equal(cleared.previousStatus, 'running');
    assert.equal(await h.historyRow(name), null);
});

test('A16-B-128 잘 올라간 줄은 정리 거절, 줄 그대로', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await assert.rejects(
        migrationRunner.resolveFailure({ sequelize: db.sequelize, name: '0034-add-game-settings', confirmRecovered: true }),
        { message: /failed\/running 상태가 아닙니다 \(현재: applied\)/ },
    );
    assert.equal((await h.historyRow('0034-add-game-settings')).status, 'applied');
});

test('A16-B-129 없는 이름은 정리 거절', async (t) => {
    if (noDb(t)) return;
    await assert.rejects(
        migrationRunner.resolveFailure({ sequelize: db.sequelize, name: '9999-none', confirmRecovered: true }),
        { message: /실패 이력을 찾을 수 없습니다/ },
    );
});

test('A16-B-130 상태 보기는 읽기만: 빈 DB면 34개 다 pending, 이력 표도 안 만듦', async (t) => {
    if (noDb(t)) return;
    await h.emptyDb();
    const rows = await migrationRunner.getStatus({ sequelize: db.sequelize, migrations: MIGRATIONS });
    assert.equal(rows.length, 34);
    assert.deepEqual([...new Set(rows.map((row) => row.status))], ['pending']);
    assert.deepEqual([...new Set(rows.map((row) => row.checksumMatches))], [null]);
    assert.deepEqual(await h.listTables(), []);
});

// 명령 출력에서 이름·상태 줄만 (앞 공백 두 칸 + 네 자리 번호)
const statusLines = (stdout) => stdout.split(/\r?\n/).filter((line) => /^ {2}\d{4}-\S+\s+\S+/.test(line));

test('A16-B-131 명령 status: 다 적용이면 종료 0·34줄 applied, 0034 failed면 종료 1·복구 안내', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const cwd = h.makeTempDir();
    t.after(() => h.removeTempDir(cwd));

    const ok = await h.runMigrateCommand(['status'], { cwd });
    assert.equal(ok.code, 0, ok.stderr);
    const lines = statusLines(ok.stdout);
    assert.equal(lines.length, 34);
    assert.equal(lines.filter((line) => /\sapplied\s/.test(line)).length, 34);

    await h.select("UPDATE schema_migrations SET status = 'failed' WHERE name = '0034-add-game-settings'");
    const bad = await h.runMigrateCommand(['status'], { cwd });
    assert.equal(bad.code, 1);
    assert.ok(statusLines(bad.stdout).some((line) => line.includes('0034-add-game-settings') && /\sfailed\s/.test(line)), bad.stdout);
    assert.ok(bad.stdout.includes('복구 절차를 먼저 수행'), bad.stdout);
});

test('A16-B-132 명령 migrate: 0032 줄이 failed면 종료 1·차단 글, 새 두 표 안 생김', async (t) => {
    if (noDb(t)) return;
    await h.migrateTo(32);
    await h.select("UPDATE schema_migrations SET status = 'failed' WHERE name = '0032-add-inquiries'");
    const cwd = h.makeTempDir();
    t.after(() => h.removeTempDir(cwd));

    const run = await h.runMigrateCommand(['migrate'], { cwd });
    assert.equal(run.code, 1);
    assert.ok(`${run.stdout}\n${run.stderr}`.includes('무조건 재적용을 차단'), run.stderr);
    const tables = await h.listTables();
    assert.equal(tables.includes('game_desertions'), false);
    assert.equal(tables.includes('game_settings'), false);
});
