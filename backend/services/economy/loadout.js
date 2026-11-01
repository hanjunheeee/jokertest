'use strict';

// 장착 파일, 아이템 장착 · 프로필 사진·테두리 장착 · 공개/게임 시작 로드아웃
// index 거쳐 controllers/economy/account.js·friend/list.js·game/roleStatistics·socket/matchmaking/room(view·start)이 부름
const crypto = require('crypto');
const catalog = require('./catalog');
const { createError } = require('../../utils/appError');
const { defaultDb, buildSkinsByJob, isFreeJobSkin } = require('./helpers');
const { SLOT_TO_ITEM_TYPE, SLOT_TO_LOADOUT_COLUMN, FREE_CARD_FRAME_ID, JOB_NAME_BY_SLOT, SKIN_ITEM_ID_PREFIX } = require('./constants');
const { ensureDefaultEntitlements } = require('./defaults');
const { economyModels } = require('../../repositories/economy/models');
const entitlementRepository = require('../../repositories/economy/entitlement');
const loadoutRepository = require('../../repositories/economy/loadout');
const { withTransaction } = require('../../repositories/common');

// 보유·칸 종류 확인 뒤 revision 맞을 때만 바꿈 (다른 곳에서 바꿨으면 409)
const equipItem = async ({ userId, slot, itemId, expectedRevision }, db = defaultDb()) => {
    // 모르는 칸·빈 아이템 id 거절
    const expectedType = SLOT_TO_ITEM_TYPE[slot];
    const column = SLOT_TO_LOADOUT_COLUMN[slot];
    if (!expectedType || !column) {
        throw createError('알 수 없는 장착 슬롯입니다.', 400, 'UNKNOWN_EQUIP_SLOT');
    }
    if (typeof itemId !== 'string' || itemId.length === 0) {
        throw createError('itemId가 필요합니다.', 400, 'INVALID_ITEM_ID');
    }

    // 기본 아이템 먼저 보유하게 (기본 사진·테두리도 보유 확인 통과)
    await ensureDefaultEntitlements(userId, db);

    // 공짜 카드 테두리·기본 스킨은 상품 목록에 없어 확인 건너뜀
    const isFreeCardFrame = slot === 'PLAYER_CARD_FRAME' && itemId === FREE_CARD_FRAME_ID;
    const isFreeSkin = isFreeJobSkin(slot, itemId);
    const models = economyModels(db);

    if (!isFreeCardFrame && !isFreeSkin) {
        // 상품 목록에 있고 그 칸에 맞는 종류인지
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.type !== expectedType) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }

        // 스킨이면 그 칸 직업 스킨인지 (다른 직업 스킨 막기)
        const requiredPrefix = JOB_NAME_BY_SLOT[slot];
        if (requiredPrefix && !itemId.startsWith(`${SKIN_ITEM_ID_PREFIX}${requiredPrefix}`)) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }

        // 가진 것만 장착
        const owned = await entitlementRepository.findOwned(models, { userId, itemId });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
    }

    // 잠글 장착 행 보장
    await loadoutRepository.ensureLoadout(models, { userId, revision: crypto.randomUUID() });

    // revision 없이 오면 비교 건너뜀 (컨트롤러는 늘 보냄, 시험이 씀)
    const hasExpectedRevision = typeof expectedRevision === 'string' && expectedRevision.length > 0;

    return withTransaction(db, async (t) => {
        const loadout = await loadoutRepository.lockLoadout(models, userId, t);

        // 잠근 뒤 revision 비교, 다르면 남이 먼저 바꾼 것이라 409
        if (hasExpectedRevision && loadout.revision !== expectedRevision) {
            throw createError(
                '장착 상태가 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
                409,
                'SKIN_REVISION_CONFLICT',
            );
        }

        // 여기부터 진짜 바뀜: 칸 값 넣고 revision 새로
        await loadoutRepository.saveLoadout(loadout, { [column]: itemId, revision: crypto.randomUUID() }, t);
        return loadout;
    });
};

