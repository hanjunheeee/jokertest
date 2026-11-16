'use strict';

// 이미 올린 마이그레이션 내용이 바뀌었을 때 알아채는지 + 서버 켜기 전 "준비됐는지 검사"가 진짜 DB에서 돌려주는 답·거절을 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-151~153·161~167 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, migrationRunner, MIGRATIONS, M, noDb } = h;
const { ensureSchemaReady, SCHEMA_NOT_READY } = require('../../db/schemaReadiness');

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

// 0034를 up 한 줄 다른 복사본으로 바꾼 목록 (진짜 파일은 그대로)
const original0034 = M('0034');
const changed0034 = {
    ...original0034,
    async up(queryInterface, Sequelize, sequelize) {
        // 시험이 바꾼 한 줄
        return original0034.up(queryInterface, Sequelize, sequelize);
    },
};
const changedList = [...MIGRATIONS.slice(0, 33), changed0034];

// 운영으로 검사 → SCHEMA_NOT_READY 오류 글
async function productionRejects(migrations) {
    let caught = null;
    try {
        await ensureSchemaReady(db.sequelize, { env: 'production', ...(migrations ? { migrations } : {}), warn: () => {} });
    } catch (error) {
        caught = error;
    }
    assert.ok(caught, '운영인데 거절 안 함');
    assert.equal(caught.code, SCHEMA_NOT_READY);
    return caught.message;
}

test('A16-B-151 올린 뒤 0034 내용이 바뀌면 올리기가 멈춤, 판 골드 값·0034 이력·뒤 시험용 표 그대로', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const before = await h.historyRow('0034-add-game-settings');
    await assert.rejects(
        migrationRunner.applyMigrations({
            sequelize: db.sequelize,
            migrations: [...changedList, h.tableMakingMigration('9906-test-after-change', 'zz_a16_after_change')],
        }),
        { message: /체크섬이 기록과 다릅니다/ },
    );
    assert.deepEqual(await h.select('SELECT `key`, value_int FROM game_settings'), [{ key: 'GAME_GOLD_REWARD', value_int: 1 }]);
    assert.deepEqual(await h.historyRow('0034-add-game-settings'), before);
    assert.equal((await h.listTables()).includes('zz_a16_after_change'), false);
});

test('A16-B-152 상태 보기가 바뀐 0034만 표시, 명령 status엔 0034 줄에 [체크섬 불일치]', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const rows = await migrationRunner.getStatus({ sequelize: db.sequelize, migrations: changedList });
    assert.deepEqual(rows.filter((row) => row.checksumMatches === false).map((row) => row.name), ['0034-add-game-settings']);
    assert.equal(rows.filter((row) => row.checksumMatches === true).length, 33);

    // 명령은 진짜 파일을 읽음 → 이력 쪽을 "바뀐 파일로 올린 기록"으로 맞춰 같은 어긋남을 만듦
    await h.select("UPDATE schema_migrations SET checksum = :checksum WHERE name = '0034-add-game-settings'", {
        checksum: migrationRunner.checksumOf(changed0034),
    });
    const cwd = h.makeTempDir();
    t.after(() => h.removeTempDir(cwd));
    const run = await h.runMigrateCommand(['status'], { cwd });
    const lines = run.stdout.split(/\r?\n/).filter((line) => /^ {2}\d{4}-/.test(line));
    const flagged = lines.filter((line) => line.includes('[체크섬 불일치]'));
    assert.equal(flagged.length, 1, run.stdout);
    assert.ok(flagged[0].includes('0034-add-game-settings'), flagged[0]);
});

test('A16-B-153 이력 쪽 0033 체크섬이 바뀌어도 올리기가 멈추고 상태 보기에 표시', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await h.select("UPDATE schema_migrations SET checksum = :checksum WHERE name = '0033-add-game-desertions'", { checksum: 'f'.repeat(64) });
    await assert.rejects(
        migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS }),
        { message: /체크섬이 기록과 다릅니다/ },
    );
    const rows = await migrationRunner.getStatus({ sequelize: db.sequelize, migrations: MIGRATIONS });
    assert.equal(rows.find((row) => row.name === '0033-add-game-desertions').checksumMatches, false);
});

test('A16-B-161 0034만 안 올렸으면 운영은 거절, 글에 그 이름, 표는 안 만듦', async (t) => {
    if (noDb(t)) return;
    await h.migrateTo(33);
    const message = await productionRejects();
    assert.ok(message.includes('안 돌린 마이그레이션 1개 [0034-add-game-settings]'), message);
    assert.equal((await h.listTables()).includes('game_settings'), false);
});

test('A16-B-162 0033·0034 둘 다 안 올렸으면 운영 거절 글에 둘 다', async (t) => {
    if (noDb(t)) return;
    await h.migrateTo(32);
    const message = await productionRejects();
    assert.ok(message.includes('안 돌린 마이그레이션 2개 [0033-add-game-desertions, 0034-add-game-settings]'), message);
});

test('A16-B-163 0034 줄이 failed면 운영 거절, 실패·멈춘 이름', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await h.select("UPDATE schema_migrations SET status = 'failed' WHERE name = '0034-add-game-settings'");
    const message = await productionRejects();
    assert.ok(message.includes('실패·멈춘 마이그레이션 [0034-add-game-settings]'), message);
});

test('A16-B-164 바뀐 0034 목록이면 운영 거절, 바뀐 이름', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const message = await productionRejects(changedList);
    assert.ok(message.includes('적용 뒤 파일이 바뀐 마이그레이션 [0034-add-game-settings]'), message);
});

test('A16-B-165 빈 DB면 34개 다 안 돌림, 검사 뒤에도 표 0개', async (t) => {
    if (noDb(t)) return;
    await h.emptyDb();
    const message = await productionRejects();
    assert.ok(message.includes('안 돌린 마이그레이션 34개'), message);
    assert.deepEqual(await h.listTables(), []);
});

test('A16-B-166 개발 값이면 안 던지고 경고 한 줄만, 표는 안 만듦', async (t) => {
    if (noDb(t)) return;
    await h.migrateTo(33);
    const warnings = [];
    const summary = await ensureSchemaReady(db.sequelize, { env: 'development', warn: (line) => warnings.push(line) });
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.pending, ['0034-add-game-settings']);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].startsWith('[STARTUP] 경고 — DB 표 준비 안 됨: '), warnings[0]);
    assert.equal((await h.listTables()).includes('game_settings'), false);
});

test('A16-B-167 다 올렸으면 운영도 통과, 세 목록 빔, 경고 0번', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    const warnings = [];
    const summary = await ensureSchemaReady(db.sequelize, { env: 'production', warn: (line) => warnings.push(line) });
    assert.deepEqual(summary, { ready: true, pending: [], broken: [], changed: [] });
    assert.equal(warnings.length, 0);
});
