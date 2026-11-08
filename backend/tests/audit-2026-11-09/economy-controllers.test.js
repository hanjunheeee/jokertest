'use strict';

// 경제 처리기(구매·골드 구매·지급·장착·지갑·팔레트) 입력 검사·응답 모양 시험
// 경제 서비스는 모듈 객체 함수를 가짜로 갈아끼움 (DB 안 씀)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const economyService = require('../../services/economy');
const purchase = require('../../controllers/economy/purchase');
const account = require('../../controllers/economy/account');
const palette = require('../../controllers/economy/emojiPalette');
const serializers = require('../../controllers/economy/serializers');

// 처리기 한 번 부르고 응답 또는 next로 온 오류를 돌려줌
const call = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    Promise.resolve(handler({ user: { uuid: 'me' }, params: {}, ...req }, res, (error) => resolve({ error }))).catch((error) => resolve({ thrown: error }));
});

// 서비스 함수 갈아끼우고 시험 끝나면 되돌림, 부를 때 받은 값 기록
const stub = (t, name, impl) => {
    const original = economyService[name];
    const calls = [];
    economyService[name] = async (...args) => { calls.push(args); return impl(...args); };
    t.after(() => { economyService[name] = original; });
    return calls;
};

const ledgerRow = (overrides = {}) => ({
    id: 1, reason: 'PURCHASE', item_id: 'profile-border-남작', currency: 'GOLD', amount: -200,
    balance_after: 800, reference_event_id: 'r::item::profile-border-남작', created_at: new Date('2026-11-09T00:00:00Z'), ...overrides,
});

const expectError = (result, code, status) => {
    assert.ok(result.error, `오류가 아니라 응답이 왔음: ${JSON.stringify(result)}`);
    assert.equal(result.error.code, code);
    if (status !== undefined) assert.equal(result.error.status, status);
};

test('단건 구매 처리기: 모르는 필드(price)가 있으면 400 UNKNOWN_PURCHASE_FIELD', async (t) => {
    const calls = stub(t, 'purchaseItem', () => ({ idempotent: false, ledgerEntry: ledgerRow() }));
    const result = await call(purchase.purchaseItem, { body: { itemId: 'x', referenceEventId: 'r', price: 0 } });
    expectError(result, 'UNKNOWN_PURCHASE_FIELD', 400);
    assert.equal(calls.length, 0);
});

test('단건 구매 처리기: itemId가 숫자면 400 INVALID_PURCHASE_REQUEST', async (t) => {
    stub(t, 'purchaseItem', () => ({ idempotent: false, ledgerEntry: ledgerRow() }));
    expectError(await call(purchase.purchaseItem, { body: { itemId: 1, referenceEventId: 'r' } }), 'INVALID_PURCHASE_REQUEST', 400);
});

test('단건 구매 처리기: 본문이 없으면 500이 아니라 400 INVALID_PURCHASE_REQUEST', async (t) => {
    stub(t, 'purchaseItem', () => ({ idempotent: false, ledgerEntry: ledgerRow() }));
    expectError(await call(purchase.purchaseItem, { body: undefined }), 'INVALID_PURCHASE_REQUEST', 400);
});

test('단건 구매 처리기: 새 구매는 201, 장부는 화면용 이름으로', async (t) => {
    stub(t, 'purchaseItem', () => ({ idempotent: false, ledgerEntry: ledgerRow() }));
    const result = await call(purchase.purchaseItem, { body: { itemId: 'profile-border-남작', referenceEventId: 'r' } });
    assert.equal(result.status, 201);
    assert.equal(result.body.idempotent, false);
    assert.equal(result.body.ledgerEntry.itemId, 'profile-border-남작');
    assert.equal(result.body.ledgerEntry.balanceAfter, 800);
    assert.equal(result.body.ledgerEntry.item_id, undefined);
});

