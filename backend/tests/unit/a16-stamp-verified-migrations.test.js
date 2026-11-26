'use strict';

// stamp-verified-migrations 복구 스크립트 단위 시험 (DB 연결 없이 가짜 sequelize로 검증)
// 메타 테이블 미생성·GET_LOCK/RELEASE_LOCK·sequelize.close 보장·0001 failed 조건부 해제·running 중단 확인
const test = require('node:test');
const assert = require('node:assert/strict');

const migrationRunner = require('../../db/migrationRunner');
const {
    BASELINE_NAME,
    STAMP_LOCK_TIMEOUT_SECONDS,
    runStampVerifiedMigrations,
} = require('../../scripts/stamp-verified-migrations');

// 가짜 sequelize 생성기: 메타 테이블 유무·초기 행·잠금 결과·오류 주입 지원
function createFakeDb({ hasMeta = false, initialRows = [], lockResult = 1, failOnInsert = false } = {}) {
    let metaExists = hasMeta;
    const rows = new Map(initialRows.map((r) => [r.name, { ...r }]));
    const calls = { locks: [], releases: 0, closed: 0, createdMeta: 0, queries: [] };

    const qi = {
        showAllTables: async () => (metaExists ? ['schema_migrations'] : []),
        createTable: async (name) => {
            if (name === 'schema_migrations') {
                metaExists = true;
                calls.createdMeta += 1;
            }
        },
    };

    const sequelize = {
        constructor: { INTEGER: 'INT', STRING: () => 'STR', DATE: 'DATE', TEXT: 'TEXT' },
        authenticate: async () => {},
        getQueryInterface: () => qi,
        close: async () => { calls.closed += 1; },
        query: async (sql, opts = {}) => {
            const trimmed = sql.trim();
            calls.queries.push({ sql: trimmed, replacements: opts.replacements });
            if (trimmed.startsWith('SELECT GET_LOCK')) {
                calls.locks.push(opts.replacements);
                return [[{ acquired: lockResult }]];
            }
            if (trimmed.startsWith('SELECT RELEASE_LOCK')) {
                calls.releases += 1;
                return [[{ released: 1 }]];
            }
            if (!metaExists) throw new Error("Table 'schema_migrations' doesn't exist");
            if (/^SELECT \*|^SELECT name, status FROM schema_migrations/i.test(trimmed)) {
                return [[...rows.values()]];
            }
            if (/WHERE name = :name/i.test(trimmed) && trimmed.startsWith('SELECT')) {
                const hit = rows.get(opts.replacements.name);
                return [hit ? [hit] : []];
            }
            if (trimmed.startsWith('DELETE FROM schema_migrations')) {
                rows.delete(opts.replacements.name);
                return [{ affectedRows: 1 }];
            }
            if (trimmed.startsWith('INSERT INTO schema_migrations')) {
                if (failOnInsert) throw new Error('insert 실패 주입');
                const { name, checksum } = opts.replacements;
                rows.set(name, { name, checksum, status: 'applied' });
                return [{ affectedRows: 1 }];
            }
            throw new Error(`예상 밖 SQL: ${trimmed}`);
        },
    };

    return { sequelize, rows, calls, hasMeta: () => metaExists };
}

const quietLogger = () => {
    const out = { logs: [], warns: [], errors: [] };
    return {
        out,
        log: (m) => out.logs.push(String(m)),
        warn: (m) => out.warns.push(String(m)),
        error: (m) => out.errors.push(String(m)),
    };
};

const sampleMigration = (name, passesVerify = true) => ({
    name,
    async up() {},
    async verify() {
        if (!passesVerify) throw new Error(`${name} verify 실패`);
    },
});

test('schema_migrations 미생성 DB에서 --dry-run 실행 시 죽지 않고 테이블도 안 만듦 + close 호출', async () => {
    const fake = createFakeDb({ hasMeta: false });
    const logger = quietLogger();
    const code = await runStampVerifiedMigrations({
        dryRun: true,
        confirm: false,
        sequelize: fake.sequelize,
        migrations: [sampleMigration(BASELINE_NAME, true), sampleMigration('0002-next', false)],
        logger,
    });
    assert.equal(code, 0);
    assert.equal(fake.hasMeta(), false);
    assert.equal(fake.calls.locks.length, 0);
    assert.equal(fake.calls.closed, 1);
    assert.ok(logger.out.logs.some((l) => l.includes(`[dry-run] 등록 예정: ${BASELINE_NAME}`)));
});

