'use strict';

// 다이아로 골드 사기 시험 (가짜 DB, 진짜 DB 안 씀)
const test = require('node:test');
const assert = require('node:assert/strict');

const economy = require('../../services/economy');
const { MAX_BALANCE } = require('../../services/economy/constants');
const { createFakeEconomyDb, seedWallet, goldProductRow, deadlockError } = require('./fakeEconomyDb');

const rejectsWithCode = (promise, code, status) => assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
});

const setup = ({ products = [goldProductRow()], diamond = 100, gold = 0 } = {}) => {
    const db = createFakeEconomyDb({ products });
    seedWallet(db, 'u', { gold, diamond });
    return db;
};
const req = (overrides = {}) => ({ userId: 'u', productId: 'gold-100', version: 1, referenceEventId: 'g1', ...overrides });
const wallet = (db) => db._inspect.wallets.get('u');

test('골드 구매: 다이아 10 내고 골드 100을 받는다 (응답 잔액도 같음)', async () => {
    const db = setup();
    const result = await economy.purchaseGold(req(), db);
    assert.equal(result.idempotent, false);
    assert.equal(result.balanceDiamond, 90);
    assert.equal(result.balanceGold, 100);
    assert.equal(wallet(db).balance_diamond, 90);
    assert.equal(wallet(db).balance_gold, 100);
});

test('골드 구매: 보너스가 있으면 기본 지급량 + 보너스만큼 받는다', async () => {
    const db = setup({ products: [goldProductRow({ bonus_amount: 25 })] });
    const result = await economy.purchaseGold(req(), db);
    assert.equal(result.balanceGold, 125);
});

test('골드 구매: 다이아가 값보다 1 모자라면 400 INSUFFICIENT_DIAMOND이고 지갑 그대로', async () => {
    const db = setup({ diamond: 9 });
    await rejectsWithCode(economy.purchaseGold(req(), db), 'INSUFFICIENT_DIAMOND', 400);
    assert.equal(wallet(db).balance_diamond, 9);
    assert.equal(wallet(db).balance_gold, 0);
    assert.equal(db._inspect.ledgerEntries.length, 0);
});

test('골드 구매: 다이아가 값과 딱 같으면 사지고 다이아 0', async () => {
    const db = setup({ diamond: 10 });
    const result = await economy.purchaseGold(req(), db);
    assert.equal(result.balanceDiamond, 0);
});

test('골드 구매: 지갑이 없는 새 계정은 지갑을 만들고 다이아 부족으로 거절', async () => {
    const db = createFakeEconomyDb({ products: [goldProductRow()] });
    await rejectsWithCode(economy.purchaseGold(req({ userId: 'fresh' }), db), 'INSUFFICIENT_DIAMOND', 400);
});

test('골드 구매: 받을 골드가 최대 잔액을 넘으면 BALANCE_LIMIT_EXCEEDED이고 다이아도 되돌아간다', async () => {
    const db = setup({ gold: MAX_BALANCE - 50 });
    await rejectsWithCode(economy.purchaseGold(req(), db), 'BALANCE_LIMIT_EXCEEDED', 400);
    assert.equal(wallet(db).balance_diamond, 100);
    assert.equal(wallet(db).balance_gold, MAX_BALANCE - 50);
    assert.equal(db._inspect.ledgerEntries.length, 0);
    assert.equal(db._inspect.purchaseRequests.length, 0);
});

test('골드 구매: 없는 상품이면 404 PRODUCT_NOT_FOUND', async () => {
    const db = setup();
    await rejectsWithCode(economy.purchaseGold(req({ productId: 'nope' }), db), 'PRODUCT_NOT_FOUND', 404);
});

test('골드 구매: 다이아 충전 상품 id로 골드를 사려 하면 404 PRODUCT_NOT_FOUND', async () => {
    const db = setup({
        products: [goldProductRow({ product_id: 'dia-10', kind: 'DIAMOND_TOPUP', pay_currency: 'KRW', grant_currency: 'DIAMOND' })],
    });
    await rejectsWithCode(economy.purchaseGold(req({ productId: 'dia-10' }), db), 'PRODUCT_NOT_FOUND', 404);
    assert.equal(wallet(db).balance_diamond, 100);
});

test('골드 구매: 판매 중지 상품이면 409 PRODUCT_STOPPED', async () => {
    const db = setup({ products: [goldProductRow({ status: 'STOPPED' })] });
    await rejectsWithCode(economy.purchaseGold(req(), db), 'PRODUCT_STOPPED', 409);
});

test('골드 구매: 화면이 본 버전과 다르면 409 PRODUCT_VERSION_MISMATCH와 지금 상품을 같이 준다', async () => {
    const db = setup({ products: [goldProductRow({ version: 2, pay_amount: 20 })] });
    await assert.rejects(economy.purchaseGold(req({ version: 1 }), db), (error) => {
        assert.equal(error.code, 'PRODUCT_VERSION_MISMATCH');
        assert.equal(error.currentProduct.version, 2);
        assert.equal(error.currentProduct.payAmount, 20);
        return true;
    });
    assert.equal(wallet(db).balance_diamond, 100);
});

test('골드 구매: 값이 0인 이상한 상품 행은 팔지 않는다 (404)', async () => {
    const db = setup({ products: [goldProductRow({ pay_amount: 0 })] });
    await rejectsWithCode(economy.purchaseGold(req(), db), 'PRODUCT_NOT_FOUND', 404);
});

