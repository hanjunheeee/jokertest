'use strict';

// 아이템 구매(단건·묶음)·구매 결과 다시 묻기 시험 (가짜 DB, 진짜 DB 안 씀)
const test = require('node:test');
const assert = require('node:assert/strict');

const economy = require('../../services/economy');
const { createFakeEconomyDb, seedWallet, REFERENCE_COLUMN_MAX } = require('./fakeEconomyDb');

const BARON = 'profile-border-남작'; // 200골드
const VISCOUNT = 'profile-border-자작'; // 300골드
const SKIN = 'player-skin-귀족1-블러드'; // 500골드
const CARD = 'player-card-가고일'; // 500골드
const EMOJI = 'emoji-shush'; // 500골드

const rejectsWithCode = (promise, code, status) => assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
});

const owns = (db, userId, itemId) => db._inspect.entitlements.some((e) => e.user_id === userId && e.item_id === itemId);
const gold = (db, userId) => db._inspect.wallets.get(userId)?.balance_gold;

test('구매: 참조 id 없으면 400 MISSING_REFERENCE_EVENT_ID', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }] }, db), 'MISSING_REFERENCE_EVENT_ID', 400);
});

test('구매: items가 배열이 아니면 400 EMPTY_PURCHASE_ITEMS', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: { itemId: BARON }, referenceEventId: 'r' }, db), 'EMPTY_PURCHASE_ITEMS', 400);
});

test('구매: 빈 items 배열은 400 EMPTY_PURCHASE_ITEMS', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [], referenceEventId: 'r' }, db), 'EMPTY_PURCHASE_ITEMS', 400);
});

test('구매: items 안에 null이 섞이면 400 INVALID_PURCHASE_ITEM', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }, null], referenceEventId: 'r' }, db), 'INVALID_PURCHASE_ITEM', 400);
});

test('구매: itemId가 빈 문자열이면 400 INVALID_PURCHASE_ITEM', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [{ itemId: '' }], referenceEventId: 'r' }, db), 'INVALID_PURCHASE_ITEM', 400);
});

test('구매: itemId가 숫자면 400 INVALID_PURCHASE_ITEM', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [{ itemId: 7 }], referenceEventId: 'r' }, db), 'INVALID_PURCHASE_ITEM', 400);
});

test('구매: 같은 아이템을 묶음에 두 번 넣으면 400 DUPLICATE_PURCHASE_ITEM이고 돈이 안 빠진다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 1000 });
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }, { itemId: BARON }], referenceEventId: 'r' }, db), 'DUPLICATE_PURCHASE_ITEM', 400);
    assert.equal(gold(db, 'u'), 1000);
});

test('구매: 목록에 없는 아이템은 400 ITEM_NOT_PURCHASABLE', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItem({ userId: 'u', itemId: 'profile-border-없는등급', referenceEventId: 'r' }, db), 'ITEM_NOT_PURCHASABLE', 400);
});

test('구매: 공짜 기본 사진은 안 팔아서 400 ITEM_NOT_PURCHASABLE', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItem({ userId: 'u', itemId: 'player-profile-금빛가면', referenceEventId: 'r' }, db), 'ITEM_NOT_PURCHASABLE', 400);
});

test('구매: 업적 보상 전용 직업 테두리는 사지 못한다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 10000 });
    await rejectsWithCode(economy.purchaseItem({ userId: 'u', itemId: 'profile-border-귀족', referenceEventId: 'r' }, db), 'ITEM_NOT_PURCHASABLE', 400);
    assert.equal(owns(db, 'u', 'profile-border-귀족'), false);
});

test('구매: 기본 이모티콘·공짜 카드 테두리는 사지 못한다', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItem({ userId: 'u', itemId: 'emoji-basic-love', referenceEventId: 'r1' }, db), 'ITEM_NOT_PURCHASABLE', 400);
    await rejectsWithCode(economy.purchaseItem({ userId: 'u', itemId: 'player-card-베이스', referenceEventId: 'r2' }, db), 'ITEM_NOT_PURCHASABLE', 400);
});

test('구매: 묶음 중 하나라도 못 파는 아이템이면 전부 거절되고 아무것도 안 생긴다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 5000 });
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }, { itemId: 'nope' }], referenceEventId: 'r' }, db), 'ITEM_NOT_PURCHASABLE', 400);
    assert.equal(owns(db, 'u', BARON), false);
    assert.equal(gold(db, 'u'), 5000);
});

test('구매: 잔액이 값보다 1 모자라면 INSUFFICIENT_BALANCE이고 보유가 안 생긴다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 199 });
    await rejectsWithCode(economy.purchaseItem({ userId: 'u', itemId: BARON, referenceEventId: 'r' }, db), 'INSUFFICIENT_BALANCE', 400);
    assert.equal(owns(db, 'u', BARON), false);
    assert.equal(db._inspect.purchaseRequests.length, 0);
});

