'use strict';

// 이모티콘 팔레트 파일, 보유 이모티콘 · 팔레트 조회/저장
// 팔레트 컨트롤러가 부름
const crypto = require('crypto');
const catalog = require('../../economy/catalog');
const { createError } = require('../../utils/appError');
const { defaultDb } = require('./helpers');
const { EMOJI_PALETTE_SLOT_COLUMNS, DEFAULT_EMOJI_PALETTE_SLOTS } = require('./constants');
const { ensureDefaultEntitlements } = require('./defaults');
const { economyModels } = require('../../repositories/economy/models');
const entitlementRepository = require('../../repositories/economy/entitlement');
const emojiPaletteRepository = require('../../repositories/economy/emojiPalette');
const { withTransaction } = require('../../repositories/common');
const {
    ITEM_TYPES,
    DEFAULT_PROFILE_PHOTO_ID,
    DEFAULT_PROFILE_BORDER_ID,
    listDefaultGrantItems,
} = catalog;

// 팔레트 처음 행 값
const emojiPaletteDefaults = (userId) => ({
    user_id: userId,
    ...Object.fromEntries(EMOJI_PALETTE_SLOT_COLUMNS.map((column, index) => [column, DEFAULT_EMOJI_PALETTE_SLOTS[index]])),
    revision: crypto.randomUUID(),
});

// 행에서 칸 4개만 배열로
const emojiPaletteSlotsOf = (row) => EMOJI_PALETTE_SLOT_COLUMNS.map((column) => row[column] ?? null);

// 보유한 이모티콘 id 목록
const listOwnedEmoticons = async (models, userId, transaction = null) => {
    const rows = await entitlementRepository.listOwnedByType(models, { userId, itemType: ITEM_TYPES.EMOTICON }, transaction);
    return rows.map((row) => row.item_id);
};

// 칸 4개 모양 아니면 400
const assertValidEmojiSlots = (slots) => {
    const invalid = () => createError('slots가 올바르지 않습니다.', 400, 'INVALID_SLOTS');
    if (!Array.isArray(slots) || slots.length !== EMOJI_PALETTE_SLOT_COLUMNS.length) throw invalid();
    if (slots.some((value) => value !== null && (typeof value !== 'string' || value.length === 0))) throw invalid();
    const filled = slots.filter((value) => value !== null);
    if (new Set(filled).size !== filled.length) throw invalid();
};

// 없으면 기본 팔레트 만들고 칸·revision·보유 목록 같이
const getEmojiPalette = async (userId, db = defaultDb()) => {
    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    const [row] = await emojiPaletteRepository.ensurePalette(models, { userId, defaults: emojiPaletteDefaults(userId) });

    return {
        slots: emojiPaletteSlotsOf(row),
        revision: row.revision,
        owned: await listOwnedEmoticons(models, userId),
    };
};

// 보유 안 한 이모티콘·revision 다름은 거절, 맞으면 저장
const saveEmojiPalette = async (userId, { slots, expectedRevision } = {}, db = defaultDb()) => {
    if (typeof expectedRevision !== 'string' || expectedRevision.length === 0) {
        throw createError('expectedRevision이 필요합니다.', 400, 'MISSING_EXPECTED_REVISION');
    }
    assertValidEmojiSlots(slots);

    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    return withTransaction(db, async (t) => {
        await emojiPaletteRepository.ensurePalette(models, { userId, defaults: emojiPaletteDefaults(userId) }, t);

        const owned = new Set(await listOwnedEmoticons(models, userId, t));
        if (slots.some((value) => value !== null && !owned.has(value))) {
            throw createError('소유하지 않은 이모티콘입니다.', 400, 'NOT_OWNED');
        }

        const revision = crypto.randomUUID();
        const patch = { revision };
        EMOJI_PALETTE_SLOT_COLUMNS.forEach((column, index) => { patch[column] = slots[index]; });

        const [affected] = await emojiPaletteRepository.updatePaletteIfRevision(models, { userId, expectedRevision, patch }, t);
        if (affected === 1) return { slots: [...slots], revision };

        const current = await emojiPaletteRepository.lockPalette(models, userId, t);
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
    getEmojiPalette,
    saveEmojiPalette,
};
