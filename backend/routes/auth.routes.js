const express = require("express");
const router  = express.Router();

const {
    signup, login, me, logout, checkEmail, refresh,
    completeSocialSignup, getSocialSignupIntent, googleAuthStart, googleAuthCallback,
    discordAuthStart, discordAuthCallback,
    discordLinkStart, discordLinkCallback,
} = require("../controllers/auth");
const { verifyToken }        = require("../middlewares/auth.middleware");
const crypto                 = require("crypto");
const { createRateLimiter }  = require("../middlewares/rateLimit.middleware");
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

const codeIpHourLimiter = createRateLimiter({
    windowMs: codeConfig.ipHourWindowMs,
    max:      codeConfig.ipHourMax,
    keyOf:    (req) => `ip-hour:${req.ip}`,
});
const codeIpDayLimiter = createRateLimiter({
    windowMs: codeConfig.ipDayWindowMs,
    max:      codeConfig.ipDayMax,
    keyOf:    (req) => `ip-day:${req.ip}`,
});
const codeEmailHourLimiter = createRateLimiter({
    windowMs: codeConfig.emailHourWindowMs,
    max:      codeConfig.emailHourMax,
    keyOf:    (req, res) => `email-hour:${crypto.createHash("sha256").update(res.locals.signupEmailCodeInput.email).digest("hex")}`,
});
const codeEmailDayLimiter = createRateLimiter({
    windowMs: codeConfig.emailDayWindowMs,
    max:      codeConfig.emailDayMax,
    keyOf:    (req, res) => `email-day:${crypto.createHash("sha256").update(res.locals.signupEmailCodeInput.email).digest("hex")}`,
});

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

const toPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const findIdIpLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.FIND_ID_WINDOW_MS, 600000),
    max:      toPositiveInt(process.env.FIND_ID_IP_MAX, 10),
    keyOf:    (req) => `ip:${req.ip}`,
});

const findIdTargetLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.FIND_ID_WINDOW_MS, 600000),
    max:      toPositiveInt(process.env.FIND_ID_TARGET_MAX, 5),
    keyOf:    (req, res) => `target:${crypto.createHash("sha256").update(res.locals.findIdInput.nickname).digest("hex")}`,
});

router.post(
    "/find-id",
    findIdIpLimiter,
    validateFindIdRequest,
    findIdTargetLimiter,
    findId,
);

const resetRequestIpLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.PASSWORD_RESET_REQUEST_WINDOW_MS, 60 * 60 * 1000),
    max:      toPositiveInt(process.env.PASSWORD_RESET_REQUEST_IP_MAX, 10),
    keyOf:    (req) => `ip:${req.ip}`,
});

const resetEmailLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.PASSWORD_RESET_REQUEST_WINDOW_MS, 60 * 60 * 1000),
    max:      toPositiveInt(process.env.PASSWORD_RESET_REQUEST_EMAIL_MAX, 3),
    keyOf:    (req, res) => `email:${crypto.createHash("sha256")
        .update(res.locals.passwordResetInput.email.trim().toLowerCase())
        .digest("hex")}`,
});

const resetCheckIpLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.PASSWORD_RESET_CHECK_WINDOW_MS, 10 * 60 * 1000),
    max:      toPositiveInt(process.env.PASSWORD_RESET_CHECK_IP_MAX, 20),
    keyOf:    (req) => `ip:${req.ip}`,
});

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
