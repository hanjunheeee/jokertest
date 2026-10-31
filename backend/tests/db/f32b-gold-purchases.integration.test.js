'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f32b-gold-purchases-integration-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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

const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addCurrencyProductsTopupOrders, migrationRunner,
});

let sequelize;

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

const db = require('../../models');
const userRepository = require('../../repositories/user.repositories');
const economyService = require('../../service/economy.service');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

let schemaReady = false;

const rebuildSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    schemaReady = true;
};

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

const boot = async (t) => {
    stubAuthGate(t);
    const dropResponses = { on: false };
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/economy/gold-purchases', (req, res, next) => {
        if (dropResponses.on) res.json = () => { req.socket.destroy(); return res; };
        next();
    });
    app.use('/economy', require('../../routes/economy.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections?.(); }));
    const base = `http://127.0.0.1:${server.address().port}`;

    const call = async (path, { method = 'GET', user, body } = {}) => {
        const headers = {};
        if (user) headers.cookie = `accessToken=${tokenFor(user)}`;
        if (body !== undefined) headers['content-type'] = 'application/json';
        const res = await fetch(new URL(path, base), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
        const json = await res.json().catch(() => null);
        return { status: res.status, json };
    };
    return {
        dropResponses,
        call,
        buy: (user, body) => call('/economy/gold-purchases', { method: 'POST', user, body }),
        result: (user, ref) => call(`/economy/purchases/${encodeURIComponent(ref)}`, { user }),
    };
};

const GOLD_PRODUCT = Object.freeze({
    product_id: 'test-gold-1', kind: 'GOLD_PURCHASE', display_name: '시험용 골드 상품(임시값)',
    pay_currency: 'DIAMOND', pay_amount: 30, grant_currency: 'GOLD', grant_amount: 100, bonus_amount: 10,
    status: 'ON_SALE', sort_order: 0, version: 1,
});

const insertProduct = async (overrides = {}) => {
    const row = { ...GOLD_PRODUCT, ...overrides };
    await sequelize.query(
        `INSERT INTO economy_currency_products
           (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount, status, sort_order, version, created_at, updated_at)
         VALUES (:product_id, :kind, :display_name, :pay_currency, :pay_amount, :grant_currency, :grant_amount, :bonus_amount, :status, :sort_order, :version, NOW(), NOW())`,
        { replacements: row },
    );
    return row;
};

const updateProduct = (productId, fields) => sequelize.query(
    `UPDATE economy_currency_products
        SET pay_amount = :pay_amount, grant_amount = :grant_amount, bonus_amount = :bonus_amount,
            status = :status, version = version + 1, updated_at = NOW()
      WHERE product_id = :productId`,
    { replacements: { pay_amount: 30, grant_amount: 100, bonus_amount: 10, status: 'ON_SALE', ...fields, productId } },
);

const seedWallet = (userId, { diamond, gold }) => sequelize.query(
    `INSERT INTO economy_wallets (user_id, balance_gold, balance_diamond, created_at, updated_at)
     VALUES (:userId, :gold, :diamond, NOW(), NOW())`,
    { replacements: { userId, gold, diamond } },
);

const rows = async (sql, replacements) => (await sequelize.query(sql, { replacements }))[0];
const count = async (sql, replacements) => Number((await rows(sql, replacements))[0].n);

const wallet = async (userId) => {
    const [row] = await rows('SELECT balance_gold, balance_diamond FROM economy_wallets WHERE user_id = :userId', { userId });
    return row ? { gold: Number(row.balance_gold), diamond: Number(row.balance_diamond) } : null;
};
const requestCount = (userId) => count('SELECT COUNT(*) AS n FROM economy_purchase_requests WHERE user_id = :userId', { userId });
const ledgerRows = (userId) => rows('SELECT * FROM economy_ledger_entries WHERE user_id = :userId ORDER BY id', { userId });
const entitlementCount = (userId) => count('SELECT COUNT(*) AS n FROM economy_entitlements WHERE user_id = :userId', { userId });

const snapshot = async (userId) => ({
    wallet: await wallet(userId),
    ledger: (await ledgerRows(userId)).map((r) => [String(r.id), r.currency, r.amount, r.balance_after]),
    requests: await requestCount(userId),
    entitlements: await entitlementCount(userId),
});

const ref = (label) => `${label}-${crypto.randomBytes(6).toString('hex')}`;
const REQ = (referenceEventId, extra = {}) => ({ productId: GOLD_PRODUCT.product_id, version: 1, referenceEventId, ...extra });

const injectCreateFailure = (t, model, failOn) => {
    const original = model.create;
    let calls = 0;
    const observed = [];
    model.create = async function patched(values, options) {
        calls += 1;
        if (failOn(calls, options)) {
            observed.push({ call: calls, transaction: options?.transaction });
            const [inTx] = await db.sequelize.query(
                'SELECT balance_diamond, balance_gold FROM economy_wallets WHERE user_id = :userId',
                { replacements: { userId: values.user_id }, transaction: options.transaction },
            ).then(([r]) => r);
            observed[observed.length - 1].walletInTransaction = inTx;
            throw new Error('주입된 쓰기 실패');
        }
        return original.call(this, values, options);
    };
    const restore = () => { model.create = original; };
    t.after(restore);
    return { restore, observed };
};

test('AC-01: 정상 골드 구매는 서버 상품표 값으로 다이아를 줄이고 골드를 늘리며 구매 요청 1행·재화 원장 2행을 남긴다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('buy');
    await insertProduct();
    await seedWallet(user, { diamond: 100, gold: 20 });

    const key = ref('ac01');
    const res = await ctx.buy(user, REQ(key));
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.deepEqual(res.json, { ok: true, balanceGold: 130, balanceDiamond: 70 });

    assert.deepEqual(await wallet(user), { gold: 130, diamond: 70 });
    assert.equal(await requestCount(user), 1, '구매 요청 1행(A-01)');
    const ledger = await ledgerRows(user);
    assert.equal(ledger.length, 2, '재화별 1행씩 총 2행');
    const diamond = ledger.find((r) => r.currency === 'DIAMOND');
    const gold = ledger.find((r) => r.currency === 'GOLD');
    assert.deepEqual([diamond.reason, diamond.amount, diamond.balance_after], ['GOLD_PURCHASE', -30, 70]);
    assert.deepEqual([gold.reason, gold.amount, gold.balance_after], ['GOLD_PURCHASE', 110, 130]);
    assert.equal(await entitlementCount(user), 0, '소유권은 늘지 않는다');

    const [stored] = await rows('SELECT kind, payload_json FROM economy_purchase_requests WHERE user_id = :userId', { userId: user });
    assert.equal(stored.kind, 'GOLD');
    assert.deepEqual(typeof stored.payload_json === 'string' ? JSON.parse(stored.payload_json) : stored.payload_json,
        { type: 'GOLD_PURCHASE', productId: 'test-gold-1', version: 1 });
});

test('AC-05: 인증이 없으면 401이고 서비스·DB에 아무것도 남지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    const res = await ctx.buy(undefined, REQ(ref('anon')));
    assert.equal(res.status, 401);
    assert.equal(await count('SELECT COUNT(*) AS n FROM economy_purchase_requests', {}), 0);
});

