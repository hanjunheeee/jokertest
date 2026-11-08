'use strict';

// 장부 거래·보상 지급 시험 (가짜 DB, 진짜 DB 안 씀)
const test = require('node:test');
const assert = require('node:assert/strict');

const economy = require('../../services/economy');
const { MAX_BALANCE } = require('../../services/economy/constants');
const { createFakeEconomyDb, seedWallet } = require('./fakeEconomyDb');

const { applyLedgerTransaction, ensureWalletRow } = economy.__internal;

const base = (overrides = {}) => ({
    userId: 'u1', reason: 'REWARD', currency: 'GOLD', amount: 100, referenceEventId: 'ref-1', ...overrides,
});

const rejectsWithCode = (promise, code, status) => assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
});

test('장부: 참조 id가 없으면 400 MISSING_REFERENCE_EVENT_ID이고 지갑을 만들지 않는다', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(applyLedgerTransaction(db, base({ referenceEventId: undefined })), 'MISSING_REFERENCE_EVENT_ID', 400);
    assert.equal(db._inspect.wallets.size, 0);
});

test('장부: 참조 id가 빈 문자열이면 400 MISSING_REFERENCE_EVENT_ID', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(applyLedgerTransaction(db, base({ referenceEventId: '' })), 'MISSING_REFERENCE_EVENT_ID', 400);
});

test('장부: 참조 id가 숫자면 400 MISSING_REFERENCE_EVENT_ID', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(applyLedgerTransaction(db, base({ referenceEventId: 123 })), 'MISSING_REFERENCE_EVENT_ID', 400);
});

test('장부: 모르는 통화(KRW)는 400 INVALID_CURRENCY', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(applyLedgerTransaction(db, base({ currency: 'KRW' })), 'INVALID_CURRENCY', 400);
});

test('장부: 통화 이름이 물려받은 속성(toString)이어도 INVALID_CURRENCY로 거절', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(applyLedgerTransaction(db, base({ currency: 'toString' })), 'INVALID_CURRENCY', 400);
});

test('장부: 소문자 통화(gold)는 다른 통화로 보고 거절', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(applyLedgerTransaction(db, base({ currency: 'gold' })), 'INVALID_CURRENCY', 400);
});

test('장부: 소수 금액은 400 AMOUNT_OUT_OF_RANGE', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(applyLedgerTransaction(db, base({ amount: 1.5 })), 'AMOUNT_OUT_OF_RANGE', 400);
});

test('장부: 문자열 금액("100")은 400 AMOUNT_OUT_OF_RANGE', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(applyLedgerTransaction(db, base({ amount: '100' })), 'AMOUNT_OUT_OF_RANGE', 400);
});

test('장부: 금액이 최대 잔액+1이면 거절, 최대 잔액 그대로는 통과', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(applyLedgerTransaction(db, base({ amount: MAX_BALANCE + 1 })), 'AMOUNT_OUT_OF_RANGE', 400);
    const ok = await applyLedgerTransaction(db, base({ amount: MAX_BALANCE, referenceEventId: 'max' }));
    assert.equal(ok.walletBalance, MAX_BALANCE);
});

test('장부: 잔액이 최대 잔액을 1 넘게 되면 BALANCE_LIMIT_EXCEEDED이고 잔액은 그대로', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u1', { gold: MAX_BALANCE });
    await rejectsWithCode(applyLedgerTransaction(db, base({ amount: 1 })), 'BALANCE_LIMIT_EXCEEDED', 400);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, MAX_BALANCE);
    assert.equal(db._inspect.ledgerEntries.length, 0);
});

test('장부: 빼기로 잔액이 정확히 0이 되면 통과', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u1', { gold: 300 });
    const result = await applyLedgerTransaction(db, base({ amount: -300 }));
    assert.equal(result.walletBalance, 0);
    assert.equal(result.ledgerEntry.balance_after, 0);
});

test('장부: 빼기로 잔액이 -1이 되면 INSUFFICIENT_BALANCE이고 장부가 안 남는다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u1', { gold: 299 });
    await rejectsWithCode(applyLedgerTransaction(db, base({ amount: -300 })), 'INSUFFICIENT_BALANCE', 400);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 299);
    assert.equal(db._inspect.ledgerEntries.length, 0);
});

