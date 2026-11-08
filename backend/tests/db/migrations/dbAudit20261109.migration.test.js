'use strict';

// DB 전수조사(2026-11-09) 뒷정리 마이그레이션 0020~0023 모양 시험, DB 없이 가짜 queryInterface로
const test = require('node:test');
const assert = require('node:assert/strict');

const addOauthStatesUserFk = require('../../../db/migrations/0020-add-oauth-states-user-fk');
const addUserSessionsRefreshIndexes = require('../../../db/migrations/0021-add-user-sessions-refresh-indexes');
const alignIndexNames = require('../../../db/migrations/0022-align-index-names');
const uuidTypeRoomAndBannedBy = require('../../../db/migrations/0023-uuid-type-room-and-banned-by');
const { MIGRATIONS } = require('../../../scripts/migrate-db');

const FakeSequelize = { UUID: 'UUID', INTEGER: 'INTEGER' };

// 표마다 인덱스·외래키·칸 타입·값 있는 칸 수만 들고 있는 가짜 DB
const createFakeDb = (tables) => {
    const calls = [];
    const state = JSON.parse(JSON.stringify(tables));
    const indexRow = (index) => ({
        name: index.name,
        primary: index.name === 'PRIMARY',
        unique: Boolean(index.unique),
        fields: index.fields.map((attribute) => ({ attribute, order: 'ASC' })),
    });
    const queryInterface = {
        async showIndex(table) { return (state[table].indexes || []).map(indexRow); },
        async addIndex(table, fields, options = {}) {
            calls.push(['addIndex', table, fields, options.name]);
            state[table].indexes.push({ name: options.name, unique: Boolean(options.unique), fields });
        },
        async removeIndex(table, name) {
            calls.push(['removeIndex', table, name]);
            state[table].indexes = state[table].indexes.filter((index) => index.name !== name);
        },
        async getForeignKeyReferencesForTable(table) { return state[table].fks || []; },
        async addConstraint(table, options) {
            calls.push(['addConstraint', table, options]);
            state[table].fks.push({
                constraintName: options.name,
                columnName: options.fields[0],
                referencedTableName: options.references.table,
                referencedColumnName: options.references.field,
            });
        },
        async removeConstraint(table, name) {
            calls.push(['removeConstraint', table, name]);
            state[table].fks = state[table].fks.filter((fk) => fk.constraintName !== name);
        },
        async describeTable(table) {
            return Object.fromEntries(Object.entries(state[table].columns).map(([column, type]) => [
                column, { type, allowNull: true, primaryKey: false },
            ]));
        },
        async changeColumn(table, column, definition) {
            calls.push(['changeColumn', table, column, definition]);
            state[table].columns[column] = definition.type === 'UUID' ? 'CHAR(36) BINARY' : 'INT';
        },
    };
    const sequelize = {
        async query(sql) {
            calls.push(['query', sql]);
            const rename = sql.match(/^ALTER TABLE `(\w+)` RENAME INDEX `(\w+)` TO `(\w+)`$/);
            if (rename) {
                const [, table, from, to] = rename;
                state[table].indexes.find((index) => index.name === from).name = to;
                return [[]];
            }
            if (/LEFT JOIN users/.test(sql)) return [[{ orphan_count: state.oauth_states.orphans ?? 0 }]];
            const filled = sql.match(/FROM `(\w+)` WHERE `(\w+)` IS NOT NULL/);
            if (filled) return [[{ filled: state[filled[1]].filled?.[filled[2]] ?? 0 }]];
            throw new Error(`가짜 DB가 모르는 쿼리: ${sql}`);
        },
    };
    return { queryInterface, sequelize, calls, state };
};

const run = (migration, fake) => migration.up(fake.queryInterface, FakeSequelize, fake.sequelize);
const verify = (migration, fake) => migration.verify(fake.queryInterface, FakeSequelize, fake.sequelize);

// ── 0020 oauth_states 외래키 ──

