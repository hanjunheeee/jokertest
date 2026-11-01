const crypto            = require("crypto");
const jwt                = require("jsonwebtoken");
const authService       = require("../services/auth/account");
const socialAuthService = require("../services/auth/social");
const googleOAuthService = require("../services/auth/oauth/google");
const discordOAuthService = require("../services/auth/oauth/discord");
const userRepository    = require("../repositories/user.repositories");
const { getDeviceType } = require("../utils/device");
const { getClientIp }   = require("../utils/ip");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearSessionCookie, clearRefreshCookie } = require("../auth/cookieOptions");

const OAUTH_ATTEMPT_COOKIE = "oauthAttempt";
const OAUTH_ATTEMPT_TTL_SECONDS = 10 * 60;
const SOCIAL_SIGNUP_INTENT_TTL_SECONDS = 30 * 60;

const oauthAttemptCookieOptions = (maxAgeSeconds) => ({
    httpOnly: true,
    sameSite: "Lax",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   maxAgeSeconds * 1000,
});

const signOAuthAttempt = (payload, ttlSeconds) =>
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ttlSeconds });

const verifyOAuthAttempt = (token) => {
    if (typeof token !== "string" || !token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
};

exports.signup = async (req, res, next) => {
    try {
        await authService.signup(req.body);
        res.status(200).json({ success: true, message: "회원가입이 완료되었습니다." });
    } catch (error) {
        next(error);
    }
};

exports.checkEmail = async (req, res, next) => {
    try {
        const result = await authService.checkEmailAvailability(req.query.email);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { user, token, refreshToken, refreshTokenExpiresAt } = await authService.login(req.body, reqInfo);

        res.cookie("accessToken", token, buildSessionCookieOptions(req.body?.rememberMe, refreshTokenExpiresAt));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        } else {
            clearRefreshCookie(res);
        }

        res.status(200).json({
            success: true,
            data: {
                user: {
                    uuid:     user.uuid,
                    nickname: user.nickname,
                    role:     user.role,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.me = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            data: {
                uuid: req.user.uuid,
                role: req.user.role,
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.logout = async (req, res, next) => {
    try {
        await userRepository.recordLogout(req.user.uuid, req.user.sessionId);
        clearSessionCookie(res);
        res.status(200).json({ success: true, message: "성공적으로 로그아웃 되었습니다." });
    } catch (error) {
        next(error);
    }
};

exports.completeSocialSignup = async (req, res, next) => {
    try {
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { intentToken, nickname, birthDate, email, signupProof } = req.body ?? {};

        const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
        const rememberMe = attempt?.purpose === "signup"
            && attempt?.intentToken === intentToken
            && attempt?.rememberMe === true;

        const { user, token, refreshToken, refreshTokenExpiresAt } = await socialAuthService.completeSocialSignup({
            intentToken, nickname, birthDate, email, signupProof, rememberMe, reqInfo,
        });

        res.clearCookie(OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions(SOCIAL_SIGNUP_INTENT_TTL_SECONDS));

        res.cookie("accessToken", token, buildSessionCookieOptions(rememberMe, refreshTokenExpiresAt));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        } else {
            clearRefreshCookie(res);
        }

        res.status(200).json({
            success: true,
            data: {
                user: {
                    uuid:     user.uuid,
                    nickname: user.nickname,
                    role:     user.role,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.getSocialSignupIntent = async (req, res, next) => {
    try {
        const { intentToken } = req.body ?? {};

        const { emailVerificationRequired } = await socialAuthService.getSocialSignupIntent({ intentToken });

        res.set("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { emailVerificationRequired } });
    } catch (error) {
        next(error);
    }
};

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

exports.discordAuthStart = async (req, res, next) => {
    try {
        const rememberMe = req.query.rememberMe === "true";
        const browserFingerprint = crypto.randomBytes(32).toString("base64url");

        const { state } = await socialAuthService.issueOAuthState({ purpose: "login", browserFingerprint });

        const attemptToken = signOAuthAttempt(
            { fp: browserFingerprint, rememberMe, purpose: "login", provider: "discord" },
            OAUTH_ATTEMPT_TTL_SECONDS,
        );
        res.cookie(OAUTH_ATTEMPT_COOKIE, attemptToken, oauthAttemptCookieOptions(OAUTH_ATTEMPT_TTL_SECONDS));

        res.redirect(discordOAuthService.buildAuthorizationUrl(state));
    } catch (error) {
        next(error);
    }
};

exports.discordAuthCallback = async (req, res, next) => {
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

        const browserFingerprint = attempt?.purpose === "login" && attempt?.provider === "discord" ? attempt.fp : undefined;
        const rememberMe = attempt?.purpose === "login" && attempt?.provider === "discord" && attempt?.rememberMe === true;

        await socialAuthService.consumeOAuthState(req.query.state, { browserFingerprint, purpose: "login" });

        const cancelled = req.query.error !== undefined;
        let subject = null;
        let email = null;
        if (!cancelled) {
            const profile = await discordOAuthService.exchangeCodeForProfile(req.query.code);
            subject = profile.subject;
            email = profile.email;
        }

        const result = await socialAuthService.resolveOAuthAccount({
            provider: "discord", subject, email, cancelled, rememberMe, reqInfo,
        });

        if (result.status === "SIGNUP_REQUIRED") {
            const intentAttemptToken = signOAuthAttempt(
                { intentToken: result.intentToken, rememberMe, purpose: "signup", provider: "discord" },
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

exports.discordLinkStart = async (req, res, next) => {
    try {
        const browserFingerprint = crypto.randomBytes(32).toString("base64url");

        const { state } = await socialAuthService.issueOAuthState({
            purpose: "link", userId: req.user.uuid, sessionId: req.user.sessionId, browserFingerprint,
        });

        const attemptToken = signOAuthAttempt(
            { fp: browserFingerprint, purpose: "link", provider: "discord" },
            OAUTH_ATTEMPT_TTL_SECONDS,
        );
        res.cookie(OAUTH_ATTEMPT_COOKIE, attemptToken, oauthAttemptCookieOptions(OAUTH_ATTEMPT_TTL_SECONDS));

        res.redirect(discordOAuthService.buildAuthorizationUrl(state, { purpose: "link" }));
    } catch (error) {
        next(error);
    }
};

exports.discordLinkCallback = async (req, res, next) => {
    const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
    res.clearCookie(OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions(OAUTH_ATTEMPT_TTL_SECONDS));

    const frontendBase = process.env.FRONTEND_URL;
    const redirectWithError = (code) => res.redirect(`${frontendBase}/account?socialLinkError=${encodeURIComponent(code)}`);

    try {
        const browserFingerprint = attempt?.purpose === "link" && attempt?.provider === "discord" ? attempt.fp : undefined;
        const rawState = req.query.state;

        const consumed = await socialAuthService.consumeOAuthState(rawState, { browserFingerprint, purpose: "link" });

        if (consumed.userId !== req.user.uuid || consumed.sessionId !== req.user.sessionId) {
            const error = new Error("연결 요청 세션과 state 발급 세션이 일치하지 않습니다.");
            error.status = 400; error.code = "STATE_USER_MISMATCH";
            throw error;
        }

        if (req.query.error !== undefined) {
            const error = new Error("사용자가 계정 연결을 취소했습니다.");
            error.status = 400; error.code = "OAUTH_CANCELLED";
            throw error;
        }

        const profile = await discordOAuthService.exchangeCodeForProfile(req.query.code, { purpose: "link" });

        await socialAuthService.linkExternalIdentityForValidatedSession({
            userId: req.user.uuid,
            sessionId: req.user.sessionId,
            provider: "discord",
            subject: profile.subject,
            email: profile.email,
        });

        return res.redirect(`${frontendBase}/account?socialLinkSuccess=discord`);
    } catch (error) {
        if (!error?.code) {
            console.error('\x1b[31m%s\x1b[0m', error?.stack || error);
        }
        return redirectWithError(error?.code || "OAUTH_FAILED");
    }
};

exports.refresh = async (req, res, next) => {
    try {
        const { accessToken, refreshToken, refreshTokenExpiresAt } = await authService.refresh(req.cookies.refreshToken);

        res.cookie("accessToken", accessToken, buildSessionCookieOptions(true, refreshTokenExpiresAt));
        if (refreshToken) {
            res.cookie("refreshToken", refreshToken, buildRefreshCookieOptions(refreshTokenExpiresAt));
        }

        res.status(200).json({ success: true });
    } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
            clearSessionCookie(res);
        }
        next(error);
    }
};