test('AC-02: 다이아가 부족하면 400 INSUFFICIENT_DIAMOND로 거절되고 잔액·원장·구매 요청이 그대로다(지갑 없는 계정 포함)', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();

    const poor = await createUser('poor');
    await seedWallet(poor, { diamond: 29, gold: 20 });
    const before = await snapshot(poor);
    const res = await ctx.buy(poor, REQ(ref('ac02')));
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'INSUFFICIENT_DIAMOND');
    assert.deepEqual(await snapshot(poor), before);

    const noWallet = await createUser('nowal');
    const rejected = await ctx.buy(noWallet, REQ(ref('ac02b')));
    assert.equal(rejected.status, 400);
    assert.equal(rejected.json.code, 'INSUFFICIENT_DIAMOND');
    assert.deepEqual(await snapshot(noWallet), { wallet: null, ledger: [], requests: 0, entitlements: 0 });
});

test('AC-02: 두 번째 원장 쓰기·구매 요청 쓰기가 실패하면 선행 차감이 있었어도 전부 롤백되고, 해제 뒤 같은 키 재시도는 한 번만 커밋된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    const user = await createUser('roll');
    await seedWallet(user, { diamond: 100, gold: 20 });
    const before = await snapshot(user);
    const key = ref('ac02-roll');

    const ledgerFail = injectCreateFailure(t, db.EconomyLedgerEntry, (n) => n === 2);
    const first = await ctx.buy(user, REQ(key));
    assert.equal(first.status, 500);
    assert.equal(first.json.code, 'SERVER_ERROR');
    assert.equal(ledgerFail.observed.length, 1);
    assert.equal(Number(ledgerFail.observed[0].walletInTransaction.balance_diamond), 70, '실패 시점에 같은 트랜잭션에서는 선행 차감이 적용돼 있었다');
    ledgerFail.restore();
    assert.deepEqual(await snapshot(user), before, '별도 연결에서는 기준선 그대로');

    const requestFail = injectCreateFailure(t, db.sequelize.models.EconomyPurchaseRequest, () => true);
    const second = await ctx.buy(user, REQ(key));
    assert.equal(second.status, 500);
    assert.equal(Number(requestFail.observed[0].walletInTransaction.balance_gold), 130, '두 원장이 적용된 뒤 실패했다');
    requestFail.restore();
    assert.deepEqual(await snapshot(user), before);

    const retry = await ctx.buy(user, REQ(key));
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.json, { ok: true, balanceGold: 130, balanceDiamond: 70 });
    const again = await ctx.buy(user, REQ(key));
    assert.deepEqual(again.json, retry.json);
    assert.equal(await requestCount(user), 1);
    assert.equal((await ledgerRows(user)).length, 2);
});

