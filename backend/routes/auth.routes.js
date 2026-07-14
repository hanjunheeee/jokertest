const express = require("express");
const router  = express.Router();

const { signup, login, me, logout } = require("../controller/user.controller");
const { verifyToken }        = require("../middleware/auth.middleware");

router.post("/signup", signup);
router.post("/login", login);

router.get("/me", verifyToken, me);
router.post("/logout", verifyToken, logout);

module.exports = router;
