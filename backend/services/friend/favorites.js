// 즐겨찾기 파일, 즐겨찾기 친구 id 목록 · 켜고 끄기
// friend 컨트롤러가 부름
const friendRepository = require("../../repositories/friend/relation");
const { createError } = require("../../utils/appError");

// 내 즐겨찾기 친구 id
exports.getFavoriteFriendIds = async (myUuid) => {
    return await friendRepository.findFavoriteFriendIds(myUuid);
};

// 친구일 때만 켜고 끔
exports.setFriendFavorite = async (myUuid, friendId, desired) => {
    if (typeof friendId !== 'string' || friendId.length === 0) {
        throw createError('friendId가 필요합니다.', 400);
    }
    if (typeof desired !== 'boolean') {
        throw createError('favorite 값이 필요합니다.', 400);
    }
    if (friendId === myUuid) {
        throw createError('자기 자신을 즐겨찾기할 수 없습니다.', 400);
    }

    const friendship = await friendRepository.findExistingFriendship(myUuid, friendId);
    if (!friendship || friendship.status !== 'ACCEPTED') {
        throw createError('친구가 아닌 사용자는 즐겨찾기할 수 없습니다.', 404);
    }

    const favorite = await friendRepository.setFriendFavorite(myUuid, friendId, desired);
    return { friendId, favorite };
};