test('AC-02: 골드 한도를 넘는 지급은 400 BALANCE_LIMIT_EXCEEDED이고 선행 다이아 차감도 롤백된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    const user = await createUser('cap');
    await seedWallet(user, { diamond: 100, gold: economyService.MAX_BALANCE - 50 });
    const before = await snapshot(user);
    const res = await ctx.buy(user, REQ(ref('ac02-cap')));
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'BALANCE_LIMIT_EXCEEDED');
    assert.deepEqual(await snapshot(user), before);
});

test('AC-03: 같은 요청을 순차·병렬로 여러 번 보내도 차감·지급·원장이 정확히 1회다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    const user = await createUser('dup');
    await seedWallet(user, { diamond: 100, gold: 20 });

    const seqKey = ref('seq');
    const a = await ctx.buy(user, REQ(seqKey));
    const b = await ctx.buy(user, REQ(seqKey));
    assert.equal(a.status, 200);
    assert.deepEqual(b, a);
    assert.deepEqual(await wallet(user), { gold: 130, diamond: 70 });

    const parKey = ref('par');
    const par = await Promise.all([ctx.buy(user, REQ(parKey)), ctx.buy(user, REQ(parKey)), ctx.buy(user, REQ(parKey))]);
    for (const r of par) {
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.deepEqual(r.json, { ok: true, balanceGold: 240, balanceDiamond: 40 });
    }
    assert.deepEqual(await wallet(user), { gold: 240, diamond: 40 }, '두 번째 키는 한 번만 반영');
    assert.equal(await requestCount(user), 2);
    assert.equal((await ledgerRows(user)).length, 4);
});

