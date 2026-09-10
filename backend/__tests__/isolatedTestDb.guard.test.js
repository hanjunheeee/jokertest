'use strict';

// F-05 R-IMPL(CODEX-2/VERIFY-10): backend/tests/helpers/isolatedTestDb.js가 하는 안전
// 확인(전용 테스트 DB 대상인지, 관리 목록 밖 테이블이 없는지)이 실제로 destructive
// drop보다 먼저 실행되고, 어느 하나라도 걸리면 drop이 단 한 번도 호출되지 않는지를
// 실제 MySQL 없이(스텁 sequelize) 검증한다 — 이 파일은 격리 DB 유무와 무관하게 항상
// 실행된다.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    ALLOWED_DATABASE_NAMES,
    assertDedicatedTestDatabase,
    buildManagedSchema,
    resetManagedSchema,
} = require('../tests/helpers/isolatedTestDb');

const [APPROVED_DB_NAME] = ALLOWED_DATABASE_NAMES;
const APPROVED_URL = `mysql://user:pass@127.0.0.1:3306/${APPROVED_DB_NAME}`;

// showAllTables/dropTable 호출을 모두 기록하는 스텁. query()는 DATABASE()를 흉내낸다 —
// 실제 드라이버처럼 [rows] 형태로 돌려준다.
const makeStubSequelize = ({ connectedDatabaseName, existingTables = [] }) => {
    const dropCalls = [];
    let showAllTablesCalls = 0;
    return {
        query: async (sql) => {
            if (typeof sql === 'string' && sql.includes('DATABASE()')) {
                return [[{ name: connectedDatabaseName }]];
            }
            throw new Error(`이 테스트는 예상치 못한 쿼리를 호출했습니다: ${sql}`);
        },
        getQueryInterface: () => ({
            showAllTables: async () => { showAllTablesCalls += 1; return existingTables; },
            dropTable: async (table) => { dropCalls.push(table); },
        }),
        dropCalls,
        get showAllTablesCalls() { return showAllTablesCalls; },
    };
};

// ── assertDedicatedTestDatabase ──────────────────────────────────────────────

test('승인되지 않은 DB 이름을 가리키는 URL은 DATABASE() 조회조차 하지 않고 즉시 거부된다', async () => {
    const sequelize = {
        query: async () => { throw new Error('승인되지 않은 URL에서는 query가 호출되면 안 됩니다'); },
    };
    await assert.rejects(
        () => assertDedicatedTestDatabase(sequelize, 'mysql://user:pass@127.0.0.1:3306/jokertest-db-1'),
        /전용 테스트 DB 대상이 아닙니다/,
    );
});

test('운영 DATABASE_URL 형태(운영 DB 이름)도 승인 목록에 없으면 거부된다', async () => {
    const sequelize = {
        query: async () => { throw new Error('승인되지 않은 URL에서는 query가 호출되면 안 됩니다'); },
    };
    await assert.rejects(
        () => assertDedicatedTestDatabase(sequelize, 'mysql://prod_user:prod_pass@prod-host:3306/jokertest_production'),
        /전용 테스트 DB 대상이 아닙니다/,
    );
});

test('URL은 승인된 이름이어도 실제 연결된 DATABASE()가 다르면 거부된다', async () => {
    const sequelize = makeStubSequelize({ connectedDatabaseName: 'some_other_schema' });
    await assert.rejects(
        () => assertDedicatedTestDatabase(sequelize, APPROVED_URL),
        /실제 연결된 DB\(some_other_schema\)가 URL이 가리키는 DB/,
    );
});

test('URL과 실제 연결된 DATABASE()가 둘 다 승인된 이름과 일치하면 통과한다', async () => {
    const sequelize = makeStubSequelize({ connectedDatabaseName: APPROVED_DB_NAME });
    await assert.doesNotReject(() => assertDedicatedTestDatabase(sequelize, APPROVED_URL));
});

// ── resetManagedSchema: 세 가지 거부 경로 모두 drop을 단 한 번도 호출하지 않는다 ──────

