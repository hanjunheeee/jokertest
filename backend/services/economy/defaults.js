'use strict';

// 기본 지급 파일, 처음 계정에 기본 장착·기본 보유 아이템 넣기
// 가입·소셜 가입·백필 스크립트가 부름
const crypto = require('crypto');
const catalog = require('../../economy/catalog');
const { defaultDb } = require('./helpers');
const { CURRENCIES } = require('./constants');
const {
    ITEM_TYPES,
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    listDefaultGrantItems,
} = catalog;
const { applyLedgerTransaction } = require('./ledger');
const { economyModels } = require('../../repositories/economy/models');
const loadoutRepository = require('../../repositories/economy/loadout');

// 장착 행 없으면 기본값으로 만들고 비어 있는 칸만 채움
const ensureDefaultLoadout = async (db, userId, externalTransaction = null) => {
    const models = economyModels(db);
    await loadoutRepository.ensureLoadout(models, { userId, revision: crypto.randomUUID() }, externalTransaction);

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
            if (error?.code === 'ITEM_ALREADY_OWNED') continue;
            throw error;
        }
    }
    return ensureDefaultLoadout(db, userId, externalTransaction);
};

module.exports = {
    ensureDefaultLoadout,
    ensureDefaultEntitlements,
};
