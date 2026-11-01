'use strict';

// 경제 카테고리 입구, 옛 economy.service 이름 전부 내보냄 (나누는 중이라 남은 함수도 여기)
// routes·컨트롤러·친구·업적·인증·충전·socket이 이 입구로 부름
const crypto = require('crypto');
const catalog = require('../../economy/catalog');
const { createError } = require('../../utils/appError');
const { defaultDb, buildSkinsByJob, isFreeJobSkin } = require('./helpers');
const { MAX_BALANCE, CURRENCIES, SLOT_TO_ITEM_TYPE, SLOT_TO_LOADOUT_COLUMN, FREE_CARD_FRAME_ID, JOB_SKIN_ID_PREFIX_BY_SLOT, SKIN_ITEM_ID_PREFIX, EMOJI_PALETTE_SLOT_COLUMNS, DEFAULT_EMOJI_PALETTE_SLOTS } = require('./constants');
const { ensureDefaultEntitlements, ensureDefaultLoadout } = require('./defaults');
const { economyModels, ensureWalletRow, applyLedgerTransaction } = require('./ledger');
const {
    ITEM_TYPES,
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    listDefaultGrantItems,
} = catalog;
const { getWalletSummary, listTransactions } = require('./wallet');
const { purchaseItem, purchaseItems, getPurchaseResult } = require('./purchase');
const { purchaseGold } = require('./goldPurchase');
const { grantReward, grantAchievementCurrency, grantAchievementItem } = require('./grants');

const equipItem = async ({ userId, slot, itemId, expectedRevision }, db = defaultDb()) => {
    const expectedType = SLOT_TO_ITEM_TYPE[slot];
    const column = SLOT_TO_LOADOUT_COLUMN[slot];
    if (!expectedType || !column) {
        throw createError('알 수 없는 장착 슬롯입니다.', 400, 'UNKNOWN_EQUIP_SLOT');
    }
    if (typeof itemId !== 'string' || itemId.length === 0) {
        throw createError('itemId가 필요합니다.', 400, 'INVALID_ITEM_ID');
    }

    await ensureDefaultEntitlements(userId, db);

    const isFreeCardFrame = slot === 'PLAYER_CARD_FRAME' && itemId === FREE_CARD_FRAME_ID;
    const isFreeSkin = isFreeJobSkin(slot, itemId);
    const models = economyModels(db);

    if (!isFreeCardFrame && !isFreeSkin) {
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.type !== expectedType) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }

        const requiredPrefix = JOB_SKIN_ID_PREFIX_BY_SLOT[slot];
        if (requiredPrefix && !itemId.startsWith(`${SKIN_ITEM_ID_PREFIX}${requiredPrefix}`)) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }

        const owned = await models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId } });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
    }

    await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId, revision: crypto.randomUUID() },
    });

    const hasExpectedRevision = typeof expectedRevision === 'string' && expectedRevision.length > 0;

    return db.sequelize.transaction(async (t) => {
        const loadout = await models.EconomyLoadout.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (hasExpectedRevision && loadout.revision !== expectedRevision) {
            throw createError(
                '장착 상태가 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
                409,
                'SKIN_REVISION_CONFLICT',
            );
        }

        await loadout.update({ [column]: itemId, revision: crypto.randomUUID() }, { transaction: t });
        return loadout;
    });
};

const equipProfileAppearance = async ({ userId, photoItemId, borderItemId, expectedRevision }, db = defaultDb()) => {
    const slots = [
        ['PROFILE_PHOTO', photoItemId],
        ['PROFILE_BORDER', borderItemId],
    ].filter(([, itemId]) => itemId !== undefined);

    if (slots.length === 0) {
        throw createError('변경할 프로필 항목이 없습니다.', 400, 'EMPTY_PROFILE_EQUIP_REQUEST');
    }
    for (const [, itemId] of slots) {
        if (typeof itemId !== 'string' || itemId.length === 0) {
            throw createError('itemId가 필요합니다.', 400, 'INVALID_ITEM_ID');
        }
    }
    if (typeof expectedRevision !== 'string' || expectedRevision.length === 0) {
        throw createError('expectedRevision이 필요합니다.', 400, 'MISSING_EXPECTED_REVISION');
    }

    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    const updates = {};
    for (const [slot, itemId] of slots) {
        const expectedType = SLOT_TO_ITEM_TYPE[slot];
        const column = SLOT_TO_LOADOUT_COLUMN[slot];
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.type !== expectedType) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }
        // eslint-disable-next-line no-await-in-loop -- 슬롯이 최대 2개뿐이고, 두 검증 모두
        const owned = await models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId } });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
        updates[column] = itemId;
    }

    await models.EconomyLoadout.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId, revision: crypto.randomUUID() },
    });

    return db.sequelize.transaction(async (t) => {
        const loadout = await models.EconomyLoadout.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (loadout.revision !== expectedRevision) {
            throw createError(
                '프로필이 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
                409,
                'PROFILE_REVISION_CONFLICT',
            );
        }

        await loadout.update({ ...updates, revision: crypto.randomUUID() }, { transaction: t });
        return loadout;
    });
};

