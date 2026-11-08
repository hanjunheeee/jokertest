'use strict';

// 운영 받침 시험: 마이그레이션 0024(운영 표 8개)·0025(기간 인덱스) 모양 · 목록 등록 · 충전 주문 REFUNDED · 판 끝 보관 표시
// 가짜 queryInterface·가짜 주문 db (진짜 DB 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const ops = require('../../db/migrations/0024-add-operations-tables');
const periodIndexes = require('../../db/migrations/0025-add-period-indexes');
const { MIGRATIONS } = require('../../scripts/migrate-db');
const { ORDER_STATUS } = require('../../services/economy/topup/constants');
const { confirmTopupOrder } = require('../../services/economy/topup/confirm');
const chatBuffer = require('../../services/ops/chatBuffer');

const FakeSequelize = new Proxy({ NOW: 'NOW' }, {
    get: (target, prop) => (prop in target ? target[prop] : ((...args) => `${String(prop)}(${args.join(',')})`)),
});

// 표·칸·인덱스·외래 키를 들고 있는 가짜 DB
const createFakeDb = (existingTables = {}) => {
    const tables = JSON.parse(JSON.stringify(existingTables));
    const calls = [];
    const queryInterface = {
        async showAllTables() { return Object.keys(tables); },
        async createTable(name, columns) {
            calls.push(['createTable', name]);
            tables[name] = {
                columns: Object.fromEntries(Object.entries(columns).map(([col, def]) => [col, { allowNull: def.allowNull !== false, primaryKey: def.primaryKey === true, references: def.references }])),
                indexes: [],
            };
        },
        async dropTable(name) { calls.push(['dropTable', name]); delete tables[name]; },
        async describeTable(name) { return tables[name].columns; },
        async showIndex(name) {
            return tables[name].indexes.map((index) => ({ name: index.name, unique: index.unique, fields: index.fields.map((attribute) => ({ attribute })) }));
        },
        async addIndex(name, fields, options = {}) { calls.push(['addIndex', name, options.name]); tables[name].indexes.push({ name: options.name, unique: Boolean(options.unique), fields }); },
        async removeIndex(name, indexName) { calls.push(['removeIndex', name, indexName]); tables[name].indexes = tables[name].indexes.filter((i) => i.name !== indexName); },
        async getForeignKeyReferencesForTable(name) {
            return Object.entries(tables[name].columns).filter(([, def]) => def.references).map(([column, def]) => ({
                columnName: column, referencedTableName: def.references.model, referencedColumnName: def.references.key,
            }));
        },
    };
    const queries = [];
    const sequelize = { async query(sql, options) { queries.push([sql, options]); return [[]]; } };
    return { tables, calls, queries, queryInterface, sequelize };
};

const runUp = (migration, fake) => migration.up(fake.queryInterface, FakeSequelize, fake.sequelize);

test('0024: 빈 DB에 운영 표 8개 + 인덱스 전부 만들고 verify 통과', async () => {
    const fake = createFakeDb({ users: { columns: {}, indexes: [] } });
    await runUp(ops, fake);
    for (const table of Object.values(ops.TABLES)) assert.ok(fake.tables[table], `${table} 없음`);
    await ops.verify(fake.queryInterface, FakeSequelize, fake.sequelize);
    assert.equal(Object.keys(ops.TABLES).length, 8);
});

test('0024: 점검 한 줄(id 1, 꺼짐)을 없을 때만 넣는 쿼리', async () => {
    const fake = createFakeDb({ users: { columns: {}, indexes: [] } });
    await runUp(ops, fake);
    const [sql, options] = fake.queries[0];
    assert.match(sql, /INSERT IGNORE INTO `maintenance_state`/);
    assert.equal(options.replacements.id, 1);
});

test('0024: 다시 돌리면 표·인덱스 안 다시 만듦 (반복 실행 안전)', async () => {
    const fake = createFakeDb({ users: { columns: {}, indexes: [] } });
    await runUp(ops, fake);
    const before = fake.calls.length;
    await runUp(ops, fake);
    assert.equal(fake.calls.length, before);
});

