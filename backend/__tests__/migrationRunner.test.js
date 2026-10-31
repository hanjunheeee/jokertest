'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const migrationRunner = require('../db/migrationRunner');

const createFakeSequelize = ({ failOn = () => false } = {}) => {
    const rows = [];
    const queryInterface = { showAllTables: async () => ['schema_migrations'] };

    const sequelize = {
        constructor: {}, // ensureMetaTable은 showAllTables에 이미 포함돼 있어 createTable을 타지 않으므로 타입이 필요 없다
        getQueryInterface: () => queryInterface,
        query: async (sql, options = {}) => {
            const replacements = options.replacements || {};
            const trimmed = sql.trim();
            if (failOn(trimmed, replacements)) {
                throw new Error(`시뮬레이션된 DB 오류: ${trimmed.slice(0, 60)}`);
            }
            if (trimmed.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
            if (trimmed.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]];
            if (trimmed.startsWith('SELECT id, name, checksum')) {
                const row = rows.find((r) => r.name === replacements.name);
                return [row ? [{ ...row }] : []];
            }
            if (trimmed.startsWith('INSERT INTO')) {
                rows.push({
                    name: replacements.name,
                    checksum: replacements.checksum,
                    status: 'running',
                    started_at: new Date(0),
                    finished_at: null,
                    error_message: null,
                });
                return [{}];
            }
            if (trimmed.startsWith('UPDATE')) {
                const row = rows.find((r) => r.name === replacements.name);
                if (row) {
                    row.status = replacements.status;
                    row.checksum = replacements.checksum;
                    row.finished_at = new Date(1);
                    row.error_message = replacements.errorMessage;
                }
                return [{}];
            }
            if (trimmed.startsWith('DELETE FROM')) {
                const idx = rows.findIndex((r) => r.name === replacements.name);
                if (idx >= 0) rows.splice(idx, 1);
                return [{}];
            }
            if (trimmed.startsWith('SELECT * FROM')) {
                return [rows.map((r) => ({ ...r }))];
            }
            throw new Error(`fake sequelize가 처리할 수 없는 쿼리: ${trimmed}`);
        },
    };
    return { sequelize, rows };
};

const makeMigration = (name, { up, verify } = {}) => ({
    name,
    up: up || (async () => {}),
    ...(verify ? { verify } : {}),
});

const findRowByName = (rows, name) => rows.find((r) => r.name === name);

test('applyMigrations: up()만 성공하면 applied로 기록된다', async () => {
    const { sequelize, rows } = createFakeSequelize();
    const migration = makeMigration('m1');

    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: [migration] });

    assert.deepEqual(applied, ['m1']);
    assert.equal(findRowByName(rows, 'm1').status, 'applied');
});

test('applyMigrations: 이미 applied인 마이그레이션은 up()을 다시 호출하지 않고 건너뛴다', async () => {
    const { sequelize } = createFakeSequelize();
    let calls = 0;
    const migration = makeMigration('m1', { up: async () => { calls += 1; } });

    await migrationRunner.applyMigrations({ sequelize, migrations: [migration] });
    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: [migration] });

    assert.deepEqual(applied, []);
    assert.equal(calls, 1, 'up()은 최초 1번만 호출돼야 한다');
});

test('applyMigrations: up()이 던지면 failed로 기록되고 에러가 전파된다', async () => {
    const { sequelize, rows } = createFakeSequelize();
    const migration = makeMigration('m1', { up: async () => { throw new Error('DDL 실패'); } });

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [migration] }),
        /DDL 실패/,
    );

    const row = findRowByName(rows, 'm1');
    assert.equal(row.status, 'failed');
    assert.ok(row.error_message.includes('DDL 실패'));
    assert.ok(!row.error_message.includes('DDL은 성공'), 'DDL 자체가 실패했을 때는 "DDL은 성공" 표시가 없어야 한다');
});

test('applyMigrations: failed 이력이 있으면 무조건 재적용을 차단하고 up()을 다시 부르지 않는다', async () => {
    const { sequelize } = createFakeSequelize();
    let calls = 0;
    const migration = makeMigration('m1', { up: async () => { calls += 1; throw new Error('DDL 실패'); } });

    await assert.rejects(() => migrationRunner.applyMigrations({ sequelize, migrations: [migration] }));
    assert.equal(calls, 1);

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [migration] }),
        /실패 이력이 있어 무조건 재적용할 수 없습니다/,
    );
    assert.equal(calls, 1, '실패 이력이 있으면 up()을 다시 호출하면 안 된다');
});

test('applyMigrations: DDL은 성공했지만 applied 기록(UPDATE)이 실패하면 failed로 안전하게 귀결된다', async () => {
    let ddlRan = false;
    const { sequelize, rows } = createFakeSequelize({
        failOn: (sql, replacements) => sql.startsWith('UPDATE') && replacements.status === 'applied',
    });
    const migration = makeMigration('m1', { up: async () => { ddlRan = true; } });

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [migration] }),
        /시뮬레이션된 DB 오류/,
    );

    assert.equal(ddlRan, true, 'DDL(up)은 실제로 실행됐어야 한다');
    const row = findRowByName(rows, 'm1');
    assert.equal(row.status, 'failed', '이력 쓰기(applied) 실패는 failed 마크 재시도로 안전하게 귀결돼야 한다');
    assert.ok(
        row.error_message.includes('DDL은 성공'),
        'DDL은 성공했지만 이후 단계에서 실패했다는 사실이 error_message에 남아야 복구 판단이 가능하다',
    );
});

