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