test('schema_migrations 미생성 DB에서 --confirm 실행 시 잠금(10초) → 테이블 생성 → 기록 → 잠금 해제·close', async () => {
    const fake = createFakeDb({ hasMeta: false });
    const logger = quietLogger();
    const code = await runStampVerifiedMigrations({
        dryRun: false,
        confirm: true,
        sequelize: fake.sequelize,
        migrations: [sampleMigration(BASELINE_NAME, true), sampleMigration('0002-next', false)],
        logger,
    });
    assert.equal(code, 0);
    assert.deepEqual(fake.calls.locks, [{ name: migrationRunner.LOCK_NAME, timeout: STAMP_LOCK_TIMEOUT_SECONDS }]);
    assert.equal(fake.calls.createdMeta, 1);
    assert.equal(fake.rows.get(BASELINE_NAME)?.status, 'applied');
    assert.equal(fake.rows.has('0002-next'), false);
    assert.equal(fake.calls.releases, 1);
    assert.equal(fake.calls.closed, 1);
});

test('0001-legacy-baseline이 failed여도 verify 실패(toStamp 미포함)면 failed 이력을 해제하지 않음', async () => {
    const fake = createFakeDb({
        hasMeta: true,
        initialRows: [{ name: BASELINE_NAME, checksum: '0'.repeat(64), status: 'failed' }],
    });
    const logger = quietLogger();
    const code = await runStampVerifiedMigrations({
        dryRun: false,
        confirm: true,
        sequelize: fake.sequelize,
        migrations: [sampleMigration(BASELINE_NAME, false), sampleMigration('0002-next', true)],
        logger,
    });
    assert.equal(code, 0);
    assert.equal(fake.rows.get(BASELINE_NAME)?.status, 'failed');
    assert.equal(fake.rows.get('0002-next')?.status, 'applied');
});

test('0001-legacy-baseline이 failed이고 verify 통과(toStamp 포함)면 정리 후 applied로 기록', async () => {
    const fake = createFakeDb({
        hasMeta: true,
        initialRows: [{ name: BASELINE_NAME, checksum: '0'.repeat(64), status: 'failed' }],
    });
    const logger = quietLogger();
    const code = await runStampVerifiedMigrations({
        dryRun: false,
        confirm: true,
        sequelize: fake.sequelize,
        migrations: [sampleMigration(BASELINE_NAME, true)],
        logger,
    });
    assert.equal(code, 0);
    assert.equal(fake.rows.get(BASELINE_NAME)?.status, 'applied');
});

test('running 상태 행이 있으면 덮어쓰지 않고 종료 코드 1 + 안내 출력 + 잠금 해제·close', async () => {
    const fake = createFakeDb({
        hasMeta: true,
        initialRows: [{ name: '0005-add-social-auth', checksum: '1'.repeat(64), status: 'running' }],
    });
    const logger = quietLogger();
    const code = await runStampVerifiedMigrations({
        dryRun: false,
        confirm: true,
        sequelize: fake.sequelize,
        migrations: [sampleMigration(BASELINE_NAME, true), sampleMigration('0005-add-social-auth', true)],
        logger,
    });
    assert.equal(code, 1);
    assert.equal(fake.rows.get('0005-add-social-auth')?.status, 'running');
    assert.equal(fake.rows.has(BASELINE_NAME), false);
    assert.ok(logger.out.errors.some((e) => e.includes('running') && e.includes('0005-add-social-auth')));
    assert.equal(fake.calls.releases, 1);
    assert.equal(fake.calls.closed, 1);
});

test('쓰기 도중 오류가 나도 finally에서 잠금 해제와 sequelize.close를 모두 수행', async () => {
    const fake = createFakeDb({ hasMeta: true, failOnInsert: true });
    const logger = quietLogger();
    await assert.rejects(
        runStampVerifiedMigrations({
            dryRun: false,
            confirm: true,
            sequelize: fake.sequelize,
            migrations: [sampleMigration(BASELINE_NAME, true)],
            logger,
        }),
        { message: 'insert 실패 주입' },
    );
    assert.equal(fake.calls.releases, 1);
    assert.equal(fake.calls.closed, 1);
});
