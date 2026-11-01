const express = require("express");
const router  = express.Router();

const { getMyProfile,
        updateNickname,
        updatePassword } = require("../controllers/profile.controller");
const { getMyRoleStatistics,
        getRoleRanking }  = require("../controllers/game/roleStatistics");
const { getMyAchievements } = require("../controllers/achievement.controller");
const { getEmojiPalette,
        saveEmojiPalette }  = require("../controllers/emojiPalette.controller");
const { verifyToken }    = require("../middlewares/auth.middleware");

router.get("/me/profile",   verifyToken, getMyProfile);
router.patch("/me/nickname", verifyToken, updateNickname);
router.patch("/me/password", verifyToken, updatePassword);

router.get("/me/role-statistics",   verifyToken, getMyRoleStatistics);
router.get("/role-statistics/ranking", verifyToken, getRoleRanking);

router.get("/me/achievements", verifyToken, getMyAchievements);

router.get("/me/emoji-palette", verifyToken, getEmojiPalette);
router.put("/me/emoji-palette", verifyToken, saveEmojiPalette);

module.exports = router;
