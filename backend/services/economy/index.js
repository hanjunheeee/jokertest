'use strict';

// 경제 입구 파일, 경제 함수·상수 23개 + 시험 손잡이(__internal) + 상품·충전 이름 내보냄
// controllers/economy·auth 가입 2곳·friend/list·achievement·game/roleStatistics·socket/matchmaking·db/backfillEconomy가 부름 (시험이 이 객체 함수 갈아끼움)
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
// 상품·충전 이름도 같이 모음 (불러올 때 값 복사본이라 시험 갈아끼우기 안 먹음, 부를 땐 ./currencyProducts·./topup 입구 사용)
const {
    KINDS,
    STATUSES,
    ALLOWED_CURRENCY_PAIRS,
    normalizeProductRow,
    toPublicProduct,
    listCurrencyProducts,
    getCurrencyProduct,
} = require('./currencyProducts');
const {
    ORDER_STATUS,
    OPEN_ORDER_LIMIT,
    LEASE_MS,
    ORDER_ID_PATTERN,
    PAYMENT_KEY_PATTERN,
    referenceEventIdOf,
    createTopupOrder,
    confirmTopupOrder,
    getTopupOrder,
    listOpenTopupOrders,
} = require('./topup');

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
    KINDS,
    STATUSES,
    ALLOWED_CURRENCY_PAIRS,
    normalizeProductRow,
    toPublicProduct,
    listCurrencyProducts,
    getCurrencyProduct,
    ORDER_STATUS,
    OPEN_ORDER_LIMIT,
    LEASE_MS,
    ORDER_ID_PATTERN,
    PAYMENT_KEY_PATTERN,
    referenceEventIdOf,
    createTopupOrder,
    confirmTopupOrder,
    getTopupOrder,
    listOpenTopupOrders,
};
