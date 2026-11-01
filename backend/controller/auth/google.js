// 구글 로그인 컨트롤러 파일, 시작 · 콜백
// 콜백 오류는 로그인 화면으로 code만 붙여 돌려보냄
const crypto            = require("crypto");
const socialAuthService = require("../../services/auth/social");
const googleOAuthService = require("../../services/auth/oauth/google");
const { getDeviceType } = require("../../utils/device");
const { getClientIp }   = require("../../utils/ip");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearRefreshCookie } = require("../../auth/cookieOptions");
const { signOAuthAttempt, OAUTH_ATTEMPT_TTL_SECONDS, OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions, verifyOAuthAttempt, SOCIAL_SIGNUP_INTENT_TTL_SECONDS } = require('./cookies');

// state 발급 → 시도 쿠키 → 인가 주소로
exports.googleAuthStart = async (req, res, next) => {
    try {
        const rememberMe = req.query.rememberMe === "true";
        const browserFingerprint = crypto.randomBytes(32).toString("base64url");

        const { state } = await socialAuthService.issueOAuthState({ purpose: "login", browserFingerprint });

        const attemptToken = signOAuthAttempt(
            { fp: browserFingerprint, rememberMe, purpose: "login", provider: "google" },
            OAUTH_ATTEMPT_TTL_SECONDS,
        );
        res.cookie(OAUTH_ATTEMPT_COOKIE, attemptToken, oauthAttemptCookieOptions(OAUTH_ATTEMPT_TTL_SECONDS));

        res.redirect(googleOAuthService.buildAuthorizationUrl(state));
    } catch (error) {
        next(error);
    }
};

// 시도 쿠키 읽고 지움 → state 소비 → 프로필 → 로그인 또는 가입 의도
exports.googleAuthCallback = async (req, res, next) => {
    const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
    res.clearCookie(OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions(OAUTH_ATTEMPT_TTL_SECONDS));

    const frontendBase = process.env.FRONTEND_URL;
    const redirectWithError = (code) => res.redirect(`${frontendBase}/login?socialError=${encodeURIComponent(code)}`);

    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const browserFingerprint = attempt?.purpose === "login" && attempt?.provider === "google" ? attempt.fp : undefined;
        const rememberMe = attempt?.purpose === "login" && attempt?.provider === "google" && attempt?.rememberMe === true;

        await socialAuthService.consumeOAuthState(req.query.state, { browserFingerprint, purpose: "login" });

        const cancelled = req.query.error !== undefined;
        let subject = null;
        let email = null;
        if (!cancelled) {
            const profile = await googleOAuthService.exchangeCodeForProfile(req.query.code);
            subject = profile.subject;
            email = profile.email;
        }

        const result = await socialAuthService.resolveOAuthAccount({
            provider: "google", subject, email, cancelled, rememberMe, reqInfo,
        });

        if (result.status === "SIGNUP_REQUIRED") {
            const intentAttemptToken = signOAuthAttempt(
                { intentToken: result.intentToken, rememberMe, purpose: "signup", provider: "google" },
                SOCIAL_SIGNUP_INTENT_TTL_SECONDS,
            );
            res.cookie(OAUTH_ATTEMPT_COOKIE, intentAttemptToken, oauthAttemptCookieOptions(SOCIAL_SIGNUP_INTENT_TTL_SECONDS));
            return res.redirect(`${frontendBase}/login?socialIntent=${encodeURIComponent(result.intentToken)}`);
        }

        res.cookie("accessToken", result.token, buildSessionCookieOptions(rememberMe, result.refreshTokenExpiresAt));
        if (result.refreshToken) {
            res.cookie("refreshToken", result.refreshToken, buildRefreshCookieOptions(result.refreshTokenExpiresAt));
        } else {
            clearRefreshCookie(res);
        }

        return res.redirect(`${frontendBase}/lobby`);
    } catch (error) {
        if (!error?.code) {
            console.error('\x1b[31m%s\x1b[0m', error?.stack || error);
        }
        return redirectWithError(error?.code || "OAUTH_FAILED");
    }
};
