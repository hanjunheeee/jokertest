const express = require("express");
const router  = express.Router();

const { getMyProfile,
        updateNickname,
        updatePassword } = require("../controller/profile.controller");
const { getMyRoleStatistics,
        getRoleRanking }  = require("../controller/roleStatistics.controller");
const { getMyAchievements } = require("../controller/achievement.controller");
const { getEmojiPalette,
        saveEmojiPalette }  = require("../controller/emojiPalette.controller");
const { verifyToken }    = require("../middleware/auth.middleware");

router.get("/me/profile",   verifyToken, getMyProfile);
router.patch("/me/nickname", verifyToken, updateNickname);
router.patch("/me/password", verifyToken, updatePassword);

// F-10: 직업 전적·랭킹(AC-01/AC-03). 다른 /me/* 경로와 같은 인증 경계 뒤에 둔다.
router.get("/me/role-statistics",   verifyToken, getMyRoleStatistics);
router.get("/role-statistics/ranking", verifyToken, getRoleRanking);

// F-12: 22개 업적 진행률·달성 상태(AC-01/AC-06). 같은 /me/* 인증 경계 뒤에 둔다.
router.get("/me/achievements", verifyToken, getMyAchievements);

// F-33 E-2: 이모티콘 팔레트 8칸 조회·저장(설계도 §2-2). 다른 /me/* 경로와 같은 인증 경계
// 뒤에 두고, 대상 계정은 verifyToken이 채운 req.user.uuid로만 정해진다 — 요청이 다른
// 계정을 지정할 방법이 없다(AC-07).
router.get("/me/emoji-palette", verifyToken, getEmojiPalette);
router.put("/me/emoji-palette", verifyToken, saveEmojiPalette);

module.exports = router;
