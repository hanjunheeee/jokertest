// 친구 관계 컨트롤러 파일, 즐겨찾기·차단
// routes/friend.routes.js가 friend/index.js 거쳐 부름, 차단·풀기 뒤 관계 다시 읽게 알림
const friendService = require("../../services/friend");

// 즐겨찾기 친구 id 목록
exports.getFavorites = async (req, res, next) => {
    try {
        const ids = await friendService.getFavoriteFriendIds(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: ids });
    } catch (error) {
        next(error);
    }
};

// 즐겨찾기 켜기·끄기
exports.setFavorite = async (req, res, next) => {
    try {
        const { favorite } = req.body ?? {};
        const result = await friendService.setFriendFavorite(req.user.uuid, req.params.friendId, favorite);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

// 차단 목록
exports.getBlocks = async (req, res, next) => {
    try {
        const blocks = await friendService.getBlockedUsers(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: blocks });
    } catch (error) {
        next(error);
    }
};

// 차단 저장 뒤 나·상대 둘 다 친구 관계 다시 읽게 알림
exports.blockUser = async (req, res, next) => {
    try {
        const { targetId } = req.body ?? {};
        const result = await friendService.blockUser(req.user.uuid, targetId);

        for (const userId of [req.user.uuid, targetId]) {
            friendService.notifyBlocked(userId);
        }

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

// 차단 풀기 뒤 내 쪽만 관계 다시 읽게 알림
exports.unblockUser = async (req, res, next) => {
    try {
        const result = await friendService.unblockUser(req.user.uuid, req.params.targetId);
        friendService.notifyUnblocked(req.user.uuid);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};
