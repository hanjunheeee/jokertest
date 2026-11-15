'use strict';

// 골드 구매(다이아 → 골드) DB 시험: 다이아 잔액 경계·장부 두 줄·덤·상품 바뀜/중지/종류·같은 번호·동시에·한도·역교환 없음·결과 다시 묻기를 시험 DB로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-308~327 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

test.before(h.prepareDb);
test.after(h.closeDb);

// 골드 구매 요청 하나 (참조 번호 안 주면 새로)
const buyGold = (base, uuid, product, { version = product.version, referenceEventId = `a12d-gold-${h.hex()}`, productId = product.product_id } = {}) =>
    h.call(base, uuid, 'POST', '/economy/gold-purchases', { productId, version, referenceEventId });

const goldRows = async (uuid) => (await h.ledgerOf(uuid)).filter((row) => row.reason === 'GOLD_PURCHASE');

// ── A12-B-308~311 다이아 잔액 경계 (상품 다이아 값 10) ──
const DIAMOND_CASES = [
    { no: 'A12-B-308', diamond: 0, ok: false },
    { no: 'A12-B-309', diamond: 9, ok: false },
    { no: 'A12-B-310', diamond: 10, ok: true, left: 0 },
    { no: 'A12-B-311', diamond: 11, ok: true, left: 1 },
];

for (const c of DIAMOND_CASES) {
    test(`${c.no} 다이아 값 10 상품, 다이아 ${c.diamond} → ${c.ok ? `됨·다이아 ${c.left}` : '400 INSUFFICIENT_DIAMOND·지갑·장부·구매 요청 그대로'}`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('dia');
        const product = await h.createProduct({ pay_amount: 10 });
        await h.ensureWallet(user);
        if (c.diamond > 0) await h.fund(user, 'DIAMOND', c.diamond);
        const before = await h.fourTables(user);

        const res = await buyGold(base, user, product);
        if (!c.ok) {
            h.assertCode(res, 400, 'INSUFFICIENT_DIAMOND');
            assert.deepEqual(await h.fourTables(user), before);
            return;
        }
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.balanceDiamond, c.left);
        assert.equal((await h.walletOf(user)).diamond, c.left);
    });
}

test('A12-B-312 되면 장부 GOLD_PURCHASE 다이아 −값 1줄 + 골드 +(지급+덤) 1줄·구매 요청 GOLD 1줄·응답 잔액 = 지갑', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('two');
    const product = await h.createProduct({ pay_amount: 10, grant_amount: 1000, bonus_amount: 50 });
    await h.fund(user, 'DIAMOND', 30);

    const res = await buyGold(base, user, product);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const rows = await goldRows(user);
    assert.equal(rows.length, 2);
    const diamondRow = rows.find((row) => row.currency === 'DIAMOND');
    const goldRow = rows.find((row) => row.currency === 'GOLD');
    assert.equal(Number(diamondRow.amount), -10);
    assert.equal(Number(goldRow.amount), 1050);
    assert.deepEqual((await h.requestsOf(user)).map((row) => row.kind), ['GOLD']);
    const wallet = await h.walletOf(user);
    assert.equal(res.body.balanceGold, wallet.gold);
    assert.equal(res.body.balanceDiamond, wallet.diamond);
    assert.deepEqual(wallet, { gold: 1050, diamond: 20 });
});

// ── A12-B-313~314 덤 ──
const BONUS_CASES = [
    { no: 'A12-B-313', bonus: 0, gain: 1000 },
    { no: 'A12-B-314', bonus: 100, gain: 1100 },
];

for (const c of BONUS_CASES) {
    test(`${c.no} 덤 ${c.bonus} → 골드 +${c.gain}`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('bonus');
        const product = await h.createProduct({ grant_amount: 1000, bonus_amount: c.bonus });
        await h.fund(user, 'DIAMOND', 10);

        const res = await buyGold(base, user, product);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal((await h.walletOf(user)).gold, c.gain);
    });
}

// ── A12-B-315~318 상품 바뀜·중지·종류 (전부 다이아 그대로) ──

