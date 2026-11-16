'use strict';

// 같은 때 두 곳에서 올리려 하면 한 곳만 도는지 봄 (MySQL 연결 둘로 흉내, 141은 잠금 기다림 30초를 진짜로 기다림)
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-141~144 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, migrationRunner, MIGRATIONS, EXPECTED_TABLES, noDb } = h;

const LOCK = 'al_f01_schema_migrations';

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

// 다른 연결로 잠금을 바로(0초) 잡아 보고 바로 놓음 → 잡혔으면 1
async function tryLockElsewhere(t) {
    const other = h.secondConnection();
    t.after(() => other.close());
    const got = Number(await h.scalar(other, 'SELECT GET_LOCK(:name, 0) AS got', { name: LOCK }));
    await other.query('SELECT RELEASE_LOCK(:name)', { replacements: { name: LOCK } });
    return got;
}

test('A16-B-141 다른 연결이 잠금을 쥐고 있으면 약 30초 기다린 뒤 거절, 표 0개 그대로', { timeout: 90_000 }, async (t) => {
    if (noDb(t)) return;
    await h.emptyDb();
    const holder = h.secondConnection();
    t.after(() => holder.close());
    assert.equal(Number(await h.scalar(holder, 'SELECT GET_LOCK(:name, 0) AS got', { name: LOCK })), 1);
    try {
        const startedAt = Date.now();
        await assert.rejects(
            migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS }),
            { message: /다른 마이그레이션 실행이 이미 진행 중입니다/ },
        );
        const waited = Date.now() - startedAt;
        // 잠금 기다림 30초 (±1.5초 폭)
        assert.ok(waited >= 28_500 && waited <= 31_500, `기다린 시간 ${waited}ms`);
        assert.deepEqual(await h.listTables(), []);
    } finally {
        await holder.query('SELECT RELEASE_LOCK(:name)', { replacements: { name: LOCK } });
    }
});

test('A16-B-142 두 연결이 같은 순간 올려도 이력 34줄·표 49개 한 벌만', { timeout: 120_000 }, async (t) => {
    if (noDb(t)) return;
    await h.emptyDb();
    const other = h.secondConnection();
    t.after(() => other.close());

    const results = await Promise.allSettled([
        migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS }),
        migrationRunner.applyMigrations({ sequelize: other, migrations: MIGRATIONS }),
    ]);

    const rows = await h.historyRows();
    assert.equal(rows.length, 34);
    assert.equal(new Set(rows.map((row) => row.name)).size, 34);
    assert.deepEqual(await h.listTables(), EXPECTED_TABLES);

    // 한쪽은 34개, 다른 쪽은 빈 목록 (앞쪽이 30초 넘으면 다른 쪽은 잠금 거절)
    const full = results.filter((r) => r.status === 'fulfilled' && r.value.applied.length === 34);
    const rest = results.filter((r) => !full.includes(r));
    assert.equal(full.length, 1, JSON.stringify(results.map((r) => r.status)));
    assert.equal(rest.length, 1);
    const [second] = rest;
    if (second.status === 'fulfilled') assert.deepEqual(second.value.applied, []);
    else assert.match(second.reason.message, /다른 마이그레이션 실행이 이미 진행 중입니다/);
});

test('A16-B-143 다 올리고 나면 잠금을 풂 (다른 연결이 바로 잡음)', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    assert.equal(await tryLockElsewhere(t), 1);
});

test('A16-B-144 시험용이 실패해도 잠금을 풂', async (t) => {
    if (noDb(t)) return;
    await h.restoreFull();
    await assert.rejects(
        migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: [...MIGRATIONS, h.failingMigration()] }),
        { message: '시험 실패' },
    );
    assert.equal(await tryLockElsewhere(t), 1);
});
