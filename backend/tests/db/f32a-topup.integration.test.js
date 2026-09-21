'use strict';

// F-32a 다이아 충전 서버 — 실제 MySQL 격리 DB + 실제 Express router·서비스·모델 + 제어 가능한 가짜
// 결제 어댑터(backend/tests/helpers/fakeTossAdapter.js). f01~f31과 같은 원칙: F01_TEST_DATABASE_URL이
// 없으면 t.skip으로 "미검증"을 남기고, 설정된 DB에 연결하지 못하면 실패다. 실제 토스 API·실제
// 테스트 결제는 호출하지 않는다(외부 입력 — 미검증). 외부 상품 작성자는 별도 연결(`sequelize`)로
// 모사한다 — 실제 외부 등록 서버와의 통합이 아니다.
//
// 이 파일의 상품 수치(1000원 → 100 + 보너스 10 = 110 다이아 등)는 **자동 시험용 임시값**이며 최종
// 상품 정책이 아니다.

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f32a-topup-integration-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const { MIGRATIONS } = require('../../scripts/migrate-db');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addCurrencyProductsTopupOrders = require('../../db/migrations/0018-add-currency-products-topup-orders');
const { buildManagedSchema, resetManagedSchema, resetManagedData } = require('../helpers/isolatedTestDb');
const { createFakeTossAdapter, installFakeAdapter, FAKE_CLIENT_KEY } = require('../helpers/fakeTossAdapter');

const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner,
});

let sequelize; // 시험 자신의 연결 — 외부 상품 작성자와 DB 검사자 역할(앱과 별도 연결)

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    await sequelize.authenticate();
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    return false;
};

// 앱이 쓰는 연결(모델 로더의 싱글턴)은 첫 require 시점의 DATABASE_URL — 위에서 맞춘 격리 DB다.
const db = require('../../models');
const userRepository = require('../../repositories/user.repositories');
const topupService = require('../../service/topup.service');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

// ── 스키마·픽스처 ───────────────────────────────────────────────────────────────────

let schemaReady = false;

const rebuildSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    schemaReady = true;
};

/** 첫 케이스는 전체 재구축, 이후는 승인된 격리 DB 확인을 거친 데이터 정리(스키마·이력 유지). */
const setUp = async () => {
    if (!schemaReady) return rebuildSchema();
    const result = await resetManagedData(sequelize, TEST_DB_URL, {
        managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER, keepTables: [migrationRunner.META_TABLE],
    });
    if (!result.cleaned) await rebuildSchema();
    return undefined;
};

const createUser = async (label = 'u') => {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'x'.repeat(60),
        nickname: `${label}${uuid.slice(0, 7 - label.length)}`.slice(0, 8),
        email: `${label}-${uuid}@example.com`,
    });
    return uuid;
};

const tokenFor = (uuid) => jwt.sign({ uuid, role: 'USER', sessionId: `session-${uuid}` }, process.env.JWT_SECRET, { expiresIn: '1d' });

const stubAuthGate = (t) => {
    const keys = ['findActiveSession', 'checkActiveBan', 'findByUuid'];
    const originals = Object.fromEntries(keys.map((key) => [key, userRepository[key]]));
    userRepository.findActiveSession = async (id, userId) => ({ id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null });
    userRepository.checkActiveBan = async () => null;
    userRepository.findByUuid = async (uuid) => ({ uuid, role: 'USER' });
    t.after(() => Object.assign(userRepository, originals));
};

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/economy', require('../../routes/economy.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); }));
    return `http://127.0.0.1:${server.address().port}`;
};