test('A12-B-315 버전 지금−1 → 409 PRODUCT_VERSION_MISMATCH + 지금 상품·다이아 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('ver');
    const product = await h.createProduct({ version: 2 });
    await h.fund(user, 'DIAMOND', 50);

    const res = await buyGold(base, user, product, { version: 1 });
    h.assertCode(res, 409, 'PRODUCT_VERSION_MISMATCH');
    assert.equal(res.body.product?.productId, product.product_id);
    assert.equal(res.body.product?.version, 2);
    assert.equal((await h.walletOf(user)).diamond, 50);
});

test('A12-B-316 버전 지금+1 → 409 PRODUCT_VERSION_MISMATCH + 지금 상품·다이아 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('ver');
    const product = await h.createProduct({ version: 2 });
    await h.fund(user, 'DIAMOND', 50);

    const res = await buyGold(base, user, product, { version: 3 });
    h.assertCode(res, 409, 'PRODUCT_VERSION_MISMATCH');
    assert.equal(res.body.product?.version, 2);
    assert.equal((await h.walletOf(user)).diamond, 50);
});

test('A12-B-317 판매 중지 → 409 PRODUCT_STOPPED·다이아 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('stop');
    const product = await h.createProduct({ status: 'STOPPED' });
    await h.fund(user, 'DIAMOND', 50);

    const res = await buyGold(base, user, product);
    h.assertCode(res, 409, 'PRODUCT_STOPPED');
    assert.equal((await h.walletOf(user)).diamond, 50);
});

test('A12-B-318 충전 상품 id로 골드 사기 → 404·다이아 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('kind');
    const topup = await h.createTopupProduct();
    await h.fund(user, 'DIAMOND', 5000);

    const res = await buyGold(base, user, topup);
    h.assertCode(res, 404, 'PRODUCT_NOT_FOUND');
    assert.equal((await h.walletOf(user)).diamond, 5000);
});

test('A12-B-319 산 뒤 같은 몸 다시 → 처음 잔액 그대로·다이아 한 번만', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('again');
    const product = await h.createProduct();
    await h.fund(user, 'DIAMOND', 30);

    const first = await buyGold(base, user, product, { referenceEventId: 'a12d-gold-same' });
    const again = await buyGold(base, user, product, { referenceEventId: 'a12d-gold-same' });
    assert.equal(first.status, 200);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.balanceGold, first.body.balanceGold);
    assert.equal(again.body.balanceDiamond, first.body.balanceDiamond);
    assert.equal((await h.walletOf(user)).diamond, 20);
    assert.equal((await goldRows(user)).length, 2);
});

test('A12-B-320 같은 번호 동시에 2개 → 장부 2줄(다이아·골드)만·구매 요청 1줄', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('race');
    const product = await h.createProduct();
    await h.fund(user, 'DIAMOND', 30);

    await Promise.all([1, 2].map(() => buyGold(base, user, product, { referenceEventId: 'a12d-gold-race' })));
    assert.equal((await goldRows(user)).length, 2);
    assert.equal((await h.requestsOf(user)).length, 1);
    assert.equal((await h.walletOf(user)).diamond, 20);
});

// ── A12-B-321~322 같은 번호 다른 내용 [지금 동작] ──

test('A12-B-321 같은 번호에 다른 상품 → 409 REFERENCE_EVENT_CONFLICT', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('conf');
    const product = await h.createProduct();
    const other = await h.createProduct();
    await h.fund(user, 'DIAMOND', 50);
    assert.equal((await buyGold(base, user, product, { referenceEventId: 'a12d-gold-conf' })).status, 200);

    const res = await buyGold(base, user, other, { referenceEventId: 'a12d-gold-conf' });
    h.assertCode(res, 409, 'REFERENCE_EVENT_CONFLICT');
    assert.equal((await h.walletOf(user)).diamond, 40);
});