test('applyMigrations: verify()가 실패해도 DDL 성공 사실이 error_message에 남는다', async () => {
    const { sequelize, rows } = createFakeSequelize();
    const migration = makeMigration('m1', {
        up: async () => {},
        verify: async () => { throw new Error('스키마 검증 실패'); },
    });

    await assert.rejects(() => migrationRunner.applyMigrations({ sequelize, migrations: [migration] }));

    const row = findRowByName(rows, 'm1');
    assert.equal(row.status, 'failed');
    assert.ok(row.error_message.includes('DDL은 성공'));
    assert.ok(row.error_message.includes('스키마 검증 실패'));
});

test('applyMigrations: applied 기록도, 그 뒤 failed 기록도 모두 실패하면 running에 멈추고 원래 오류가 전파되며 경고가 로그된다', async () => {
    const { sequelize, rows } = createFakeSequelize({
        failOn: (sql) => sql.startsWith('UPDATE'), // applied든 failed든 모든 UPDATE를 막는다
    });
    const migration = makeMigration('m1', { up: async () => {} });
    const logs = [];

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [migration], logger: (msg) => logs.push(msg) }),
        /시뮬레이션된 DB 오류/,
    );

    const row = findRowByName(rows, 'm1');
    assert.equal(row.status, 'running', '두 번의 이력 쓰기가 모두 실패하면 행이 running에 멈춰 있어야 한다');
    assert.ok(
        logs.some((l) => l.includes('기록하는 것도 실패')),
        '이중 실패는 반드시 로그로 남아야 운영자가 놓치지 않는다',
    );
});

test('applyMigrations: running으로 멈춘 이력이 있으면 재적용을 막고 up()을 다시 부르지 않는다', async () => {
    const { sequelize, rows } = createFakeSequelize();
    rows.push({ name: 'm1', checksum: 'whatever', status: 'running', started_at: new Date(0), finished_at: null, error_message: null });
    let calls = 0;
    const migration = makeMigration('m1', { up: async () => { calls += 1; } });

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [migration] }),
        /running 상태로 남아 있습니다/,
    );
    assert.equal(calls, 0, 'running으로 멈춘 이력이 있으면 up()을 아예 호출하면 안 된다');
});

test('resolveFailure: confirmRecovered 없이는 failed 이력도 지울 수 없다', async () => {
    const { sequelize, rows } = createFakeSequelize();
    rows.push({ name: 'm1', checksum: 'x', status: 'failed', started_at: new Date(0), finished_at: new Date(1), error_message: 'boom' });

    await assert.rejects(
        () => migrationRunner.resolveFailure({ sequelize, name: 'm1', confirmRecovered: false }),
        /confirmRecovered=true 없이는/,
    );
    assert.equal(rows.length, 1, '거부됐으므로 행이 그대로 남아 있어야 한다');
});

test('resolveFailure: confirmRecovered=true면 failed 이력을 정리한다', async () => {
    const { sequelize, rows } = createFakeSequelize();
    rows.push({ name: 'm1', checksum: 'x', status: 'failed', started_at: new Date(0), finished_at: new Date(1), error_message: 'boom' });

    const result = await migrationRunner.resolveFailure({ sequelize, name: 'm1', confirmRecovered: true });

    assert.deepEqual(result, { cleared: 'm1', previousStatus: 'failed' });
    assert.equal(rows.length, 0);
});

test('resolveFailure: running으로 멈춘 이력도(크래시/이력쓰기실패) 정리할 수 있다', async () => {
    const { sequelize, rows } = createFakeSequelize();
    rows.push({ name: 'm1', checksum: 'x', status: 'running', started_at: new Date(0), finished_at: null, error_message: null });

    const result = await migrationRunner.resolveFailure({ sequelize, name: 'm1', confirmRecovered: true });

    assert.deepEqual(result, { cleared: 'm1', previousStatus: 'running' });
    assert.equal(rows.length, 0);
});

test('resolveFailure: applied 상태는 정리 대상이 아니다', async () => {
    const { sequelize, rows } = createFakeSequelize();
    rows.push({ name: 'm1', checksum: 'x', status: 'applied', started_at: new Date(0), finished_at: new Date(1), error_message: null });

    await assert.rejects(
        () => migrationRunner.resolveFailure({ sequelize, name: 'm1', confirmRecovered: true }),
        /failed\/running 상태가 아닙니다/,
    );
});

test('resolveFailure: 존재하지 않는 이력은 에러다', async () => {
    const { sequelize } = createFakeSequelize();
    await assert.rejects(
        () => migrationRunner.resolveFailure({ sequelize, name: 'ghost', confirmRecovered: true }),
        /찾을 수 없습니다/,
    );
});

test('applyMigrations: 이미 applied된 마이그레이션 파일이 수정되면(체크섬 불일치) 에러다', async () => {
    const { sequelize, rows } = createFakeSequelize();
    rows.push({ name: 'm1', checksum: 'stale-checksum', status: 'applied', started_at: new Date(0), finished_at: new Date(1), error_message: null });
    const migration = makeMigration('m1');

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [migration] }),
        /체크섬이 기록과 다릅니다/,
    );
});
