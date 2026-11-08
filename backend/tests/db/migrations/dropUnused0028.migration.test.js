'use strict';

// 마이그레이션 0028(안 쓰는 칸 3개 + traffic_logs 지우기) 모양 시험, DB 없이 가짜 queryInterface로
const test = require('node:test');
const assert = require('node:assert/strict');

const dropUnused = require('../../../db/migrations/0028-drop-unused-columns-traffic-logs');
const { MIGRATIONS } = require('../../../scripts/migrate-db');

const FakeSequelize = { STRING: (n) => `STRING(${n})`, DATE: 'DATE', UUID: 'UUID', INTEGER: 'INTEGER', TEXT: 'TEXT', NOW: 'NOW' };

// 지우기 전 모양 (칸 이름 순서 = DB 순서)
const startTables = () => ({
    users: { columns: ['uuid', 'email', 'phone', 'role'], filled: {}, rows: 3 },
    user_sessions: { columns: ['id', 'connected_at', 'last_ping_at', 'is_online'], filled: {}, rows: 2 },
    online_presence: { columns: ['user_id', 'last_active_at', 'current_room_id', 'server_id'], filled: {}, rows: 1 },
    traffic_logs: { columns: ['id', 'url'], filled: {}, rows: 0 },
});

// 칸 목록·값 있는 칸 수·줄 수만 들고 있는 가짜 DB
const createFakeDb = (tables) => {
    const calls = [];
    const state = tables;
    const queryInterface = {
        async describeTable(table) {
            return Object.fromEntries(state[table].columns.map((column) => [column, { type: 'X', allowNull: true }]));
        },
        async showAllTables() { return Object.keys(state); },
        async removeColumn(table, column) {
            calls.push(['removeColumn', table, column]);
            state[table].columns = state[table].columns.filter((c) => c !== column);
        },
        async addColumn(table, column, definition) {
            calls.push(['addColumn', table, column, definition]);
            const at = state[table].columns.indexOf(definition.after);
            state[table].columns.splice(at + 1, 0, column);
        },
        async dropTable(table) {
            calls.push(['dropTable', table]);
            delete state[table];
        },
        async createTable(table, columns) {
            calls.push(['createTable', table, columns]);
            state[table] = { columns: Object.keys(columns), filled: {}, rows: 0 };
        },
    };
    const sequelize = {
        async query(sql) {
            const filledMatch = sql.match(/FROM `(\w+)` WHERE `(\w+)` IS NOT NULL/);
            if (filledMatch) return [[{ n: state[filledMatch[1]].filled[filledMatch[2]] ?? 0 }]];
            const rowsMatch = sql.match(/FROM `(\w+)`$/);
            if (rowsMatch) return [[{ n: state[rowsMatch[1]].rows }]];
            throw new Error(`모르는 쿼리: ${sql}`);
        },
    };
    return { queryInterface, sequelize, state, calls };
};

const run = (fake, step) => dropUnused[step](fake.queryInterface, FakeSequelize, fake.sequelize);

test('0028 up: 세 칸과 traffic_logs만 지우고 verify 통과, 다시 돌려도 바뀌는 것 없음', async () => {
    const fake = createFakeDb(startTables());
    await run(fake, 'up');
    await run(fake, 'verify');
    assert.deepEqual(fake.state.users.columns, ['uuid', 'email', 'role']);
    assert.deepEqual(fake.state.user_sessions.columns, ['id', 'connected_at', 'is_online']);
    assert.deepEqual(fake.state.online_presence.columns, ['user_id', 'last_active_at', 'server_id']);
    assert.equal(fake.state.traffic_logs, undefined);

    const before = fake.calls.length;
    await run(fake, 'up');
    assert.equal(fake.calls.length, before, '두 번째 up은 아무것도 안 함');
});

test('0028 up: 값 있는 칸이 하나라도 있으면 아무것도 안 지우고 멈춤', async () => {
    const tables = startTables();
    tables.online_presence.filled.current_room_id = 2;
    const fake = createFakeDb(tables);
    await assert.rejects(run(fake, 'up'), /online_presence\.current_room_id에 값이 2개/);
    assert.deepEqual(fake.calls, []);
});

test('0028 up: traffic_logs에 줄이 있으면 아무것도 안 지우고 멈춤', async () => {
    const tables = startTables();
    tables.traffic_logs.rows = 5;
    const fake = createFakeDb(tables);
    await assert.rejects(run(fake, 'up'), /traffic_logs에 줄이 5개/);
    assert.deepEqual(fake.calls, []);
});

test('0028 down: 칸은 원래 자리·모양으로, 표는 0001 모양으로 다시 만듦', async () => {
    const fake = createFakeDb(startTables());
    await run(fake, 'up');
    fake.calls.length = 0;
    await run(fake, 'down');
    const before = startTables();
    for (const table of ['users', 'user_sessions', 'online_presence']) {
        assert.deepEqual(fake.state[table].columns, before[table].columns, `${table} 칸 순서`);
    }
    const added = Object.fromEntries(fake.calls.filter(([kind]) => kind === 'addColumn').map(([, , column, def]) => [column, def]));
    assert.deepEqual(added.phone, { type: 'STRING(20)', allowNull: true, after: 'email' });
    assert.deepEqual(added.last_ping_at, { type: 'DATE', allowNull: true, after: 'connected_at' });
    assert.deepEqual(added.current_room_id, { type: 'UUID', allowNull: true, after: 'last_active_at' });
    const [, , trafficColumns] = fake.calls.find(([kind]) => kind === 'createTable');
    assert.deepEqual(Object.keys(trafficColumns), ['id', 'url', 'method', 'response_status', 'ip_address', 'response_time_ms', 'accessed_at']);
    assert.equal(trafficColumns.url.allowNull, false);
    assert.equal(trafficColumns.id.autoIncrement, true);

    // down 두 번째도 안전
    const count = fake.calls.length;
    await run(fake, 'down');
    assert.equal(fake.calls.length, count);
});

test('migrate-db 목록: 0027 바로 다음에 0028이 붙음', () => {
    const names = MIGRATIONS.map((migration) => migration.name);
    const at = names.indexOf('0027-drop-user-stats-title-reputation');
    assert.equal(names[at + 1], '0028-drop-unused-columns-traffic-logs');
});
