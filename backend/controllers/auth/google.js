// 구글 로그인 컨트롤러 파일, 시작 · 콜백 (디스코드 discord.js와 같은 흐름)
// routes/auth.routes.js가 부름, 콜백 오류는 로그인 화면에 code만 붙여 돌려보냄
const socialAuthService = require("../../services/auth/social");
const googleOAuthService = require("../../services/auth/oauth/google");
const { getDeviceType, getClientIp } = require("../../utils/request");
const { buildSessionCookieOptions, buildRefreshCookieOptions, clearRefreshCookie } = require("../../utils/auth/cookieOptions");
const { OAUTH_ATTEMPT_COOKIE, attemptCookieOptions } = require('./cookies');
const { verifyOAuthAttempt, ATTEMPT_TTL_SECONDS, INTENT_TTL_SECONDS } = require("../../services/auth/social");

// state 발급 → 시도 쿠키(브라우저 지문·로그인 유지) → 구글 인가 주소로
exports.googleAuthStart = async (req, res, next) => {
    try {
        const rememberMe = req.query.rememberMe === "true";
        const { state, attemptToken } = await socialAuthService.startGoogleLogin({
            rememberMe, client: socialAuthService.parseClient(req.query.client),
        });
        res.cookie(OAUTH_ATTEMPT_COOKIE, attemptToken, attemptCookieOptions(ATTEMPT_TTL_SECONDS));

        res.redirect(googleOAuthService.buildAuthorizationUrl(state));
    } catch (error) {
        next(error);
    }
};

// 시도 쿠키 읽고 지움 → state 소비 → 프로필 → 로그인 또는 가입 의도
exports.googleAuthCallback = async (req, res, next) => {
    // 시도 쿠키는 이 콜백에서만 쓰고 바로 지움 (성공·실패 상관없이)
    const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
    res.clearCookie(OAUTH_ATTEMPT_COOKIE, attemptCookieOptions(ATTEMPT_TTL_SECONDS));

    // 모바일에서 시작한 시도 표만 모바일 주소로 (시도 표는 서명돼서 못 바꿔치기)
    const frontendBase = socialAuthService.resolveFrontendBase(attempt?.client);
    const redirectWithError = (code) => res.redirect(`${frontendBase}/login?socialError=${encodeURIComponent(code)}`);

    try {
        // 세션 행에 넣을 ip·기기 정보
        const userAgent = req.headers["user-agent"];
        const reqInfo = {
            ip:         getClientIp(req),
            userAgent:  userAgent,
            deviceType: getDeviceType(userAgent),
        };

        const { result, rememberMe, intentAttemptToken } = await socialAuthService.completeGoogleLogin({
            attempt, query: req.query, reqInfo,
        });

        // 가입 안 된 계정이면 가입 시도 쿠키 새로 넣고 소셜 가입 칸으로
        if (result.status === "SIGNUP_REQUIRED") {
            res.cookie(OAUTH_ATTEMPT_COOKIE, intentAttemptToken, attemptCookieOptions(INTENT_TTL_SECONDS));
            return res.redirect(`${frontendBase}/login?socialIntent=${encodeURIComponent(result.intentToken)}`);
        }

        // 로그인 유지 아니면 지난 refresh 쿠키 지움
        res.cookie("accessToken", result.token, buildSessionCookieOptions(rememberMe, result.refreshTokenExpiresAt));
        if (result.refreshToken) {
            res.cookie("refreshToken", result.refreshToken, buildRefreshCookieOptions(result.refreshTokenExpiresAt));
        } else {
            clearRefreshCookie(res);
        }

        return res.redirect(`${frontendBase}/lobby`);
    } catch (error) {
        // 코드 없는 오류만 로그 (예상한 오류는 code만 화면으로)
        if (!error?.code) {
            console.error('\x1b[31m%s\x1b[0m', error?.stack || error);
        }
        return redirectWithError(error?.code || "OAUTH_FAILED");
    }
};