test('0024: 표만 있고 인덱스 빠진 상태면 인덱스만 채움', async () => {
    const fake = createFakeDb({ users: { columns: {}, indexes: [] } });
    await runUp(ops, fake);
    fake.tables.coupon_redemptions.indexes = [];
    await runUp(ops, fake);
    assert.ok(fake.calls.some((c) => c[0] === 'addIndex' && c[2] === 'coupon_redemptions_coupon_user_unique'));
    await ops.verify(fake.queryInterface, FakeSequelize, fake.sequelize);
});

test('0024 verify: 한 사람 한 쿠폰 유일 인덱스가 유일 아니면 멈춤', async () => {
    const fake = createFakeDb({ users: { columns: {}, indexes: [] } });
    await runUp(ops, fake);
    fake.tables.coupon_redemptions.indexes.find((i) => i.name === 'coupon_redemptions_coupon_user_unique').unique = false;
    await assert.rejects(ops.verify(fake.queryInterface, FakeSequelize, fake.sequelize), /유일 여부/);
});

test('0024 verify: 신고 중복 막는 인덱스 칸 순서가 다르면 멈춤', async () => {
    const fake = createFakeDb({ users: { columns: {}, indexes: [] } });
    await runUp(ops, fake);
    fake.tables.reports.indexes.find((i) => i.name === 'reports_reporter_target_game_unique').fields = ['game_id', 'reporter_id', 'target_id'];
    await assert.rejects(ops.verify(fake.queryInterface, FakeSequelize, fake.sequelize), /칸이 다릅니다/);
});

test('0024 verify: 외래 키 빠지면 멈춤 (쿠폰 사용 → 사용자)', async () => {
    const fake = createFakeDb({ users: { columns: {}, indexes: [] } });
    await runUp(ops, fake);
    delete fake.tables.coupon_redemptions.columns.user_id.references;
    await assert.rejects(ops.verify(fake.queryInterface, FakeSequelize, fake.sequelize), /외래 키/);
});

test('0024: 약관 버전·동의 표는 안 만듦 (회원 기능 쪽 몫)', () => {
    assert.ok(!Object.values(ops.TABLES).some((name) => /term|consent|agreement/i.test(name)));
});

test('0024 down: 가리키는 표부터 지워 전부 없앰', async () => {
    const fake = createFakeDb({ users: { columns: {}, indexes: [] } });
    await runUp(ops, fake);
    await ops.down(fake.queryInterface);
    const dropped = fake.calls.filter((c) => c[0] === 'dropTable').map((c) => c[1]);
    assert.equal(dropped.indexOf('coupon_redemptions') < dropped.indexOf('coupons'), true);
    assert.equal(dropped.indexOf('report_chat_evidence') < dropped.indexOf('reports'), true);
    assert.equal(dropped.indexOf('admin_audit_logs') < dropped.indexOf('admin_users'), true);
});

const periodDb = () => createFakeDb({
    users: { columns: {}, indexes: [] },
    game_results: { columns: {}, indexes: [] },
    economy_topup_orders: { columns: {}, indexes: [{ name: 'economy_topup_orders_payment_key_unique', unique: true, fields: ['payment_key'] }] },
});

test('0025: 기간 인덱스 3개 만들고 verify 통과, 다시 돌리면 안 만듦', async () => {
    const fake = periodDb();
    await periodIndexes.up(fake.queryInterface);
    assert.deepEqual(fake.calls.map((c) => c[2]), ['users_created_at_idx', 'game_results_ended_at_idx', 'economy_topup_orders_created_at_idx']);
    await periodIndexes.verify(fake.queryInterface);
    await periodIndexes.up(fake.queryInterface);
    assert.equal(fake.calls.length, 3);
});

test('0025 verify: 같은 이름이 다른 칸을 덮으면 멈춤', async () => {
    const fake = periodDb();
    fake.tables.users.indexes.push({ name: 'users_created_at_idx', unique: false, fields: ['updated_at'] });
    await periodIndexes.up(fake.queryInterface);
    await assert.rejects(periodIndexes.verify(fake.queryInterface), /칸이 다릅니다/);
});

