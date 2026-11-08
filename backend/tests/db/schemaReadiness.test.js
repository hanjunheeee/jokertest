'use strict';

// 시작 전 표 준비 확인 시험, DB 없이 가짜 연결로 (D-01: 서버가 표를 만들지 않고 마이그레이션 이력만 봄)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const schemaReadiness = require('../../db/schemaReadiness');
const migrationRunner = require('../../db/migrationRunner');

const MIGRATIONS = [
    { name: '0001-a', up: async () => {}, down: async () => {} },
    { name: '0002-b', up: async () => {}, down: async () => {} },
];

// 이력 표 줄을 들고 있는 가짜 연결 (표 만들기 같은 쓰기 쿼리가 오면 실패시킴)
const fakeSequelize = (historyRows, { metaTable = true, authFails = false } = {}) => {
    const queries = [];
    return {
        queries,
        async authenticate() { if (authFails) throw new Error('connect ECONNREFUSED'); },
        getQueryInterface() {
            return { async showAllTables() { return metaTable ? [migrationRunner.META_TABLE, 'users'] : ['users']; } };
        },
        async query(sql) {
            queries.push(sql);
            if (/^SELECT \* FROM schema_migrations/.test(sql)) return [historyRows];
            throw new Error(`읽기 말고는 하면 안 됨: ${sql}`);
        },
    };
};

const appliedRow = (migration) => ({
    name: migration.name, status: 'applied', checksum: migrationRunner.checksumOf(migration), finished_at: new Date(),
});

test('다 적용됐으면 운영에서도 통과, 쓰기 쿼리 없음', async () => {
    const sequelize = fakeSequelize(MIGRATIONS.map(appliedRow));
    const result = await schemaReadiness.ensureSchemaReady(sequelize, { env: 'production', migrations: MIGRATIONS });
    assert.equal(result.ready, true);
    assert.deepEqual(sequelize.queries, ['SELECT * FROM schema_migrations']);
});

test('운영: 안 돌린 마이그레이션이 있으면 SCHEMA_NOT_READY로 거부, 이름이 문구에 나옴', async () => {
    const sequelize = fakeSequelize([appliedRow(MIGRATIONS[0])]);
    await assert.rejects(
        () => schemaReadiness.ensureSchemaReady(sequelize, { env: 'production', migrations: MIGRATIONS }),
        (error) => error.code === schemaReadiness.SCHEMA_NOT_READY && /0002-b/.test(error.message) && /migrate/.test(error.message),
    );
});

test('운영: 이력 표 자체가 없으면(새 DB) 거부', async () => {
    const sequelize = fakeSequelize([], { metaTable: false });
    await assert.rejects(
        () => schemaReadiness.ensureSchemaReady(sequelize, { env: 'production', migrations: MIGRATIONS }),
        (error) => error.code === schemaReadiness.SCHEMA_NOT_READY && /2개/.test(error.message),
    );
});

test('운영: 실패 이력·적용 뒤 바뀐 파일도 거부', async () => {
    const failed = fakeSequelize([appliedRow(MIGRATIONS[0]), { ...appliedRow(MIGRATIONS[1]), status: 'failed' }]);
    await assert.rejects(
        () => schemaReadiness.ensureSchemaReady(failed, { env: 'production', migrations: MIGRATIONS }),
        /실패·멈춘 마이그레이션 \[0002-b\]/,
    );
    const changed = fakeSequelize([appliedRow(MIGRATIONS[0]), { ...appliedRow(MIGRATIONS[1]), checksum: 'old' }]);
    await assert.rejects(
        () => schemaReadiness.ensureSchemaReady(changed, { env: 'production', migrations: MIGRATIONS }),
        /파일이 바뀐 마이그레이션 \[0002-b\]/,
    );
});

test('개발: 안 돌린 게 있어도 경고 한 줄만 남기고 계속, 표는 안 만듦', async () => {
    const sequelize = fakeSequelize([appliedRow(MIGRATIONS[0])]);
    const warnings = [];
    const result = await schemaReadiness.ensureSchemaReady(sequelize, {
        env: 'development', migrations: MIGRATIONS, warn: (message) => warnings.push(message),
    });
    assert.equal(result.ready, false);
    assert.deepEqual(result.pending, ['0002-b']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /^\[STARTUP\] 경고 — DB 표 준비 안 됨/);
    assert.deepEqual(sequelize.queries, ['SELECT * FROM schema_migrations']);
});

test('연결 실패는 SCHEMA_NOT_READY가 아닌 원래 오류로 (index.js가 "DB 연결"로 찍음)', async () => {
    const sequelize = fakeSequelize([], { authFails: true });
    await assert.rejects(
        () => schemaReadiness.ensureSchemaReady(sequelize, { env: 'production', migrations: MIGRATIONS }),
        (error) => error.code !== schemaReadiness.SCHEMA_NOT_READY && /ECONNREFUSED/.test(error.message),
    );
});

test('기본 목록은 migrate-db.js 목록 그대로', async () => {
    const { MIGRATIONS: listed } = require('../../scripts/migrate-db');
    const sequelize = fakeSequelize(listed.map(appliedRow));
    const result = await schemaReadiness.ensureSchemaReady(sequelize, { env: 'production' });
    assert.equal(result.ready, true);
});

test('index.js: 표 준비 안 됨이면 포트 안 열고 "[STARTUP] 실패 — DB 표 준비 안 됨" 한 줄 + 종료 코드 1', () => {
    const entry = path.join(__dirname, '..', '..', 'index.js');
    const preload = path.join(__dirname, '..', 'helpers', 'schemaNotReady.preload.js');
    const result = spawnSync(process.execPath, ['-r', preload, entry], {
        env: { ...process.env, DATABASE_URL: 'mysql://u:p@127.0.0.1:1/x', PORT: '0' },
        encoding: 'utf8',
        timeout: 30000,
    });
    assert.equal(result.signal, null, '시간 넘겨 강제 종료되면 안 됨');
    assert.equal(result.status, 1);
    const lines = result.stderr.split(/\r?\n/).filter((line) => line.includes('[STARTUP] 실패'));
    assert.equal(lines.length, 1, result.stderr);
    assert.match(lines[0], /DB 표 준비 안 됨: 안 돌린 마이그레이션 1개/);
    assert.doesNotMatch(result.stdout, /\[STARTUP\] 성공/);
});
