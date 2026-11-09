// 친구 목록·신청 컨트롤러 파일, 친구 목록·사람 찾기·신청 보내기·수락·거절·결과
// routes/friend.routes.js가 friend/index.js 거쳐 부름, 상대 알림은 저장 끝난 뒤 보냄 (보내다 실패해도 응답은 그대로)
const friendService = require("../../services/friend");
const { createError } = require("../../utils/appError");

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
        // 본문 없는 요청도 400으로 (Express 5는 본문 없으면 req.body가 비어 있음)
        const { receiverId } = req.body ?? {};

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
