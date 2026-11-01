// 즐겨찾기 파일, 즐겨찾기 친구 id 목록 · 켜고 끄기
// controllers/friend.controller.js가 index.js 거쳐 부름
const friendshipRepository = require("../../repositories/friend/friendship");
const blockRepository = require("../../repositories/friend/block");
const { createError } = require("../../utils/appError");

// 내 즐겨찾기 친구 id (즐겨찾기 저장소는 block.js에 같이 있음)
exports.getFavoriteFriendIds = async (myUuid) => {
    return await blockRepository.findFavoriteFriendIds(myUuid);
};

// 수락된 친구일 때만 켜고 끔 (같은 값 두 번도 결과 그대로)
exports.setFriendFavorite = async (myUuid, friendId, desired) => {
    // 친구 id·켜고 끌 값 없거나 나 자신이면 거절
    if (typeof friendId !== 'string' || friendId.length === 0) {
        throw createError('friendId가 필요합니다.', 400);
    }
    if (typeof desired !== 'boolean') {
        throw createError('favorite 값이 필요합니다.', 400);
    }
    if (friendId === myUuid) {
        throw createError('자기 자신을 즐겨찾기할 수 없습니다.', 400);
    }

    // 친구 관계 없거나 수락 상태 아니면 404
    const friendship = await friendshipRepository.findExistingFriendship(myUuid, friendId);
    if (!friendship || friendship.status !== 'ACCEPTED') {
        throw createError('친구가 아닌 사용자는 즐겨찾기할 수 없습니다.', 404);
    }

    const favorite = await blockRepository.setFriendFavorite(myUuid, friendId, desired);
    return { friendId, favorite };
};