test('0020: sync로 만든 표(외래키·user_id 인덱스 없음)엔 인덱스 → 외래키 순서로 걸고 verify 통과', async () => {
    const fake = createFakeDb({
        oauth_states: { indexes: [{ name: 'state_hash', unique: true, fields: ['state_hash'] }], fks: [], orphans: 0 },
    });
    await run(addOauthStatesUserFk, fake);
    const kinds = fake.calls.filter(([kind]) => kind !== 'query');
    assert.deepEqual(kinds[0], ['addIndex', 'oauth_states', ['user_id'], 'oauth_states_user_id']);
    assert.equal(kinds[1][0], 'addConstraint');
    assert.deepEqual(kinds[1][2], {
        fields: ['user_id'], type: 'foreign key', name: 'oauth_states_ibfk_1',
        references: { table: 'users', field: 'uuid' },
    });
    await verify(addOauthStatesUserFk, fake);
});

test('0020: 0005로 만든 표(외래키 있음)는 아무것도 안 함', async () => {
    const fake = createFakeDb({
        oauth_states: {
            indexes: [{ name: 'user_id', fields: ['user_id'] }],
            fks: [{ constraintName: 'oauth_states_ibfk_1', columnName: 'user_id', referencedTableName: 'users', referencedColumnName: 'uuid' }],
        },
    });
    await run(addOauthStatesUserFk, fake);
    assert.deepEqual(fake.calls, []);
});

test('0020: 고아 행이 있으면 지우지 않고 멈춤', async () => {
    const fake = createFakeDb({ oauth_states: { indexes: [], fks: [], orphans: 2 } });
    await assert.rejects(() => run(addOauthStatesUserFk, fake), /2개/);
    assert.equal(fake.calls.some(([kind]) => kind === 'addConstraint' || kind === 'addIndex'), false);
});

test('0020: user_id 인덱스가 이미 있으면 인덱스는 안 만들고 외래키만', async () => {
    const fake = createFakeDb({ oauth_states: { indexes: [{ name: 'user_id', fields: ['user_id'] }], fks: [] } });
    await run(addOauthStatesUserFk, fake);
    assert.equal(fake.calls.some(([kind]) => kind === 'addIndex'), false);
    assert.equal(fake.calls.filter(([kind]) => kind === 'addConstraint').length, 1);
});

// ── 0021 user_sessions 갱신 인덱스 ──

test('0021: 두 해시 칸에 유일 아닌 인덱스를 정한 이름으로 만들고, 다시 돌리면 안 만듦', async () => {
    const fake = createFakeDb({ user_sessions: { indexes: [{ name: 'PRIMARY', unique: true, fields: ['id'] }, { name: 'user_id', fields: ['user_id'] }] } });
    await assert.rejects(() => verify(addUserSessionsRefreshIndexes, fake), /refresh_token_hash/);
    await run(addUserSessionsRefreshIndexes, fake);
    assert.deepEqual(fake.calls, [
        ['addIndex', 'user_sessions', ['refresh_token_hash'], 'user_sessions_refresh_token_hash'],
        ['addIndex', 'user_sessions', ['refresh_previous_hash'], 'user_sessions_refresh_previous_hash'],
    ]);
    assert.equal(fake.state.user_sessions.indexes.filter((index) => index.unique).length, 1, '유일 인덱스는 PRIMARY만');
    await verify(addUserSessionsRefreshIndexes, fake);

    fake.calls.length = 0;
    await run(addUserSessionsRefreshIndexes, fake);
    assert.deepEqual(fake.calls, []);
});

// ── 0022 인덱스 이름 맞추기 ──

const legacyIndexTables = () => ({
    oauth_states: { indexes: [{ name: 'state_hash', unique: true, fields: ['state_hash'] }, { name: 'oauth_states_user_id', fields: ['user_id'] }] },
    social_signup_intents: { indexes: [{ name: 'intent_token_hash', unique: true, fields: ['intent_token_hash'] }] },
    friendships: { indexes: [
        { name: 'friendships_requester_id_receiver_id', unique: true, fields: ['requester_id', 'receiver_id'] },
        { name: 'receiver_id', fields: ['receiver_id'] },
    ] },
    external_identities: { indexes: [
        { name: 'external_identities_provider_subject_unique', unique: true, fields: ['provider', 'subject'] },
        { name: 'user_id', fields: ['user_id'] },
    ] },
});

test('0022: sync식 이름을 마이그레이션 이름으로 RENAME만 하고 verify 통과', async () => {
    const fake = createFakeDb(legacyIndexTables());
    await run(alignIndexNames, fake);
    assert.deepEqual(fake.calls.map(([, sql]) => sql), [
        'ALTER TABLE `oauth_states` RENAME INDEX `state_hash` TO `oauth_states_state_hash_unique`',
        'ALTER TABLE `social_signup_intents` RENAME INDEX `intent_token_hash` TO `social_signup_intents_token_hash_unique`',
        'ALTER TABLE `friendships` RENAME INDEX `friendships_requester_id_receiver_id` TO `friendships_requester_receiver`',
        'ALTER TABLE `external_identities` RENAME INDEX `user_id` TO `external_identities_user_id`',
    ]);
    await verify(alignIndexNames, fake);
});