const http = (base) => async (path, { method = 'GET', user, body, signal } = {}) => {
    const headers = {};
    if (user) headers.cookie = `accessToken=${tokenFor(user)}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(new URL(path, base), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
};

/** 서버·인증·가짜 어댑터를 한 번에 세운다. */
const boot = async (t, adapterOptions) => {
    stubAuthGate(t);
    const fake = installFakeAdapter(t, createFakeTossAdapter(adapterOptions));
    const base = await startServer(t);
    const call = http(base);
    return {
        fake,
        call,
        listProducts: (user, query = '') => call(`/economy/currency-products${query}`, { user }),
        createOrder: (user, body) => call('/economy/topup/orders', { method: 'POST', user, body }),
        confirm: (user, orderId, paymentKey, amount, extra = {}) => call(`/economy/topup/orders/${orderId}/confirm`, {
            method: 'POST', user, body: { paymentKey, amount, ...extra },
        }),
        getOrder: (user, orderId, query = '') => call(`/economy/topup/orders/${orderId}${query}`, { user }),
    };
};

// ── 외부 상품 작성자 모사(별도 연결의 raw SQL) ─────────────────────────────────────────

const TEST_PRODUCT = Object.freeze({
    product_id: 'test-topup-1', kind: 'DIAMOND_TOPUP', display_name: '시험용 다이아 상품(임시값)',
    pay_currency: 'KRW', pay_amount: 1000, grant_currency: 'DIAMOND', grant_amount: 100, bonus_amount: 10,
    status: 'ON_SALE', sort_order: 0, version: 1,
});

const insertProduct = async (overrides = {}) => {
    const row = { ...TEST_PRODUCT, ...overrides };
    await sequelize.query(
        `INSERT INTO economy_currency_products
           (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount, status, sort_order, version, created_at, updated_at)
         VALUES (:product_id, :kind, :display_name, :pay_currency, :pay_amount, :grant_currency, :grant_amount, :bonus_amount, :status, :sort_order, :version, NOW(), NOW())`,
        { replacements: row },
    );
    return row;
};

const updateProductAtomically = (productId, fields) => sequelize.query(
    `UPDATE economy_currency_products
        SET pay_amount = :pay_amount, grant_amount = :grant_amount, bonus_amount = :bonus_amount,
            status = :status, version = version + 1, updated_at = NOW()
      WHERE product_id = :productId`,
    { replacements: { pay_amount: 1000, grant_amount: 100, bonus_amount: 10, status: 'ON_SALE', ...fields, productId } },
);

// ── DB 검사(앱과 다른 연결) ────────────────────────────────────────────────────────────

const one = async (sql, replacements) => {
    const [rows] = await sequelize.query(sql, { replacements });
    return rows[0] ?? null;
};
const orderRow = (orderId) => one('SELECT * FROM economy_topup_orders WHERE order_id = :orderId', { orderId });
const ledgerCount = async (userId, orderId) => Number((await one(
    'SELECT COUNT(*) AS n FROM economy_ledger_entries WHERE user_id = :userId AND reference_event_id = :ref',
    { userId, ref: `topup:${orderId}` },
)).n);
const topupLedgerTotal = async () => Number((await one(
    "SELECT COUNT(*) AS n FROM economy_ledger_entries WHERE reason = 'DIAMOND_TOPUP'", {},
)).n);
const diamondBalance = async (userId) => Number((await one(
    'SELECT COALESCE(SUM(balance_diamond), 0) AS n FROM economy_wallets WHERE user_id = :userId', { userId },
)).n);
const ledgerEntry = (userId, orderId) => one(
    'SELECT * FROM economy_ledger_entries WHERE user_id = :userId AND reference_event_id = :ref',
    { userId, ref: `topup:${orderId}` },
);

/** 주문 하나와 그에 대응하는 제공자 쪽 결제를 만든다(사용자가 결제창에서 인증을 마친 상태). */
const orderWithPayment = async (ctx, user, { scenario = 'approve', amount = 1000 } = {}) => {
    const created = await ctx.createOrder(user, { productId: TEST_PRODUCT.product_id, version: 1 });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const { orderId } = created.json;
    const paymentKey = `pay_${crypto.randomBytes(8).toString('hex')}`;
    ctx.fake.registerPayment(paymentKey, { orderId, amount, scenario });
    return { orderId, paymentKey };
};

/** 별도 연결이 주문 행 잠금을 바로 얻을 수 있는지 — 외부 승인 대기 중 잠금이 없다는 근거(A-05). */
const assertOrderRowLockable = async (orderId) => {
    await sequelize.transaction(async (transaction) => {
        await sequelize.query('SET SESSION innodb_lock_wait_timeout = 2', { transaction });
        try {
            const [rows] = await sequelize.query(
                'SELECT order_id FROM economy_topup_orders WHERE order_id = :orderId FOR UPDATE',
                { replacements: { orderId }, transaction },
            );
            assert.equal(rows.length, 1);
        } finally {
            await sequelize.query('SET SESSION innodb_lock_wait_timeout = 50', { transaction });
        }
    });
};

/**
 * 앱의 싱글턴(models/index.js)과 **별개의 새 Sequelize 연결**(같은 격리 테스트 DB)로 모델을 다시
 * 초기화해 db 핸들을 만든다. 서비스에 deps.db로 넘기면 메모리 상태·연결 풀·모델 인스턴스를 앱과
 * 공유하지 않는 "새 프로세스" 서비스 인스턴스가 된다 — 복구가 DB에 영속된 값만으로 이어지는지 본다.
 */
const openSeparateDb = async (t) => {
    const separate = new Sequelize(TEST_DB_URL, { logging: false });
    t.after(() => separate.close());
    await separate.authenticate();

    const handle = {};
    const load = (dir) => {
        for (const file of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) load(fullPath);
            else if (file.indexOf('.') !== 0 && file !== 'index.js' && file.endsWith('.js') && !file.includes('.test.js')) {
                const model = require(fullPath)(separate, Sequelize.DataTypes);
                handle[model.name] = model;
            }
        }
    };
    load(path.join(__dirname, '../../models'));
    for (const name of Object.keys(handle)) if (handle[name].associate) handle[name].associate(handle);
    handle.sequelize = separate;
    handle.Sequelize = Sequelize;

    const [[appConn]] = await db.sequelize.query('SELECT CONNECTION_ID() AS id');
    const [[freshConn]] = await separate.query('SELECT CONNECTION_ID() AS id');
    assert.notEqual(handle.sequelize, db.sequelize);
    assert.notEqual(handle.EconomyTopupOrder, db.EconomyTopupOrder, '모델 인스턴스를 앱과 공유하지 않는다');
    assert.notEqual(freshConn.id, appConn.id, '앱과 다른 DB 연결이다');
    return handle;
};

// ═══ AC-06(상품 계약): 외부 작성자의 커밋이 서버 재시작 없이 반영된다 ═══════════════════

test('AC-06: 별도 연결의 상품 등록·수정·판매 중지·삭제가 서버 재시작 없이 목록·주문에 반영된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('prod');

    // 빈 상품표
    const empty = await ctx.listProducts(user);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.json, { ok: true, products: [] });

    // 등록 → 다음 조회에 반영(공개 필드만)
    await insertProduct();
    await insertProduct({ product_id: 'test-gold-1', kind: 'GOLD_PURCHASE', pay_currency: 'DIAMOND', pay_amount: 50, grant_currency: 'GOLD', grant_amount: 500, bonus_amount: 0, sort_order: 5 });
    const listed = await ctx.listProducts(user);
    assert.deepEqual(listed.json.products.map((p) => p.productId), ['test-topup-1', 'test-gold-1']);
    assert.deepEqual(listed.json.products[0], {
        productId: 'test-topup-1', kind: 'DIAMOND_TOPUP', displayName: '시험용 다이아 상품(임시값)', payCurrency: 'KRW',
        payAmount: 1000, grantCurrency: 'DIAMOND', grantAmount: 100, bonusAmount: 10, version: 1,
    });
    assert.deepEqual((await ctx.listProducts(user, '?kind=DIAMOND_TOPUP')).json.products.map((p) => p.productId), ['test-topup-1']);
    assert.deepEqual((await ctx.listProducts(user, '?kind=GOLD_PURCHASE')).json.products.map((p) => p.productId), ['test-gold-1']);

    // 골드 구매 상품은 충전 주문의 근거가 될 수 없다
    const goldOrder = await ctx.createOrder(user, { productId: 'test-gold-1', version: 1 });
    assert.equal(goldOrder.status, 404);
    assert.equal(goldOrder.json.code, 'PRODUCT_NOT_FOUND');

    // 가격·지급량·version을 한 문장으로 수정 → 다음 조회에 반영, 오래된 version은 거부 + 현재 상품
    await updateProductAtomically('test-topup-1', { pay_amount: 2000, grant_amount: 250, bonus_amount: 30 });
    const changed = (await ctx.listProducts(user, '?kind=DIAMOND_TOPUP')).json.products[0];
    assert.deepEqual([changed.payAmount, changed.grantAmount, changed.bonusAmount, changed.version], [2000, 250, 30, 2]);

    const stale = await ctx.createOrder(user, { productId: 'test-topup-1', version: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.code, 'PRODUCT_VERSION_MISMATCH');
    assert.deepEqual(stale.json.product, changed, '현재 상품은 검증된 공개 필드만 실려야 한다');
    assert.equal(await one('SELECT COUNT(*) AS n FROM economy_topup_orders', {}).then((r) => Number(r.n)), 0, '거부된 주문은 저장되지 않는다');

    const fresh = await ctx.createOrder(user, { productId: 'test-topup-1', version: 2 });
    assert.equal(fresh.status, 201);
    assert.equal(fresh.json.amount, 2000);
    assert.equal(fresh.json.clientKey, FAKE_CLIENT_KEY);

    // 판매 중지 → 목록에서 빠지고 주문 거부
    await updateProductAtomically('test-topup-1', { pay_amount: 2000, grant_amount: 250, bonus_amount: 30, status: 'STOPPED' });
    assert.deepEqual((await ctx.listProducts(user, '?kind=DIAMOND_TOPUP')).json.products, []);
    const stopped = await ctx.createOrder(user, { productId: 'test-topup-1', version: 3 });
    assert.equal(stopped.status, 409);
    assert.equal(stopped.json.code, 'PRODUCT_STOPPED');

    // 삭제 → 주문 거부(이미 만든 주문은 남는다 — 스냅샷 시험이 별도로 검사)
    await sequelize.query("DELETE FROM economy_currency_products WHERE product_id = 'test-topup-1'");
    const gone = await ctx.createOrder(user, { productId: 'test-topup-1', version: 3 });
    assert.equal(gone.status, 404);
    assert.equal(gone.json.code, 'PRODUCT_NOT_FOUND');
    assert.equal((await orderRow(fresh.json.orderId)).pay_amount, 2000, '삭제된 상품의 기존 주문은 그대로 남는다');
});

test('AC-06: 잘못된 통화 조합·0/음수 수량·음수 보너스·한도 초과·알 수 없는 종류/상태 행은 목록과 주문에서 제외된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('bad');

    await insertProduct({ product_id: 'valid-1' });
    const invalid = {
        'wrong-pair-1': { pay_currency: 'DIAMOND', grant_currency: 'DIAMOND' },
        'wrong-pair-2': { kind: 'DIAMOND_TOPUP', pay_currency: 'KRW', grant_currency: 'GOLD' },
        'zero-price': { pay_amount: 0 },
        'negative-price': { pay_amount: -5 },
        'zero-grant': { grant_amount: 0 },
        'negative-grant': { grant_amount: -1 },
        'negative-bonus': { bonus_amount: -1 },
        'over-limit': { grant_amount: 1_000_000_000, bonus_amount: 1 },
        'unknown-kind': { kind: 'SKIN' },
        'unknown-status': { status: 'HIDDEN' },
        'lowercase-status': { status: 'on_sale' },
        'zero-version': { version: 0 },
    };
    for (const [productId, overrides] of Object.entries(invalid)) await insertProduct({ product_id: productId, ...overrides });

    const listed = await ctx.listProducts(user);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.json.products.map((p) => p.productId), ['valid-1']);

    for (const productId of Object.keys(invalid)) {
        const res = await ctx.createOrder(user, { productId, version: 1 });
        assert.ok([404, 409].includes(res.status), `${productId}: ${res.status}`);
        assert.ok(['PRODUCT_NOT_FOUND', 'PRODUCT_STOPPED'].includes(res.json.code), `${productId}: ${res.json.code}`);
        // 잘못된 행에 대해 성공 주문이 만들어지면 안 된다
        assert.notEqual(res.status, 201, productId);
    }
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM economy_topup_orders', {})).n), 0);
});

test('AC-06: 상품 조회 DB 오류는 빈 목록이 아니라 5xx다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('dberr');
    await insertProduct();

    const original = db.EconomyCurrencyProduct.findAll;
    db.EconomyCurrencyProduct.findAll = async () => { throw Object.assign(new Error('injected'), { code: 'ER_INJECTED' }); };
    t.after(() => { db.EconomyCurrencyProduct.findAll = original; });

    const res = await ctx.listProducts(user);
    assert.equal(res.status, 500);
    assert.equal(res.json.code, 'SERVER_ERROR');
    assert.equal(res.json.products, undefined);
});

// ═══ AC-01: 정상 승인 → 정확히 1회 지급, 지급량은 서버 상품표 스냅샷 ═══════════════════

test('AC-01: 정상 승인 뒤 다이아가 스냅샷 합계(110)만큼 정확히 1회 지급되고 원장·주문·응답이 일치한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('ac01');
    await insertProduct();

    const { orderId, paymentKey } = await orderWithPayment(ctx, user);

    // 승인 전: 스냅샷만 저장되고 원장 0건·증분 0
    const before = await orderRow(orderId);
    assert.deepEqual(
        [before.status, before.product_id, before.version, before.pay_amount, before.grant_amount, before.bonus_amount, before.payment_key],
        ['CREATED', 'test-topup-1', 1, 1000, 100, 10, null],
    );
    assert.equal(await ledgerCount(user, orderId), 0);
    assert.equal(await diamondBalance(user), 0);

    const confirmed = await ctx.confirm(user, orderId, paymentKey, 1000);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.json));
    assert.deepEqual(confirmed.json, { ok: true, status: 'GRANTED', balanceDiamond: 110 });

    const after = await orderRow(orderId);
    assert.equal(after.status, 'GRANTED');
    assert.equal(after.payment_key, paymentKey);
    assert.equal(after.lease_token, null);
    assert.ok(after.approved_at && after.granted_at);
    assert.equal(await ledgerCount(user, orderId), 1);
    assert.equal(await topupLedgerTotal(), 1);
    assert.equal(await diamondBalance(user), 110);

    const entry = await ledgerEntry(user, orderId);
    assert.deepEqual(
        [entry.reason, entry.currency, entry.amount, entry.balance_after, entry.item_id, entry.reference_event_id],
        ['DIAMOND_TOPUP', 'DIAMOND', 110, 110, null, `topup:${orderId}`],
    );

    // 제공자 호출은 1회, 멱등키는 주문에서 복원되는 값
    assert.equal(ctx.fake.callsOf('confirm').length, 1);
    assert.equal(ctx.fake.callsOf('confirm')[0].idempotencyKey, `topup-confirm:${orderId}`);

    // 조회·재확인은 저장된 결과이고 추가 지급·제공자 호출이 없다
    const fetched = await ctx.getOrder(user, orderId);
    assert.equal(fetched.json.status, 'GRANTED');
    assert.equal(fetched.json.balanceDiamond, 110);
    assert.ok(!JSON.stringify(fetched.json).includes(paymentKey), '결제키는 조회 응답에 싣지 않는다');
    const again = await ctx.confirm(user, orderId, paymentKey, 1000);
    assert.deepEqual(again.json, { ok: true, status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(await ledgerCount(user, orderId), 1);
    assert.equal(await diamondBalance(user), 110);
    assert.equal(ctx.fake.callsOf('confirm').length, 1);

    // 기존 본인 지갑 조회에도 반영된다
    const wallet = await ctx.call(`/economy/accounts/${user}/wallet`, { user });
    assert.equal(wallet.json.balanceDiamond, 110);
});

test('AC-01(A-03): 주문 뒤 상품 가격·지급량·version 변경과 삭제에도 승인 금액 1000·지급량 110이 유지된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('snap');
    await insertProduct();

    const first = await orderWithPayment(ctx, user);
    const second = await orderWithPayment(ctx, user);

    await updateProductAtomically('test-topup-1', { pay_amount: 5000, grant_amount: 500, bonus_amount: 99 });
    // 새 가격으로는 승인 대조가 거부된다
    const wrongAmount = await ctx.confirm(user, first.orderId, first.paymentKey, 5000);
    assert.equal(wrongAmount.status, 400);
    assert.equal(wrongAmount.json.code, 'AMOUNT_MISMATCH');
    assert.equal(await diamondBalance(user), 0);

    const granted = await ctx.confirm(user, first.orderId, first.paymentKey, 1000);
    assert.deepEqual(granted.json, { ok: true, status: 'GRANTED', balanceDiamond: 110 });

    await sequelize.query("DELETE FROM economy_currency_products WHERE product_id = 'test-topup-1'");
    const afterDelete = await ctx.confirm(user, second.orderId, second.paymentKey, 1000);
    assert.deepEqual(afterDelete.json, { ok: true, status: 'GRANTED', balanceDiamond: 220 });
    assert.equal(await diamondBalance(user), 220);
    assert.equal((await orderRow(second.orderId)).grant_amount, 100);
});

// ═══ AC-02: 변조·타인·복귀·실패·취소는 미지급 ═════════════════════════════════════════

const assertNothingGranted = async (user, orderId) => {
    assert.equal(await ledgerCount(user, orderId), 0, '원장이 없어야 한다');
    assert.equal(await diamondBalance(user), 0, '다이아 증분이 없어야 한다');
};

test('AC-02: 타인 계정의 주문 조회·확인, 없는 주문, 금액·필드 변조는 모두 거부되고 지급·제공자 호출이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const owner = await createUser('own');
    const other = await createUser('oth');
    await insertProduct();
    const { orderId, paymentKey } = await orderWithPayment(ctx, owner);

    const foreignGet = await ctx.getOrder(other, orderId);
    assert.deepEqual([foreignGet.status, foreignGet.json.code], [403, 'NOT_OWNER']);
    const foreignConfirm = await ctx.confirm(other, orderId, paymentKey, 1000);
    assert.deepEqual([foreignConfirm.status, foreignConfirm.json.code], [403, 'NOT_OWNER']);

    const missing = crypto.randomUUID();
    assert.deepEqual((await ctx.getOrder(owner, missing)).json.code, 'ORDER_NOT_FOUND');
    assert.equal((await ctx.confirm(owner, missing, paymentKey, 1000)).json.code, 'ORDER_NOT_FOUND');
    assert.equal((await ctx.confirm(owner, 'x', paymentKey, 1000)).status, 404);

    for (const [amount, expectedStatus, code] of [
        [999, 400, 'AMOUNT_MISMATCH'], [1001, 400, 'AMOUNT_MISMATCH'],
        ['1000', 400, 'INVALID_TOPUP_CONFIRM_REQUEST'], [1000.5, 400, 'INVALID_TOPUP_CONFIRM_REQUEST'],
        [-1000, 400, 'INVALID_TOPUP_CONFIRM_REQUEST'], [0, 400, 'INVALID_TOPUP_CONFIRM_REQUEST'],
    ]) {
        const res = await ctx.confirm(owner, orderId, paymentKey, amount);
        assert.deepEqual([res.status, res.json.code], [expectedStatus, code], String(amount));
    }
    for (const extra of [{ userId: other }, { grantAmount: 999999 }, { orderId: crypto.randomUUID() }]) {
        const res = await ctx.confirm(owner, orderId, paymentKey, 1000, extra);
        assert.deepEqual([res.status, res.json.code], [400, 'UNKNOWN_TOPUP_CONFIRM_FIELD'], JSON.stringify(extra));
    }

    await assertNothingGranted(owner, orderId);
    await assertNothingGranted(other, orderId);
    assert.equal(ctx.fake.calls.length, 0, '외부 호출 전에 판정되어야 한다');
    const row = await orderRow(orderId);
    assert.deepEqual([row.status, row.payment_key], ['CREATED', null], '거부된 요청은 주문 상태를 바꾸지 않는다');
});

test('AC-02: 결제창 복귀를 모사한 GET(쿼리)만으로는 승인·지급하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('ret');
    await insertProduct();
    const { orderId, paymentKey } = await orderWithPayment(ctx, user);

    const res = await ctx.getOrder(user, orderId, `?paymentKey=${paymentKey}&orderId=${orderId}&amount=1000`);
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'CREATED');
    assert.equal(ctx.fake.calls.length, 0);
    assert.deepEqual([(await orderRow(orderId)).status, (await orderRow(orderId)).payment_key], ['CREATED', null]);
    await assertNothingGranted(user, orderId);
});

test('AC-02: 결제키·주문 변조 — 다른 주문이 점유한 키, 이미 저장된 키와 다른 키, 다른 주문용 결제키는 미지급이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('key');
    await insertProduct();

    const first = await orderWithPayment(ctx, user);
    const second = await orderWithPayment(ctx, user);
    const third = await orderWithPayment(ctx, user);

    // (1) 첫 주문이 GRANTED가 된 뒤 그 결제키를 둘째 주문에 끼워 넣는다
    assert.equal((await ctx.confirm(user, first.orderId, first.paymentKey, 1000)).status, 200);
    const conflict = await ctx.confirm(user, second.orderId, first.paymentKey, 1000);
    assert.deepEqual([conflict.status, conflict.json.code], [409, 'PAYMENT_KEY_CONFLICT']);
    assert.deepEqual([(await orderRow(second.orderId)).status, (await orderRow(second.orderId)).payment_key], ['CREATED', null]);
    assert.equal(await ledgerCount(user, second.orderId), 0);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM economy_topup_orders WHERE payment_key = :key', { key: first.paymentKey })).n), 1);

    // (2) 제공자에 등록된 결제키가 다른 주문(third)용이다 — 둘째 주문에 제출하면 제공자가 거절 → 미지급
    const wrongOrder = await ctx.confirm(user, second.orderId, third.paymentKey, 1000);
    assert.deepEqual([wrongOrder.status, wrongOrder.json.code], [402, 'PAYMENT_FAILED']);
    assert.equal((await orderRow(second.orderId)).status, 'FAILED');
    assert.equal(await ledgerCount(user, second.orderId), 0);

    // (3) 이미 GRANTED인 주문도 소유권·금액·결제키를 먼저 비교한다
    const otherUser = await createUser('key2');
    const regrantOther = await ctx.confirm(otherUser, first.orderId, first.paymentKey, 1000);
    assert.equal(regrantOther.json.code, 'NOT_OWNER');
    assert.equal((await ctx.confirm(user, first.orderId, first.paymentKey, 999)).json.code, 'AMOUNT_MISMATCH');
    assert.equal((await ctx.confirm(user, first.orderId, 'pay_other_key', 1000)).json.code, 'PAYMENT_KEY_MISMATCH');
    assert.equal(await ledgerCount(user, first.orderId), 1);
    assert.equal(await diamondBalance(user), 110, '첫 주문의 110만 지급되어 있어야 한다');

    // (4) 키가 저장된 CONFIRMING(입금 대기) 주문에 다른 키를 제출
    const waiting = await orderWithPayment(ctx, user, { scenario: 'waiting' });
    assert.equal((await ctx.confirm(user, waiting.orderId, waiting.paymentKey, 1000)).status, 503);
    const callsBefore = ctx.fake.calls.length;
    const swapped = await ctx.confirm(user, waiting.orderId, third.paymentKey, 1000);
    assert.deepEqual([swapped.status, swapped.json.code], [409, 'PAYMENT_KEY_MISMATCH']);
    assert.equal(ctx.fake.calls.length, callsBefore, '키 불일치는 외부 호출 전에 거부된다');
});

test('AC-02: 제공자 응답이 변조(금액·주문·결제키 불일치)되면 지급하지 않고 FAILED로 남는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('tamp');
    await insertProduct();

    for (const scenario of ['tamper-amount', 'tamper-order', 'tamper-key']) {
        const { orderId, paymentKey } = await orderWithPayment(ctx, user, { scenario });
        const res = await ctx.confirm(user, orderId, paymentKey, 1000);
        assert.deepEqual([res.status, res.json.code], [402, 'PAYMENT_FAILED'], scenario);
        const row = await orderRow(orderId);
        assert.deepEqual([row.status, row.failure_code], ['FAILED', 'PAYMENT_MISMATCH'], scenario);
        await assertNothingGranted(user, orderId);
    }
});

test('AC-02: 실패·취소·만료·입금 대기·미등록 결제는 미지급이고 종단 상태는 재확인해도 제공자를 다시 부르지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('fail');
    await insertProduct();

    const expected = { reject: 'FAILED', cancel: 'CANCELED', expire: 'EXPIRED' };
    for (const [scenario, status] of Object.entries(expected)) {
        const { orderId, paymentKey } = await orderWithPayment(ctx, user, { scenario });
        const res = await ctx.confirm(user, orderId, paymentKey, 1000);
        assert.deepEqual([res.status, res.json.code], [402, 'PAYMENT_FAILED'], scenario);
        assert.equal((await orderRow(orderId)).status, status, scenario);
        assert.equal((await ctx.getOrder(user, orderId)).json.status, status, scenario);
        await assertNothingGranted(user, orderId);

        const callsBefore = ctx.fake.calls.length;
        const retry = await ctx.confirm(user, orderId, paymentKey, 1000);
        assert.equal(retry.json.code, 'PAYMENT_FAILED', scenario);
        assert.equal(ctx.fake.calls.length, callsBefore, `${scenario}: 종단 상태는 제공자를 다시 부르지 않는다`);
    }

    // 입금 대기 — 승인 전이므로 지급하지 않고 CONFIRMING으로 남는다
    const waiting = await orderWithPayment(ctx, user, { scenario: 'waiting' });
    const res = await ctx.confirm(user, waiting.orderId, waiting.paymentKey, 1000);
    assert.deepEqual([res.status, res.json.code], [503, 'PAYMENT_PROCESSING']);
    assert.equal((await orderRow(waiting.orderId)).status, 'CONFIRMING');
    assert.equal((await ctx.getOrder(user, waiting.orderId)).json.status, 'CONFIRMING');
    await assertNothingGranted(user, waiting.orderId);

    // 제공자에 없는 결제키
    const created = await ctx.createOrder(user, { productId: 'test-topup-1', version: 1 });
    const unknown = await ctx.confirm(user, created.json.orderId, 'pay_never_registered', 1000);
    assert.deepEqual([unknown.status, unknown.json.code], [402, 'PAYMENT_FAILED']);
    await assertNothingGranted(user, created.json.orderId);
});

// ═══ AC-05: 설정 미비·live 키 ═══════════════════════════════════════════════════════════

test('AC-05: 결제 설정이 없으면(가짜 어댑터) 주문·승인이 CONFIG_MISSING으로 실패하고 주문·지급이 바뀌지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('cfg');
    await insertProduct();

    const { orderId, paymentKey } = await orderWithPayment(ctx, user);
    ctx.fake.setConfigMissing(true);

    const newOrder = await ctx.createOrder(user, { productId: 'test-topup-1', version: 1 });
    assert.deepEqual([newOrder.status, newOrder.json.code], [503, 'CONFIG_MISSING']);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM economy_topup_orders', {})).n), 1, '설정 미비로 주문이 만들어지면 안 된다');

    const res = await ctx.confirm(user, orderId, paymentKey, 1000);
    assert.deepEqual([res.status, res.json.code], [503, 'CONFIG_MISSING']);
    const row = await orderRow(orderId);
    assert.deepEqual([row.status, row.payment_key], ['CREATED', null], '기존 주문을 성공으로도 바꾸지 않는다');
    assert.equal(ctx.fake.calls.length, 0);
    await assertNothingGranted(user, orderId);

    // 설정이 복구되면 같은 주문이 정상 진행된다
    ctx.fake.setConfigMissing(false);
    assert.equal((await ctx.confirm(user, orderId, paymentKey, 1000)).json.status, 'GRANTED');
});

test('AC-05: 실제 어댑터 — 키 누락·live 키는 CONFIG_MISSING이고, test 키의 주문 생성은 공개 clientKey만 돌려준다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    stubAuthGate(t);
    const call = http(await startServer(t)); // 가짜 어댑터를 끼우지 않는다 — 실제 tossAdapter
    const user = await createUser('real');
    await insertProduct();

    const saved = { c: process.env.TOSS_TEST_CLIENT_KEY, s: process.env.TOSS_TEST_SECRET_KEY };
    t.after(() => {
        for (const [key, value] of [['TOSS_TEST_CLIENT_KEY', saved.c], ['TOSS_TEST_SECRET_KEY', saved.s]]) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
    const create = () => call('/economy/topup/orders', { method: 'POST', user, body: { productId: 'test-topup-1', version: 1 } });

    delete process.env.TOSS_TEST_CLIENT_KEY; delete process.env.TOSS_TEST_SECRET_KEY;
    assert.deepEqual((({ status, json }) => [status, json.code])(await create()), [503, 'CONFIG_MISSING']);

    process.env.TOSS_TEST_CLIENT_KEY = 'live_ck_abcdefghijkl1234'; process.env.TOSS_TEST_SECRET_KEY = 'live_sk_abcdefghijkl1234';
    assert.deepEqual((({ status, json }) => [status, json.code])(await create()), [503, 'CONFIG_MISSING']);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM economy_topup_orders', {})).n), 0);

    const clientKey = 'test_ck_realadapterclient0001';
    process.env.TOSS_TEST_CLIENT_KEY = clientKey; delete process.env.TOSS_TEST_SECRET_KEY;
    const created = await create();
    assert.equal(created.status, 201);
    assert.equal(created.json.clientKey, clientKey);
    assert.ok(!JSON.stringify(created.json).includes('secret'));

    // secret이 없으면 승인 호출은 설정 미비로 실패하고 주문·지급은 그대로다
    const { orderId } = created.json;
    const res = await call(`/economy/topup/orders/${orderId}/confirm`, { method: 'POST', user, body: { paymentKey: 'pay_real_key', amount: 1000 } });
    assert.deepEqual([res.status, res.json.code], [503, 'CONFIG_MISSING']);
    assert.deepEqual([(await orderRow(orderId)).status, (await orderRow(orderId)).payment_key], ['CREATED', null]);
    await assertNothingGranted(user, orderId);
});

// ═══ AC-03: DB 지급 실패·응답 유실 → 확인 중/지급 대기 → 복구 → 1회 지급 ═════════════════

test('AC-03: 제공자는 승인했지만 응답이 유실되면 CONFIRMING으로 남고, 새 서비스 인스턴스의 조회·재확인이 복구해 한 번만 지급한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('lost');
    const user2 = await createUser('lost2');
    await insertProduct();

    // (a) 조회로 복구 — 서비스 인스턴스를 새로 만들어 메모리 상태에 의존하지 않음을 확인한다
    const a = await orderWithPayment(ctx, user, { scenario: 'lost-response' });
    const lost = await ctx.confirm(user, a.orderId, a.paymentKey, 1000);
    assert.deepEqual([lost.status, lost.json.code], [503, 'PAYMENT_PROCESSING']);
    const midRow = await orderRow(a.orderId);
    assert.deepEqual([midRow.status, midRow.payment_key, midRow.lease_token], ['CONFIRMING', a.paymentKey, null]);
    assert.equal(ctx.fake.providerState(a.paymentKey), 'DONE', '제공자는 이미 승인했다');
    await assertNothingGranted(user, a.orderId);

    // 새 Sequelize 연결·새 모델 인스턴스로 만든 서비스 — 앱의 연결과 메모리를 공유하지 않는다.
    const separate = await openSeparateDb(t);
    const view = await topupService.getTopupOrder({ userId: user, orderId: a.orderId }, { db: separate });
    assert.equal(view.status, 'GRANTED');
    assert.equal(view.balanceDiamond, 110);
    assert.equal(await ledgerCount(user, a.orderId), 1);
    assert.equal(await diamondBalance(user), 110);
    assert.equal(ctx.fake.callsOf('confirm').length, 1, '복구는 다시 승인하지 않고 조회한다');
    assert.equal(ctx.fake.callsOf('get').length, 1);

    // (b) 재확인(confirm)으로 복구
    const b = await orderWithPayment(ctx, user2, { scenario: 'lost-response' });
    assert.equal((await ctx.confirm(user2, b.orderId, b.paymentKey, 1000)).status, 503);
    const retry = await ctx.confirm(user2, b.orderId, b.paymentKey, 1000);
    assert.deepEqual(retry.json, { ok: true, status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(await ledgerCount(user2, b.orderId), 1);
    assert.equal(await diamondBalance(user2), 110);
    assert.equal((await ctx.confirm(user2, b.orderId, b.paymentKey, 1000)).json.balanceDiamond, 110);
    assert.equal(await diamondBalance(user2), 110, '반복 확인이 다시 지급하면 안 된다');

    // (c) 재확인(confirm)을 새 연결의 서비스 인스턴스로 복구 — 결제키는 DB에 영속된 값으로만 이어진다
    const user3 = await createUser('lost3');
    const c = await orderWithPayment(ctx, user3, { scenario: 'lost-response' });
    assert.equal((await ctx.confirm(user3, c.orderId, c.paymentKey, 1000)).status, 503);
    assert.equal((await orderRow(c.orderId)).status, 'CONFIRMING');
    await assertNothingGranted(user3, c.orderId);
    const recovered = await topupService.confirmTopupOrder(
        { userId: user3, orderId: c.orderId, paymentKey: c.paymentKey, amount: 1000 }, { db: separate },
    );
    assert.deepEqual(recovered, { status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(await ledgerCount(user3, c.orderId), 1);
    assert.equal(await diamondBalance(user3), 110);
    assert.equal(ctx.fake.callsOf('confirm').filter((call) => call.orderId === c.orderId).length, 1, '복구는 다시 승인하지 않고 조회한다');
    const again = await topupService.confirmTopupOrder(
        { userId: user3, orderId: c.orderId, paymentKey: c.paymentKey, amount: 1000 }, { db: separate },
    );
    assert.equal(again.balanceDiamond, 110);
    assert.equal(await diamondBalance(user3), 110, '새 연결에서 반복 확인해도 다시 지급하지 않는다');
});

test('AC-03: 승인 뒤 원장 생성이 실패하면 PENDING_GRANT로 남고(원장 0건·잔액 그대로) 이후 조회·재확인이 이어서 1회 지급한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('gfail');
    const user2 = await createUser('gfail2');
    await insertProduct();

    let armed = 0;
    const original = db.EconomyLedgerEntry.create;
    db.EconomyLedgerEntry.create = async function injected(...args) {
        if (armed > 0) {
            armed -= 1;
            throw Object.assign(new Error('injected ledger failure'), { code: 'ER_INJECTED' });
        }
        return original.apply(this, args);
    };
    t.after(() => { db.EconomyLedgerEntry.create = original; });

    // (a) 지급 실패 → PENDING_GRANT → 조회가 이어서 지급
    const a = await orderWithPayment(ctx, user);
    armed = 1;
    const deferred = await ctx.confirm(user, a.orderId, a.paymentKey, 1000);
    assert.deepEqual(deferred.json, { ok: true, status: 'PENDING_GRANT' });
    const pending = await orderRow(a.orderId);
    assert.equal(pending.status, 'PENDING_GRANT');
    assert.ok(pending.approved_at, '승인 사실은 영속화되어 있다');
    await assertNothingGranted(user, a.orderId);
    assert.equal((await ctx.getOrder(user, a.orderId)).json.status, 'GRANTED', '조회가 지급을 이어서 끝낸다');
    assert.equal(await ledgerCount(user, a.orderId), 1);
    assert.equal(await diamondBalance(user), 110);
    assert.equal(ctx.fake.callsOf('confirm').length, 1);

    // (b) 지급 실패 → 같은 confirm 재시도가 이어서 지급(제공자를 다시 부르지 않는다)
    const b = await orderWithPayment(ctx, user2);
    armed = 1;
    assert.equal((await ctx.confirm(user2, b.orderId, b.paymentKey, 1000)).json.status, 'PENDING_GRANT');
    const callsBefore = ctx.fake.calls.length;
    const resumed = await ctx.confirm(user2, b.orderId, b.paymentKey, 1000);
    assert.deepEqual(resumed.json, { ok: true, status: 'GRANTED', balanceDiamond: 110 });
    assert.equal(ctx.fake.calls.length, callsBefore);
    assert.equal(await ledgerCount(user2, b.orderId), 1);
    assert.equal(await diamondBalance(user2), 110);
});

test('AC-03: 승인 사실 저장(PENDING_GRANT) 실패는 CONFIRMING에 남고 다음 조회가 제공자 상태로 복구한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('pfail');
    await insertProduct();

    const original = db.EconomyTopupOrder.prototype.update;
    let armed = true;
    db.EconomyTopupOrder.prototype.update = function injected(values, options) {
        if (armed && values && values.status === 'PENDING_GRANT') {
            armed = false;
            return Promise.reject(Object.assign(new Error('injected persist failure'), { code: 'ER_INJECTED' }));
        }
        return original.call(this, values, options);
    };
    t.after(() => { delete db.EconomyTopupOrder.prototype.update; });

    const { orderId, paymentKey } = await orderWithPayment(ctx, user);
    const failed = await ctx.confirm(user, orderId, paymentKey, 1000);
    assert.equal(failed.status, 500);
    assert.equal(failed.json.code, 'SERVER_ERROR');
    const row = await orderRow(orderId);
    assert.deepEqual([row.status, row.payment_key, row.lease_token], ['CONFIRMING', paymentKey, null], '임대는 반납된다');
    assert.equal(ctx.fake.providerState(paymentKey), 'DONE');
    await assertNothingGranted(user, orderId);

    const recovered = await ctx.getOrder(user, orderId);
    assert.equal(recovered.json.status, 'GRANTED');
    assert.equal(await ledgerCount(user, orderId), 1);
    assert.equal(await diamondBalance(user), 110);
    assert.equal(ctx.fake.callsOf('confirm').length, 1);
    assert.equal(ctx.fake.callsOf('get').length, 1);
});

test('AC-03: 요청이 제공자에 닿기 전 실패(승인 불명)는 실패로 단정하지 않고, 재확인이 같은 멱등키로 승인해 1회 지급한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('unre');
    await insertProduct();

    const { orderId, paymentKey } = await orderWithPayment(ctx, user, { scenario: 'unreached' });
    const first = await ctx.confirm(user, orderId, paymentKey, 1000);
    assert.deepEqual([first.status, first.json.code], [503, 'PAYMENT_PROCESSING']);
    assert.equal((await orderRow(orderId)).status, 'CONFIRMING');
    assert.equal(ctx.fake.providerState(paymentKey), 'IN_PROGRESS');
    await assertNothingGranted(user, orderId);

    const second = await ctx.confirm(user, orderId, paymentKey, 1000);
    assert.deepEqual(second.json, { ok: true, status: 'GRANTED', balanceDiamond: 110 });
    const keys = ctx.fake.callsOf('confirm').map((c) => c.idempotencyKey);
    assert.equal(keys.length, 2);
    assert.deepEqual(new Set(keys), new Set([`topup-confirm:${orderId}`]), '재시도에서도 멱등키가 바뀌지 않는다');
    assert.equal(await ledgerCount(user, orderId), 1);
});

test('AC-03: 지급이 커밋된 뒤 HTTP 응답이 유실되어도 이미 커밋된 지급은 대기로 되돌아가지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('resp');
    await insertProduct();
    const { orderId, paymentKey } = await orderWithPayment(ctx, user);

    // 서비스가 지급(원장 + GRANTED)을 커밋하고 돌아온 **직후, 응답이 나가기 전**에 멈추는 관찰 지점.
    // 라우터는 topupService를 모듈 객체로 호출하므로 이 감싸기가 실제 confirm 경로에 그대로 끼어든다.
    const originalConfirm = topupService.confirmTopupOrder;
    let markCommitted;
    let openResponse;
    const grantCommitted = new Promise((resolve) => { markCommitted = resolve; });
    const clientGone = new Promise((resolve) => { openResponse = resolve; });
    topupService.confirmTopupOrder = async (...args) => {
        const result = await originalConfirm.apply(topupService, args);
        markCommitted(result);
        await clientGone; // 클라이언트가 떠난 뒤에야 라우터가 응답을 쓴다
        return result;
    };
    t.after(() => { topupService.confirmTopupOrder = originalConfirm; openResponse(); });

    const controller = new AbortController();
    const inFlight = ctx.call(`/economy/topup/orders/${orderId}/confirm`, {
        method: 'POST', user, body: { paymentKey, amount: 1000 }, signal: controller.signal,
    }).then((res) => ({ res }), (error) => ({ aborted: error.name }));

    // 지급이 이미 커밋된 상태에서(응답은 아직 없다) 클라이언트가 연결을 끊는다.
    assert.deepEqual(await grantCommitted, { status: 'GRANTED', balanceDiamond: 110 });
    const committed = await orderRow(orderId);
    assert.equal(committed.status, 'GRANTED', '응답을 받기 전에 이미 GRANTED가 커밋되어 있다');
    assert.ok(committed.granted_at);
    assert.equal(await ledgerCount(user, orderId), 1);
    assert.equal(await diamondBalance(user), 110);
    controller.abort();
    const lostResult = await inFlight;
    assert.equal(lostResult.aborted, 'AbortError', '클라이언트는 응답을 받지 못했다');
    assert.equal(lostResult.res, undefined);
    openResponse(); // 서버는 끊어진 연결에 응답을 쓴다
    topupService.confirmTopupOrder = originalConfirm;

    // 응답 유실 뒤에도 커밋된 지급은 대기로 되돌아가지 않고, 재조회·재확인은 새 지급 없이 같은 결과를 준다.
    assert.equal(await ledgerCount(user, orderId), 1);
    assert.equal(await diamondBalance(user), 110);
    assert.equal((await orderRow(orderId)).status, 'GRANTED');

    const fetched = await ctx.getOrder(user, orderId);
    assert.deepEqual([fetched.json.status, fetched.json.balanceDiamond], ['GRANTED', 110]);
    const reconfirmed = await ctx.confirm(user, orderId, paymentKey, 1000);
    assert.deepEqual(reconfirmed.json, { ok: true, status: 'GRANTED', balanceDiamond: 110 });

    // 새 연결의 서비스 인스턴스에서도 같은 결과다.
    const separate = await openSeparateDb(t);
    const viaFreshConnection = await topupService.getTopupOrder({ userId: user, orderId }, { db: separate });
    assert.deepEqual([viaFreshConnection.status, viaFreshConnection.balanceDiamond], ['GRANTED', 110]);
    assert.deepEqual(
        await topupService.confirmTopupOrder({ userId: user, orderId, paymentKey, amount: 1000 }, { db: separate }),
        { status: 'GRANTED', balanceDiamond: 110 },
    );

    assert.equal(await ledgerCount(user, orderId), 1, '재조회·재확인 뒤에도 원장은 1건이다');
    assert.equal(await diamondBalance(user), 110, '잔액은 한 번만 증가했다');
    assert.equal(ctx.fake.callsOf('confirm').length, 1);
    assert.equal(ctx.fake.callsOf('get').length, 0, 'GRANTED 주문은 제공자를 다시 부르지 않는다');
});

// ═══ AC-04: 중복·동시 확인은 지급 1회, 외부 승인 중 DB 잠금 없음 ═══════════════════════════

test('AC-04(A-05): 외부 승인이 대기 중일 때 별도 연결이 주문 행 잠금을 얻고, 중복 confirm은 제공자를 다시 부르지 않으며, 해제 뒤 지급은 1회다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('conc');
    await insertProduct();
    const { orderId, paymentKey } = await orderWithPayment(ctx, user);

    const hold = ctx.fake.hold(paymentKey);
    const first = ctx.confirm(user, orderId, paymentKey, 1000);
    await hold.entered;

    // 외부 호출 중: 열린 DB 잠금이 없다
    await assertOrderRowLockable(orderId);
    const mid = await orderRow(orderId);
    assert.equal(mid.status, 'CONFIRMING');
    assert.ok(mid.lease_token && mid.lease_expires_at, '처리 임대가 저장되어 있다');

    // 같은 주문의 두 번째 confirm·조회는 유효 임대 때문에 진행하지 않는다
    const dup = await ctx.confirm(user, orderId, paymentKey, 1000);
    assert.deepEqual([dup.status, dup.json.code], [503, 'PAYMENT_PROCESSING']);
    assert.equal((await ctx.getOrder(user, orderId)).json.status, 'CONFIRMING');
    assert.equal(ctx.fake.callsOf('confirm').length, 1, '외부 승인은 한 번만 호출된다');
    assert.equal(ctx.fake.callsOf('get').length, 0);

    hold.release();
    const firstRes = await first;
    assert.deepEqual(firstRes.json, { ok: true, status: 'GRANTED', balanceDiamond: 110 });

    // 해제 뒤 confirm·조회를 동시에 재시도해도 원장·잔액은 그대로다
    const results = await Promise.all([
        ctx.confirm(user, orderId, paymentKey, 1000), ctx.confirm(user, orderId, paymentKey, 1000),
        ctx.getOrder(user, orderId), ctx.getOrder(user, orderId),
    ]);
    for (const res of results) assert.equal(res.json.status, 'GRANTED');
    assert.equal(await ledgerCount(user, orderId), 1);
    assert.equal(await diamondBalance(user), 110);
    assert.equal(ctx.fake.callsOf('confirm').length, 1);

    // 원장 유일 제약이 실제로 중복 행을 막는다(서비스 논리가 아니라 DB 제약)
    await assert.rejects(
        () => sequelize.query(
            `INSERT INTO economy_ledger_entries (user_id, reason, item_id, currency, amount, balance_after, reference_event_id, created_at)
             VALUES (:userId, 'DIAMOND_TOPUP', NULL, 'DIAMOND', 110, 220, :ref, NOW())`,
            { replacements: { userId: user, ref: `topup:${orderId}` } },
        ),
        /Duplicate|unique/i,
    );
    assert.equal(await ledgerCount(user, orderId), 1);
});

test('AC-04: 같은 주문에 대한 동시 confirm·GET 폭주에도 원장 1건·다이아 1회 증가·제공자 승인 1회다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('storm');
    await insertProduct();
    const { orderId, paymentKey } = await orderWithPayment(ctx, user);

    const results = await Promise.all([
        ...Array.from({ length: 6 }, () => ctx.confirm(user, orderId, paymentKey, 1000)),
        ...Array.from({ length: 3 }, () => ctx.getOrder(user, orderId)),
    ]);
    const confirms = results.slice(0, 6);
    for (const res of confirms) assert.ok([200, 503].includes(res.status), `${res.status} ${JSON.stringify(res.json)}`);
    assert.ok(confirms.some((res) => res.status === 200 && res.json.status === 'GRANTED'), '한 요청은 지급을 끝낸다');
    for (const res of results.slice(6)) assert.equal(res.status, 200);

    assert.equal((await orderRow(orderId)).status, 'GRANTED');
    assert.equal(await ledgerCount(user, orderId), 1);
    assert.equal(await topupLedgerTotal(), 1);
    assert.equal(await diamondBalance(user), 110);
    assert.equal(ctx.fake.callsOf('confirm').length, 1);
});

test('AC-04: 서로 다른 두 주문이 같은 paymentKey를 제출하면 키는 최대 한 주문이 점유하고 다른 주문에는 원장이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const userA = await createUser('kA');
    const userB = await createUser('kB');
    await insertProduct();

    // (a) 결정적: 첫 주문이 제공자 대기 중일 때 둘째 주문이 같은 키를 제출
    const a = await orderWithPayment(ctx, userA);
    const b = await ctx.createOrder(userB, { productId: 'test-topup-1', version: 1 });
    const hold = ctx.fake.hold(a.paymentKey);
    const firstConfirm = ctx.confirm(userA, a.orderId, a.paymentKey, 1000);
    await hold.entered;
    const stolen = await ctx.confirm(userB, b.json.orderId, a.paymentKey, 1000);
    assert.deepEqual([stolen.status, stolen.json.code], [409, 'PAYMENT_KEY_CONFLICT']);
    hold.release();
    assert.equal((await firstConfirm).json.status, 'GRANTED');
    assert.equal(await ledgerCount(userB, b.json.orderId), 0);
    assert.equal(await diamondBalance(userB), 0);
    assert.equal((await orderRow(b.json.orderId)).status, 'CREATED');
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM economy_topup_orders WHERE payment_key = :key', { key: a.paymentKey })).n), 1);

    // (b) 동시 제출: 누가 이기든 키 점유 ≤ 1, 지급 ≤ 1, 진 쪽에는 원장이 없다
    const c = await createOrderRaw(ctx, userA);
    const d = await createOrderRaw(ctx, userB);
    const sharedKey = `pay_${crypto.randomBytes(8).toString('hex')}`;
    ctx.fake.registerPayment(sharedKey, { orderId: c, amount: 1000, scenario: 'approve' });
    const totalBefore = await topupLedgerTotal();
    const [rc, rd] = await Promise.all([ctx.confirm(userA, c, sharedKey, 1000), ctx.confirm(userB, d, sharedKey, 1000)]);
    assert.ok([rc, rd].every((res) => [200, 402, 409].includes(res.status)), JSON.stringify([rc, rd]));
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM economy_topup_orders WHERE payment_key = :key', { key: sharedKey })).n), 1);
    assert.ok((await topupLedgerTotal()) - totalBefore <= 1);
    assert.equal(await ledgerCount(userB, d), 0, '제공자 결제와 무관한 주문에는 원장이 없어야 한다');
});

const createOrderRaw = async (ctx, user) => {
    const created = await ctx.createOrder(user, { productId: 'test-topup-1', version: 1 });
    assert.equal(created.status, 201);
    return created.json.orderId;
};

test('AC-04: 임대가 만료된 CONFIRMING(처리자 중단)은 조회가 이어받고, 임대를 잃은 이전 처리자는 새 결과를 덮지 못한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('lease');
    await insertProduct();

    // (a) 처리자가 승인 호출 전에 중단된 상태를 직접 만든다 → 조회가 저장된 결제키로 이어서 승인·지급
    const a = await orderWithPayment(ctx, user);
    await sequelize.query(
        `UPDATE economy_topup_orders SET status = 'CONFIRMING', payment_key = :key, lease_token = 'dead-handler',
                lease_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE order_id = :orderId`,
        { replacements: { key: a.paymentKey, orderId: a.orderId } },
    );
    const recovered = await ctx.getOrder(user, a.orderId);
    assert.equal(recovered.json.status, 'GRANTED');
    assert.equal(await ledgerCount(user, a.orderId), 1);
    assert.equal(ctx.fake.callsOf('get').length, 1, '중단 뒤에는 먼저 제공자 상태를 조회한다');
    assert.equal(ctx.fake.callsOf('confirm').length, 1);

    // (b) 유효한 임대가 남은 CONFIRMING은 조회가 건드리지 않는다
    const b = await orderWithPayment(ctx, user);
    await sequelize.query(
        `UPDATE economy_topup_orders SET status = 'CONFIRMING', payment_key = :key, lease_token = 'live-handler',
                lease_expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE) WHERE order_id = :orderId`,
        { replacements: { key: b.paymentKey, orderId: b.orderId } },
    );
    const callsBefore = ctx.fake.calls.length;
    assert.equal((await ctx.getOrder(user, b.orderId)).json.status, 'CONFIRMING');
    assert.equal((await ctx.confirm(user, b.orderId, b.paymentKey, 1000)).json.code, 'PAYMENT_PROCESSING');
    assert.equal(ctx.fake.calls.length, callsBefore);

    // (c) 이전 처리자(H1)가 제공자 응답을 기다리는 동안 임대를 다른 처리자가 가져갔다 → H1은 결과를 덮지 못한다
    const c = await orderWithPayment(ctx, user);
    const hold = ctx.fake.hold(c.paymentKey);
    const h1 = ctx.confirm(user, c.orderId, c.paymentKey, 1000);
    await hold.entered;
    await sequelize.query(
        "UPDATE economy_topup_orders SET lease_token = 'taken-over', lease_expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE) WHERE order_id = :orderId",
        { replacements: { orderId: c.orderId } },
    );
    hold.release();
    const lost = await h1;
    assert.deepEqual([lost.status, lost.json.code], [503, 'PAYMENT_PROCESSING']);
    const row = await orderRow(c.orderId);
    assert.deepEqual([row.status, row.lease_token], ['CONFIRMING', 'taken-over'], '늦은 처리자가 새 임대의 상태를 덮으면 안 된다');
    assert.equal(await ledgerCount(user, c.orderId), 0);
});

// ═══ AC-06: 마이그레이션 — 반복 적용·부분 실패 복구·기존 경제 데이터 보존 ═══════════════════

const snapshotEconomy = async () => {
    const tables = ['users', 'economy_wallets', 'economy_ledger_entries', 'economy_entitlements', 'economy_loadouts'];
    const snapshot = {};
    for (const table of tables) {
        const [rows] = await sequelize.query(`SELECT * FROM ${table} ORDER BY 1`);
        snapshot[table] = JSON.parse(JSON.stringify(rows));
    }
    return snapshot;
};

test('AC-06: 0017 상태의 기존 경제 데이터는 0018 적용 전후로 그대로이고, 반복 적용·up/verify 직접 반복·부분 인덱스 실패 복구가 통과한다', async (t) => {
    if (unavailable(t)) return;
    schemaReady = false; // 이 케이스는 스키마를 직접 만진다 — 다음 케이스는 전체 재구축한다
    t.after(() => { schemaReady = false; });

    const index0018 = MIGRATIONS.findIndex((m) => m.name === addCurrencyProductsTopupOrders.name);
    assert.ok(index0018 > 0, 'CLI MIGRATIONS에 0018이 등록되어 있어야 한다');
    assert.equal(index0018, MIGRATIONS.length - 1, '0018은 현재 마지막 마이그레이션이다');
    assert.equal(MIGRATIONS[index0018 - 1].name, '0017-social-signup-email');

    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    const upTo0017 = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS.slice(0, index0018) });
    assert.ok(!upTo0017.applied.includes(addCurrencyProductsTopupOrders.name));
    const queryInterface = sequelize.getQueryInterface();
    assert.ok(!(await queryInterface.showAllTables()).includes('economy_topup_orders'), '0017 상태에는 신규 테이블이 없다');

    // 기존 경제 데이터(지갑·원장·소유품·장착)
    const userId = await createUser('keep');
    await sequelize.query('INSERT INTO economy_wallets (user_id, balance_gold, balance_diamond, created_at, updated_at) VALUES (:u, 500, 7, NOW(), NOW())', { replacements: { u: userId } });
    await sequelize.query("INSERT INTO economy_ledger_entries (user_id, reason, item_id, currency, amount, balance_after, reference_event_id, created_at) VALUES (:u, 'TEST_SEED', NULL, 'GOLD', 500, 500, 'seed-keep', NOW())", { replacements: { u: userId } });
    await sequelize.query("INSERT INTO economy_entitlements (user_id, item_id, item_type, source, acquired_at) VALUES (:u, 'item-keep', 'PROFILE_PHOTO', 'TEST', NOW())", { replacements: { u: userId } });
    await sequelize.query("INSERT INTO economy_loadouts (user_id, selected_profile_photo_id, revision, created_at, updated_at) VALUES (:u, 'item-keep', 'rev-keep', NOW(), NOW())", { replacements: { u: userId } });
    const before = await snapshotEconomy();

    const applied = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied.applied, [addCurrencyProductsTopupOrders.name], '0018만 새로 적용되어야 한다');
    assert.deepEqual(await snapshotEconomy(), before, '기존 경제 데이터는 값과 건수가 그대로여야 한다');

    // 운영 상품은 삽입하지 않는다
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM economy_currency_products', {})).n), 0);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM economy_topup_orders', {})).n), 0);

    // CLI 목록 재실행: 오류·중복 없음
    assert.deepEqual((await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS })).applied, []);

    // up·verify 직접 반복
    await addCurrencyProductsTopupOrders.up(queryInterface, Sequelize, sequelize);
    await addCurrencyProductsTopupOrders.verify(queryInterface, Sequelize, sequelize);
    await addCurrencyProductsTopupOrders.up(queryInterface, Sequelize, sequelize);
    await addCurrencyProductsTopupOrders.verify(queryInterface, Sequelize, sequelize);
    assert.deepEqual(await snapshotEconomy(), before);

    // 부분 DDL 실패: 테이블은 있고 결제키 유일 인덱스가 빠진 상태 → verify는 거부, up이 복구
    await queryInterface.removeIndex('economy_topup_orders', addCurrencyProductsTopupOrders.PAYMENT_KEY_UNIQUE_INDEX);
    await assert.rejects(addCurrencyProductsTopupOrders.verify(queryInterface), /economy_topup_orders_payment_key_unique/);
    await addCurrencyProductsTopupOrders.up(queryInterface, Sequelize, sequelize);
    await addCurrencyProductsTopupOrders.verify(queryInterface);

    // 실제 DB 제약: 결제키 유일(NULL은 여러 개 허용), order_id 기본키, users FK, 상품 FK 없음
    const insertOrder = (orderId, paymentKey, uid = userId) => sequelize.query(
        `INSERT INTO economy_topup_orders (order_id, user_id, product_id, version, pay_amount, grant_amount, bonus_amount, order_name, status, payment_key, created_at, updated_at)
         VALUES (:orderId, :uid, 'gone-product', 1, 1000, 100, 10, 'n', 'CREATED', :paymentKey, NOW(), NOW())`,
        { replacements: { orderId, uid, paymentKey } },
    );
    await insertOrder('order-null-1', null);
    await insertOrder('order-null-2', null);
    await insertOrder('order-key-1', 'same-key');
    await assert.rejects(() => insertOrder('order-key-2', 'same-key'), /Duplicate|unique/i);
    await assert.rejects(() => insertOrder('order-key-1', 'other-key'), /Duplicate|PRIMARY/i);
    await assert.rejects(() => insertOrder('order-orphan', null, crypto.randomUUID()), /foreign key/i);
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM economy_topup_orders WHERE product_id = 'gone-product'", {})).n), 3, '존재하지 않는 상품 ID의 주문도 저장된다(상품 FK 없음)');

    const foreignKeys = await queryInterface.getForeignKeyReferencesForTable('economy_topup_orders');
    assert.deepEqual(foreignKeys.map((fk) => [fk.columnName, fk.referencedTableName, fk.referencedColumnName]), [['user_id', 'users', 'uuid']]);
});

test('AC-06: 전체 스키마를 다시 세우면(reset → 전체 적용) 두 신규 테이블도 오류 없이 만들어진다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const tables = await sequelize.getQueryInterface().showAllTables();
    assert.ok(tables.includes('economy_currency_products') && tables.includes('economy_topup_orders'));
    assert.deepEqual((await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS })).applied, []);
});
