/**
 * @file    friend.controller.js
 * @desc    친구 목록 조회 · 검색 · 친구 요청 전송 · 수락 · 거절 요청을 처리하는 컨트롤러입니다.
 *          req/res 계층만 담당하며, 실제 비즈니스 로직은 friend.service.js에 위임합니다.
 *
 *  응답 포맷 표준
 *  ┌────────────────────────────────────────────────────────────────┐
 *  │  성공  200  { success: true,  data?: any, message?: string }   │
 *  │  에러  4xx  { success: false, message: string }  ← 글로벌핸들러│
 *  └────────────────────────────────────────────────────────────────┘
 *  에러는 모두 next(error)로 글로벌 에러 핸들러에 위임합니다.
 */

const friendService = require("../service/friend.service");

// ──────────────────────────────────────────────
// 친구 목록 조회
// ──────────────────────────────────────────────

/**
 * @route   GET /friends/
 * @access  Private (verifyToken)
 * @returns 200 { success: true, data: [{ id, name, profile, status, online, isFavorite }] }
 */
exports.getFriends = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const friends = await friendService.getFriendList(myUuid);
        res.status(200).json({ success: true, data: friends });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 받은 친구 요청 목록
// ──────────────────────────────────────────────

/**
 * @route   GET /friends/requests/incoming
 * @access  Private (verifyToken)
 * @returns 200 { success: true, data: [{ request_id, id, name, profile, message, created_at }] }
 */
exports.getIncomingRequests = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const requests = await friendService.getIncomingRequests(myUuid);
        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 유저 검색
// ──────────────────────────────────────────────

/**
 * @route   GET /friends/search?q=닉네임
 * @access  Private (verifyToken)
 * @returns 200 { success: true, data: [{ id, name, profile }] }
 */
exports.searchUsers = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const { q } = req.query;
        const users = await friendService.searchUsers(q, myUuid);
        // Express가 동일 응답에 자동 ETag를 생성해 304를 반환하는 현상을 막기 위해 캐시 비활성화
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 친구 신청 전송
// ──────────────────────────────────────────────

/**
 * @route   POST /friends/requests
 * @access  Private (verifyToken)
 * @body    { receiverId: string }
 * @returns 200 { success: true, message }  |  next(error) → 400/409
 */
exports.sendFriendRequest = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const { receiverId } = req.body;

        if (!receiverId) {
            const err = new Error('receiverId가 필요합니다.');
            err.status = 400;
            return next(err);
        }

        await friendService.sendFriendRequest(myUuid, receiverId);
        res.status(200).json({ success: true, message: '친구 신청을 보냈습니다.' });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 친구 요청 수락
// ──────────────────────────────────────────────

/**
 * @route   PUT /friends/requests/:id/accept
 * @access  Private (verifyToken)
 * @returns 200 { success: true, message }  |  next(error) → 403/404/409
 */
exports.acceptRequest = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const requestId = parseInt(req.params.id, 10);
        await friendService.acceptRequest(myUuid, requestId);
        res.status(200).json({ success: true, message: '친구 요청을 수락했습니다.' });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 친구 요청 거절
// ──────────────────────────────────────────────

/**
 * @route   PUT /friends/requests/:id/decline
 * @access  Private (verifyToken)
 * @returns 200 { success: true, message }  |  next(error) → 403/404/409
 */
exports.declineRequest = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const requestId = parseInt(req.params.id, 10);
        await friendService.declineRequest(myUuid, requestId);
        res.status(200).json({ success: true, message: '친구 요청을 거절했습니다.' });
    } catch (error) {
        next(error);
    }
};
