// 차단 파일, 차단 확인 · 차단 목록 · 차단 · 해제
// controllers/friend.controller.js가 index.js 거쳐 부름, requests.js가 차단 확인 씀
const db = require("../../repositories/common/db");
const friendshipRepository = require("../../repositories/friend/friendship");
const friendRequestRepository = require("../../repositories/friend/request");
const blockRepository = require("../../repositories/friend/block");
const gameInviteService = require("./gameInvite");
const { createError } = require("../../utils/appError");
const { loadPublicLoadouts } = require('./list');
const { withTransaction } = require('../../repositories/common');

// 둘 중 누가 차단했으면 403 (신청 보내기·수락 때 씀)
const assertNotBlocked = async (uuidA, uuidB, options = {}) => {
    const blocks = await blockRepository.findBlocksBetween(uuidA, uuidB, options);
    if (blocks.length > 0) {
        throw createError('차단된 사용자와는 친구 신청·게임 초대를 주고받을 수 없습니다.', 403);
    }
};

// 위 함수 그대로 내보냄 (requests.js가 가져다 씀)
exports.assertNotBlocked = assertNotBlocked;

// 내가 차단한 사람 목록 + 공개 장착 (최근 차단 먼저)
exports.getBlockedUsers = async (myUuid) => {
    const rows = await blockRepository.findBlocksOwnedBy(myUuid);
    const uuids = rows.map((row) => row.blocked_id);
    const loadoutsByUuid = await loadPublicLoadouts(uuids);

    // 상대 행·장착 없으면 기본값 (화면 칸 안 비게)
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

// 차단 + 둘 사이 대기 신청·초대 취소 (한 트랜잭션)
exports.blockUser = async (myUuid, targetId) => {
    // 대상 없거나 나 자신이면 거절
    if (typeof targetId !== 'string' || targetId.length === 0) {
        throw createError('targetId가 필요합니다.', 400);
    }
    if (targetId === myUuid) {
        throw createError('자기 자신을 차단할 수 없습니다.', 400);
    }

    return await withTransaction(db, async (t) => {
        // 두 계정 순서대로 잠금 (동시 신청·초대와 엇갈림 막기), 없는 계정이면 404
        const [accountA, accountB] = await friendshipRepository.lockAccountsInOrder(
            [myUuid, targetId], { transaction: t },
        );
        if (!accountA || !accountB) throw createError('사용자를 찾을 수 없습니다.', 404);

        // 여기부터 진짜 바뀜: 차단 → 대기 신청 취소 → 대기 초대 취소
        // 친구 관계는 안 지움 (친구 목록이 차단 상대를 숨김)
        await blockRepository.createBlock(myUuid, targetId, { transaction: t });
        await friendRequestRepository.cancelPendingRequestsBetween(myUuid, targetId, { transaction: t });
        const cancelledInvites = await gameInviteService.cancelPendingInvitesBetween(
            myUuid, targetId, 'BLOCKED', { db, transaction: t },
        );

        return { blockedId: targetId, cancelledInvites };
    });
};

// 내가 단 차단만 풂 (상대가 단 차단은 그대로)
exports.unblockUser = async (myUuid, targetId) => {
    // 대상 없으면 거절
    if (typeof targetId !== 'string' || targetId.length === 0) {
        throw createError('targetId가 필요합니다.', 400);
    }

    return await withTransaction(db, async (t) => {
        // 차단 때와 같은 순서로 두 계정 잠금 (동시 차단과 엇갈림 막기)
        await friendshipRepository.lockAccountsInOrder([myUuid, targetId], { transaction: t });

        // 여기부터 진짜 바뀜: 차단 행 지움, 지울 게 없으면 404
        const removed = await blockRepository.deleteBlock(myUuid, targetId, { transaction: t });
        if (removed === 0) throw createError('차단 기록을 찾을 수 없습니다.', 404);

        return { unblockedId: targetId };
    });
};
