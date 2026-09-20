const express = require("express");
const router  = express.Router();

const {
    signup, login, me, logout, checkEmail, refresh,
    completeSocialSignup, googleAuthStart, googleAuthCallback,
    discordAuthStart, discordAuthCallback,
    discordLinkStart, discordLinkCallback,
} = require("../controller/user.controller");
const { verifyToken }        = require("../middleware/auth.middleware");
const crypto                 = require("crypto");
const { createRateLimiter }  = require("../middleware/rateLimit");
const { validateFindIdRequest } = require("../validation/findIdValidation");
const { findId }             = require("../controller/accountRecovery.controller");

router.post("/signup", signup);
router.get("/check-email", checkEmail);
router.post("/login", login);

// F-29a(AC-05): 아이디 찾기 요청 빈도 제한. 라우터 구성 시 한 번만 생성해 요청마다
// 카운터가 초기화되지 않게 한다. IP 제한은 검증 실패도 포함해 이 경로에 들어온 모든 요청을
// 세고(먼저 연결), 대상(닉네임) 제한은 검증을 통과한 요청만 정규화된 닉네임의 SHA-256으로
// 센다(뒤에 연결) — 생년월일은 키에 섞지 않아 날짜만 바꿔 대상 제한을 우회할 수 없다.
// 환경변수가 없거나 잘못되면(Number가 NaN 등) 조용히 제한 해제로 떨어지지 않도록, createRateLimiter가
// 유효하지 않은 설정에서 즉시 예외를 던진다 — 그래서 아래는 항상 유효한 숫자로 기본값을 먼저 계산한다.
const toPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// req.ip를 쓴다 — backend/index.js:51의 `app.set("trust proxy", 1)`이 신뢰 경계 안에서
// Express가 계산한 값이다. utils/ip.js의 getClientIp는 신뢰 경계와 무관하게
// X-Forwarded-For 첫 값을 그대로 채택해, 클라이언트가 그 헤더를 바꾸는 것만으로 이 IP
// 제한을 우회할 수 있었다(getClientIp 자체는 accountRecovery.controller.js가 로그 저장용
// IP 문자열을 만드는 데 그대로 쓰므로 건드리지 않는다).
const findIdIpRateLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.FIND_ID_WINDOW_MS, 600000),
    max:      toPositiveInt(process.env.FIND_ID_IP_MAX, 10),
    keyOf:    (req) => `ip:${req.ip}`,
});

const findIdTargetRateLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.FIND_ID_WINDOW_MS, 600000),
    max:      toPositiveInt(process.env.FIND_ID_TARGET_MAX, 5),
    keyOf:    (req, res) => `target:${crypto.createHash("sha256").update(res.locals.findIdInput.nickname).digest("hex")}`,
});

router.post(
    "/find-id",
    findIdIpRateLimiter,
    validateFindIdRequest,
    findIdTargetRateLimiter,
    findId,
);

// 액세스 토큰이 이미 만료된 상태에서 호출되는 경로이므로 verifyToken을 걸지 않는다 —
// 갱신 자격(refreshToken 쿠키) 자체의 유효성은 authService.refresh가 검증한다(F-03).
router.post("/refresh", refresh);

router.get("/me", verifyToken, me);
router.post("/logout", verifyToken, logout);

// F-05: 소셜 로그인 최초 인증 이후 가입을 완료한다. 아직 계정이 없으므로 verifyToken을
// 걸지 않는다 — 인증은 intentToken(socialAuth.service.js가 발급) 자체가 대신한다.
router.post("/social/signup/complete", completeSocialSignup);

// F-06/F-07: Google·Discord 제공자 검증 어댑터(googleOAuth.service.js/discordOAuth.service.js)가
// 완성되어, F-05가 남겨둔 계약(auth.routes.js 위쪽 주석 — "실제 제공자 검증 어댑터를 완성해
// 그 어댑터가 검증한 결과로만 이 함수들을 호출하는 라우트를 추가할 때까지")대로 로그인
// 시작·콜백 라우트를 추가한다. 모두 브라우저의 전체 페이지 이동(GET)으로 동작하는 표준
// 인가 코드 흐름이라 verifyToken을 걸지 않는다 — 인증 자체가 이 왕복(state 발급 → 제공자
// 동의 → 콜백)의 결과물이다. 두 제공자의 state는 같은 socialAuth.service.js state 저장소를
// 공유하지만, user.controller.js가 서명하는 oauthAttempt 쿠키에 provider를 함께 묶어 한
// 제공자로 시작한 시도의 쿠키를 다른 제공자의 콜백이 받아들이지 않게 한다(user.controller.js
// signOAuthAttempt 주석 참고).
router.get("/google", googleAuthStart);
router.get("/google/callback", googleAuthCallback);
router.get("/discord", discordAuthStart);
router.get("/discord/callback", discordAuthCallback);

// F-07 AC-04/D-01: 명시적 연결(link) — 로그인한 사용자가 Discord 계정을 자기 계정에 연결한다.
// F-05는 이 라우트를 의도적으로 열지 않았다(운영자 코드 검토 R-IMPL) — 공개 HTTP 경로로
// provider/subject/email을 client가 직접 주장하게 두면(이전에 있었던 POST /auth/social/link·
// /auth/social/link/state가 그 패턴이었다 — backend/__tests__/socialAuth.route.test.js가 그
// 두 라우트의 부재를 회귀로 고정한다), 로그인한 사용자가 소유권 증명 없이 임의의 소셜
// identity를 자기 계정에 선점할 수 있다. 이제 discordOAuth.service.js(F-07)가 실제 제공자
// 검증 어댑터를 완성했으므로, 그 어댑터가 검증한 subject/email만 쓰는 이 라우트를 연다 —
// verifyToken으로 보호되고, 클라이언트는 code 외에 다른 신원 파라미터를 아예 보내지 않는다
// (user.controller.js discordLinkStart/discordLinkCallback 참고). Google(F-06)의 동등한 링크
// 라우트는 이 슬라이스(F-07) 범위 밖이라 추가하지 않는다.
router.get("/discord/link", verifyToken, discordLinkStart);
router.get("/discord/link/callback", verifyToken, discordLinkCallback);

module.exports = router;