test('AC-03: 지갑 행이 없는 계정의 같은 키 순차·병렬 중복 요청은 모두 INSUFFICIENT_DIAMOND이고 지갑·원장·구매 요청에 어떤 효과도 남지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    const user = await createUser('nowdup');
    const empty = { wallet: null, ledger: [], requests: 0, entitlements: 0 };
    assert.deepEqual(await snapshot(user), empty);

    const seqKey = ref('nw-seq');
    const first = await ctx.buy(user, REQ(seqKey));
    const second = await ctx.buy(user, REQ(seqKey));
    for (const r of [first, second]) {
        assert.equal(r.status, 400, JSON.stringify(r.json));
        assert.equal(r.json.code, 'INSUFFICIENT_DIAMOND');
    }
    assert.deepEqual(second, first, '순차 재시도는 같은 거절이다');
    assert.deepEqual(await snapshot(user), empty);

    const parKey = ref('nw-par');
    const same = await Promise.all([ctx.buy(user, REQ(parKey)), ctx.buy(user, REQ(parKey))]);
    const different = await Promise.all([ctx.buy(user, REQ(ref('nw-a'))), ctx.buy(user, REQ(ref('nw-b')))]);
    for (const r of [...same, ...different]) {
        assert.equal(r.status, 400, JSON.stringify(r.json));
        assert.equal(r.json.code, 'INSUFFICIENT_DIAMOND');
    }
    assert.deepEqual(same[1], same[0], '같은 키 병렬 요청의 응답이 같다');
    assert.deepEqual(await snapshot(user), empty, '부분 지갑 행도 남지 않는다');
    assert.equal(await count('SELECT COUNT(*) AS n FROM economy_wallets WHERE user_id = :userId', { userId: user }), 0);
});

test('AC-03: 서로 다른 키 두 요청은 한 번 살 다이아만 있으면 1성공·1부족, 두 번 살 다이아면 둘 다 성공한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();

    const one = await createUser('one');
    await seedWallet(one, { diamond: 30, gold: 0 });
    const raced = await Promise.all([ctx.buy(one, REQ(ref('k1'))), ctx.buy(one, REQ(ref('k2')))]);
    assert.deepEqual(raced.map((r) => r.status).sort(), [200, 400], JSON.stringify(raced));
    assert.equal(raced.find((r) => r.status === 400).json.code, 'INSUFFICIENT_DIAMOND');
    assert.deepEqual(await wallet(one), { gold: 110, diamond: 0 });
    assert.equal(await requestCount(one), 1);
    assert.equal((await ledgerRows(one)).length, 2);

    const two = await createUser('two');
    await seedWallet(two, { diamond: 60, gold: 0 });
    const both = await Promise.all([ctx.buy(two, REQ(ref('k3'))), ctx.buy(two, REQ(ref('k4')))]);
    assert.deepEqual(both.map((r) => r.status), [200, 200], JSON.stringify(both));
    assert.deepEqual(await wallet(two), { gold: 220, diamond: 0 });
    assert.equal(await requestCount(two), 2);
});

test('AC-03: 같은 키를 다른 상품·버전이나 기존 SINGLE/BULK 요청과 겹쳐 쓰면 409 REFERENCE_EVENT_CONFLICT이고 추가 효과가 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    await insertProduct({ product_id: 'test-gold-2', pay_amount: 10, grant_amount: 40, bonus_amount: 0 });
    const user = await createUser('conf');
    await seedWallet(user, { diamond: 100, gold: 0 });

    const key = ref('conf');
    assert.equal((await ctx.buy(user, REQ(key))).status, 200);
    const afterFirst = await snapshot(user);

    const otherProduct = await ctx.buy(user, { productId: 'test-gold-2', version: 1, referenceEventId: key });
    assert.equal(otherProduct.status, 409);
    assert.equal(otherProduct.json.code, 'REFERENCE_EVENT_CONFLICT');
    const otherVersion = await ctx.buy(user, REQ(key, { version: 2 }));
    assert.equal(otherVersion.status, 409);
    assert.equal(otherVersion.json.code, 'REFERENCE_EVENT_CONFLICT');

    for (const kind of ['SINGLE', 'BULK']) {
        const legacyKey = ref(`legacy-${kind}`);
        await sequelize.query(
            `INSERT INTO economy_purchase_requests (user_id, reference_event_id, kind, payload_json, result_json, created_at)
             VALUES (:userId, :key, :kind, :payload, :result, NOW())`,
            { replacements: { userId: user, key: legacyKey, kind, payload: JSON.stringify({ itemIds: ['x'] }), result: '[]' } },
        );
        const res = await ctx.buy(user, REQ(legacyKey));
        assert.equal(res.status, 409, kind);
        assert.equal(res.json.code, 'REFERENCE_EVENT_CONFLICT');
    }
    const after = await snapshot(user);
    assert.deepEqual({ ...after, requests: after.requests - 2 }, afterFirst, '재화·원장에는 추가 효과가 없다');

    const other = await createUser('oth');
    await seedWallet(other, { diamond: 30, gold: 0 });
    const independent = await ctx.buy(other, REQ(key));
    assert.equal(independent.status, 200);
    assert.deepEqual(independent.json, { ok: true, balanceGold: 110, balanceDiamond: 0 });
});

