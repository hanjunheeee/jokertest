// 필요한 모듈 불러오기
// Express 프레임워크와 길잡이 역할을 할 Router 객체를 가져옵니다.
const express = require("express");
const router = express.Router();

// 컨트롤러 및 미들웨어 불러오기
// - friendController: 실제 DB에서 친구 목록을 조회하는 핵심 로직을 담당합니다.
// - verifyToken: 쿠키(JWT)를 검사하여 로그인된 유저인지 확인하는 문지기 미들웨어입니다.
const friendController = require("../controller/friend.controller");
const { verifyToken } = require("../middleware/auth.middleware");

// API 라우트 정의
/**
 * @route   GET / (실제 주소 예: /api/friends)
 * @desc    내 친구 목록과 현재 접속 상태를 조회합니다.
 * @access  Private (로그인한 유저만 접근 가능)
 * 동작 흐름:
 * 1. 클라이언트 요청 -> 2. verifyToken 통과(출입증 검사) -> 3. getFriends 실행(데이터 반환)
 */
router.get("/", verifyToken, friendController.getFriends);

// 모듈 내보내기
module.exports = router;