test('구매: 잔액이 값과 딱 같으면 사지고 잔액 0', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 200 });
    const result = await economy.purchaseItem({ userId: 'u', itemId: BARON, referenceEventId: 'r' }, db);
    assert.equal(result.idempotent, false);
    assert.equal(result.ledgerEntry.amount, -200);
    assert.equal(result.ledgerEntry.balance_after, 0);
    assert.equal(gold(db, 'u'), 0);
});

test('구매: 지갑이 아예 없는 새 계정은 잔액 0이라 INSUFFICIENT_BALANCE', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.purchaseItem({ userId: 'new', itemId: BARON, referenceEventId: 'r' }, db), 'INSUFFICIENT_BALANCE', 400);
    assert.equal(gold(db, 'new'), 0);
});

test('구매: 사면 보유 행의 종류·출처가 상품 목록과 맞다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 2000 });
    await economy.purchaseItems({ userId: 'u', items: [{ itemId: SKIN }, { itemId: CARD }, { itemId: EMOJI }], referenceEventId: 'r' }, db);
    const byId = Object.fromEntries(db._inspect.entitlements.map((e) => [e.item_id, e]));
    assert.equal(byId[SKIN].item_type, 'SKIN');
    assert.equal(byId[CARD].item_type, 'PLAYER_CARD_FRAME');
    assert.equal(byId[EMOJI].item_type, 'EMOTICON');
    assert.ok([SKIN, CARD, EMOJI].every((id) => byId[id].source === 'PURCHASE'));
});

test('구매: 단건은 kind SINGLE, 두 개 이상은 kind BULK', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 5000 });
    const single = await economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }], referenceEventId: 's' }, db);
    const bulk = await economy.purchaseItems({ userId: 'u', items: [{ itemId: VISCOUNT }, { itemId: SKIN }], referenceEventId: 'b' }, db);
    assert.equal(single.kind, 'SINGLE');
    assert.equal(bulk.kind, 'BULK');
});

test('묶음 구매: 값 합만큼 빠지고 결과가 아이템마다 한 줄씩 나온다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 1000 });
    const result = await economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }, { itemId: VISCOUNT }], referenceEventId: 'b' }, db);
    assert.equal(result.results.length, 2);
    assert.deepEqual(result.results.map((r) => r.item_id), [BARON, VISCOUNT]);
    assert.equal(gold(db, 'u'), 500);
    assert.equal(new Set(result.results.map((r) => r.reference_event_id)).size, 2);
});

test('묶음 구매: 두 번째 아이템을 이미 가졌으면 첫 아이템도 안 사지고 돈이 그대로', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 2000 });
    await economy.purchaseItem({ userId: 'u', itemId: VISCOUNT, referenceEventId: 'first' }, db);
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }, { itemId: VISCOUNT }], referenceEventId: 'b' }, db), 'ITEM_ALREADY_OWNED', 409);
    assert.equal(owns(db, 'u', BARON), false);
    assert.equal(gold(db, 'u'), 1700);
    assert.equal(db._inspect.purchaseRequests.length, 1);
});

test('묶음 구매: 첫 아이템 값은 되지만 합계가 모자라면 전부 되돌아간다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 400 });
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }, { itemId: VISCOUNT }], referenceEventId: 'b' }, db), 'INSUFFICIENT_BALANCE', 400);
    assert.equal(gold(db, 'u'), 400);
    assert.equal(db._inspect.ledgerEntries.length, 0);
    assert.equal(db._inspect.entitlements.length, 0);
});

test('묶음 구매: 같은 참조 id로 순서만 바꿔 다시 보내면 같은 요청으로 보고 두 번 안 뺀다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 1000 });
    const first = await economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }, { itemId: VISCOUNT }], referenceEventId: 'b' }, db);
    const again = await economy.purchaseItems({ userId: 'u', items: [{ itemId: VISCOUNT }, { itemId: BARON }], referenceEventId: 'b' }, db);
    assert.equal(again.idempotent, true);
    assert.deepEqual(again.results.map((r) => r.id), first.results.map((r) => r.id));
    assert.equal(gold(db, 'u'), 500);
});

test('묶음 구매: 같은 참조 id에 아이템 구성이 다르면 409 REFERENCE_EVENT_CONFLICT', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 2000 });
    await economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }, { itemId: VISCOUNT }], referenceEventId: 'b' }, db);
    await rejectsWithCode(economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }], referenceEventId: 'b' }, db), 'REFERENCE_EVENT_CONFLICT', 409);
    assert.equal(gold(db, 'u'), 1500);
});