test('장부: 금액 0 거래는 잔액을 안 바꾸고 장부 한 줄만 남긴다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u1', { gold: 50 });
    const result = await applyLedgerTransaction(db, base({ amount: 0 }));
    assert.equal(result.walletBalance, 50);
    assert.equal(db._inspect.ledgerEntries.length, 1);
});

test('장부: 다이아 거래는 다이아 잔액만 바꾸고 골드는 그대로', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u1', { gold: 7, diamond: 3 });
    const result = await applyLedgerTransaction(db, base({ currency: 'DIAMOND', amount: 10 }));
    assert.equal(result.walletBalance, 13);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 7);
});

test('장부: 같은 참조 id·같은 내용으로 다시 오면 idempotent:true와 처음 장부를 돌려주고 두 번 안 더한다', async () => {
    const db = createFakeEconomyDb();
    const first = await applyLedgerTransaction(db, base());
    const second = await applyLedgerTransaction(db, base());
    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(second.ledgerEntry.id, first.ledgerEntry.id);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 100);
});

test('장부: 같은 참조 id에 금액이 다르면 409 REFERENCE_EVENT_CONFLICT', async () => {
    const db = createFakeEconomyDb();
    await applyLedgerTransaction(db, base());
    await rejectsWithCode(applyLedgerTransaction(db, base({ amount: 999 })), 'REFERENCE_EVENT_CONFLICT', 409);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 100);
});

test('장부: 같은 참조 id에 사유만 달라도 409 REFERENCE_EVENT_CONFLICT', async () => {
    const db = createFakeEconomyDb();
    await applyLedgerTransaction(db, base());
    await rejectsWithCode(applyLedgerTransaction(db, base({ reason: 'OTHER' })), 'REFERENCE_EVENT_CONFLICT', 409);
});

test('장부: 같은 참조 id에 통화만 달라도 409 REFERENCE_EVENT_CONFLICT', async () => {
    const db = createFakeEconomyDb();
    await applyLedgerTransaction(db, base());
    await rejectsWithCode(applyLedgerTransaction(db, base({ currency: 'DIAMOND' })), 'REFERENCE_EVENT_CONFLICT', 409);
});

test('장부: 같은 참조 id 문자열도 사람이 다르면 따로 처리된다', async () => {
    const db = createFakeEconomyDb();
    const a = await applyLedgerTransaction(db, base({ userId: 'a' }));
    const b = await applyLedgerTransaction(db, base({ userId: 'b' }));
    assert.equal(a.idempotent, false);
    assert.equal(b.idempotent, false);
    assert.equal(db._inspect.wallets.get('a').balance_gold, 100);
    assert.equal(db._inspect.wallets.get('b').balance_gold, 100);
});

test('장부: 같은 참조 id 요청 5개가 동시에 와도 한 번만 더해지고 모두 같은 장부 id를 받는다', async () => {
    const db = createFakeEconomyDb();
    const results = await Promise.all(Array.from({ length: 5 }, () => applyLedgerTransaction(db, base())));
    assert.equal(new Set(results.map((r) => r.ledgerEntry.id)).size, 1);
    assert.equal(results.filter((r) => r.idempotent === false).length, 1);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 100);
});

test('장부: 서로 다른 참조 id 빼기 두 개가 동시에 와도 잔액이 음수로 안 간다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u1', { gold: 100 });
    const results = await Promise.allSettled([
        applyLedgerTransaction(db, base({ amount: -80, referenceEventId: 'x' })),
        applyLedgerTransaction(db, base({ amount: -80, referenceEventId: 'y' })),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'INSUFFICIENT_BALANCE');
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 20);
});

test('장부: 이미 가진 아이템을 다시 주면 409 ITEM_ALREADY_OWNED이고 돈이 안 빠진다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u1', { gold: 1000 });
    const item = { itemId: 'profile-border-남작', itemType: 'PROFILE_BORDER', entitlementSource: 'PURCHASE', reason: 'PURCHASE' };
    await applyLedgerTransaction(db, base({ ...item, amount: -200, referenceEventId: 'p1' }));
    await rejectsWithCode(applyLedgerTransaction(db, base({ ...item, amount: -200, referenceEventId: 'p2' })), 'ITEM_ALREADY_OWNED', 409);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 800);
});

test('장부: 장부 끝 잔액(balance_after)은 차례대로 쌓인 잔액과 같다', async () => {
    const db = createFakeEconomyDb();
    await applyLedgerTransaction(db, base({ amount: 100, referenceEventId: 'a' }));
    await applyLedgerTransaction(db, base({ amount: -30, referenceEventId: 'b' }));
    await applyLedgerTransaction(db, base({ amount: 5, referenceEventId: 'c' }));
    assert.deepEqual(db._inspect.ledgerEntries.map((e) => e.balance_after), [100, 70, 75]);
});

