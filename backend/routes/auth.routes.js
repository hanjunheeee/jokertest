const express = require("express");
const router  = express.Router();

const {
    signup, login, me, logout, checkEmail, refresh,
    completeSocialSignup, getSocialSignupIntent, googleAuthStart, googleAuthCallback,
    discordAuthStart, discordAuthCallback,
    discordLinkStart, discordLinkCallback,
} = require("../controllers/auth");
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
const { getSignupEmailVerificationConfig } = require("../config/signupEmailVerification");
const { validateCodeRequest, validateCodeVerify } = require("../validations/auth/signupEmailVerification");
const {
    requestSignupCode, verifySignupCode,
} = require("../controllers/auth/signupEmailVerification");

router.post("/signup", signup);
router.get("/check-email", checkEmail);
router.post("/login", login);

const codeConfig = getSignupEmailVerificationConfig(process.env);

const {
    ipHour:    codeIpHourLimiter,
    ipDay:     codeIpDayLimiter,
    emailHour: codeEmailHourLimiter,
    emailDay:  codeEmailDayLimiter,
} = buildSignupCodeRateLimiters(codeConfig, createRateLimiter);

router.post(
    "/signup/email-code",
    codeIpHourLimiter,
    codeIpDayLimiter,
    validateCodeRequest,
    codeEmailHourLimiter,
    codeEmailDayLimiter,
    requestSignupCode,
);
router.post(
    "/signup/email-code/verify",
    validateCodeVerify(codeConfig.codeLength),
    verifySignupCode,
);

const {
    ip:     findIdIpLimiter,
    target: findIdTargetLimiter,
} = buildFindIdRateLimiters(process.env, createRateLimiter);

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

router.post(
    "/password-reset/request",
    resetRequestIpLimiter,
    validateResetRequest,
    resetEmailLimiter,
    requestPasswordReset,
);
router.get("/password-reset/verify", resetCheckIpLimiter, verifyPasswordReset);
router.post("/password-reset/confirm", resetCheckIpLimiter, confirmPasswordReset);

router.post("/refresh", refresh);

router.get("/me", verifyToken, me);
router.post("/logout", verifyToken, logout);

router.post("/social/signup/complete", completeSocialSignup);

router.post("/social/signup/intent", getSocialSignupIntent);

router.get("/google", googleAuthStart);
router.get("/google/callback", googleAuthCallback);
router.get("/discord", discordAuthStart);
router.get("/discord/callback", discordAuthCallback);

router.get("/discord/link", verifyToken, discordLinkStart);
router.get("/discord/link/callback", verifyToken, discordLinkCallback);

module.exports = router;
