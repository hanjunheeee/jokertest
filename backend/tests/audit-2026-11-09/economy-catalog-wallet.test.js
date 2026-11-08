'use strict';

// 상품 목록 규칙·경제 도우미·기본 지급·지갑 요약·거래 목록 시험 (가짜 DB, 진짜 DB 안 씀)
const test = require('node:test');
const assert = require('node:assert/strict');

const economy = require('../../services/economy');
const catalog = require('../../services/economy/catalog');
const constants = require('../../services/economy/constants');
const helpers = require('../../services/economy/helpers');
const { createFakeEconomyDb, seedWallet } = require('./fakeEconomyDb');

test('상품 목록: 아이템 id가 모두 다르다', () => {
    const ids = catalog.ALL_ITEMS.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('상품 목록: 파는 아이템은 값이 1 이상 정수, 안 파는 아이템은 값 0', () => {
    for (const item of catalog.ALL_ITEMS) {
        if (item.purchasable) assert.ok(Number.isInteger(item.priceGold) && item.priceGold > 0, item.id);
        else assert.equal(item.priceGold, 0, item.id);
    }
});

test('상품 목록: 기본 지급 아이템은 하나도 팔지 않는다', () => {
    assert.ok(catalog.listDefaultGrantItems().every((item) => item.purchasable === false));
});

test('상품 목록: 모든 아이템 종류는 정해진 다섯 종류 중 하나', () => {
    const types = new Set(Object.values(catalog.ITEM_TYPES));
    assert.ok(catalog.ALL_ITEMS.every((item) => types.has(item.type)));
});

test('상품 목록: 기본 사진·테두리 id가 목록에 있고 기본 지급이다', () => {
    assert.equal(catalog.getCatalogItem(catalog.DEFAULT_PROFILE_PHOTO_ID).defaultGrant, true);
    assert.equal(catalog.getCatalogItem(catalog.DEFAULT_PROFILE_BORDER_ID).defaultGrant, true);
});

test('상품 목록: 팔레트 기본 8칸 이모티콘은 모두 기본 지급 이모티콘이다', () => {
    for (const id of constants.DEFAULT_EMOJI_SLOTS) {
        const item = catalog.getCatalogItem(id);
        assert.equal(item?.type, 'EMOTICON', id);
        assert.equal(item.defaultGrant, true, id);
    }
});

test('상품 목록: 유료 스킨은 모두 장착 칸 직업 이름 중 하나로 시작한다 (칸이 없는 스킨 없음)', () => {
    const jobNames = Object.values(constants.JOB_NAME_BY_SLOT);
    const skins = catalog.ALL_ITEMS.filter((item) => item.type === 'SKIN');
    assert.ok(skins.length > 0);
    for (const skin of skins) {
        assert.ok(jobNames.some((name) => skin.id.startsWith(`${constants.SKIN_ITEM_ID_PREFIX}${name}`)), skin.id);
    }
});

test('상품 목록: 직업 기본 스킨·공짜 카드 테두리 id는 상품 목록 id와 안 겹친다', () => {
    const free = [constants.FREE_CARD_FRAME_ID, ...Object.values(constants.FREE_SKINS_BY_SLOT).flat()];
    assert.ok(free.every((id) => catalog.getCatalogItem(id) === undefined));
});

test('상품 목록: 없는 id는 undefined, 물려받은 이름(toString)도 undefined', () => {
    assert.equal(catalog.getCatalogItem('nope'), undefined);
    assert.equal(catalog.getCatalogItem('toString'), undefined);
});

test('보상 표: 정한 사유만 값이 있고 물려받은 이름(constructor·__proto__)은 undefined', () => {
    assert.deepEqual(catalog.getRewardCatalogEntry('QA_TEST_GRANT_GOLD'), { currency: 'GOLD', amount: 100000 });
    assert.equal(catalog.getRewardCatalogEntry('constructor'), undefined);
    assert.equal(catalog.getRewardCatalogEntry('__proto__'), undefined);
    assert.equal(catalog.getRewardCatalogEntry(''), undefined);
});

test('보상 표: 모든 금액은 최대 잔액 안 양의 정수이고 통화는 GOLD·DIAMOND', () => {
    for (const entry of Object.values(catalog.REWARD_CATALOG)) {
        assert.ok(helpers.isValidCurrency(entry.currency));
        assert.ok(Number.isInteger(entry.amount) && entry.amount > 0 && entry.amount <= constants.MAX_BALANCE);
    }
});

test('도우미: 금액 범위 판정 경계 (최대 잔액·음수 최대·안전하지 않은 정수·NaN·무한대)', () => {
    assert.equal(helpers.isBoundedAmount(constants.MAX_BALANCE), true);
    assert.equal(helpers.isBoundedAmount(-constants.MAX_BALANCE), true);
    assert.equal(helpers.isBoundedAmount(constants.MAX_BALANCE + 1), false);
    assert.equal(helpers.isBoundedAmount(Number.MAX_SAFE_INTEGER + 2), false);
    assert.equal(helpers.isBoundedAmount(Number.NaN), false);
    assert.equal(helpers.isBoundedAmount(Infinity), false);
    assert.equal(helpers.isBoundedAmount(null), false);
});

test('도우미: 장부 내용 비교는 아이템 id의 null·undefined를 같게 본다', () => {
    const entry = { reason: 'R', item_id: null, currency: 'GOLD', amount: 1 };
    assert.equal(helpers.payloadMatches(entry, { reason: 'R', itemId: undefined, currency: 'GOLD', amount: 1 }), true);
    assert.equal(helpers.payloadMatches(entry, { reason: 'R', itemId: 'x', currency: 'GOLD', amount: 1 }), false);
});

test('도우미: 기본 스킨 판정은 칸마다 따로 (다른 칸 기본 스킨은 아님)', () => {
    assert.equal(helpers.isFreeJobSkin('JOB_SKIN_NOBLE', 'basic-skin-귀족3'), true);
    assert.equal(helpers.isFreeJobSkin('JOB_SKIN_DOCTOR', 'basic-skin-귀족3'), false);
    assert.equal(helpers.isFreeJobSkin('PROFILE_PHOTO', 'basic-skin-귀족3'), false);
});

test('기본 지급: 처음 계정은 사진 16 + 테두리 1 + 기본 이모티콘 8 = 25개를 받고 돈은 0', async () => {
    const db = createFakeEconomyDb();
    await economy.ensureDefaultEntitlements('u', db);
    const owned = db._inspect.entitlements.filter((e) => e.user_id === 'u');
    assert.equal(owned.length, 25);
    assert.ok(owned.every((e) => e.source === 'DEFAULT_GRANT'));
    assert.equal(db._inspect.wallets.get('u').balance_gold, 0);
});

test('기본 지급: 동시에 세 번 불러도 아이템이 겹쳐 생기지 않는다', async () => {
    const db = createFakeEconomyDb();
    await Promise.all([1, 2, 3].map(() => economy.ensureDefaultEntitlements('u', db)));
    const ids = db._inspect.entitlements.filter((e) => e.user_id === 'u').map((e) => e.item_id);
    assert.equal(ids.length, new Set(ids).size);
    assert.equal(ids.length, 25);
});

test('기본 지급: 이미 업적 등 다른 길로 가진 기본 아이템이 있어도 실패하지 않는다', async () => {
    const db = createFakeEconomyDb();
    await economy.grantAchievementItem({ userId: 'u', itemId: 'player-profile-기사', itemType: 'PROFILE_PHOTO', referenceEventId: 'x' }, db);
    await economy.ensureDefaultEntitlements('u', db);
    assert.equal(db._inspect.entitlements.filter((e) => e.user_id === 'u').length, 25);
});

test('지갑 요약: 처음 계정은 잔액 0·0, 기본 사진·테두리 장착, revision 있음', async () => {
    const db = createFakeEconomyDb();
    const summary = await economy.getWalletSummary('u', db);
    assert.equal(summary.balanceGold, 0);
    assert.equal(summary.balanceDiamond, 0);
    assert.equal(summary.loadout.selectedProfilePhotoId, catalog.DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(summary.loadout.selectedProfileBorderId, catalog.DEFAULT_PROFILE_BORDER_ID);
    assert.equal(summary.loadout.selectedCardFrameId, null);
    assert.equal(typeof summary.loadout.revision, 'string');
});

test('지갑 요약: 보유 목록 한 줄은 itemId·itemType·source·acquiredAt 네 칸', async () => {
    const db = createFakeEconomyDb();
    const summary = await economy.getWalletSummary('u', db);
    assert.deepEqual(Object.keys(summary.entitlements[0]).sort(), ['acquiredAt', 'itemId', 'itemType', 'source']);
});

test('지갑 요약: 잔액이 지갑 행 값 그대로 나온다', async () => {
    const db = createFakeEconomyDb();
    seedWallet(db, 'u', { gold: 1234, diamond: 56 });
    const summary = await economy.getWalletSummary('u', db);
    assert.equal(summary.balanceGold, 1234);
    assert.equal(summary.balanceDiamond, 56);
});

test('거래 목록: 최근 것부터 나오고 limit만큼 자른다', async () => {
    const db = createFakeEconomyDb();
    for (const n of [1, 2, 3]) {
        await economy.grantReward({ userId: 'u', amount: n, referenceEventId: `r${n}` }, db);
    }
    const two = await economy.listTransactions('u', { limit: 2 }, db);
    assert.deepEqual(two.map((t) => t.amount), [3, 2]);
});

test('거래 목록: 응답 칸 이름은 화면용 이름으로 바뀐다', async () => {
    const db = createFakeEconomyDb();
    await economy.grantReward({ userId: 'u', amount: 5, referenceEventId: 'r' }, db);
    const [row] = await economy.listTransactions('u', undefined, db);
    assert.deepEqual(Object.keys(row).sort(), ['amount', 'balanceAfter', 'createdAt', 'currency', 'id', 'itemId', 'reason', 'referenceEventId']);
    assert.equal(row.balanceAfter, 5);
});

test('거래 목록: 다른 사람 장부는 안 섞인다', async () => {
    const db = createFakeEconomyDb();
    await economy.grantReward({ userId: 'a', amount: 5, referenceEventId: 'r' }, db);
    assert.deepEqual(await economy.listTransactions('b', {}, db), []);
});
