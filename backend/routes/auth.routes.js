// 인증 경로 파일, /auth 아래 경로 + 검사·요청 수 제한 줄 세우기 (처리기는 controllers/auth)
// index.js가 /auth에 붙임, 요청 수 제한은 이 파일 불러올 때 한 번 만듦
const express = require("express");
const router  = express.Router();

const { signup, login, checkEmail } = require("../controllers/auth/account");
const { me, logout, refresh } = require("../controllers/auth/session");
const { completeSocialSignup, getSocialSignupIntent } = require("../controllers/auth/socialSignup");
const { googleAuthStart, googleAuthCallback } = require("../controllers/auth/google");
const { discordAuthStart, discordAuthCallback } = require("../controllers/auth/discord");
const { discordLinkStart, discordLinkCallback } = require("../controllers/auth/discordLink");
const { verifyToken }        = require("../middlewares/auth.middleware");
const { createRateLimiter }  = require("../middlewares/rateLimit.middleware");
const {
    buildSignupCodeRateLimiters, buildFindIdRateLimiters, buildPasswordResetRateLimiters,
} = require("../middlewares/authRateLimit.middleware");
const { validateFindIdRequest } = require("../validations/auth/findId");
const { findId }             = require("../controllers/auth/accountRecovery");
const { validateResetRequest } = require("../validations/auth/passwordReset");
const {
    requestPasswordReset, verifyPasswordReset, confirmPasswordReset,
} = require("../controllers/auth/passwordReset");
const { getSignupEmailConfig } = require("../config/signupEmailVerification");
const { validateCodeRequest, validateCodeVerify } = require("../validations/auth/signupEmailVerification");
const {
    requestSignupCode, verifySignupCode,
} = require("../controllers/auth/signupEmailVerification");

// 이메일·비번 가입, 이메일 중복 확인, 로그인 (로그인 전이라 verifyToken 없음)
router.post("/signup", signup);
router.get("/check-email", checkEmail);
router.post("/login", login);

// 가입 인증 설정(번호 자리 수·제한 횟수)은 불러올 때 env에서 한 번 읽음
const codeConfig = getSignupEmailConfig(process.env);

const {
    ipHour:    codeIpHourLimiter,
    ipDay:     codeIpDayLimiter,
    emailHour: codeEmailHourLimiter,
    emailDay:  codeEmailDayLimiter,
} = buildSignupCodeRateLimiters(codeConfig, createRateLimiter);

// 인증번호 요청: ip 제한 → 입력 검사 → 주소 제한 (주소 제한은 검사가 채운 값 읽어서 뒤에 둠)
router.post(
    "/signup/email-code",
    codeIpHourLimiter,
    codeIpDayLimiter,
    validateCodeRequest,
    codeEmailHourLimiter,
    codeEmailDayLimiter,
    requestSignupCode,
);
// 인증번호 확인: 틀린 횟수 제한은 서비스 몫이라 요청 수 제한 없음
router.post(
    "/signup/email-code/verify",
    validateCodeVerify(codeConfig.codeLength),
    verifySignupCode,
);

const {
    ip:     findIdIpLimiter,
    target: findIdTargetLimiter,
} = buildFindIdRateLimiters(process.env, createRateLimiter);

// 아이디 찾기: ip 제한 → 입력 검사 → 닉네임 제한 (닉네임 제한은 검사 값 읽음)
router.post(
    "/find-id",
    findIdIpLimiter,
    validateFindIdRequest,
    findIdTargetLimiter,
    findId,
);

const {
    requestIp:    resetRequestIpLimiter,
    requestEmail: resetEmailLimiter,
    checkIp:      resetCheckIpLimiter,
} = buildPasswordResetRateLimiters(process.env, createRateLimiter);

// 재설정 메일 요청: ip 제한 → 입력 검사 → 주소 제한
router.post(
    "/password-reset/request",
    resetRequestIpLimiter,
    validateResetRequest,
    resetEmailLimiter,
    requestPasswordReset,
);
// 링크 확인·새 비번 저장은 ip 제한 하나를 같이 씀 (토큰 맞히기 시도 막기)
router.get("/password-reset/verify", resetCheckIpLimiter, verifyPasswordReset);
router.post("/password-reset/confirm", resetCheckIpLimiter, confirmPasswordReset);

// refresh는 access 만료 뒤에 부르므로 verifyToken 안 붙임
router.post("/refresh", refresh);

router.get("/me", verifyToken, me);
router.post("/logout", verifyToken, logout);

// 소셜 가입 마무리·가입 의도 확인 (가입 전이라 시도 쿠키·의도 토큰으로 확인)
router.post("/social/signup/complete", completeSocialSignup);

router.post("/social/signup/intent", getSocialSignupIntent);

// 구글·디스코드 로그인 시작·콜백
router.get("/google", googleAuthStart);
router.get("/google/callback", googleAuthCallback);
router.get("/discord", discordAuthStart);
router.get("/discord/callback", discordAuthCallback);

// 디스코드 계정 연결은 로그인한 사람만 (콜백도 시작한 세션과 같은지 봄)
router.get("/discord/link", verifyToken, discordLinkStart);
router.get("/discord/link/callback", verifyToken, discordLinkCallback);

module.exports = router;
