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
    resetManagedData,
    findNonEmptyManagedTables,
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

// ── resetManagedData: 스키마를 두고 행만 비우는 경로도 같은 안전 확인을 먼저 지난다 ────
//
// F-19 검증 시간 보수로 추가된 경로다. 드롭보다 덜 파괴적으로 보이지만 "전용 테스트 DB의
// 모든 행을 지운다"는 점에서 위험도는 같으므로, 대상 DB 확인·미지 테이블 거부가 DELETE보다
// 반드시 먼저 실행되는지를 resetManagedSchema와 똑같이 검증한다.

// DELETE/SELECT를 기록하는 스텁. rowCounts는 COUNT(*) UNION 응답을 흉내낸다.
const makeDataStubSequelize = ({ connectedDatabaseName, existingTables = [], rowCounts = {} }) => {
    const deleteCalls = [];
    const countQueries = [];
    return {
        query: async (sql) => {
            const statement = String(sql);
            if (statement.includes('DATABASE()')) return [[{ name: connectedDatabaseName }]];
            if (statement.startsWith('DELETE FROM')) {
                deleteCalls.push(statement.replace(/^DELETE FROM `(.+)`$/, '$1'));
                return [[], {}];
            }
            if (statement.startsWith('SELECT')) {
                countQueries.push(statement);
                const rows = [...statement.matchAll(/CAST\('([^']+)' AS CHAR\(\d+\)\)/g)]
                    .map(([, table]) => ({ table_name: table, row_count: rowCounts[table] ?? 0 }));
                return [rows, {}];
            }
            throw new Error(`이 테스트는 예상치 못한 쿼리를 호출했습니다: ${statement}`);
        },
        getQueryInterface: () => ({
            showAllTables: async () => existingTables,
            dropTable: async () => { throw new Error('resetManagedData는 dropTable을 호출하면 안 됩니다'); },
        }),
        deleteCalls,
        countQueries,
    };
};

// 위의 SCHEMA는 economy/notifications/f19 인자를 생략해 **실제** 마이그레이션 모듈의 테이블
// 이름까지 관리 목록에 넣는다(isolatedTestDb.js가 기본값으로 require한다). resetManagedData는
// "관리 테이블이 전부 존재한다"를 요구하므로, 여기서는 그 확장 목록을 모두 빈 객체로 덮어
// 스텁이 흉내낼 수 있는 최소 스키마만 남긴다.
const EMPTY_TABLES = { TABLE_NAMES: {} };
const DATA_SCHEMA = buildManagedSchema({
    baseline: { TABLE_ORDER: ['users', 'user_sessions'] },
    addRefreshTokenHistory: { TABLE_NAME: 'refresh_token_history' },
    addSocialAuth: { TABLE_NAMES: { EXTERNAL_IDENTITIES: 'external_identities', OAUTH_STATES: 'oauth_states', SOCIAL_SIGNUP_INTENTS: 'social_signup_intents' } },
    addEconomy: EMPTY_TABLES,
    addEconomyPurchaseRequests: EMPTY_TABLES,
    addVoteParticipations: EMPTY_TABLES,
    addAchievementGrants: EMPTY_TABLES,
    addNotifications: EMPTY_TABLES,
    addF19FriendsInvites: EMPTY_TABLES,
    migrationRunner: { META_TABLE: 'schema_migrations' },
});

const ALL_MANAGED = [...DATA_SCHEMA.managedTables];

test('전용 DB가 아니면 resetManagedData가 DELETE를 전혀 실행하지 않는다', async () => {
    const sequelize = makeDataStubSequelize({ connectedDatabaseName: 'irrelevant', existingTables: ALL_MANAGED });
    await assert.rejects(
        () => resetManagedData(sequelize, 'mysql://user:pass@127.0.0.1:3306/not-approved', DATA_SCHEMA),
        /전용 테스트 DB 대상이 아닙니다/,
    );
    assert.deepEqual(sequelize.deleteCalls, []);
});

test('연결된 DB 이름이 URL과 다르면 resetManagedData가 DELETE를 전혀 실행하지 않는다', async () => {
    const sequelize = makeDataStubSequelize({ connectedDatabaseName: 'mismatch', existingTables: ALL_MANAGED });
    await assert.rejects(() => resetManagedData(sequelize, APPROVED_URL, DATA_SCHEMA), /실제 연결된 DB/);
    assert.deepEqual(sequelize.deleteCalls, []);
});

test('관리 목록에 없는 미지의 테이블이 있으면 resetManagedData가 DELETE를 전혀 실행하지 않는다', async () => {
    const sequelize = makeDataStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        existingTables: [...ALL_MANAGED, 'some_unrelated_app_table'],
    });
    await assert.rejects(
        () => resetManagedData(sequelize, APPROVED_URL, DATA_SCHEMA),
        /관리 목록이 모르는 테이블이 있습니다.*some_unrelated_app_table/,
    );
    assert.deepEqual(sequelize.deleteCalls, []);
});

