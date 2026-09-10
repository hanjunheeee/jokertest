const express = require("express");
const router  = express.Router();

const {
    signup, login, me, logout, checkEmail, refresh,
    completeSocialSignup, googleAuthStart, googleAuthCallback,
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

// F-06: Google 제공자 검증 어댑터(googleOAuth.service.js)가 완성되어, F-05가 남겨둔
// 계약(auth.routes.js 위쪽 주석 — "실제 제공자 검증 어댑터를 완성해 그 어댑터가 검증한
// 결과로만 이 함수들을 호출하는 라우트를 추가할 때까지")대로 로그인 시작·콜백 라우트를
// 추가한다. 둘 다 브라우저의 전체 페이지 이동(GET)으로 동작하는 표준 인가 코드 흐름이라
// verifyToken을 걸지 않는다 — 인증 자체가 이 왕복(state 발급 → Google 동의 → 콜백)의
// 결과물이다.
router.get("/google", googleAuthStart);
router.get("/google/callback", googleAuthCallback);

// F-05 AC-04/D-01 R-IMPL: 명시적 연결(link) 라우트는 여기서 등록하지 않는다. 인증된
// 사용자라도 요청 본문의 provider/subject/email은 클라이언트가 주장한 값일 뿐 서버가 검증한
// 적이 없다 — 공개 HTTP 경로로 노출하면 로그인한 사용자가 소유권 증명 없이 임의의 소셜
// identity를 자기 계정에 선점할 수 있다(운영자 코드 검토 R-IMPL). socialAuthService의
// issueOAuthState(purpose:"link")·linkExternalIdentity는 이미 서버가 OAuth 교환·검증을
// 마친 provider/subject만 입력으로 받는 내부 전용 계약으로 남겨두고(backend/tests/db/
// f05-social-auth.integration.test.js가 그 계약을 직접 검증한다), F-06/F-07이 실제 제공자
// 검증 어댑터를 완성해 그 어댑터가 검증한 결과로만 이 함수들을 호출하는 라우트를 추가할 때까지
// 공개 라우트는 닫아 둔다.

module.exports = router;
