// 게임 초대 컨트롤러 파일, 받은 초대 묶음·보내기·하나 보기·거절
// routes/friend.routes.js가 friend/index.js 거쳐 부름 (수락은 방 입장이 걸려 socket accept_game_invite 쪽)
const gameInviteService = require("../../services/friend/gameInvite");

// 받은 게임 초대 묶음
exports.getInviteSnapshot = async (req, res, next) => {
    try {
        const snapshot = await gameInviteService.getReceiverSnapshot(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: snapshot });
    } catch (error) {
        next(error);
    }
};

// 게임 초대 보내기 (새로 만들면 201, 같은 creationKey거나 대기 중 초대가 있으면 그 초대로 200)
exports.createInvite = async (req, res, next) => {
    try {
        const { receiverId, creationKey } = req.body ?? {};
        const result = await gameInviteService.createInvite({
            senderId: req.user.uuid, receiverId, creationKey,
        });
        res.status(result.created ? 201 : 200).json({ success: true, data: result.invite });
    } catch (error) {
        next(error);
    }
};

// 초대 하나 (보낸 사람·받는 사람만, 아니면 서비스가 404)
exports.getInvite = async (req, res, next) => {
    try {
        const invite = await gameInviteService.getInviteForUser(req.user.uuid, req.params.inviteId);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: invite });
    } catch (error) {
        next(error);
    }
};

// 받은 초대 거절
exports.declineInvite = async (req, res, next) => {
    try {
        const invite = await gameInviteService.declineInvite(req.user.uuid, req.params.inviteId);
        res.status(200).json({ success: true, data: invite });
    } catch (error) {
        next(error);
    }
};
