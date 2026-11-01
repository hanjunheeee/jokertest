// 친구 컨트롤러 파일, 친구 목록·검색·신청·즐겨찾기·차단·게임 초대 응답
// routes/friend.routes.js가 부름, 상대 알림은 저장 끝난 뒤 보냄 (보내다 실패해도 응답은 그대로)
const friendService = require("../services/friend");
const gameInviteService = require("../services/friend/gameInvite");
const { createError } = require("../utils/appError");

// 내 친구 목록
exports.getFriends = async (req, res, next) => {
    try {
        const friends = await friendService.getFriendList(req.user.uuid);
        res.status(200).json({ success: true, data: friends });
    } catch (error) {
        next(error);
    }
};

// 받은 친구 신청 목록
exports.getIncomingRequests = async (req, res, next) => {
    try {
        const requests = await friendService.getIncomingRequests(req.user.uuid);
        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        next(error);
    }
};

// 닉네임으로 사람 찾기 (접속 상태가 섞여서 캐시 금지)
exports.searchUsers = async (req, res, next) => {
    try {
        const users = await friendService.searchUsers(req.query.q, req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
};

// 친구 신청 저장 뒤 받는 사람에게 알림
exports.sendFriendRequest = async (req, res, next) => {
    try {
        const { receiverId } = req.body;

        if (!receiverId) {
            return next(createError('receiverId가 필요합니다.', 400));
        }

        const created = await friendService.sendFriendRequest(req.user.uuid, receiverId);
        friendService.notifyRequestReceived(receiverId, created?.id);

        res.status(200).json({ success: true, message: '친구 신청을 보냈습니다.' });
    } catch (error) {
        next(error);
    }
};

// 수락 저장 뒤 신청 보낸 사람에게 알림
exports.acceptRequest = async (req, res, next) => {
    try {
        // 숫자 아닌 신청 id는 서비스 부르기 전 400
        const requestId = parseInt(req.params.id, 10);
        if (Number.isNaN(requestId)) {
            return next(createError('유효하지 않은 요청 id입니다.', 400));
        }

        const { requesterId } = await friendService.acceptRequest(req.user.uuid, requestId);
        friendService.notifyRequestAccepted(requesterId, req.user.uuid, requestId);

        res.status(200).json({ success: true, message: '친구 요청을 수락했습니다.', data: { request_id: requestId, status: 'ACCEPTED' } });
    } catch (error) {
        next(error);
    }
};

// 거절 저장 뒤 신청 보낸 사람에게 알림
exports.declineRequest = async (req, res, next) => {
    try {
        // 숫자 아닌 신청 id는 서비스 부르기 전 400
        const requestId = parseInt(req.params.id, 10);
        if (Number.isNaN(requestId)) {
            return next(createError('유효하지 않은 요청 id입니다.', 400));
        }

        const { requesterId } = await friendService.declineRequest(req.user.uuid, requestId);
        friendService.notifyRequestDeclined(requesterId, req.user.uuid, requestId);

        res.status(200).json({ success: true, message: '친구 요청을 거절했습니다.', data: { request_id: requestId, status: 'DECLINED' } });
    } catch (error) {
        next(error);
    }
};

// 보낸 신청 여러 개 결과 (id는 쉼표로 받고 빈 칸 뺌, 캐시 금지)
exports.getRequestResults = async (req, res, next) => {
    try {
        const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
        const requestIds = raw.split(',').map((value) => value.trim()).filter(Boolean);
        const results = await friendService.getRequestResults(req.user.uuid, requestIds);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
};

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