test('단건 구매 처리기: 같은 참조 id 다시 보내기는 200', async (t) => {
    stub(t, 'purchaseItem', () => ({ idempotent: true, ledgerEntry: ledgerRow() }));
    const result = await call(purchase.purchaseItem, { body: { itemId: 'profile-border-남작', referenceEventId: 'r' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.idempotent, true);
});

test('단건 구매 처리기: 사는 사람은 본문이 아니라 로그인 계정이다', async (t) => {
    const calls = stub(t, 'purchaseItem', () => ({ idempotent: false, ledgerEntry: ledgerRow() }));
    await call(purchase.purchaseItem, { user: { uuid: 'real' }, body: { itemId: 'x', referenceEventId: 'r' } });
    assert.equal(calls[0][0].userId, 'real');
});

test('단건 구매 처리기: 참조 id가 DB 칸 크기(150자)를 넘으면(151자) 400으로 거절한다', async (t) => {
    stub(t, 'purchaseItem', () => ({ idempotent: false, ledgerEntry: ledgerRow() }));
    const result = await call(purchase.purchaseItem, { body: { itemId: 'profile-border-남작', referenceEventId: 'r'.repeat(151) } });
    assert.ok(result.error, '151자 참조 id가 그대로 서비스까지 감');
    assert.equal(result.error.status, 400);
});

test('단건 구매 처리기: 서비스 오류(409 ITEM_ALREADY_OWNED)는 그대로 next로 넘긴다', async (t) => {
    stub(t, 'purchaseItem', () => { throw Object.assign(new Error('이미 보유'), { status: 409, code: 'ITEM_ALREADY_OWNED' }); });
    expectError(await call(purchase.purchaseItem, { body: { itemId: 'x', referenceEventId: 'r' } }), 'ITEM_ALREADY_OWNED', 409);
});

test('묶음 구매 처리기: 참조 id 없으면 400 INVALID_BULK_PURCHASE_REQUEST', async (t) => {
    stub(t, 'purchaseItems', () => ({ idempotent: false, kind: 'BULK', results: [] }));
    expectError(await call(purchase.purchaseItems, { body: { items: [{ itemId: 'a' }] } }), 'INVALID_BULK_PURCHASE_REQUEST', 400);
});

test('묶음 구매 처리기: 빈 items는 400 INVALID_BULK_PURCHASE_REQUEST', async (t) => {
    stub(t, 'purchaseItems', () => ({ idempotent: false, kind: 'BULK', results: [] }));
    expectError(await call(purchase.purchaseItems, { body: { items: [], referenceEventId: 'r' } }), 'INVALID_BULK_PURCHASE_REQUEST', 400);
});

test('묶음 구매 처리기: 항목에 모르는 필드(priceGold)가 있으면 400 UNKNOWN_BULK_PURCHASE_ITEM_FIELD', async (t) => {
    stub(t, 'purchaseItems', () => ({ idempotent: false, kind: 'BULK', results: [] }));
    expectError(await call(purchase.purchaseItems, { body: { items: [{ itemId: 'a', priceGold: 0 }], referenceEventId: 'r' } }), 'UNKNOWN_BULK_PURCHASE_ITEM_FIELD', 400);
});

test('묶음 구매 처리기: 항목이 null이면 500이 아니라 400', async (t) => {
    stub(t, 'purchaseItems', () => ({ idempotent: false, kind: 'BULK', results: [] }));
    const result = await call(purchase.purchaseItems, { body: { items: [null], referenceEventId: 'r' } });
    assert.equal(result.error?.status, 400);
});

test('묶음 구매 처리기: 성공하면 201·kind·결과 줄마다 화면용 이름', async (t) => {
    stub(t, 'purchaseItems', () => ({ idempotent: false, kind: 'BULK', results: [ledgerRow(), ledgerRow({ id: 2, item_id: 'b' })] }));
    const result = await call(purchase.purchaseItems, { body: { items: [{ itemId: 'a' }, { itemId: 'b' }], referenceEventId: 'r' } });
    assert.equal(result.status, 201);
    assert.equal(result.body.kind, 'BULK');
    assert.deepEqual(result.body.results.map((r) => r.id), [1, 2]);
});

test('구매 결과 처리기: 결과가 없으면 404 PURCHASE_RESULT_NOT_FOUND', async (t) => {
    stub(t, 'getPurchaseResult', () => null);
    expectError(await call(purchase.getPurchaseResult, { params: { referenceEventId: 'r' } }), 'PURCHASE_RESULT_NOT_FOUND', 404);
});

test('구매 결과 처리기: 골드 구매면 ok·다이아·골드 잔액을 같이 준다', async (t) => {
    stub(t, 'getPurchaseResult', () => ({
        kind: 'GOLD', createdAt: new Date(0),
        results: [ledgerRow({ currency: 'DIAMOND', amount: -10, balance_after: 90 }), ledgerRow({ id: 2, currency: 'GOLD', amount: 100, balance_after: 100 })],
    }));
    const result = await call(purchase.getPurchaseResult, { params: { referenceEventId: 'r' } });
    assert.equal(result.body.ok, true);
    assert.equal(result.body.balanceDiamond, 90);
    assert.equal(result.body.balanceGold, 100);
});

test('구매 결과 처리기: 아이템 구매 결과에는 잔액 칸을 붙이지 않는다', async (t) => {
    stub(t, 'getPurchaseResult', () => ({ kind: 'SINGLE', createdAt: new Date(0), results: [ledgerRow()] }));
    const result = await call(purchase.getPurchaseResult, { params: { referenceEventId: 'r' } });
    assert.equal(result.body.kind, 'SINGLE');
    assert.equal('balanceGold' in result.body, false);
});

test('골드 구매 처리기: 참고용 필드(price·amount·quantity)는 지우고 통과시킨다', async (t) => {
    const calls = stub(t, 'purchaseGold', () => ({ balanceGold: 100, balanceDiamond: 90 }));
    const result = await call(purchase.purchaseGold, { body: { productId: 'gold-100', version: 1, referenceEventId: 'g', price: 1, amount: 999, quantity: 3 } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true, balanceGold: 100, balanceDiamond: 90 });
    assert.deepEqual(Object.keys(calls[0][0]).sort(), ['productId', 'referenceEventId', 'userId', 'version']);
});

test('골드 구매 처리기: 본문에 userId를 넣으면 400 UNKNOWN_GOLD_PURCHASE_FIELD (남의 지갑으로 못 삼)', async (t) => {
    stub(t, 'purchaseGold', () => ({ balanceGold: 0, balanceDiamond: 0 }));
    expectError(await call(purchase.purchaseGold, { body: { productId: 'p', version: 1, referenceEventId: 'g', userId: 'victim' } }), 'UNKNOWN_GOLD_PURCHASE_FIELD', 400);
});

test('골드 구매 처리기: version이 문자열 "1"이면 400 INVALID_GOLD_PURCHASE_REQUEST', async (t) => {
    stub(t, 'purchaseGold', () => ({ balanceGold: 0, balanceDiamond: 0 }));
    expectError(await call(purchase.purchaseGold, { body: { productId: 'p', version: '1', referenceEventId: 'g' } }), 'INVALID_GOLD_PURCHASE_REQUEST', 400);
});

test('골드 구매 처리기: 참조 id 151자·상품 id 65자는 400', async (t) => {
    stub(t, 'purchaseGold', () => ({ balanceGold: 0, balanceDiamond: 0 }));
    expectError(await call(purchase.purchaseGold, { body: { productId: 'p', version: 1, referenceEventId: 'g'.repeat(151) } }), 'INVALID_GOLD_PURCHASE_REQUEST', 400);
    expectError(await call(purchase.purchaseGold, { body: { productId: 'p'.repeat(65), version: 1, referenceEventId: 'g' } }), 'INVALID_GOLD_PURCHASE_REQUEST', 400);
});

test('골드 구매 처리기: 본문이 없어도 500이 아니라 400', async (t) => {
    stub(t, 'purchaseGold', () => ({ balanceGold: 0, balanceDiamond: 0 }));
    expectError(await call(purchase.purchaseGold, { body: undefined }), 'INVALID_GOLD_PURCHASE_REQUEST', 400);
});

test('관리자 지급 처리기: 보상 표에 없는 사유는 400 UNKNOWN_REWARD_REASON', async (t) => {
    stub(t, 'grantReward', () => ({ idempotent: false, ledgerEntry: ledgerRow() }));
    expectError(await call(purchase.grantReward, { body: { userId: 'x', reason: 'FREE_MONEY', referenceEventId: 'r' } }), 'UNKNOWN_REWARD_REASON', 400);
});

test('관리자 지급 처리기: 사유가 물려받은 이름(toString)이어도 400 UNKNOWN_REWARD_REASON', async (t) => {
    stub(t, 'grantReward', () => ({ idempotent: false, ledgerEntry: ledgerRow() }));
    expectError(await call(purchase.grantReward, { body: { userId: 'x', reason: 'toString', referenceEventId: 'r' } }), 'UNKNOWN_REWARD_REASON', 400);
});

test('관리자 지급 처리기: 본문에 amount를 넣으면 400 UNKNOWN_GRANT_FIELD (금액은 표 값만)', async (t) => {
    stub(t, 'grantReward', () => ({ idempotent: false, ledgerEntry: ledgerRow() }));
    expectError(await call(purchase.grantReward, { body: { userId: 'x', reason: 'QA_TEST_GRANT_GOLD', referenceEventId: 'r', amount: 1e9 } }), 'UNKNOWN_GRANT_FIELD', 400);
});

test('관리자 지급 처리기: 지급 금액·통화는 보상 표 값으로 들어간다', async (t) => {
    stub(t, 'grantReward', (args) => ({ idempotent: false, ledgerEntry: ledgerRow({ amount: args.amount, currency: args.currency, reason: args.reason }) }));
    const result = await call(purchase.grantReward, { body: { userId: 'x', reason: 'QA_TEST_GRANT_DIAMOND', referenceEventId: 'r' } });
    assert.equal(result.status, 201);
    assert.equal(result.body.ledgerEntry.amount, 1000);
    assert.equal(result.body.ledgerEntry.currency, 'DIAMOND');
});

test('장착 처리기: slot이 없으면 400 INVALID_EQUIP_REQUEST', async (t) => {
    stub(t, 'equipItem', () => ({}));
    expectError(await call(account.equipItem, { body: { itemId: 'x', expectedRevision: 'r' } }), 'INVALID_EQUIP_REQUEST', 400);
});

test('장착 처리기: revision이 빈 문자열이면 400 MISSING_EXPECTED_REVISION', async (t) => {
    stub(t, 'equipItem', () => ({}));
    expectError(await call(account.equipItem, { body: { slot: 'PROFILE_PHOTO', itemId: 'x', expectedRevision: '' } }), 'MISSING_EXPECTED_REVISION', 400);
});

test('장착 처리기: 성공하면 사진·테두리·카드·revision + 직업 스킨 묶음을 준다', async (t) => {
    stub(t, 'equipItem', () => ({
        selected_profile_photo_id: 'p', selected_profile_border_id: 'b', selected_card_frame_id: 'c', revision: 'rv', selected_skin_noble: 's',
    }));
    const result = await call(account.equipItem, { body: { slot: 'JOB_SKIN_NOBLE', itemId: 's', expectedRevision: 'r' } });
    assert.equal(result.body.loadout.revision, 'rv');
    assert.equal(result.body.loadout.selectedSkinsByJob.noble, 's');
    assert.equal(result.body.loadout.selectedSkinsByJob.clown, null);
});

test('프로필 장착 처리기: 모르는 필드(cardFrameId)는 400 UNKNOWN_EQUIP_PROFILE_FIELD', async (t) => {
    stub(t, 'equipProfileAppearance', () => ({}));
    expectError(await call(account.equipProfile, { body: { photoItemId: 'p', expectedRevision: 'r', cardFrameId: 'c' } }), 'UNKNOWN_EQUIP_PROFILE_FIELD', 400);
});

test('프로필 장착 처리기: 사진 id가 숫자면 400 INVALID_EQUIP_PROFILE_REQUEST', async (t) => {
    stub(t, 'equipProfileAppearance', () => ({}));
    expectError(await call(account.equipProfile, { body: { photoItemId: 3, expectedRevision: 'r' } }), 'INVALID_EQUIP_PROFILE_REQUEST', 400);
});

test('프로필 장착 처리기: 성공 응답에는 직업 스킨 묶음이 없다', async (t) => {
    stub(t, 'equipProfileAppearance', () => ({ selected_profile_photo_id: 'p', selected_profile_border_id: 'b', selected_card_frame_id: null, revision: 'rv' }));
    const result = await call(account.equipProfile, { body: { photoItemId: 'p', expectedRevision: 'r' } });
    assert.deepEqual(Object.keys(result.body.loadout).sort(), ['revision', 'selectedCardFrameId', 'selectedProfileBorderId', 'selectedProfilePhotoId']);
});

test('지갑 처리기: 잔액 두 칸만 주고 보유·장착은 안 준다', async (t) => {
    stub(t, 'getWalletSummary', () => ({ balanceGold: 1, balanceDiamond: 2, entitlements: [{ itemId: 'x' }], loadout: {} }));
    const result = await call(account.getWallet, { params: { userId: 'me' } });
    assert.deepEqual(result.body, { balanceGold: 1, balanceDiamond: 2 });
});

test('거래 목록 처리기: 서비스 오류는 next로 넘긴다', async (t) => {
    stub(t, 'listTransactions', () => { throw Object.assign(new Error('db'), { status: 500 }); });
    const result = await call(account.getTransactions, { params: { userId: 'me' } });
    assert.equal(result.error.status, 500);
});

test('팔레트 처리기: 모르는 필드가 있으면 400 INVALID_FIELDS (ok:false)', async (t) => {
    stub(t, 'saveEmojiPalette', () => ({ slots: [], revision: 'r' }));
    const result = await call(palette.saveEmojiPalette, { body: { slots: [], expectedRevision: 'r', userId: 'victim' } });
    assert.equal(result.status, 400);
    assert.deepEqual({ ok: result.body.ok, code: result.body.code }, { ok: false, code: 'INVALID_FIELDS' });
});

test('팔레트 처리기: revision 충돌이면 409와 지금 revision·칸을 같이 준다', async (t) => {
    stub(t, 'saveEmojiPalette', () => { throw Object.assign(new Error('충돌'), { status: 409, code: 'REVISION_MISMATCH', revision: 'now', slots: [null] }); });
    const result = await call(palette.saveEmojiPalette, { body: { slots: [], expectedRevision: 'old' } });
    assert.equal(result.status, 409);
    assert.equal(result.body.revision, 'now');
    assert.deepEqual(result.body.slots, [null]);
});

test('팔레트 처리기: 상태 없는 오류는 500 EMOJI_PALETTE_ERROR', async (t) => {
    stub(t, 'getEmojiPalette', () => { throw new Error('boom'); });
    const result = await call(palette.getEmojiPalette, {});
    assert.equal(result.status, 500);
    assert.equal(result.body.code, 'EMOJI_PALETTE_ERROR');
});

test('팔레트 처리기: 읽기 성공은 ok:true·칸·revision·보유', async (t) => {
    stub(t, 'getEmojiPalette', () => ({ slots: [1], revision: 'r', owned: ['a'] }));
    const result = await call(palette.getEmojiPalette, {});
    assert.deepEqual(result.body, { ok: true, slots: [1], revision: 'r', owned: ['a'] });
});

test('응답 모양: 장부 행이 null이면 null 그대로', () => {
    assert.equal(serializers.serializeLedgerEntry(null), null);
    assert.equal(serializers.serializeLedgerEntry(undefined), undefined);
});
