/**
 * @file    user.routes.js
 * @desc    유저 프로필 · 계정 관리 API 라우터
 *
 *  엔드포인트 목록
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  GET   /user/me/profile   내 프로필 + 게임 통계 조회          │
 *  │  PATCH /user/me/nickname  닉네임 변경                         │
 *  │  PATCH /user/me/password  비밀번호 변경                       │
 *  └──────────────────────────────────────────────────────────────┘
 */

const express = require("express");
const router  = express.Router();

const { getMyProfile,
        updateNickname,
        updatePassword } = require("../controller/profile.controller");
const { verifyToken }    = require("../middleware/auth.middleware");

/**
 * @route   GET /user/me/profile
 * @desc    닉네임, 프로필 이미지, 평판/칭호/전적 등 게임 통계를 한 번에 조회합니다.
 * @access  Private (verifyToken 통과 필요)
 * @returns { nickname, profile_image_url, reputation, title, total_games, survival_count, execution_count, most_played_role }
 */
router.get("/me/profile",   verifyToken, getMyProfile);

/**
 * @route   PATCH /user/me/nickname
 * @desc    로그인한 유저의 닉네임을 변경합니다.
 * @access  Private (verifyToken 통과 필요)
 * @body    { nickname: string }
 */
router.patch("/me/nickname", verifyToken, updateNickname);

/**
 * @route   PATCH /user/me/password
 * @desc    현재 비밀번호를 확인한 후 새 비밀번호로 변경합니다.
 * @access  Private (verifyToken 통과 필요)
 * @body    { currentPassword: string, newPassword: string }
 */
router.patch("/me/password", verifyToken, updatePassword);

module.exports = router;