test('장부: 바깥 트랜잭션이 나중에 실패하면 그 안에서 더한 잔액·장부가 되돌아간다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u1', { gold: 10 });
    await assert.rejects(db.sequelize.transaction(async (t) => {
        await applyLedgerTransaction(db, base(), { transaction: t });
        throw new Error('뒤 단계 실패');
    }), /뒤 단계 실패/);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 10);
    assert.equal(db._inspect.ledgerEntries.length, 0);
});

test('지갑 행: 두 번 만들어도 오류 없이 하나만 남는다', async () => {
    const db = createFakeEconomyDb();
    await ensureWalletRow(db, 'u1');
    await ensureWalletRow(db, 'u1');
    assert.equal(db._inspect.wallets.size, 1);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 0);
});

test('보상 지급: 금액 0은 400 INVALID_AMOUNT', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.grantReward({ userId: 'u1', amount: 0, referenceEventId: 'r' }, db), 'INVALID_AMOUNT', 400);
});

test('보상 지급: 음수 금액은 400 INVALID_AMOUNT (보상으로 돈 빼기 막기)', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u1', { gold: 100 });
    await rejectsWithCode(economy.grantReward({ userId: 'u1', amount: -50, referenceEventId: 'r' }, db), 'INVALID_AMOUNT', 400);
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 100);
});

test('보상 지급: 모르는 통화는 400 INVALID_CURRENCY', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.grantReward({ userId: 'u1', amount: 5, currency: 'RUBY', referenceEventId: 'r' }, db), 'INVALID_CURRENCY', 400);
});

test('보상 지급: 통화를 안 주면 골드로 들어간다', async () => {
    const db = createFakeEconomyDb();
    const result = await economy.grantReward({ userId: 'u1', amount: 5, referenceEventId: 'r' }, db);
    assert.equal(result.ledgerEntry.currency, 'GOLD');
    assert.equal(result.ledgerEntry.reason, 'REWARD');
});

test('보상 지급: 참조 id 없이 부르면 400 MISSING_REFERENCE_EVENT_ID', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.grantReward({ userId: 'u1', amount: 5 }, db), 'MISSING_REFERENCE_EVENT_ID', 400);
});

test('업적 통화 보상: 사유는 ACHIEVEMENT_REWARD로 남는다', async () => {
    const db = createFakeEconomyDb();
    const result = await economy.grantAchievementCurrency({ userId: 'u1', currency: 'DIAMOND', amount: 30, referenceEventId: 'ach' }, db);
    assert.equal(result.ledgerEntry.reason, 'ACHIEVEMENT_REWARD');
    assert.equal(db._inspect.wallets.get('u1').balance_diamond, 30);
});

test('업적 통화 보상: 소수 금액은 400 INVALID_AMOUNT', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.grantAchievementCurrency({ userId: 'u1', currency: 'GOLD', amount: 0.5, referenceEventId: 'a' }, db), 'INVALID_AMOUNT', 400);
});

test('업적 아이템 보상: 이미 가진 아이템이면 실패 대신 alreadyOwned:true', async () => {
    const db = createFakeEconomyDb();
    const reward = { userId: 'u1', itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER' };
    await economy.grantAchievementItem({ ...reward, referenceEventId: 'a1' }, db);
    const again = await economy.grantAchievementItem({ ...reward, referenceEventId: 'a2' }, db);
    assert.deepEqual(again, { idempotent: true, alreadyOwned: true });
    assert.equal(db._inspect.entitlements.filter((e) => e.item_id === 'profile-border-귀족').length, 1);
});

test('업적 아이템 보상: 보유 출처는 ACHIEVEMENT_GRANT, 돈은 안 바뀐다', async () => {
    const db = createFakeEconomyDb();
    await economy.grantAchievementItem({ userId: 'u1', itemId: 'profile-border-광대', itemType: 'PROFILE_BORDER', referenceEventId: 'a1' }, db);
    const owned = db._inspect.entitlements.find((e) => e.item_id === 'profile-border-광대');
    assert.equal(owned.source, 'ACHIEVEMENT_GRANT');
    assert.equal(db._inspect.wallets.get('u1').balance_gold, 0);
});
