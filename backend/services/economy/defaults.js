'use strict';

// 기본 지급 파일, 처음 계정에 기본 장착·기본 보유 아이템 넣기
// index 거쳐 auth 가입 2곳·db/backfillEconomy.js가 부름, 안에선 wallet·loadout·emojiPalette가 먼저 부름
const crypto = require('crypto');
const catalog = require('./catalog');
const { defaultDb } = require('./helpers');
const { CURRENCIES } = require('./constants');
const {
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    listDefaultGrantItems,
} = catalog;
const { applyLedgerTransaction } = require('./ledger');
const { economyModels } = require('../../repositories/economy/models');
const loadoutRepository = require('../../repositories/economy/loadout');

// 장착 행 없으면 만들고 기본 사진·테두리 채움 (testing.js 거쳐 시험도 부름)
const ensureDefaultLoadout = async (db, userId, externalTransaction = null) => {
    const models = economyModels(db);
    await loadoutRepository.ensureLoadout(models, { userId, revision: crypto.randomUUID() }, externalTransaction);

    // 빈 칸만 채움 (사용자가 고른 사진·테두리는 안 덮어씀)
    await loadoutRepository.fillEmptyColumn(models, {
        userId, column: 'selected_profile_photo_id', value: DEFAULT_PROFILE_PHOTO_ID, revision: crypto.randomUUID(),
    }, externalTransaction);
    await loadoutRepository.fillEmptyColumn(models, {
        userId, column: 'selected_profile_border_id', value: DEFAULT_PROFILE_BORDER_ID, revision: crypto.randomUUID(),
    }, externalTransaction);

    return loadoutRepository.findLoadout(models, userId, externalTransaction);
};

// 기본 아이템을 장부 거래로 지급 (다시 불러도 두 번 안 줌)
const ensureDefaultEntitlements = async (userId, db = defaultDb(), { transaction: externalTransaction = null } = {}) => {
    for (const item of listDefaultGrantItems()) {
        // 사람·아이템마다 참조 id 고정, 0골드 장부라 보유만 남김
        const referenceEventId = `default-grant:${userId}:${item.id}`;
        try {
            await applyLedgerTransaction(db, {
                userId,
                reason: 'DEFAULT_GRANT',
                currency: CURRENCIES.GOLD,
                amount: 0,
                itemId: item.id,
                itemType: item.type,
                referenceEventId,
                entitlementSource: 'DEFAULT_GRANT',
            }, { transaction: externalTransaction });
        } catch (error) {
            // 다른 길로 이미 가진 아이템이면 건너뜀
            if (error?.code === 'ITEM_ALREADY_OWNED') continue;
            throw error;
        }
    }
    // 기본 장착까지 같이 채움
    return ensureDefaultLoadout(db, userId, externalTransaction);
};

module.exports = {
    ensureDefaultLoadout,
    ensureDefaultEntitlements,
};
