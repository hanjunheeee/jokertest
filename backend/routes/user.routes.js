const express = require("express");
const router  = express.Router();

const { getMyProfile,
        updateNickname,
        updatePassword } = require("../controller/profile.controller");
const { getMyRoleStatistics,
        getRoleRanking }  = require("../controller/roleStatistics.controller");
const { getMyAchievements } = require("../controller/achievement.controller");
const { verifyToken }    = require("../middleware/auth.middleware");

router.get("/me/profile",   verifyToken, getMyProfile);
router.patch("/me/nickname", verifyToken, updateNickname);
router.patch("/me/password", verifyToken, updatePassword);

// F-10: 직업 전적·랭킹(AC-01/AC-03). 다른 /me/* 경로와 같은 인증 경계 뒤에 둔다.
router.get("/me/role-statistics",   verifyToken, getMyRoleStatistics);
router.get("/role-statistics/ranking", verifyToken, getRoleRanking);

// F-12: 22개 업적 진행률·달성 상태(AC-01/AC-06). 같은 /me/* 인증 경계 뒤에 둔다.
router.get("/me/achievements", verifyToken, getMyAchievements);

module.exports = router;