test('0025 down: 만든 인덱스만 지움 (결제 키 유일 인덱스는 그대로)', async () => {
    const fake = periodDb();
    await periodIndexes.up(fake.queryInterface);
    await periodIndexes.down(fake.queryInterface);
    assert.deepEqual(fake.tables.economy_topup_orders.indexes.map((i) => i.name), ['economy_topup_orders_payment_key_unique']);
});

test('migrate-db 목록: 0024·0025가 0023 뒤에 이 순서로, 번호 안 겹침', () => {
    const names = MIGRATIONS.map((m) => m.name);
    const at = names.indexOf('0023-uuid-type-room-and-banned-by');
    assert.deepEqual(names.slice(at, at + 3), ['0023-uuid-type-room-and-banned-by', '0024-add-operations-tables', '0025-add-period-indexes']);
    const numbers = names.map((n) => n.slice(0, 4));
    assert.equal(new Set(numbers).size, numbers.length);
});

// ── 충전 주문 REFUNDED ──

test('충전 주문: REFUNDED 상태가 있음 (관리자 환불 표시용)', () => {
    assert.equal(ORDER_STATUS.REFUNDED, 'REFUNDED');
});

test('충전 확인: 환불된 주문은 결제사에 다시 안 묻고 409 ORDER_REFUNDED (다시 지급 안 함)', async () => {
    const order = { order_id: 'order-123456', user_id: 'u1', pay_amount: 1000, status: 'REFUNDED', payment_key: 'pk_1' };
    let adapterCalled = false;
    const db = {
        sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }) },
        EconomyTopupOrder: { findOne: async () => order, update: async () => [1] },
    };
    const adapter = { assertConfigured: () => { adapterCalled = true; }, confirmPayment: async () => { adapterCalled = true; } };
    await assert.rejects(
        confirmTopupOrder({ userId: 'u1', orderId: 'order-123456', paymentKey: 'pk_1', amount: 1000 }, { db, adapter }),
        (e) => e.code === 'ORDER_REFUNDED' && e.status === 409,
    );
    assert.equal(adapterCalled, false);
});

test('충전 오류 응답: ORDER_REFUNDED는 409 + 정한 문구로 나감 (500으로 안 숨음)', () => {
    const { globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
    const { createError } = require('../../utils/appError');
    const res = { headers: {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, set(k, v) { this.headers[k] = v; return this; } };
    globalErrorHandler(createError('x', 409, 'ORDER_REFUNDED'), { method: 'POST', url: '/economy/topup/orders/o/confirm', originalUrl: '/economy/topup/orders/o/confirm' }, res, () => {});
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { ok: false, code: 'ORDER_REFUNDED', message: '환불된 주문입니다.' });
});

// ── 판 끝 → 보관 끝 표시 ──

test('판 끝 마무리: finalizeGameSessionEnd가 판 채팅 보관에 끝 표시 (10분 뒤 사라짐)', (t) => {
    const end = require('../../socket/gameSession/departure/end');
    const T0 = Date.now();
    chatBuffer.__resetForTests();
    t.after(() => chatBuffer.__resetForTests());
    chatBuffer.recordGameChatMessage('g-end', { channel: 'DAY', text: 'gg' });
    const originalError = console.error;
    console.error = () => {};
    try {
        end.finalizeGameSessionEnd(null, { id: 'g-end', players: new Map(), channelId: 'c', phase: 'ENDED' }, 'TEST', null, []);
    } catch { /* 가짜 판이라 뒤 단계 실패는 무시, 끝 표시는 맨 앞 */ } finally { console.error = originalError; }
    assert.equal(chatBuffer.getGameChatMessages('g-end', { now: () => T0 + 60_000 }).length, 1);
    assert.equal(chatBuffer.getGameChatMessages('g-end', { now: () => T0 + chatBuffer.KEEP_AFTER_END_MS + 1000 }).length, 0);
});
