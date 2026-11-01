// 디스코드 계정 연결 컨트롤러 파일, 시작 · 콜백
// 로그인한 사람만, 연결 결과는 계정 화면으로 돌려보냄
const socialAuthService = require("../../services/auth/social");
const discordOAuthService = require("../../services/auth/oauth/discord");
const { OAUTH_ATTEMPT_COOKIE, attemptCookieOptions } = require('./cookies');
const { verifyOAuthAttempt, ATTEMPT_TTL_SECONDS } = require("../../services/auth/social");

// 연결용 state 발급 → 시도 쿠키 → 인가 주소로
exports.discordLinkStart = async (req, res, next) => {
    try {
        const { state, attemptToken } = await socialAuthService.startDiscordLink({
            userId: req.user.uuid, sessionId: req.user.sessionId,
        });
        res.cookie(OAUTH_ATTEMPT_COOKIE, attemptToken, attemptCookieOptions(ATTEMPT_TTL_SECONDS));

        res.redirect(discordOAuthService.buildAuthorizationUrl(state, { purpose: "link" }));
    } catch (error) {
        next(error);
    }
};

// state 소비 → 세션 같은지 → 취소 확인 → 프로필 → 연결
exports.discordLinkCallback = async (req, res, next) => {
    const attempt = verifyOAuthAttempt(req.cookies?.[OAUTH_ATTEMPT_COOKIE]);
    res.clearCookie(OAUTH_ATTEMPT_COOKIE, attemptCookieOptions(ATTEMPT_TTL_SECONDS));

    const frontendBase = process.env.FRONTEND_URL;
    const redirectWithError = (code) => res.redirect(`${frontendBase}/account?socialLinkError=${encodeURIComponent(code)}`);

    try {
        await socialAuthService.completeDiscordLink({ attempt, query: req.query, user: req.user });

        return res.redirect(`${frontendBase}/account?socialLinkSuccess=discord`);
    } catch (error) {
        if (!error?.code) {
            console.error('\x1b[31m%s\x1b[0m', error?.stack || error);
        }
        return redirectWithError(error?.code || "OAUTH_FAILED");
    }
};