const SCHEMA = buildManagedSchema({
    baseline: { TABLE_ORDER: ['users', 'user_sessions'] },
    addRefreshTokenHistory: { TABLE_NAME: 'refresh_token_history' },
    addSocialAuth: { TABLE_NAMES: { EXTERNAL_IDENTITIES: 'external_identities', OAUTH_STATES: 'oauth_states', SOCIAL_SIGNUP_INTENTS: 'social_signup_intents' } },
    migrationRunner: { META_TABLE: 'schema_migrations' },
});

test('전용 DB가 아니면 resetManagedSchema가 dropTable을 전혀 호출하지 않는다', async () => {
    const sequelize = makeStubSequelize({ connectedDatabaseName: 'irrelevant', existingTables: ['users'] });
    await assert.rejects(
        () => resetManagedSchema(sequelize, 'mysql://user:pass@127.0.0.1:3306/not-approved', SCHEMA),
        /전용 테스트 DB 대상이 아닙니다/,
    );
    assert.deepEqual(sequelize.dropCalls, []);
    assert.equal(sequelize.showAllTablesCalls, 0, 'DB 대상 확인에서 이미 막혔으므로 테이블 목록조차 조회하면 안 됩니다');
});

test('연결된 DB 이름이 URL과 다르면 resetManagedSchema가 dropTable을 전혀 호출하지 않는다', async () => {
    const sequelize = makeStubSequelize({ connectedDatabaseName: 'mismatch', existingTables: ['users'] });
    await assert.rejects(
        () => resetManagedSchema(sequelize, APPROVED_URL, SCHEMA),
        /실제 연결된 DB/,
    );
    assert.deepEqual(sequelize.dropCalls, []);
});

test('관리 목록에 없는 미지의 테이블이 있으면 resetManagedSchema가 dropTable을 전혀 호출하지 않는다', async () => {
    const sequelize = makeStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        existingTables: ['users', 'some_unrelated_app_table'],
    });
    await assert.rejects(
        () => resetManagedSchema(sequelize, APPROVED_URL, SCHEMA),
        /관리 목록이 모르는 테이블이 있습니다.*some_unrelated_app_table/,
    );
    assert.deepEqual(sequelize.dropCalls, []);
});

// F-05가 만든 세 테이블도 미지의 테이블로 취급되면 안 된다 — 이것이 CODEX-2/VERIFY-10이
// 지적한 21개 실패의 직접 원인이었다.
test('F-05 social 테이블(external_identities 등)은 미지의 테이블로 취급되지 않는다', async () => {
    const sequelize = makeStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        existingTables: ['users', 'user_sessions', 'external_identities', 'oauth_states', 'social_signup_intents'],
    });
    await assert.doesNotReject(() => resetManagedSchema(sequelize, APPROVED_URL, SCHEMA));
});

// ── resetManagedSchema 정상 경로: 존재하는 테이블만, FK 자식 우선 순서로 drop한다 ──────

test('정상 경로에서는 실제로 존재하는 테이블만 자식(FK 참조)부터 users까지 순서대로 drop된다', async () => {
    const sequelize = makeStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        existingTables: ['users', 'user_sessions', 'external_identities', 'oauth_states', 'social_signup_intents', 'refresh_token_history', 'schema_migrations'],
    });
    await resetManagedSchema(sequelize, APPROVED_URL, SCHEMA);

    assert.deepEqual(sequelize.dropCalls, [
        'external_identities', 'oauth_states', 'social_signup_intents',
        'refresh_token_history',
        'user_sessions', 'users',
        'schema_migrations',
    ]);
    // users(부모)는 그것을 참조하는 모든 자식 테이블보다 반드시 나중에 drop되어야 한다.
    const usersIndex = sequelize.dropCalls.indexOf('users');
    for (const child of ['external_identities', 'oauth_states', 'social_signup_intents', 'refresh_token_history', 'user_sessions']) {
        assert.ok(sequelize.dropCalls.indexOf(child) < usersIndex, `${child}는 users보다 먼저 drop되어야 합니다`);
    }
});

test('존재하지 않는 관리 테이블은 drop을 시도하지 않는다', async () => {
    const sequelize = makeStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        existingTables: ['users'],
    });
    await resetManagedSchema(sequelize, APPROVED_URL, SCHEMA);
    assert.deepEqual(sequelize.dropCalls, ['users']);
});
