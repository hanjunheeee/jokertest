'use strict';

// 경제 카테고리 입구, 옛 economy.service 이름 23개 + __internal + 상품·충전 이름 내보냄
// routes·컨트롤러·친구·업적·인증·충전·socket이 이 입구로 부름 (시험이 이 객체 함수를 갈아끼움)
const { CURRENCIES, FREE_CARD_FRAME_ID, SLOT_TO_ITEM_TYPE, DEFAULT_EMOJI_SLOTS, MAX_BALANCE } = require('./constants');
const { ensureDefaultEntitlements } = require('./defaults');
const { getWalletSummary, listTransactions } = require('./wallet');
const { purchaseItem, purchaseItems, getPurchaseResult } = require('./purchase');
const { purchaseGold } = require('./goldPurchase');
const { grantReward, grantAchievementCurrency, grantAchievementItem } = require('./grants');
const { equipItem, equipProfileAppearance, getPublicProfileLoadouts, getGameStartLoadouts } = require('./loadout');
const { getEmojiPalette, saveEmojiPalette } = require('./emojiPalette');
const { buildSkinsByJob } = require('./helpers');
const { applyLedgerTransaction } = require('./ledger');
const { __internal } = require('./testing');
// 상품·충전 이름도 같이 모음 (복사본이라 부를 땐 ./currencyProducts · ./topup 입구 사용)
const currencyProducts = require('./currencyProducts');
const topup = require('./topup');

module.exports = {
    CURRENCIES,
    FREE_CARD_FRAME_ID,
    SLOT_TO_ITEM_TYPE,
    ensureDefaultEntitlements,
    getWalletSummary,
    listTransactions,
    purchaseItem,
    purchaseItems,
    getPurchaseResult,
    purchaseGold,
    grantReward,
    grantAchievementCurrency,
    grantAchievementItem,
    equipItem,
    equipProfileAppearance,
    getPublicProfileLoadouts,
    getGameStartLoadouts,
    getEmojiPalette,
    saveEmojiPalette,
    DEFAULT_EMOJI_SLOTS,
    buildSkinsByJob,
    applyLedgerTransaction,
    MAX_BALANCE,
    __internal,
    ...currencyProducts,
    ...topup,
};
