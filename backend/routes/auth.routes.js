/**
 * @file    auth.routes.js
 * @desc    인증(Authentication) 관련 API 라우터입니다.
 *          회원가입 · 로그인 · 세션 검증 · 로그아웃 엔드포인트를 정의합니다.
 *
 *  엔드포인트 목록
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  POST  /auth/signup   신규 회원가입                           │
 *  │  POST  /auth/login    로그인 → HttpOnly 쿠키 발급             │
 *  │  GET   /auth/me       현재 로그인 세션(쿠키) 유효성 검증       │
 *  │  POST  /auth/logout   HttpOnly 쿠키 제거                       │
 *  └──────────────────────────────────────────────────────────────┘
 */

const express = require("express");
const router  = express.Router();

const { signup, login, me, logout } = require("../controller/user.controller");
const { verifyToken }        = require("../middleware/auth.middleware");

// ──────────────────────────────────────────────
// 공개(Public) 엔드포인트 — 토큰 불필요
// ──────────────────────────────────────────────

/**
 * @route   POST /auth/signup
 * @desc    신규 유저 회원가입.
 *          이메일 중복 검사 → 비밀번호 해싱 → DB 저장 순으로 처리됩니다.
 * @access  Public
 * @body    { email, password, nickname }
 */
router.post("/signup", signup);

/**
 * @route   POST /auth/login
 * @desc    이메일 + 비밀번호로 로그인.
 *          계정 잠금 · 정지 여부 확인 후 성공 시 JWT를 HttpOnly 쿠키로 발급합니다.
 * @access  Public
 * @body    { email, password }
 */
router.post("/login", login);

// ──────────────────────────────────────────────
// 인증(Private) 엔드포인트 — 쿠키(JWT) 필요
// ──────────────────────────────────────────────

/**
 * @route   GET /auth/me
 * @desc    현재 쿠키에 담긴 JWT가 유효한지 백엔드에서 직접 검증합니다.
 *          프론트엔드에서 "이미 로그인 상태인데 쿠키가 살아있나?" 확인할 때 사용합니다.
 *          401 응답이 오면 프론트 apiClient가 Zustand 스토어를 초기화하고 로그인 페이지로 이동합니다.
 * @access  Private (verifyToken 통과 필요)
 * @returns { uuid, role }
 */
router.get("/me", verifyToken, me);

/**
 * @route   POST /auth/logout
 * @desc    현재 브라우저의 accessToken 쿠키를 제거합니다.
 * @access  Private (verifyToken 통과 필요)
 */
router.post("/logout", verifyToken, logout);

module.exports = router;