test('AC-04: 응답이 유실돼도 같은 POST 재시도·GET 조회는 최초 결과를 돌려주고, 이후 지갑·상품표가 바뀌어도 변하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    const user = await createUser('lost');
    await seedWallet(user, { diamond: 100, gold: 20 });
    const key = ref('lost');

    ctx.dropResponses.on = true;
    await assert.rejects(() => ctx.buy(user, REQ(key)));
    ctx.dropResponses.on = false;
    assert.deepEqual(await wallet(user), { gold: 130, diamond: 70 }, '커밋은 이미 됐다');
    const committedLedger = (await ledgerRows(user)).map((r) => String(r.id));
    assert.equal(committedLedger.length, 2);

    const fetched = await ctx.result(user, key);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.json.kind, 'GOLD');
    assert.equal(fetched.json.ok, true);
    assert.equal(fetched.json.balanceDiamond, 70);
    assert.equal(fetched.json.balanceGold, 130);
    assert.deepEqual(fetched.json.results.map((r) => String(r.id)), committedLedger);
    assert.deepEqual(fetched.json.results.map((r) => [r.currency, r.amount, r.balanceAfter, r.reason]),
        [['DIAMOND', -30, 70, 'GOLD_PURCHASE'], ['GOLD', 110, 130, 'GOLD_PURCHASE']]);

    await sequelize.query('UPDATE economy_wallets SET balance_diamond = 5, balance_gold = 9999 WHERE user_id = :userId', { replacements: { userId: user } });
    const expectedRetry = { ok: true, balanceGold: 130, balanceDiamond: 70 };
    const stages = [
        () => updateProduct('test-gold-1', { pay_amount: 60, grant_amount: 1, bonus_amount: 0 }),
        () => updateProduct('test-gold-1', { pay_amount: 60, grant_amount: 1, bonus_amount: 0, status: 'STOPPED' }),
        () => sequelize.query("DELETE FROM economy_currency_products WHERE product_id = 'test-gold-1'"),
    ];
    for (const change of stages) {
        await change();
        const retry = await ctx.buy(user, REQ(key));
        assert.equal(retry.status, 200, JSON.stringify(retry.json));
        assert.deepEqual(retry.json, expectedRetry, '재시도는 최초 결과다');
        const got = await ctx.result(user, key);
        assert.equal(got.json.balanceDiamond, 70);
        assert.deepEqual(got.json.results.map((r) => String(r.id)), committedLedger);
    }
    assert.deepEqual(await wallet(user), { gold: 9999, diamond: 5 }, '재시도가 지갑을 다시 건드리지 않았다');
    assert.equal(await requestCount(user), 1);
    assert.equal((await ledgerRows(user)).length, 2);

    const stranger = await createUser('strg');
    assert.equal((await ctx.result(user, ref('never'))).status, 404);
    assert.equal((await ctx.result(stranger, key)).status, 404);
    assert.deepEqual(await snapshot(stranger), { wallet: null, ledger: [], requests: 0, entitlements: 0 });
});

