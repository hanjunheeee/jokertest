/**
 * @file    friend.controller.js
 * @desc    친구 목록 조회 · 검색 · 친구 요청 전송 · 수락 · 거절 요청을 처리하는 컨트롤러입니다.
 *          req/res 계층만 담당하며, 실제 비즈니스 로직은 friend.service.js에 위임합니다.
 */

const friendService = require("../service/friend.service");

// ──────────────────────────────────────────────
// 친구 목록 조회
// ──────────────────────────────────────────────

/**
 * @desc    내 친구 목록 + 각 친구의 현재 접속 상태 조회
 *          서비스 계층에서 ACCEPTED 상태인 Friendship 레코드를 가져와
 *          {id, name, profile, status, online, isFavorite} 형태로 가공해서 응답합니다.
 *
 * @route   GET /friends/
 * @access  Private (verifyToken)
 * @returns {Array} 200 [{ id, name, profile, status, online, isFavorite }]  |  next(error)
 */
exports.getFriends = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const friends = await friendService.getFriendList(myUuid);
        res.status(200).json(friends);
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 받은 친구 요청 목록
// ──────────────────────────────────────────────

/**
 * @desc    내가 받은 PENDING 상태의 친구 요청 목록 조회
 *          FriendAcceptTab 컴포넌트에서 수락/거절 UI를 렌더링할 때 사용합니다.
 *
 * @route   GET /friends/requests/incoming
 * @access  Private (verifyToken)
 * @returns {Array} 200 [{ request_id, id, name, profile, message, created_at }]  |  next(error)
 */
exports.getIncomingRequests = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const request = await friendService.getIncomingRequests(myUuid);
        res.status(200).json(request);
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 유저 검색
// ──────────────────────────────────────────────

/**
 * @desc    닉네임 부분 일치로 유저 검색 (최대 10명)
 *          이미 친구 / 이미 신청 보낸 대상 / 본인은 결과에서 자동 제외됩니다.
 *          304 캐시 문제를 방지하기 위해 Cache-Control: no-store 헤더를 명시합니다.
 *
 * @route   GET /friends/search?q=닉네임
 * @access  Private (verifyToken)
 * @query   q {string} 검색할 닉네임 키워드
 * @returns {Array} 200 [{ id, name, profile }]  |  next(error)
 */
exports.searchUsers = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const { q } = req.query;
        const users = await friendService.searchUsers(q, myUuid);
        // Express가 동일 응답에 자동 ETag를 생성해 304를 반환하는 현상을 막기 위해 캐시 비활성화
        res.set('Cache-Control', 'no-store');
        res.status(200).json(users);
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 친구 신청 전송
// ──────────────────────────────────────────────

/**
 * @desc    특정 유저에게 친구 신청 전송
 *          자기 자신에게 신청하거나 이미 PENDING 상태의 요청이 있으면 에러를 반환합니다.
 *          성공 시 FriendRequest 레코드가 PENDING 상태로 생성됩니다.
 *
 * @route   POST /friends/requests
 * @access  Private (verifyToken)
 * @body    { receiverId: string }  신청 대상 유저의 UUID
 * @returns {Object} 201 { message }  |  400 { message }  |  next(error)
 */
exports.sendFriendRequest = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const { receiverId } = req.body;

        if (!receiverId) {
            return res.status(400).json({ message: 'receiverId가 필요합니다.' });
        }

        await friendService.sendFriendRequest(myUuid, receiverId);
        res.status(201).json({ message: '친구 신청을 보냈습니다.' });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 친구 요청 수락
// ──────────────────────────────────────────────

/**
 * @desc    받은 친구 요청 수락
 *          요청 상태를 ACCEPTED로 변경하고 양방향 Friendship 레코드를 생성합니다.
 *          본인이 받은 요청이 아닌 경우 403, 이미 처리된 요청은 409를 반환합니다.
 *
 * @route   PUT /friends/requests/:id/accept
 * @access  Private (verifyToken)
 * @param   req.params.id {number} 수락할 FriendRequest의 PK
 * @returns {Object} 200 { message }  |  403/404/409 { message }  |  next(error)
 */
exports.acceptRequest = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const requestId = parseInt(req.params.id, 10);
        await friendService.acceptRequest(myUuid, requestId);
        res.status(200).json({ message: '친구 요청을 수락했습니다.' });
    } catch (error) {
        next(error);
    }
};

// ──────────────────────────────────────────────
// 친구 요청 거절
// ──────────────────────────────────────────────

/**
 * @desc    받은 친구 요청 거절
 *          요청 상태를 DECLINED로 변경합니다.
 *          본인이 받은 요청이 아닌 경우 403, 이미 처리된 요청은 409를 반환합니다.
 *
 * @route   PUT /friends/requests/:id/decline
 * @access  Private (verifyToken)
 * @param   req.params.id {number} 거절할 FriendRequest의 PK
 * @returns {Object} 200 { message }  |  403/404/409 { message }  |  next(error)
 */
exports.declineRequest = async (req, res, next) => {
    try {
        const myUuid = req.user.uuid;
        const requestId = parseInt(req.params.id, 10);
        await friendService.declineRequest(myUuid, requestId);
        res.status(200).json({ message: '친구 요청을 거절했습니다.' });
    } catch (error) {
        next(error);
    }
};
