'use strict';

// 장착 파일, 아이템 장착 · 프로필 사진·테두리 장착 · 공개/게임 시작 로드아웃
// economy 경로·친구 목록·방 참가자 프로필이 부름
const crypto = require('crypto');
const catalog = require('../../economy/catalog');
const { createError } = require('../../utils/appError');
const { defaultDb, buildSkinsByJob, isFreeJobSkin } = require('./helpers');
const { SLOT_TO_ITEM_TYPE, SLOT_TO_LOADOUT_COLUMN, FREE_CARD_FRAME_ID, JOB_SKIN_ID_PREFIX_BY_SLOT, SKIN_ITEM_ID_PREFIX } = require('./constants');
const { ensureDefaultEntitlements } = require('./defaults');
const { economyModels } = require('../../repositories/economy/models');
const entitlementRepository = require('../../repositories/economy/entitlement');
const loadoutRepository = require('../../repositories/economy/loadout');
const { withTransaction } = require('../../repositories/common');

// 보유·칸 종류 확인 뒤 revision 맞을 때만 바꿈 (다른 곳에서 바꿨으면 409)
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

        const owned = await entitlementRepository.findOwned(models, { userId, itemId });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
    }

    await loadoutRepository.ensureLoadout(models, { userId, revision: crypto.randomUUID() });

    const hasExpectedRevision = typeof expectedRevision === 'string' && expectedRevision.length > 0;

    return withTransaction(db, async (t) => {
        const loadout = await loadoutRepository.lockLoadout(models, userId, t);

        if (hasExpectedRevision && loadout.revision !== expectedRevision) {
            throw createError(
                '장착 상태가 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
                409,
                'SKIN_REVISION_CONFLICT',
            );
        }

        await loadoutRepository.saveLoadout(loadout, { [column]: itemId, revision: crypto.randomUUID() }, t);
        return loadout;
    });
};

// 사진·테두리 같이, 보유 확인 + revision 확인
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
        const owned = await entitlementRepository.findOwned(models, { userId, itemId });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
        updates[column] = itemId;
    }

    await loadoutRepository.ensureLoadout(models, { userId, revision: crypto.randomUUID() });

    return withTransaction(db, async (t) => {
        const loadout = await loadoutRepository.lockLoadout(models, userId, t);

        if (loadout.revision !== expectedRevision) {
            throw createError(
                '프로필이 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
                409,
                'PROFILE_REVISION_CONFLICT',
            );
        }

        await loadoutRepository.saveLoadout(loadout, { ...updates, revision: crypto.randomUUID() }, t);
        return loadout;
    });
};

// 남에게 보여도 되는 장착만 (사람마다 한 묶음)
const getPublicProfileLoadouts = async (userIds, db = defaultDb()) => {
    const uniqueUserIds = [...new Set(userIds)].filter((id) => typeof id === 'string' && id.length > 0);
    if (uniqueUserIds.length === 0) return {};

    const models = economyModels(db);
    await Promise.all(uniqueUserIds.map((userId) => ensureDefaultEntitlements(userId, db)));
    const loadouts = await loadoutRepository.listLoadouts(models, uniqueUserIds);

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

// 게임 시작 때 직업별 스킨까지
const getGameStartLoadouts = async (userIds, db = defaultDb()) => {
    const uniqueUserIds = [...new Set(userIds)].filter((id) => typeof id === 'string' && id.length > 0);
    if (uniqueUserIds.length === 0) return {};

    const models = economyModels(db);
    await Promise.all(uniqueUserIds.map((userId) => ensureDefaultEntitlements(userId, db)));
    const loadouts = await loadoutRepository.listLoadouts(models, uniqueUserIds);

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

module.exports = {
    equipItem,
    equipProfileAppearance,
    getPublicProfileLoadouts,
    getGameStartLoadouts,
};
