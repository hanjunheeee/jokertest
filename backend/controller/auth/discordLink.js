// 디스코드 계정 연결 컨트롤러 파일, 시작 · 콜백
// 로그인한 사람만, 연결 결과는 계정 화면으로 돌려보냄
const crypto            = require("crypto");
const socialAuthService = require("../../services/auth/social");
const discordOAuthService = require("../../services/auth/oauth/discord");
const { signOAuthAttempt, OAUTH_ATTEMPT_TTL_SECONDS, OAUTH_ATTEMPT_COOKIE, oauthAttemptCookieOptions, verifyOAuthAttempt } = require('./cookies');

// 연결용 state 발급 → 시도 쿠키 → 인가 주소로
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

// state 소비 → 세션 같은지 → 취소 확인 → 프로필 → 연결
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
