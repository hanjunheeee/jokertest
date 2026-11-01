'use strict';

// 이모티콘 팔레트 파일, 보유 이모티콘 · 팔레트 조회/저장
// index 거쳐 controllers/economy/emojiPalette.js·socket/matchmaking/room/start.js가 부름
const crypto = require('crypto');
const catalog = require('./catalog');
const { createError } = require('../../utils/appError');
const { defaultDb } = require('./helpers');
const { EMOJI_SLOT_COLUMNS, DEFAULT_EMOJI_SLOTS } = require('./constants');
const { ensureDefaultEntitlements } = require('./defaults');
const { economyModels } = require('../../repositories/economy/models');
const entitlementRepository = require('../../repositories/economy/entitlement');
const emojiPaletteRepository = require('../../repositories/economy/emojiPalette');
const { withTransaction } = require('../../repositories/common');
const {
    ITEM_TYPES,
} = catalog;

// 팔레트 처음 행 값 (기본 이모티콘 8개 + 새 revision)
const emojiPaletteDefaults = (userId) => ({
    user_id: userId,
    ...Object.fromEntries(EMOJI_SLOT_COLUMNS.map((column, index) => [column, DEFAULT_EMOJI_SLOTS[index]])),
    revision: crypto.randomUUID(),
});

// 행에서 칸 8개만 배열로 (빈 칸은 null)
const emojiPaletteSlotsOf = (row) => EMOJI_SLOT_COLUMNS.map((column) => row[column] ?? null);

// 보유한 이모티콘 id 목록
const listOwnedEmoticons = async (models, userId, transaction = null) => {
    const rows = await entitlementRepository.listOwnedByType(models, { userId, itemType: ITEM_TYPES.EMOTICON }, transaction);
    return rows.map((row) => row.item_id);
};

// 칸 8개 모양 아니면 400 (빈 칸은 null, 같은 이모티콘 두 칸 막기)
const assertValidEmojiSlots = (slots) => {
    const invalid = () => createError('slots가 올바르지 않습니다.', 400, 'INVALID_SLOTS');
    if (!Array.isArray(slots) || slots.length !== EMOJI_SLOT_COLUMNS.length) throw invalid();
    if (slots.some((value) => value !== null && (typeof value !== 'string' || value.length === 0))) throw invalid();
    const filled = slots.filter((value) => value !== null);
    if (new Set(filled).size !== filled.length) throw invalid();
};

// 없으면 기본 팔레트 만들고 칸·revision·보유 목록 같이
const getEmojiPalette = async (userId, db = defaultDb()) => {
    // 기본 이모티콘 먼저 보유하게
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
    // revision·칸 모양 먼저 (DB 안 건드리고 거절)
    if (typeof expectedRevision !== 'string' || expectedRevision.length === 0) {
        throw createError('expectedRevision이 필요합니다.', 400, 'MISSING_EXPECTED_REVISION');
    }
    assertValidEmojiSlots(slots);

    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    return withTransaction(db, async (t) => {
        // 행 없으면 기본값으로 만들어 둠
        await emojiPaletteRepository.ensurePalette(models, { userId, defaults: emojiPaletteDefaults(userId) }, t);

        // 가진 이모티콘만 칸에 넣게
        const owned = new Set(await listOwnedEmoticons(models, userId, t));
        if (slots.some((value) => value !== null && !owned.has(value))) {
            throw createError('소유하지 않은 이모티콘입니다.', 400, 'NOT_OWNED');
        }

        // 여기부터 진짜 바뀜: revision 그대로일 때만 칸 저장
        const revision = crypto.randomUUID();
        const patch = { revision };
        EMOJI_SLOT_COLUMNS.forEach((column, index) => { patch[column] = slots[index]; });

        const [affected] = await emojiPaletteRepository.updatePaletteIfRevision(models, { userId, expectedRevision, patch }, t);
        if (affected === 1) return { slots: [...slots], revision };

        // 0줄이면 남이 먼저 바꾼 것이라 409 + 지금 값 같이 (화면이 다시 맞추게)
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
