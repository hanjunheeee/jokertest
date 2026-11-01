// 내 정보 경로 파일, /user 아래 프로필·닉네임·비번 · 직업 통계·순위 · 업적 · 이모티콘 팔레트
// index.js가 /user에 붙임, 전부 로그인 필요 (처리기는 controllers 여러 파일)
const express = require("express");
const router  = express.Router();

const { getMyProfile,
        updateNickname,
        updatePassword } = require("../controllers/profile.controller");
const { getMyRoleStatistics,
        getRoleRanking }  = require("../controllers/game/roleStatistics");
const { getMyAchievements } = require("../controllers/achievement.controller");
const { getEmojiPalette,
        saveEmojiPalette }  = require("../controllers/economy/emojiPalette");
const { verifyToken }    = require("../middlewares/auth.middleware");

router.get("/me/profile",   verifyToken, getMyProfile);
router.patch("/me/nickname", verifyToken, updateNickname);
router.patch("/me/password", verifyToken, updatePassword);

// 순위는 남의 기록까지 보여서 /me 밖
router.get("/me/role-statistics",   verifyToken, getMyRoleStatistics);
router.get("/role-statistics/ranking", verifyToken, getRoleRanking);

router.get("/me/achievements", verifyToken, getMyAchievements);

// 이모티콘 팔레트 처리기는 경제 서비스를 써서 controllers/economy 안에 있음
router.get("/me/emoji-palette", verifyToken, getEmojiPalette);
router.put("/me/emoji-palette", verifyToken, saveEmojiPalette);

module.exports = router;