test('AC-04(AC-06 회귀): 기존 SINGLE·BULK 결과 조회는 ok·잔액 필드 없이 기존 필드만 돌려준다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    const user = await createUser('leg');
    const key = ref('legacy');
    await sequelize.query(
        `INSERT INTO economy_purchase_requests (user_id, reference_event_id, kind, payload_json, result_json, created_at)
         VALUES (:userId, :key, 'SINGLE', :payload, :result, NOW())`,
        {
            replacements: {
                userId: user, key,
                payload: JSON.stringify({ itemIds: ['x'] }),
                result: JSON.stringify([{ id: 1, reason: 'PURCHASE', item_id: 'x', currency: 'GOLD', amount: -5, balance_after: 3, reference_event_id: 'x', created_at: new Date().toISOString() }]),
            },
        },
    );
    const res = await ctx.result(user, key);
    assert.equal(res.status, 200);
    assert.equal(res.json.kind, 'SINGLE');
    assert.deepEqual(Object.keys(res.json).sort(), ['createdAt', 'kind', 'results']);

    const buyer = await createUser('bulk');
    await seedWallet(buyer, { diamond: 0, gold: 1000 });
    const bulkKey = ref('bulk');
    const bulk = await ctx.call('/economy/purchases/bulk', {
        method: 'POST',
        user: buyer,
        body: { items: [{ itemId: 'profile-border-남작' }, { itemId: 'profile-border-자작' }], referenceEventId: bulkKey },
    });
    assert.equal(bulk.status, 201, JSON.stringify(bulk.json));
    assert.equal(await count("SELECT COUNT(*) AS n FROM economy_purchase_requests WHERE user_id = :userId AND kind = 'BULK'", { userId: buyer }), 1);

    const bulkResult = await ctx.result(buyer, bulkKey);
    assert.equal(bulkResult.status, 200);
    assert.equal(bulkResult.json.kind, 'BULK');
    assert.equal(bulkResult.json.results.length, 2);
    assert.deepEqual(Object.keys(bulkResult.json).sort(), ['createdAt', 'kind', 'results']);
    for (const field of ['ok', 'balanceDiamond', 'balanceGold']) {
        assert.equal(field in res.json, false, `SINGLE 응답에 ${field}가 없다`);
        assert.equal(field in bulkResult.json, false, `BULK 응답에 ${field}가 없다`);
    }
});

test('AC-05: 클라이언트의 금액·수량 참고 필드는 무시되고 서버 상품표 값(-30/+110)만 반영되며, 그 밖의 미지 필드는 거절된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    const user = await createUser('tamp');
    await seedWallet(user, { diamond: 500, gold: 0 });

    const tampers = [
        { price: 0, priceGold: -5, amount: 0, quantity: 100 },
        { payAmount: -1, grantAmount: 999999, bonusAmount: 999999, quantity: 100 },
    ];
    let expected = { gold: 0, diamond: 500 };
    for (const tamper of tampers) {
        const res = await ctx.buy(user, REQ(ref('tamper'), tamper));
        assert.equal(res.status, 200, JSON.stringify(res.json));
        expected = { gold: expected.gold + 110, diamond: expected.diamond - 30 };
        assert.deepEqual(await wallet(user), expected);
    }
    const ledger = await ledgerRows(user);
    assert.deepEqual(ledger.map((r) => r.amount), [-30, 110, -30, 110]);

    const before = await snapshot(user);
    for (const extra of [{ userId: crypto.randomUUID() }, { currency: 'GOLD' }, { unknownField: 1 }]) {
        const res = await ctx.buy(user, REQ(ref('unk'), extra));
        assert.equal(res.status, 400, JSON.stringify(extra));
        assert.equal(res.json.code, 'UNKNOWN_GOLD_PURCHASE_FIELD');
    }
    for (const bad of [
        { productId: 7, version: 1, referenceEventId: ref('bad') },
        { productId: 'test-gold-1', version: '1', referenceEventId: ref('bad') },
        { productId: 'test-gold-1', version: 0, referenceEventId: ref('bad') },
        { productId: 'test-gold-1', version: 1 },
        { productId: 'test-gold-1', version: 1, referenceEventId: 'k'.repeat(151) },
    ]) {
        const res = await ctx.buy(user, bad);
        assert.equal(res.status, 400, JSON.stringify(bad));
        assert.equal(res.json.code, 'INVALID_GOLD_PURCHASE_REQUEST');
    }
    assert.deepEqual(await snapshot(user), before, '거절된 요청은 아무것도 바꾸지 않는다');
});