test('구매: 같은 참조 id 다시 보내기는 그사이 잔액이 0이 돼도 처음 결과를 그대로 준다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 200 });
    const first = await economy.purchaseItem({ userId: 'u', itemId: BARON, referenceEventId: 'r' }, db);
    const again = await economy.purchaseItem({ userId: 'u', itemId: BARON, referenceEventId: 'r' }, db);
    assert.equal(again.idempotent, true);
    assert.equal(again.ledgerEntry.id, first.ledgerEntry.id);
});

test('구매: 같은 참조 id 요청 3개가 동시에 와도 한 번만 빠지고 모두 같은 장부 id', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 1000 });
    const results = await Promise.all([1, 2, 3].map(() => economy.purchaseItem({ userId: 'u', itemId: BARON, referenceEventId: 'same' }, db)));
    assert.equal(new Set(results.map((r) => r.ledgerEntry.id)).size, 1);
    assert.equal(gold(db, 'u'), 800);
});

test('구매: 서로 다른 아이템을 동시에 사도 잔액이 음수로 안 가고 산 만큼만 빠진다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 500 });
    const results = await Promise.allSettled([
        economy.purchaseItem({ userId: 'u', itemId: VISCOUNT, referenceEventId: 'a' }, db),
        economy.purchaseItem({ userId: 'u', itemId: 'profile-border-백작', referenceEventId: 'b' }, db),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.ok(gold(db, 'u') >= 0);
    assert.ok(gold(db, 'u') === 200 || gold(db, 'u') === 100);
});

test('구매: 다른 사람의 같은 참조 id 구매는 서로 결과를 섞지 않는다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'a', { gold: 500 });
    seedWallet(db, 'b', { gold: 500 });
    await economy.purchaseItem({ userId: 'a', itemId: BARON, referenceEventId: 'shared' }, db);
    const b = await economy.purchaseItem({ userId: 'b', itemId: VISCOUNT, referenceEventId: 'shared' }, db);
    assert.equal(b.idempotent, false);
    assert.equal(b.ledgerEntry.item_id, VISCOUNT);
    assert.equal(owns(db, 'b', BARON), false);
});

test('구매: 참조 id가 DB 칸 크기(150자)여도 DB 오류(500) 없이 처리되거나 400으로 거절된다', async () => {
    // 구매 요청 행은 150자까지 받지만, 아이템 장부 참조 id는 "요청id::item::아이템id"라 150자를 넘음
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 1000 });
    const referenceEventId = 'r'.repeat(REFERENCE_COLUMN_MAX);
    try {
        await economy.purchaseItem({ userId: 'u', itemId: BARON, referenceEventId }, db);
        assert.ok(db._inspect.ledgerEntries.every((e) => e.reference_event_id.length <= REFERENCE_COLUMN_MAX));
    } catch (error) {
        assert.equal(error.status, 400, `400이 아닌 오류: ${error.name} ${error.message}`);
    }
    assert.equal(gold(db, 'u') === 1000 || gold(db, 'u') === 800, true);
});

test('구매 결과 다시 묻기: 참조 id 없으면 400 MISSING_REFERENCE_EVENT_ID', async () => {
    const db = createFakeEconomyDb();
    await rejectsWithCode(economy.getPurchaseResult('u', '', db), 'MISSING_REFERENCE_EVENT_ID', 400);
});

test('구매 결과 다시 묻기: 없는 참조 id면 null', async () => {
    const db = createFakeEconomyDb();
    assert.equal(await economy.getPurchaseResult('u', 'nothing', db), null);
});

test('구매 결과 다시 묻기: 산 요청이면 kind·결과·만든 시각을 돌려준다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 1000 });
    await economy.purchaseItems({ userId: 'u', items: [{ itemId: BARON }, { itemId: VISCOUNT }], referenceEventId: 'b' }, db);
    const found = await economy.getPurchaseResult('u', 'b', db);
    assert.equal(found.kind, 'BULK');
    assert.equal(found.results.length, 2);
    assert.ok(found.createdAt instanceof Date);
});

test('구매 결과 다시 묻기: 남의 참조 id로는 결과가 안 보인다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'a', { gold: 1000 });
    await economy.purchaseItem({ userId: 'a', itemId: BARON, referenceEventId: 'mine' }, db);
    assert.equal(await economy.getPurchaseResult('b', 'mine', db), null);
});

test('구매 결과 다시 묻기: 실패한 구매는 결과가 남지 않는다', async () => {
    const db = createFakeEconomyDb();
    await assert.rejects(economy.purchaseItem({ userId: 'u', itemId: BARON, referenceEventId: 'fail' }, db));
    assert.equal(await economy.getPurchaseResult('u', 'fail', db), null);
});