test('골드 구매: version이 문자열·0·소수면 400 INVALID_GOLD_PURCHASE_REQUEST', async () => {
    const db = setup();
    for (const version of ['1', 0, 1.5, -1]) {
        await rejectsWithCode(economy.purchaseGold(req({ version }), db), 'INVALID_GOLD_PURCHASE_REQUEST', 400);
    }
});

test('골드 구매: 상품 id 65자·참조 id 151자는 400, 64자·150자는 형식 통과', async () => {
    const db = setup();
    await rejectsWithCode(economy.purchaseGold(req({ productId: 'p'.repeat(65) }), db), 'INVALID_GOLD_PURCHASE_REQUEST', 400);
    await rejectsWithCode(economy.purchaseGold(req({ referenceEventId: 'r'.repeat(151) }), db), 'INVALID_GOLD_PURCHASE_REQUEST', 400);
    await rejectsWithCode(economy.purchaseGold(req({ productId: 'p'.repeat(64) }), db), 'PRODUCT_NOT_FOUND', 404);
    const ok = await economy.purchaseGold(req({ referenceEventId: 'r'.repeat(150) }), db);
    assert.equal(ok.balanceGold, 100);
});

test('골드 구매: userId가 빈 문자열이면 400 INVALID_GOLD_PURCHASE_REQUEST', async () => {
    const db = setup();
    await rejectsWithCode(economy.purchaseGold(req({ userId: '' }), db), 'INVALID_GOLD_PURCHASE_REQUEST', 400);
});

test('골드 구매: 같은 참조 id 다시 보내면 idempotent:true이고 한 번만 빠진다', async () => {
    const db = setup();
    await economy.purchaseGold(req(), db);
    const again = await economy.purchaseGold(req(), db);
    assert.equal(again.idempotent, true);
    assert.equal(again.balanceDiamond, 90);
    assert.equal(again.balanceGold, 100);
    assert.equal(wallet(db).balance_diamond, 90);
});

test('골드 구매: 끝난 요청은 그 뒤 상품이 판매 중지돼도 처음 결과를 준다', async () => {
    const db = setup();
    await economy.purchaseGold(req(), db);
    db._inspect.productRows.get('gold-100').status = 'STOPPED';
    const again = await economy.purchaseGold(req(), db);
    assert.equal(again.idempotent, true);
});

test('골드 구매: 같은 참조 id에 버전이 다르면 409 REFERENCE_EVENT_CONFLICT', async () => {
    const db = setup({ products: [goldProductRow(), goldProductRow({ product_id: 'gold-500', pay_amount: 40, grant_amount: 500 })] });
    await economy.purchaseGold(req(), db);
    await rejectsWithCode(economy.purchaseGold(req({ productId: 'gold-500' }), db), 'REFERENCE_EVENT_CONFLICT', 409);
    assert.equal(wallet(db).balance_diamond, 90);
});

test('골드 구매: 아이템 구매에 쓴 참조 id로 골드를 사려 하면 409 REFERENCE_EVENT_CONFLICT', async () => {
    const db = setup({ gold: 1000 });
    await economy.purchaseItem({ userId: 'u', itemId: 'profile-border-남작', referenceEventId: 'shared' }, db);
    await rejectsWithCode(economy.purchaseGold(req({ referenceEventId: 'shared' }), db), 'REFERENCE_EVENT_CONFLICT', 409);
});

test('골드 구매: 같은 참조 id 요청 3개가 동시에 와도 다이아는 한 번만 빠진다', async () => {
    const db = setup();
    const results = await Promise.all([1, 2, 3].map(() => economy.purchaseGold(req(), db)));
    assert.equal(results.filter((r) => r.idempotent === false).length, 1);
    assert.equal(wallet(db).balance_diamond, 90);
    assert.equal(wallet(db).balance_gold, 100);
});

test('골드 구매: 다른 참조 id 두 개가 동시에 와서 다이아가 한 번 값만 있으면 하나만 된다', async () => {
    const db = setup({ diamond: 15 });
    const results = await Promise.allSettled([
        economy.purchaseGold(req({ referenceEventId: 'a' }), db),
        economy.purchaseGold(req({ referenceEventId: 'b' }), db),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(wallet(db).balance_diamond, 5);
});

test('골드 구매: 한 번 데드락이 나면 다시 시도해서 성공하고 한 번만 빠진다', async () => {
    const db = setup();
    db._failNextTransactions(deadlockError());
    const result = await economy.purchaseGold(req(), db);
    assert.equal(result.balanceDiamond, 90);
    assert.equal(wallet(db).balance_diamond, 90);
    assert.equal(db._inspect.purchaseRequests.length, 1);
});

test('골드 구매: 데드락이 세 번 계속 나면 포기하고 지갑은 그대로', async () => {
    const db = setup();
    db._failNextTransactions(deadlockError(), deadlockError(), deadlockError());
    await assert.rejects(economy.purchaseGold(req(), db), (error) => error.parent?.code === 'ER_LOCK_DEADLOCK');
    assert.equal(wallet(db).balance_diamond, 100);
    assert.equal(db._inspect.ledgerEntries.length, 0);
});

test('골드 구매 결과 다시 묻기: kind GOLD와 다이아·골드 장부 두 줄', async () => {
    const db = setup();
    await economy.purchaseGold(req(), db);
    const found = await economy.getPurchaseResult('u', 'g1', db);
    assert.equal(found.kind, 'GOLD');
    assert.deepEqual(found.results.map((r) => r.currency), ['DIAMOND', 'GOLD']);
    assert.deepEqual(found.results.map((r) => r.amount), [-10, 100]);
});
