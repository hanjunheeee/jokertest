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
const { validatePasswordResetRequest } = require("../validations/auth/passwordReset");
const {
    requestPasswordReset, verifyPasswordReset, confirmPasswordReset,
} = require("../controllers/auth/passwordReset");
const { getSignupEmailVerificationConfig } = require("../config/signupEmailVerification");
const { validateSignupCodeRequest, validateSignupCodeVerify } = require("../validations/auth/signupEmailVerification");
const {
    requestSignupCode, verifySignupCode,
} = require("../controllers/auth/signupEmailVerification");

router.post("/signup", signup);
router.get("/check-email", checkEmail);
router.post("/login", login);

const signupEmailVerificationConfig = getSignupEmailVerificationConfig(process.env);

const signupCodeIpHourRateLimiter = createRateLimiter({
    windowMs: signupEmailVerificationConfig.ipHourWindowMs,
    max:      signupEmailVerificationConfig.ipHourMax,
    keyOf:    (req) => `ip-hour:${req.ip}`,
});
const signupCodeIpDayRateLimiter = createRateLimiter({
    windowMs: signupEmailVerificationConfig.ipDayWindowMs,
    max:      signupEmailVerificationConfig.ipDayMax,
    keyOf:    (req) => `ip-day:${req.ip}`,
});
const signupCodeEmailHourRateLimiter = createRateLimiter({
    windowMs: signupEmailVerificationConfig.emailHourWindowMs,
    max:      signupEmailVerificationConfig.emailHourMax,
    keyOf:    (req, res) => `email-hour:${crypto.createHash("sha256").update(res.locals.signupEmailCodeInput.email).digest("hex")}`,
});
const signupCodeEmailDayRateLimiter = createRateLimiter({
    windowMs: signupEmailVerificationConfig.emailDayWindowMs,
    max:      signupEmailVerificationConfig.emailDayMax,
    keyOf:    (req, res) => `email-day:${crypto.createHash("sha256").update(res.locals.signupEmailCodeInput.email).digest("hex")}`,
});

router.post(
    "/signup/email-code",
    signupCodeIpHourRateLimiter,
    signupCodeIpDayRateLimiter,
    validateSignupCodeRequest,
    signupCodeEmailHourRateLimiter,
    signupCodeEmailDayRateLimiter,
    requestSignupCode,
);
router.post(
    "/signup/email-code/verify",
    validateSignupCodeVerify(signupEmailVerificationConfig.codeLength),
    verifySignupCode,
);

const toPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

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

const passwordResetRequestIpRateLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.PASSWORD_RESET_REQUEST_WINDOW_MS, 60 * 60 * 1000),
    max:      toPositiveInt(process.env.PASSWORD_RESET_REQUEST_IP_MAX, 10),
    keyOf:    (req) => `ip:${req.ip}`,
});

const passwordResetRequestEmailRateLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.PASSWORD_RESET_REQUEST_WINDOW_MS, 60 * 60 * 1000),
    max:      toPositiveInt(process.env.PASSWORD_RESET_REQUEST_EMAIL_MAX, 3),
    keyOf:    (req, res) => `email:${crypto.createHash("sha256")
        .update(res.locals.passwordResetInput.email.trim().toLowerCase())
        .digest("hex")}`,
});

const passwordResetCheckIpRateLimiter = createRateLimiter({
    windowMs: toPositiveInt(process.env.PASSWORD_RESET_CHECK_WINDOW_MS, 10 * 60 * 1000),
    max:      toPositiveInt(process.env.PASSWORD_RESET_CHECK_IP_MAX, 20),
    keyOf:    (req) => `ip:${req.ip}`,
});

router.post(
    "/password-reset/request",
    passwordResetRequestIpRateLimiter,
    validatePasswordResetRequest,
    passwordResetRequestEmailRateLimiter,
    requestPasswordReset,
);
router.get("/password-reset/verify", passwordResetCheckIpRateLimiter, verifyPasswordReset);
router.post("/password-reset/confirm", passwordResetCheckIpRateLimiter, confirmPasswordReset);

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
