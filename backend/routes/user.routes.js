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

router.get("/me/profile",   verifyToken, getMyProfile);
router.patch("/me/nickname", verifyToken, updateNickname);
router.patch("/me/password", verifyToken, updatePassword);

module.exports = router;