// 사진·테두리 한 번에 장착 (온 것만), 보유·revision 확인
const equipProfileAppearance = async ({ userId, photoItemId, borderItemId, expectedRevision }, db = defaultDb()) => {
    // 안 보낸 칸은 그대로 둠
    const slots = [
        ['PROFILE_PHOTO', photoItemId],
        ['PROFILE_BORDER', borderItemId],
    ].filter(([, itemId]) => itemId !== undefined);

    // 바꿀 칸 없음·빈 id·revision 없음 거절
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

    // 기본 사진·테두리 먼저 보유하게
    await ensureDefaultEntitlements(userId, db);
    const models = economyModels(db);

    // 칸마다 종류·보유 확인 뒤 바꿀 값 모음
    const updates = {};
    for (const [slot, itemId] of slots) {
        const expectedType = SLOT_TO_ITEM_TYPE[slot];
        const column = SLOT_TO_LOADOUT_COLUMN[slot];
        const catalogItem = catalog.getCatalogItem(itemId);
        if (!catalogItem || catalogItem.type !== expectedType) {
            throw createError('존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.', 400, 'ITEM_TYPE_MISMATCH');
        }
        // eslint-disable-next-line no-await-in-loop -- 칸 최대 2개라 차례대로 확인
        const owned = await entitlementRepository.findOwned(models, { userId, itemId });
        if (!owned) {
            throw createError('보유하지 않은 상품은 장착할 수 없습니다.', 403, 'ITEM_NOT_OWNED');
        }
        updates[column] = itemId;
    }

    // 잠글 장착 행 보장
    await loadoutRepository.ensureLoadout(models, { userId, revision: crypto.randomUUID() });

    return withTransaction(db, async (t) => {
        const loadout = await loadoutRepository.lockLoadout(models, userId, t);

        // 잠근 뒤 revision 비교, 다르면 남이 먼저 바꾼 것이라 409
        if (loadout.revision !== expectedRevision) {
            throw createError(
                '프로필이 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.',
                409,
                'PROFILE_REVISION_CONFLICT',
            );
        }

        // 여기부터 진짜 바뀜: 사진·테두리 넣고 revision 새로
        await loadoutRepository.saveLoadout(loadout, { ...updates, revision: crypto.randomUUID() }, t);
        return loadout;
    });
};

// 남에게 보여도 되는 장착만 (사진·테두리, 사람마다 한 묶음)
const getPublicProfileLoadouts = async (userIds, db = defaultDb()) => {
    // 겹친 id·빈 id 뺌, 남는 게 없으면 빈 객체
    const uniqueUserIds = [...new Set(userIds)].filter((id) => typeof id === 'string' && id.length > 0);
    if (uniqueUserIds.length === 0) return {};

    // 처음 보는 계정도 기본 사진·테두리 갖게
    const models = economyModels(db);
    await Promise.all(uniqueUserIds.map((userId) => ensureDefaultEntitlements(userId, db)));
    const loadouts = await loadoutRepository.listLoadouts(models, uniqueUserIds);

    // 장착 행 없는 사람은 null로
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

// 게임 시작 때 쓸 장착 (카드 테두리·직업별 스킨까지)
const getGameStartLoadouts = async (userIds, db = defaultDb()) => {
    // 겹친 id·빈 id 뺌, 남는 게 없으면 빈 객체
    const uniqueUserIds = [...new Set(userIds)].filter((id) => typeof id === 'string' && id.length > 0);
    if (uniqueUserIds.length === 0) return {};

    // 처음 보는 계정도 기본 장착 갖게
    const models = economyModels(db);
    await Promise.all(uniqueUserIds.map((userId) => ensureDefaultEntitlements(userId, db)));
    const loadouts = await loadoutRepository.listLoadouts(models, uniqueUserIds);

    // 장착 행 없는 사람은 null로
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
