const friendService = require("../services/friend");
const gameInviteService = require("../services/friend/gameInvite");
const { createError } = require("../utils/appError");

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

        const created = await friendService.sendFriendRequest(req.user.uuid, receiverId);
        friendService.notifyRequestReceived(receiverId, created?.id);

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
        friendService.notifyRequestAccepted(requesterId, req.user.uuid, requestId);

        res.status(200).json({ success: true, message: '친구 요청을 수락했습니다.', data: { request_id: requestId, status: 'ACCEPTED' } });
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
        friendService.notifyRequestDeclined(requesterId, req.user.uuid, requestId);

        res.status(200).json({ success: true, message: '친구 요청을 거절했습니다.', data: { request_id: requestId, status: 'DECLINED' } });
    } catch (error) {
        next(error);
    }
};

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

exports.getFavorites = async (req, res, next) => {
    try {
        const ids = await friendService.getFavoriteFriendIds(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: ids });
    } catch (error) {
        next(error);
    }
};

exports.setFavorite = async (req, res, next) => {
    try {
        const { favorite } = req.body ?? {};
        const result = await friendService.setFriendFavorite(req.user.uuid, req.params.friendId, favorite);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.getBlocks = async (req, res, next) => {
    try {
        const blocks = await friendService.getBlockedUsers(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: blocks });
    } catch (error) {
        next(error);
    }
};

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

exports.unblockUser = async (req, res, next) => {
    try {
        const result = await friendService.unblockUser(req.user.uuid, req.params.targetId);
        friendService.notifyUnblocked(req.user.uuid);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.getInviteSnapshot = async (req, res, next) => {
    try {
        const snapshot = await gameInviteService.getReceiverSnapshot(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: snapshot });
    } catch (error) {
        next(error);
    }
};

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

exports.getInvite = async (req, res, next) => {
    try {
        const invite = await gameInviteService.getInviteForUser(req.user.uuid, req.params.inviteId);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: invite });
    } catch (error) {
        next(error);
    }
};

exports.declineInvite = async (req, res, next) => {
    try {
        const invite = await gameInviteService.declineInvite(req.user.uuid, req.params.inviteId);
        res.status(200).json({ success: true, data: invite });
    } catch (error) {
        next(error);
    }
};
