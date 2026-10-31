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

router.get("/me/role-statistics",   verifyToken, getMyRoleStatistics);
router.get("/role-statistics/ranking", verifyToken, getRoleRanking);

router.get("/me/achievements", verifyToken, getMyAchievements);

router.get("/me/emoji-palette", verifyToken, getEmojiPalette);
router.put("/me/emoji-palette", verifyToken, saveEmojiPalette);

module.exports = router;
