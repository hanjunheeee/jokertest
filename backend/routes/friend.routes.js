/**
 * @file    friend.routes.js
 * @desc    친구(Friend) 관련 API 라우터입니다.
 *          모든 엔드포인트는 verifyToken 미들웨어를 통과해야 접근할 수 있습니다.
 *
 *  엔드포인트 목록
 *  ┌─────────────────────────────────────────────────────────────────────┐
 *  │  GET    /friends/                        내 친구 목록 조회           │
 *  │  GET    /friends/search?q=닉네임         유저 닉네임 검색            │
 *  │  GET    /friends/requests/incoming       받은 친구 요청 목록         │
 *  │  POST   /friends/requests                친구 신청 전송              │
 *  │  PUT    /friends/requests/:id/accept     친구 요청 수락              │
 *  │  PUT    /friends/requests/:id/decline    친구 요청 거절              │
 *  └─────────────────────────────────────────────────────────────────────┘
 */

const express = require("express");
const router  = express.Router();

const friendController = require("../controller/friend.controller");
const { verifyToken }  = require("../middleware/auth.middleware");

// ──────────────────────────────────────────────
// 친구 목록 조회
// ──────────────────────────────────────────────

/**
 * @route   GET /friends/
 * @desc    내 친구 목록과 각 친구의 현재 접속 상태(ONLINE / OFFLINE / IN_GAME)를 반환합니다.
 * @access  Private
 * @returns {Array} [{ id, name, profile, status, online, isFavorite }, ...]
 */
router.get("/", verifyToken, friendController.getFriends);

// ──────────────────────────────────────────────
// 유저 검색
// ──────────────────────────────────────────────

/**
 * @route   GET /friends/search?q=닉네임
 * @desc    닉네임 부분 일치로 유저를 검색합니다. (최대 10명)
 *          이미 친구인 유저, 이미 신청 보낸 유저, 본인은 결과에서 제외됩니다.
 * @access  Private
 * @query   q {string} 검색할 닉네임 키워드
 * @returns {Array} [{ id, name, profile }, ...]
 */
router.get("/search", verifyToken, friendController.searchUsers);

// ──────────────────────────────────────────────
// 친구 요청 관련
// ──────────────────────────────────────────────

/**
 * @route   GET /friends/requests/incoming
 * @desc    내가 받은 친구 요청 중 아직 처리하지 않은(PENDING) 목록을 반환합니다.
 * @access  Private
 * @returns {Array} [{ request_id, id, name, profile, message, created_at }, ...]
 */
router.get("/requests/incoming", verifyToken, friendController.getIncomingRequests);

/**
 * @route   POST /friends/requests
 * @desc    특정 유저에게 친구 신청을 보냅니다.
 *          자기 자신에게 신청하거나 이미 PENDING 상태의 요청이 있으면 에러를 반환합니다.
 * @access  Private
 * @body    { receiverId: string }  신청 대상 유저의 UUID
 */
router.post("/requests", verifyToken, friendController.sendFriendRequest);

/**
 * @route   PUT /friends/requests/:id/accept
 * @desc    내가 받은 친구 요청을 수락합니다.
 *          요청 상태를 ACCEPTED로 변경하고 Friendship 레코드를 생성합니다.
 * @access  Private
 * @param   id {number} 수락할 친구 요청의 PK (FriendRequest.id)
 */
router.put("/requests/:id/accept", verifyToken, friendController.acceptRequest);

/**
 * @route   PUT /friends/requests/:id/decline
 * @desc    내가 받은 친구 요청을 거절합니다.
 *          요청 상태를 DECLINED로 변경합니다.
 * @access  Private
 * @param   id {number} 거절할 친구 요청의 PK (FriendRequest.id)
 */
router.put("/requests/:id/decline", verifyToken, friendController.declineRequest);

module.exports = router;
