'use strict';

// 기본 지급 파일, 처음 계정에 기본 장착·기본 보유 아이템 넣기
// index 거쳐 auth 가입 2곳·db/backfillEconomy.js가 부름, 안에선 wallet·loadout·emojiPalette가 먼저 부름
const crypto = require('crypto');
const catalog = require('./catalog');
const { defaultDb, payloadMatches } = require('./helpers');
const { CURRENCIES } = require('./constants');
const {
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    listDefaultGrantItems,
} = catalog;
const { applyLedgerTransaction } = require('./ledger');
const { economyModels } = require('../../repositories/economy/models');
const loadoutRepository = require('../../repositories/economy/loadout');
const ledgerRepository = require('../../repositories/economy/ledger');
const entitlementRepository = require('../../repositories/economy/entitlement');

// 기본 지급 참조 id (사람·아이템마다 고정, 다시 불러도 두 번 안 줌)
const defaultGrantReference = (userId, itemId) => `default-grant:${userId}:${itemId}`;

// 기본 아이템 중 더 할 일 없는 것: 같은 내용 장부가 있거나(지급 끝) 이미 가짐(다른 길로 얻음)
// 장부 내용이 다르면 가졌어도 빼지 않음 → 아래 장부 거래가 409로 알림 (예전과 같음)
const findSettledDefaultGrants = async (db, userId, items, externalTransaction = null) => {
    const models = economyModels(db);
    const referenceToItem = new Map(items.map((item) => [defaultGrantReference(userId, item.id), item]));
    const itemIds = new Set(items.map((item) => item.id));
    const [entries, owned] = await Promise.all([
        ledgerRepository.findByReferences(models, { userId, referenceEventIds: [...referenceToItem.keys()] }, externalTransaction),
        entitlementRepository.findOwnedAmong(models, { userId, itemIds: [...itemIds] }, externalTransaction),
    ]);
    const done = new Set();
    const conflicted = new Set();
    for (const entry of entries) {
        const item = referenceToItem.get(entry.reference_event_id);
        if (entry.user_id !== userId || !item) continue;
        const matches = payloadMatches(entry, { reason: 'DEFAULT_GRANT', itemId: item.id, currency: CURRENCIES.GOLD, amount: 0 });
        (matches ? done : conflicted).add(item.id);
    }
    for (const row of owned) {
        if (row.user_id === userId && itemIds.has(row.item_id) && !conflicted.has(row.item_id)) done.add(row.item_id);
    }
    return done;
};

// 장착 행 없으면 만들고 기본 사진·테두리 채움 (testing.js 거쳐 시험도 부름)
const ensureDefaultLoadout = async (db, userId, externalTransaction = null) => {
    const models = economyModels(db);
    // 행 있고 사진·테두리 다 찼으면 읽기 한 번으로 끝 (방 입장·시작마다 불려 쓰기 3번 아낌)
    const existing = await loadoutRepository.findLoadout(models, userId, externalTransaction);
    if (existing && existing.selected_profile_photo_id != null && existing.selected_profile_border_id != null) {
        return existing;
    }
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
// 이미 받은 것(같은 내용 장부)·이미 가진 것은 한 번에 읽어 건너뜀: 아이템마다 묻던 25번 → 2번 (방 입장·시작이 느렸던 까닭)
const ensureDefaultEntitlements = async (userId, db = defaultDb(), { transaction: externalTransaction = null } = {}) => {
    const items = listDefaultGrantItems();
    const done = await findSettledDefaultGrants(db, userId, items, externalTransaction);
    for (const item of items) {
        if (done.has(item.id)) continue;
        // 0골드 장부라 보유만 남김, 같은 참조 id 내용 다름(409)은 여기서 그대로 던짐
        const referenceEventId = defaultGrantReference(userId, item.id);
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