// 데이터만 비우는 경로는 "스키마가 이미 완전하다"를 전제로 한다. 하나라도 없으면 그 전제가
// 깨진 것이므로 DELETE로 얼버무리지 않고 호출부에 전체 재구축을 되돌려 준다.
test('관리 테이블이 하나라도 없으면 resetManagedData는 DELETE 없이 cleaned=false를 돌려준다', async () => {
    const sequelize = makeDataStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        existingTables: ALL_MANAGED.filter((table) => table !== 'oauth_states'),
    });
    const result = await resetManagedData(sequelize, APPROVED_URL, DATA_SCHEMA);
    assert.equal(result.cleaned, false);
    assert.deepEqual(result.missingTables, ['oauth_states']);
    assert.deepEqual(sequelize.deleteCalls, []);
});

test('정상 경로에서는 keepTables를 뺀 모든 관리 테이블이 자식 → 부모 순서로 비워진다', async () => {
    const sequelize = makeDataStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        existingTables: ALL_MANAGED,
    });
    const result = await resetManagedData(sequelize, APPROVED_URL, { ...DATA_SCHEMA, keepTables: ['schema_migrations'] });

    assert.equal(result.cleaned, true);
    assert.deepEqual(sequelize.deleteCalls, [
        'external_identities', 'oauth_states', 'social_signup_intents',
        'refresh_token_history',
        'user_sessions', 'users',
    ]);
    assert.ok(
        !sequelize.deleteCalls.includes('schema_migrations'),
        'keepTables로 지정한 이력 테이블은 비우지 않아야 한다',
    );
    // FOREIGN_KEY_CHECKS를 끄지 않고도 제약을 지킬 수 있는 근거가 이 순서다.
    const usersIndex = sequelize.deleteCalls.indexOf('users');
    for (const child of ['external_identities', 'oauth_states', 'social_signup_intents', 'refresh_token_history', 'user_sessions']) {
        assert.ok(sequelize.deleteCalls.indexOf(child) < usersIndex, `${child}는 users보다 먼저 비워져야 합니다`);
    }
});

test('식별자로 쓸 수 없는 테이블 이름은 DB 조회 이전에 거부된다', async () => {
    const sequelize = {
        query: async () => { throw new Error('이름 검사에서 이미 막혀야 합니다'); },
        getQueryInterface: () => ({ showAllTables: async () => { throw new Error('이름 검사에서 이미 막혀야 합니다'); } }),
    };
    await assert.rejects(
        () => resetManagedData(sequelize, APPROVED_URL, {
            managedTables: ['users'], dropOrder: ['users; DROP DATABASE x'],
        }),
        /식별자로 쓸 수 없는 테이블 이름입니다/,
    );
});

// ── findNonEmptyManagedTables: 케이스 간 데이터 누수 검사 ────────────────────────

test('findNonEmptyManagedTables는 행이 남은 테이블만 한 번의 질의로 돌려준다', async () => {
    const sequelize = makeDataStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        rowCounts: { users: 2, user_sessions: 0 },
    });
    const nonEmpty = await findNonEmptyManagedTables(sequelize, ['users', 'user_sessions']);
    assert.deepEqual(nonEmpty, [{ table: 'users', count: 2 }]);
    assert.equal(sequelize.countQueries.length, 1, '테이블 수만큼 왕복하지 않아야 한다');
});

test('모든 테이블이 비어 있으면 findNonEmptyManagedTables는 빈 목록을 돌려준다', async () => {
    const sequelize = makeDataStubSequelize({ connectedDatabaseName: APPROVED_DB_NAME });
    assert.deepEqual(await findNonEmptyManagedTables(sequelize, ['users', 'user_sessions']), []);
});
