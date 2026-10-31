'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    ALL_ITEMS,
    ITEM_TYPES,
    EMOTICON_PRICE_GOLD_PLACEHOLDER,
    getCatalogItem,
    listDefaultGrantItems,
} = require('./catalog');

const BASIC_EMOTICON_IDS = [
    'emoji-basic-reject', 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love',
    'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-dizzy',
];

const SHOP_EMOTICON_IDS = [
    'emoji-thorned-heart', 'emoji-duel-challenge', 'emoji-nasty-mock', 'emoji-startled',
    'emoji-im-crying', 'emoji-find-culprit', 'emoji-ready-to-burn', 'emoji-shush',
    'emoji-which-potion', 'emoji-puzzled', 'emoji-elegant-toast', 'emoji-meaningful',
    'emoji-take-aim', 'emoji-dead-soul', 'emoji-vote-time',
];

const REMOVED_DISPLAY_EMOTICON_IDS = ['emoticon-웃음', 'emoticon-울음', 'emoticon-화남', 'emoticon-박수'];

test('F-33 E-1: 카탈로그의 이모티콘은 설계도 §0의 23종과 정확히 같다', () => {
    const emoticonIds = ALL_ITEMS.filter((item) => item.type === ITEM_TYPES.EMOTICON).map((item) => item.id);
    assert.equal(emoticonIds.length, 23);
    assert.deepEqual([...emoticonIds].sort(), [...BASIC_EMOTICON_IDS, ...SHOP_EMOTICON_IDS].sort());
});

test('F-33 E-1: F-09 표시용 이모티콘 4종은 카탈로그에서 삭제되었다', () => {
    for (const id of REMOVED_DISPLAY_EMOTICON_IDS) {
        assert.equal(getCatalogItem(id), undefined, `${id}는 더 이상 카탈로그에 없어야 한다`);
    }
});

test('F-33 E-1: 기본 8종은 무료·기본 지급·구매 불가다', () => {
    for (const id of BASIC_EMOTICON_IDS) {
        const item = getCatalogItem(id);
        assert.ok(item, `${id}가 등록되어 있어야 한다`);
        assert.equal(item.type, ITEM_TYPES.EMOTICON);
        assert.equal(item.priceGold, 0);
        assert.equal(item.defaultGrant, true);
        assert.equal(item.purchasable, false);
    }
});

test('F-33 E-1: 상점 15종은 임시 가격 상수로 판매되고 기본 지급되지 않는다', () => {
    assert.equal(typeof EMOTICON_PRICE_GOLD_PLACEHOLDER, 'number');
    assert.ok(EMOTICON_PRICE_GOLD_PLACEHOLDER > 0);
    for (const id of SHOP_EMOTICON_IDS) {
        const item = getCatalogItem(id);
        assert.ok(item, `${id}가 등록되어 있어야 한다`);
        assert.equal(item.type, ITEM_TYPES.EMOTICON);
        assert.equal(item.priceGold, EMOTICON_PRICE_GOLD_PLACEHOLDER);
        assert.equal(item.defaultGrant, false);
        assert.equal(item.purchasable, true);
    }
});

test('F-33 E-1: 기본 지급 목록에는 기본 8종만 들어가고 상점 15종은 없다', () => {
    const defaultIds = new Set(listDefaultGrantItems().map((item) => item.id));
    for (const id of BASIC_EMOTICON_IDS) assert.ok(defaultIds.has(id), `${id}는 기본 지급 대상이어야 한다`);
    for (const id of SHOP_EMOTICON_IDS) assert.equal(defaultIds.has(id), false, `${id}는 기본 지급 대상이 아니다`);
    assert.equal(defaultIds.size, 25, '기본 지급은 프로필 16 + 테두리 1 + 기본 이모티콘 8 = 25종이다');
});
