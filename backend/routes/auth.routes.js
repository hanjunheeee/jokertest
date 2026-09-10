const express = require("express");
const router  = express.Router();

const {
    signup, login, me, logout, checkEmail, refresh,
    completeSocialSignup, issueSocialLinkState, linkSocialIdentity,
} = require("../controller/user.controller");
const { verifyToken }        = require("../middleware/auth.middleware");

router.post("/signup", signup);
router.get("/check-email", checkEmail);
router.post("/login", login);

// 액세스 토큰이 이미 만료된 상태에서 호출되는 경로이므로 verifyToken을 걸지 않는다 —
// 갱신 자격(refreshToken 쿠키) 자체의 유효성은 authService.refresh가 검증한다(F-03).
router.post("/refresh", refresh);

router.get("/me", verifyToken, me);
router.post("/logout", verifyToken, logout);

// F-05: 소셜 로그인 최초 인증 이후 가입을 완료한다. 아직 계정이 없으므로 verifyToken을
// 걸지 않는다 — 인증은 intentToken(socialAuth.service.js가 발급) 자체가 대신한다.
router.post("/social/signup/complete", completeSocialSignup);

// F-05 AC-04/D-01: 로그인 중인 사용자만 명시적 연결을 시작·완료할 수 있다.
router.post("/social/link/state", verifyToken, issueSocialLinkState);
router.post("/social/link", verifyToken, linkSocialIdentity);

module.exports = router;