test('AC-05: 잘못된 버전·판매 중지·다른 종류·잘못된 행은 상품 오류로 거절되고, 별도 연결의 상품 수정이 재시작 없이 새 키·새 버전에 반영된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    await insertProduct({ product_id: 'test-topup-1', kind: 'DIAMOND_TOPUP', pay_currency: 'KRW', pay_amount: 1000, grant_currency: 'DIAMOND', grant_amount: 100, bonus_amount: 10 });
    await insertProduct({ product_id: 'test-broken-1', pay_currency: 'KRW' });
    await insertProduct({ product_id: 'test-stopped-1', status: 'STOPPED' });
    const user = await createUser('prod');
    await seedWallet(user, { diamond: 200, gold: 0 });
    const before = await snapshot(user);

    const mismatch = await ctx.buy(user, REQ(ref('v'), { version: 2 }));
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.json.code, 'PRODUCT_VERSION_MISMATCH');
    assert.equal(mismatch.json.product.version, 1);
    assert.equal(mismatch.json.product.payAmount, 30);
    assert.equal('status' in mismatch.json.product, false, '공개 필드만 실린다');

    const stopped = await ctx.buy(user, REQ(ref('s'), { productId: 'test-stopped-1' }));
    assert.equal(stopped.status, 409);
    assert.equal(stopped.json.code, 'PRODUCT_STOPPED');

    for (const productId of ['test-topup-1', 'test-broken-1', 'no-such-product']) {
        const res = await ctx.buy(user, REQ(ref('n'), { productId }));
        assert.equal(res.status, 404, productId);
        assert.equal(res.json.code, 'PRODUCT_NOT_FOUND');
    }
    assert.deepEqual(await snapshot(user), before);

    await updateProduct('test-gold-1', { pay_amount: 40, grant_amount: 200, bonus_amount: 5 });
    const oldVersion = await ctx.buy(user, REQ(ref('old')));
    assert.equal(oldVersion.status, 409);
    assert.equal(oldVersion.json.product.version, 2);
    const fresh = await ctx.buy(user, REQ(ref('fresh'), { version: 2 }));
    assert.equal(fresh.status, 200, JSON.stringify(fresh.json));
    assert.deepEqual(fresh.json, { ok: true, balanceGold: 205, balanceDiamond: 160 });
});

test('AC-06: 골드 구매 서비스는 기존 원장·지갑 계약을 재사용한다(재화 원장 reason·참조 키 파생·itemId 없음)', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const ctx = await boot(t);
    await insertProduct();
    const user = await createUser('reuse');
    await seedWallet(user, { diamond: 100, gold: 0 });
    const key = ref('reuse');
    assert.equal((await ctx.buy(user, REQ(key))).status, 200);

    const ledger = await ledgerRows(user);
    const digest = crypto.createHash('sha256').update(key).digest('hex');
    assert.deepEqual(ledger.map((r) => r.reference_event_id).sort(), [`gold:${digest}:diamond`, `gold:${digest}:gold`]);
    assert.ok(ledger.every((r) => r.item_id === null));
    const grant = await economyService.grantReward({ userId: user, amount: 5, currency: 'GOLD', referenceEventId: ref('grant') });
    assert.equal(grant.idempotent, false);
    assert.deepEqual(await wallet(user), { gold: 115, diamond: 70 });
});