const getPublicProfileLoadouts = async (userIds, db = defaultDb()) => {
    const uniqueUserIds = [...new Set(userIds)].filter((id) => typeof id === 'string' && id.length > 0);
    if (uniqueUserIds.length === 0) return {};

    const models = economyModels(db);
    await Promise.all(uniqueUserIds.map((userId) => ensureDefaultEntitlements(userId, db)));
    const loadouts = await models.EconomyLoadout.findAll({ where: { user_id: uniqueUserIds } });

    const byUserId = {};
    for (const userId of uniqueUserIds) byUserId[userId] = { profilePhotoId: null, profileBorderId: null };
    for (const loadout of loadouts) {
        byUserId[loadout.user_id] = {
            profilePhotoId: loadout.selected_profile_photo_id ?? null,
            profileBorderId: loadout.selected_profile_border_id ?? null,
        };
    }
    return byUserId;
};

const getGameStartLoadouts = async (userIds, db = defaultDb()) => {
    const uniqueUserIds = [...new Set(userIds)].filter((id) => typeof id === 'string' && id.length > 0);
    if (uniqueUserIds.length === 0) return {};

    const models = economyModels(db);
    await Promise.all(uniqueUserIds.map((userId) => ensureDefaultEntitlements(userId, db)));
    const loadouts = await models.EconomyLoadout.findAll({ where: { user_id: uniqueUserIds } });

    const byUserId = {};
    for (const userId of uniqueUserIds) {
        byUserId[userId] = {
            profilePhotoId: null,
            profileBorderId: null,
            cardFrameId: null,
            skinsByJob: buildSkinsByJob(null),
        };
    }
    for (const loadout of loadouts) {
        byUserId[loadout.user_id] = {
            profilePhotoId: loadout.selected_profile_photo_id ?? null,
            profileBorderId: loadout.selected_profile_border_id ?? null,
            cardFrameId: loadout.selected_card_frame_id ?? null,
            skinsByJob: buildSkinsByJob(loadout),
        };
    }
    return byUserId;
};

const emojiPaletteDefaults = (userId) => ({
    user_id: userId,
    ...Object.fromEntries(EMOJI_PALETTE_SLOT_COLUMNS.map((column, index) => [column, DEFAULT_EMOJI_PALETTE_SLOTS[index]])),
    revision: crypto.randomUUID(),
});

const emojiPaletteSlotsOf = (row) => EMOJI_PALETTE_SLOT_COLUMNS.map((column) => row[column] ?? null);

const listOwnedEmoticons = async (models, userId, transaction = null) => {
    const rows = await models.EconomyEntitlement.findAll({
        where: { user_id: userId, item_type: ITEM_TYPES.EMOTICON },
        ...(transaction ? { transaction } : {}),
    });
    return rows.map((row) => row.item_id);
};

const assertValidEmojiSlots = (slots) => {
    const invalid = () => createError('slots가 올바르지 않습니다.', 400, 'INVALID_SLOTS');
    if (!Array.isArray(slots) || slots.length !== EMOJI_PALETTE_SLOT_COLUMNS.length) throw invalid();
    if (slots.some((value) => value !== null && (typeof value !== 'string' || value.length === 0))) throw invalid();
    const filled = slots.filter((value) => value !== null);
    if (new Set(filled).size !== filled.length) throw invalid();
};

const getEmojiPalette = async (userId, db = defaultDb()) => {
    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    const [row] = await models.EconomyEmojiPalette.findOrCreate({
        where: { user_id: userId },
        defaults: emojiPaletteDefaults(userId),
    });

    return {
        slots: emojiPaletteSlotsOf(row),
        revision: row.revision,
        owned: await listOwnedEmoticons(models, userId),
    };
};

const saveEmojiPalette = async (userId, { slots, expectedRevision } = {}, db = defaultDb()) => {
    if (typeof expectedRevision !== 'string' || expectedRevision.length === 0) {
        throw createError('expectedRevision이 필요합니다.', 400, 'MISSING_EXPECTED_REVISION');
    }
    assertValidEmojiSlots(slots);

    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    return db.sequelize.transaction(async (t) => {
        await models.EconomyEmojiPalette.findOrCreate({
            where: { user_id: userId },
            defaults: emojiPaletteDefaults(userId),
            transaction: t,
        });

        const owned = new Set(await listOwnedEmoticons(models, userId, t));
        if (slots.some((value) => value !== null && !owned.has(value))) {
            throw createError('소유하지 않은 이모티콘입니다.', 400, 'NOT_OWNED');
        }

        const revision = crypto.randomUUID();
        const patch = { revision };
        EMOJI_PALETTE_SLOT_COLUMNS.forEach((column, index) => { patch[column] = slots[index]; });

        const [affected] = await models.EconomyEmojiPalette.update(patch, {
            where: { user_id: userId, revision: expectedRevision },
            transaction: t,
        });
        if (affected === 1) return { slots: [...slots], revision };

        const current = await models.EconomyEmojiPalette.findOne({
            where: { user_id: userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        const error = createError(
            '이모티콘 팔레트가 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
            409,
            'REVISION_MISMATCH',
        );
        error.revision = current.revision;
        error.slots = emojiPaletteSlotsOf(current);
        throw error;
    });
};

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
    DEFAULT_EMOJI_PALETTE_SLOTS,
    buildSkinsByJob,
    applyLedgerTransaction,
    MAX_BALANCE,
    __internal: { applyLedgerTransaction, ensureWalletRow, ensureDefaultLoadout },
};
