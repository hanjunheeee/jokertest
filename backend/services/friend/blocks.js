// 차단 파일, 차단 확인 · 차단 목록 · 차단 · 해제
// 차단하면 둘 사이 대기 게임 초대도 같이 취소
const db = require("../../models");
const friendRepository = require("../../repositories/friend.repositories");
const gameInviteService = require("./gameInvite");
const { createError } = require("../../utils/appError");
const { loadPublicLoadouts } = require('./list');

// 둘 중 누가 차단했으면 403
const assertNotBlocked = async (uuidA, uuidB, options = {}) => {
    const blocks = await friendRepository.findBlocksBetween(uuidA, uuidB, options);
    if (blocks.length > 0) {
        throw createError('차단된 사용자와는 친구 신청·게임 초대를 주고받을 수 없습니다.', 403);
    }
};

// 둘 중 누가 차단했으면 403
exports.assertNotBlocked = assertNotBlocked;

// 내가 차단한 사람 목록
exports.getBlockedUsers = async (myUuid) => {
    const rows = await friendRepository.findBlocksOwnedBy(myUuid);
    const uuids = rows.map((row) => row.blocked_id);
    const loadoutsByUuid = await loadPublicLoadouts(uuids);

    return rows.map((row) => {
        const user = row.BlockedUser;
        const loadout = loadoutsByUuid[row.blocked_id] ?? { profilePhotoId: null, profileBorderId: null };
        return {
            id: row.blocked_id,
            name: user?.nickname ?? '알 수 없는 사용자',
            profile: user?.profile_image_url || '/assets/default_profile.png',
            blocked_at: row.created_at,
            accountProfilePhotoId: loadout.profilePhotoId,
            accountProfileBorderId: loadout.profileBorderId,
        };
    });
};

// 친구·요청 정리하고 차단, 대기 초대 취소 (한 트랜잭션)
exports.blockUser = async (myUuid, targetId) => {
    if (typeof targetId !== 'string' || targetId.length === 0) {
        throw createError('targetId가 필요합니다.', 400);
    }
    if (targetId === myUuid) {
        throw createError('자기 자신을 차단할 수 없습니다.', 400);
    }

    return await db.sequelize.transaction(async (t) => {
        const [accountA, accountB] = await friendRepository.lockAccountsInOrder(
            [myUuid, targetId], { transaction: t },
        );
        if (!accountA || !accountB) throw createError('사용자를 찾을 수 없습니다.', 404);

        await friendRepository.createBlock(myUuid, targetId, { transaction: t });
        await friendRepository.cancelPendingRequestsBetween(myUuid, targetId, { transaction: t });
        const cancelledInvites = await gameInviteService.cancelPendingInvitesBetween(
            myUuid, targetId, 'BLOCKED', { db, transaction: t },
        );

        return { blockedId: targetId, cancelledInvites };
    });
};

// 차단 행만 지움
exports.unblockUser = async (myUuid, targetId) => {
    if (typeof targetId !== 'string' || targetId.length === 0) {
        throw createError('targetId가 필요합니다.', 400);
    }

    return await db.sequelize.transaction(async (t) => {
        await friendRepository.lockAccountsInOrder([myUuid, targetId], { transaction: t });

        const removed = await friendRepository.deleteBlock(myUuid, targetId, { transaction: t });
        if (removed === 0) throw createError('차단 기록을 찾을 수 없습니다.', 404);

        return { unblockedId: targetId };
    });
};
