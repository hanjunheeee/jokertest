// 소셜 가입 컨트롤러 파일, 소셜 가입 마무리 · 가입 의도 확인
// 시도 표의 rememberMe는 같은 가입 의도일 때만 믿음
const socialAuthService = require("../../services/auth/social");
const { getDeviceType } = require("../../utils/device");
const { getClientIp }   = require("../../utils/ip");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearRefreshCookie } = require("../../auth/cookieOptions");
const { verifyOAuthAttempt, OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions, SOCIAL_SIGNUP_INTENT_TTL_SECONDS } = require('./cookies');

// 가입 마무리 → 시도 쿠키 지움 → 세션 쿠키
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

// 이메일 인증 필요한지만 알려 줌 (캐시 금지)
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