test('0022: 이미 맞는 이름이면 아무것도 안 함 (새 DB·다시 돌림)', async () => {
    const fake = createFakeDb(legacyIndexTables());
    await run(alignIndexNames, fake);
    fake.calls.length = 0;
    await run(alignIndexNames, fake);
    assert.deepEqual(fake.calls, []);
});

test('0022: 같은 칸 인덱스가 없거나 둘이면 짐작 않고 멈춤', async () => {
    const none = legacyIndexTables();
    none.friendships.indexes = [{ name: 'receiver_id', fields: ['receiver_id'] }];
    await assert.rejects(() => run(alignIndexNames, createFakeDb(none)), /friendships\(requester_id,receiver_id\) 인덱스가 0개/);

    const two = legacyIndexTables();
    two.external_identities.indexes.push({ name: 'user_id_2', fields: ['user_id'] });
    await assert.rejects(() => run(alignIndexNames, createFakeDb(two)), /external_identities\(user_id\) 인덱스가 2개/);
});

test('0022: 유일 여부가 다른 인덱스는 같은 칸이어도 대상 아님', async () => {
    const tables = legacyIndexTables();
    tables.social_signup_intents.indexes = [{ name: 'intent_token_hash', unique: false, fields: ['intent_token_hash'] }];
    await assert.rejects(() => run(alignIndexNames, createFakeDb(tables)), /social_signup_intents\(intent_token_hash\) 인덱스가 0개/);
});

// ── 0023 INT → CHAR(36) ──

const intColumnTables = (filled = {}) => ({
    online_presence: { columns: { user_id: 'CHAR(36) BINARY', current_room_id: 'INT' }, filled: { current_room_id: filled.room ?? 0 } },
    user_bans: { columns: { id: 'INT', banned_by: 'INT' }, filled: { banned_by: filled.bannedBy ?? 0 } },
});

test('0023: 값이 다 NULL이면 두 칸을 UUID(NULL 허용)로 바꾸고 verify 통과, 다시 돌리면 안 바꿈', async () => {
    const fake = createFakeDb(intColumnTables());
    await run(uuidTypeRoomAndBannedBy, fake);
    const changes = fake.calls.filter(([kind]) => kind === 'changeColumn');
    assert.deepEqual(changes, [
        ['changeColumn', 'online_presence', 'current_room_id', { type: 'UUID', allowNull: true }],
        ['changeColumn', 'user_bans', 'banned_by', { type: 'UUID', allowNull: true }],
    ]);
    await verify(uuidTypeRoomAndBannedBy, fake);

    fake.calls.length = 0;
    await run(uuidTypeRoomAndBannedBy, fake);
    assert.equal(fake.calls.some(([kind]) => kind === 'changeColumn'), false);
});

test('0023: 값이 하나라도 있으면 타입을 안 바꾸고 멈춤', async () => {
    const fake = createFakeDb(intColumnTables({ bannedBy: 1 }));
    await assert.rejects(() => run(uuidTypeRoomAndBannedBy, fake), /user_bans\.banned_by에 값이 1개/);
    // 앞 칸도 안 바꿈 (반쯤 바뀐 채로 안 멈춤)
    assert.equal(fake.calls.some(([kind]) => kind === 'changeColumn'), false);
});

// ── 목록 등록 ──

test('migrate-db 목록: 0020~0023이 이 순서로 끝에 붙고 이름이 겹치지 않음', () => {
    const names = MIGRATIONS.map((migration) => migration.name);
    assert.deepEqual(names.slice(-4), [
        '0020-add-oauth-states-user-fk',
        '0021-add-user-sessions-refresh-indexes',
        '0022-align-index-names',
        '0023-uuid-type-room-and-banned-by',
    ]);
    assert.equal(new Set(names).size, names.length);
    const numbers = names.map((name) => name.slice(0, 4));
    assert.equal(new Set(numbers).size, numbers.length, '번호가 겹치는 마이그레이션이 있음');
});
