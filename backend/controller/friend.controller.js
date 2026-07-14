const friendService = require("../service/friend.service");
const { createError } = require("../utils/appError");
const { emitToUser } = require("../socket/socket");

exports.getFriends = async (req, res, next) => {
    try {
        const friends = await friendService.getFriendList(req.user.uuid);
        res.status(200).json({ success: true, data: friends });
    } catch (error) {
        next(error);
    }
};

exports.getIncomingRequests = async (req, res, next) => {
    try {
        const requests = await friendService.getIncomingRequests(req.user.uuid);
        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        next(error);
    }
};

exports.searchUsers = async (req, res, next) => {
    try {
        const users = await friendService.searchUsers(req.query.q, req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
};

exports.sendFriendRequest = async (req, res, next) => {
    try {
        const { receiverId } = req.body;

        if (!receiverId) {
            return next(createError('receiverId가 필요합니다.', 400));
        }

        await friendService.sendFriendRequest(req.user.uuid, receiverId);
        emitToUser(receiverId, 'friend_request_received', {});

        res.status(200).json({ success: true, message: '친구 신청을 보냈습니다.' });
    } catch (error) {
        next(error);
    }
};

exports.acceptRequest = async (req, res, next) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        if (Number.isNaN(requestId)) {
            return next(createError('유효하지 않은 요청 id입니다.', 400));
        }

        const { requesterId } = await friendService.acceptRequest(req.user.uuid, requestId);
        emitToUser(requesterId, 'friend_request_accepted', { byUuid: req.user.uuid });

        res.status(200).json({ success: true, message: '친구 요청을 수락했습니다.' });
    } catch (error) {
        next(error);
    }
};

exports.declineRequest = async (req, res, next) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        if (Number.isNaN(requestId)) {
            return next(createError('유효하지 않은 요청 id입니다.', 400));
        }

        const { requesterId } = await friendService.declineRequest(req.user.uuid, requestId);
        emitToUser(requesterId, 'friend_request_declined', { byUuid: req.user.uuid });

        res.status(200).json({ success: true, message: '친구 요청을 거절했습니다.' });
    } catch (error) {
        next(error);
    }
};
