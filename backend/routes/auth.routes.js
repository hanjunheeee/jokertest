const express = require("express");
const router  = express.Router();

const { signup, login, me, logout, checkEmail, refresh } = require("../controller/user.controller");
const { verifyToken }        = require("../middleware/auth.middleware");

router.post("/signup", signup);
router.get("/check-email", checkEmail);
router.post("/login", login);

// 액세스 토큰이 이미 만료된 상태에서 호출되는 경로이므로 verifyToken을 걸지 않는다 —
// 갱신 자격(refreshToken 쿠키) 자체의 유효성은 authService.refresh가 검증한다(F-03).
router.post("/refresh", refresh);

router.get("/me", verifyToken, me);
router.post("/logout", verifyToken, logout);

module.exports = router;