test('A12-B-322 같은 번호에 다른 버전 → 409 REFERENCE_EVENT_CONFLICT', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('conf');
    const product = await h.createProduct({ version: 1 });
    await h.fund(user, 'DIAMOND', 50);
    assert.equal((await buyGold(base, user, product, { referenceEventId: 'a12d-gold-conf2' })).status, 200);
    // 그사이 상품 버전이 2로 올라감, 화면은 새 버전으로 같은 번호를 다시 보냄
    await h.models().EconomyCurrencyProduct.update({ version: 2 }, { where: { product_id: product.product_id } });

    const res = await buyGold(base, user, product, { version: 2, referenceEventId: 'a12d-gold-conf2' });
    h.assertCode(res, 409, 'REFERENCE_EVENT_CONFLICT');
    assert.equal((await h.walletOf(user)).diamond, 40);
});

test('A12-B-323 산 뒤 상품 중지 → 같은 번호 다시 → 처음 결과(거절 아님) [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('stop');
    const product = await h.createProduct();
    await h.fund(user, 'DIAMOND', 30);
    const first = await buyGold(base, user, product, { referenceEventId: 'a12d-gold-stop' });
    assert.equal(first.status, 200);
    await h.models().EconomyCurrencyProduct.update({ status: 'STOPPED' }, { where: { product_id: product.product_id } });

    const again = await buyGold(base, user, product, { referenceEventId: 'a12d-gold-stop' });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.balanceGold, first.body.balanceGold);
    assert.equal(again.body.balanceDiamond, first.body.balanceDiamond);
});

test('A12-B-324 다른 번호 둘 동시에, 다이아는 한 번 값만 → 하나만 됨·다이아 0·장부 2줄', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('dbl');
    const product = await h.createProduct({ pay_amount: 10 });
    await h.fund(user, 'DIAMOND', 10);

    const answers = await Promise.all([
        buyGold(base, user, product, { referenceEventId: 'a12d-gold-d1' }),
        buyGold(base, user, product, { referenceEventId: 'a12d-gold-d2' }),
    ]);
    assert.deepEqual(answers.map((res) => res.status).sort(), [200, 400]);
    assert.equal((await h.walletOf(user)).diamond, 0);
    assert.equal((await goldRows(user)).length, 2);
});

test('A12-B-325 골드가 10억 근처라 받으면 한도를 넘음 → BALANCE_LIMIT_EXCEEDED·다이아·골드 그대로 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('lim');
    const product = await h.createProduct({ grant_amount: 1000 });
    await h.fund(user, 'GOLD', 1_000_000_000 - 999);
    await h.fund(user, 'DIAMOND', 10);
    const before = await h.fourTables(user);

    const res = await buyGold(base, user, product);
    h.assertCode(res, 400, 'BALANCE_LIMIT_EXCEEDED');
    assert.deepEqual(await h.walletOf(user), { gold: 1_000_000_000 - 999, diamond: 10 });
    assert.deepEqual(await h.fourTables(user), before);
});

test('A12-B-326 골드 내고 다이아 받는 행(역교환) → 상품 목록에 없고 그 id로 사면 404', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('rev');
    const reverse = await h.createProduct({ pay_currency: 'GOLD', grant_currency: 'DIAMOND', pay_amount: 1000, grant_amount: 10 });
    await h.fund(user, 'GOLD', 5000);

    const list = await h.call(base, user, 'GET', '/economy/currency-products');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(!list.body.products.some((product) => product.productId === reverse.product_id));
    const listGold = await h.call(base, user, 'GET', '/economy/currency-products?kind=GOLD_PURCHASE');
    assert.ok(!listGold.body.products.some((product) => product.productId === reverse.product_id));

    const res = await buyGold(base, user, reverse);
    h.assertCode(res, 404, 'PRODUCT_NOT_FOUND');
    assert.deepEqual(await h.walletOf(user), { gold: 5000, diamond: 0 });
});

test('A12-B-327 산 뒤 GET /purchases/:번호 → kind GOLD + 두 잔액', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('ask');
    const product = await h.createProduct();
    await h.fund(user, 'DIAMOND', 25);
    const bought = await buyGold(base, user, product, { referenceEventId: 'a12d-gold-ask' });
    assert.equal(bought.status, 200);

    const res = await h.call(base, user, 'GET', '/economy/purchases/a12d-gold-ask');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.kind, 'GOLD');
    assert.equal(res.body.balanceGold, 1000);
    assert.equal(res.body.balanceDiamond, 15);
});
