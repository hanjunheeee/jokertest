'use strict';

// 상품 통합 시험 (AD-190·191·193), 진짜 시험 DB + 관리자 라우터 + 게임 서버 상점·주문 함수
// npm run test:with-db -- tests/admin/products.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');
const money = require('./helpers/money');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const economy = () => require('../../services/economy');
const fakePay = { getClientKey: () => 'test_ck_admin' };

const newProduct = (patch = {}) => ({
    productId: `adm-dia-${crypto.randomBytes(3).toString('hex')}`, kind: 'DIAMOND_TOPUP', displayName: '다이아 110개',
    payAmount: 1100, grantAmount: 100, bonusAmount: 10, sortOrder: 5, ...patch,
});

test('AD-190: 만들기 201(version 1) → 값 고침 → version+1, 플레이어 상품 목록에 새 값, 판매 끄면 안 보임, 기록 둘', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const input = newProduct();

    const made = await agent.post('/admin-api/products', input);
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.product.version, 1);
    assert.equal(made.body.product.payCurrency, 'KRW');
    assert.equal(made.body.product.status, 'ON_SALE');
    const dup = await agent.post('/admin-api/products', input);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'PRODUCT_EXISTS');

    const res = await agent.request('PATCH', `/admin-api/products/${input.productId}`, { body: { expectedVersion: 1, payAmount: 1200, grantAmount: 120 } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.product.version, 2);
    assert.equal(res.body.product.payAmount, 1200);

    const shop = await economy().listCurrencyProducts({ kind: 'DIAMOND_TOPUP' }, db());
    const seen = shop.find((product) => product.productId === input.productId);
    assert.equal(seen.payAmount, 1200);
    assert.equal(seen.grantAmount, 120);
    assert.equal(seen.version, 2);

    const stop = await agent.request('PATCH', `/admin-api/products/${input.productId}`, { body: { expectedVersion: 2, status: 'STOPPED' } });
    assert.equal(stop.status, 200);
    const after = await economy().listCurrencyProducts({ kind: 'DIAMOND_TOPUP' }, db());
    assert.equal(after.some((product) => product.productId === input.productId), false);

    const list = await agent.get('/admin-api/products');
    const row = list.body.items.find((item) => item.productId === input.productId);
    assert.equal(row.status, 'STOPPED');
    assert.equal(row.version, 3);
    const logs = await db().AdminAuditLog.findAll({ where: { target_id: input.productId }, order: [['id', 'ASC']], raw: true });
    assert.deepEqual(logs.map((log) => log.action), ['PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_UPDATE']);
    assert.equal(logs[0].admin_id, admin.id);
});

test('AD-191: 옛 version으로 주문 → 409 PRODUCT_VERSION_MISMATCH, 이미 만든 주문 금액 그대로', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('pv');
    const input = newProduct();
    assert.equal((await agent.post('/admin-api/products', input)).status, 201);
    const order = await economy().createTopupOrder({ userId: member.uuid, productId: input.productId, version: 1 }, { db: db(), adapter: fakePay });

    const res = await agent.request('PATCH', `/admin-api/products/${input.productId}`, { body: { expectedVersion: 1, payAmount: 9900 } });
    assert.equal(res.status, 200);

    await assert.rejects(
        economy().createTopupOrder({ userId: member.uuid, productId: input.productId, version: 1 }, { db: db(), adapter: fakePay }),
        (error) => error.code === 'PRODUCT_VERSION_MISMATCH' && error.status === 409 && error.currentProduct.payAmount === 9900,
    );
    const kept = await db().EconomyTopupOrder.findOne({ where: { order_id: order.orderId }, raw: true });
    assert.equal(kept.pay_amount, 1100);
    assert.equal(kept.version, 1);
});

test('AD-193: 두 관리자가 같은 version으로 동시에 고침 → 하나만 200, 하나는 409 PRODUCT_VERSION_CONFLICT', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const { agent: other } = await adminTestApp({ t });
    const input = newProduct();
    assert.equal((await agent.post('/admin-api/products', input)).status, 201);

    const results = await Promise.all([
        agent.request('PATCH', `/admin-api/products/${input.productId}`, { body: { expectedVersion: 1, payAmount: 1500 } }),
        other.request('PATCH', `/admin-api/products/${input.productId}`, { body: { expectedVersion: 1, payAmount: 1700 } }),
    ]);
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 409]);
    const lost = results.find((res) => res.status === 409);
    assert.equal(lost.body.code, 'PRODUCT_VERSION_CONFLICT');
    assert.equal(lost.body.currentVersion, 2);
    const row = await db().EconomyCurrencyProduct.findOne({ where: { product_id: input.productId }, raw: true });
    assert.equal(row.version, 2);
    assert.equal(row.pay_amount, results.find((res) => res.status === 200).body.product.payAmount);

    // 규칙 어김·모르는 칸·없는 상품
    const bad = await agent.request('PATCH', `/admin-api/products/${input.productId}`, { body: { expectedVersion: 2, bonusAmount: -5 } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'INVALID_PRODUCT');
    assert.equal(bad.body.field, 'bonusAmount');
    const unknown = await agent.request('PATCH', `/admin-api/products/${input.productId}`, { body: { expectedVersion: 2, kind: 'GOLD_PURCHASE' } });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.field, 'kind');
    const missing = await agent.request('PATCH', '/admin-api/products/no-such-product', { body: { expectedVersion: 1, payAmount: 10 } });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'PRODUCT_NOT_FOUND');
});
