// 친구 끊기 파일, 친구 줄 지우기 + 서로 건 즐겨찾기 풀기 + 둘 사이 대기 초대 취소
// controllers/friend가 index.js 거쳐 부름
const db = require("../../repositories/common/db");
const friendshipRepository = require("../../repositories/friend/friendship");
const blockRepository = require("../../repositories/friend/block");
const gameInviteService = require("./gameInvite");
const { createError } = require("../../utils/appError");
const { withTransaction } = require('../../repositories/common');

// 친구 끊기 (한 트랜잭션), 상대에게 알림은 안 만듦 (조용히 끊기)
exports.unfriend = async (myUuid, friendId) => {
    // 대상 없거나 나 자신이면 거절
    if (typeof friendId !== 'string' || friendId.length === 0) {
        throw createError('friendId가 필요합니다.', 400);
    }
    if (friendId === myUuid) {
        throw createError('자기 자신과는 친구를 끊을 수 없습니다.', 400);
    }

    return await withTransaction(db, async (t) => {
        // 신청·수락·차단과 같은 순서로 두 계정 잠금 (동시에 온 초대·끊기와 엇갈림 막기)
        // 상대 계정 상태는 안 봄 (정지된 친구도 끊을 수 있게), 없는 계정이면 아래에서 지울 줄이 없어 404
        await friendshipRepository.lockAccountsInOrder([myUuid, friendId], { transaction: t });

        // 여기부터 진짜 바뀜: 친구 줄 지움 → 즐겨찾기 풀기 → 대기 초대 취소, 지울 줄이 없으면 404
        const removed = await friendshipRepository.deleteFriendshipBetween(myUuid, friendId, { transaction: t });
        if (removed === 0) throw createError('친구가 아닌 사용자입니다.', 404);

        await blockRepository.deleteFavoritesBetween(myUuid, friendId, { transaction: t });
        // 초대는 친구끼리만 보내므로 남은 대기 초대도 끝냄 (차단 때와 같은 길, 이유만 다름)
        const cancelledInvites = await gameInviteService.cancelPendingInvitesBetween(
            myUuid, friendId, 'UNFRIENDED', { db, transaction: t },
        );

        return { unfriendedId: friendId, cancelledInvites };
    });
};
