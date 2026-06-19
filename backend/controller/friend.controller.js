/**
 * @file friend.controller.js
 * @desc 친구 목록 · 검색 · 요청 전송/수락/거절 컨트롤러
 */

const friendService = require("../service/friend.service");
const { createError } = require("../utils/appError");
const { emitToUser } = require("../socket/socket");

/**
 * @route   GET /friends/
 * @access  Private (verifyToken)
 * @returns {Object} { success, data: [{ id, name, profile, status, online, isFavorite }] }
 */
exports.getFriends = async (req, res, next) => {
    try {
        const friends = await friendService.getFriendList(req.user.uuid);
        res.status(200).json({ success: true, data: friends });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /friends/requests/incoming
 * @access  Private (verifyToken)
 * @returns {Object} { success, data: [{ request_id, id, name, profile, message, created_at }] }
 */
exports.getIncomingRequests = async (req, res, next) => {
    try {
        const requests = await friendService.getIncomingRequests(req.user.uuid);
        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /friends/search?q=닉네임
 * @access  Private (verifyToken)
 * @returns {Object} { success, data: [{ id, name, profile }] }
 */
exports.searchUsers = async (req, res, next) => {
    try {
        const users = await friendService.searchUsers(req.query.q, req.user.uuid);
        // Express 자동 ETag로 인한 304 응답 방지
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   POST /friends/requests
 * @access  Private (verifyToken)
 * @param   {Object} req.body - { receiverId: string }
 */
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

/**
 * @route   PUT /friends/requests/:id/accept
 * @access  Private (verifyToken)
 */
exports.acceptRequest = async (req, res, next) => {
    try {
        const { requesterId } = await friendService.acceptRequest(req.user.uuid, parseInt(req.params.id, 10));
        // byUuid: 프런트에서 sentRequestIds의 정확한 항목을 제거하기 위해 필요
        emitToUser(requesterId, 'friend_request_accepted', { byUuid: req.user.uuid });

        res.status(200).json({ success: true, message: '친구 요청을 수락했습니다.' });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   PUT /friends/requests/:id/decline
 * @access  Private (verifyToken)
 */
exports.declineRequest = async (req, res, next) => {
    try {
        const { requesterId } = await friendService.declineRequest(req.user.uuid, parseInt(req.params.id, 10));
        // byUuid: 프런트에서 sentRequestIds의 정확한 항목을 제거하기 위해 필요
        emitToUser(requesterId, 'friend_request_declined', { byUuid: req.user.uuid });

        res.status(200).json({ success: true, message: '친구 요청을 거절했습니다.' });
    } catch (error) {
        next(error);
    }
};
