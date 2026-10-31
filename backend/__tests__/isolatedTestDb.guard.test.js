'use strict';

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

test('F-05 social 테이블(external_identities 등)은 미지의 테이블로 취급되지 않는다', async () => {
    const sequelize = makeStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        existingTables: ['users', 'user_sessions', 'external_identities', 'oauth_states', 'social_signup_intents'],
    });
    await assert.doesNotReject(() => resetManagedSchema(sequelize, APPROVED_URL, SCHEMA));
});

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

test('F-32a: 기본 관리 목록은 상품·주문 테이블을 알고 있고 주문은 users보다 먼저 drop된다', async () => {
    assert.ok(SCHEMA.managedTables.includes('economy_currency_products'));
    assert.ok(SCHEMA.managedTables.includes('economy_topup_orders'));

    const sequelize = makeStubSequelize({
        connectedDatabaseName: APPROVED_DB_NAME,
        existingTables: ['users', 'economy_topup_orders', 'economy_currency_products'],
    });
    await resetManagedSchema(sequelize, APPROVED_URL, SCHEMA);

    assert.deepEqual([...sequelize.dropCalls].sort(), ['economy_currency_products', 'economy_topup_orders', 'users']);
    assert.ok(
        sequelize.dropCalls.indexOf('economy_topup_orders') < sequelize.dropCalls.indexOf('users'),
        'economy_topup_orders는 users를 참조하므로 먼저 drop되어야 합니다',
    );
});

test('F-32a: EMPTY_TABLES override를 주면 두 테이블은 관리 목록에 추가되지 않는다', () => {
    const minimal = buildManagedSchema({
        baseline: { TABLE_ORDER: ['users'] },
        addRefreshTokenHistory: { TABLE_NAME: 'refresh_token_history' },
        addSocialAuth: { TABLE_NAMES: {} },
        addEconomy: { TABLE_NAMES: {} },
        addEconomyPurchaseRequests: { TABLE_NAMES: {} },
        addVoteParticipations: { TABLE_NAMES: {} },
        addAchievementGrants: { TABLE_NAMES: {} },
        addNotifications: { TABLE_NAMES: {} },
        addF19FriendsInvites: { TABLE_NAMES: {} },
        addCurrencyProductsTopupOrders: { TABLE_NAMES: {} },
        migrationRunner: { META_TABLE: 'schema_migrations' },
    });
    assert.ok(!minimal.managedTables.includes('economy_topup_orders'));
    assert.ok(!minimal.managedTables.includes('economy_currency_products'));
    assert.ok(!minimal.dropOrder.includes('economy_topup_orders'));
});

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
    addCurrencyProductsTopupOrders: EMPTY_TABLES,
    migrationRunner: { META_TABLE: 'schema_migrations' },
});

const ALL_MANAGED = [...DATA_SCHEMA.managedTables];

test('최소 스키마(addEconomy 스텁)에서도 economy_emoji_palettes가 관리 목록과 드롭 순서에 들어간다', () => {
    assert.deepEqual(DATA_SCHEMA.managedTables, [
        'users', 'user_sessions', 'refresh_token_history',
        'external_identities', 'oauth_states', 'social_signup_intents',
        'economy_emoji_palettes',
        'signup_email_verifications',
        'schema_migrations',
    ]);
    assert.deepEqual(DATA_SCHEMA.dropOrder, [
        'signup_email_verifications',
        'economy_emoji_palettes',
        'external_identities', 'oauth_states', 'social_signup_intents',
        'refresh_token_history',
        'user_sessions', 'users',
        'schema_migrations',
    ]);
});

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
        'signup_email_verifications',
        'economy_emoji_palettes',
        'external_identities', 'oauth_states', 'social_signup_intents',
        'refresh_token_history',
        'user_sessions', 'users',
    ]);
    assert.ok(
        !sequelize.deleteCalls.includes('schema_migrations'),
        'keepTables로 지정한 이력 테이블은 비우지 않아야 한다',
    );
    const usersIndex = sequelize.deleteCalls.indexOf('users');
    for (const child of ['economy_emoji_palettes', 'external_identities', 'oauth_states', 'social_signup_intents', 'refresh_token_history', 'user_sessions']) {
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
