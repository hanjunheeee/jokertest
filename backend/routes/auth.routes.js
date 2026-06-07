// 필요한 모듈 불러오기
// Express 프레임워크를 불러 옵니다.
const express = require('express');

// 메인 앱(index.js)에서 모든 라우트를 관리하면 코드가 너무 길어지므로,
// 도메인별(여기선 인증 관련)로 길을 쪼개서 관리하기 위해 미니 라우터 객체를 만듭니다.
const router = express.Router();

// 컨트롤러 불러오기
// 실제 요청이 들어왔을 때 실행될 로직을 컨트롤러에서 꺼내옵니다.
// - signup: 클라이언트가 보낸 정보로 회원가입(DB 저장)을 처리하는 함수
// - login: 아이디/비번을 검증하고 성공 시 JWT 토큰(출입증)을 발급하는 함수
const { signup, login } = require("../controller/user.controller");

// API 라우트 정의
/**
 * @route   POST /signup
 * @desc    신규 유저 회원가입 요청을 처리합니다.
 * @access  Public (로그인하지 않은 누구나 접근 가능)
 */
router.post("/signup", signup)

/**
 * @route   POST /login
 * @desc    유저 로그인 요청을 처리하고 검증 성공 시 토큰(쿠키)을 발급합니다.
 * @access  Public (로그인하지 않은 누구나 접근 가능)
 */
router.post("/login", login)

// 모듈 내보내기
module.exports = router;