const express = require("express");
const router  = express.Router();

const { signup, login, me, logout, checkEmail } = require("../controller/user.controller");
const { verifyToken }        = require("../middleware/auth.middleware");

router.post("/signup", signup);
router.get("/check-email", checkEmail);
router.post("/login", login);

router.get("/me", verifyToken, me);
router.post("/logout", verifyToken, logout);

module.exports = router;
