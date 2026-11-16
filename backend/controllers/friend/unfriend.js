// 친구 끊기 컨트롤러 파일, 친구 끊기 하나
// routes/friend.routes.js가 friend/index.js 거쳐 부름, 끊은 뒤 두 사람 다 친구 관계 다시 읽게 알림
const friendService = require("../../services/friend");

// 친구 끊기 저장 뒤 나·상대 둘 다 친구 목록 다시 읽게 알림 (상대에게 알림 글·소리는 안 보냄)
exports.unfriend = async (req, res, next) => {
    try {
        const friendId = req.params.friendId;
        const result = await friendService.unfriend(req.user.uuid, friendId);

        for (const userId of [req.user.uuid, friendId]) {
            friendService.notifyUnfriended(userId);
        }

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};
