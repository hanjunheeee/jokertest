// 디스코드 계정 연결 흐름 파일, 시작 준비(지문·연결 state·시도 표) · 콜백 흐름(state 소비·세션 확인·취소 확인·프로필·연결)
// 디스코드 연결 컨트롤러가 부름, 쿠키·redirect·인가 주소는 컨트롤러 몫
const crypto = require("crypto");
const discordOAuthService = require("../oauth/discord");
const { signOAuthAttempt } = require("./attempt");
const { OAUTH_ATTEMPT_TTL_SECONDS } = require("./constants");

// 지문 만들고 로그인한 세션으로 연결 state 발급 → 시도 표 서명
exports.startDiscordLink = async ({ userId, sessionId }) => {
    const browserFingerprint = crypto.randomBytes(32).toString("base64url");

    const { state } = await require('./index').issueOAuthState({
        purpose: "link", userId, sessionId, browserFingerprint,
    });

    const attemptToken = signOAuthAttempt(
        { fp: browserFingerprint, purpose: "link", provider: "discord" },
        OAUTH_ATTEMPT_TTL_SECONDS,
    );
    return { state, attemptToken };
};

// state 소비 → state 발급 세션과 같은지 → 취소 확인 → 프로필 → 연결 (오류 모양은 옮기기 전 그대로)
exports.completeDiscordLink = async ({ attempt, query, user }) => {
    const browserFingerprint = attempt?.purpose === "link" && attempt?.provider === "discord" ? attempt.fp : undefined;
    const rawState = query.state;

    const consumed = await require('./index').consumeOAuthState(rawState, { browserFingerprint, purpose: "link" });

    if (consumed.userId !== user.uuid || consumed.sessionId !== user.sessionId) {
        const error = new Error("연결 요청 세션과 state 발급 세션이 일치하지 않습니다.");
        error.status = 400; error.code = "STATE_USER_MISMATCH";
        throw error;
    }

    if (query.error !== undefined) {
        const error = new Error("사용자가 계정 연결을 취소했습니다.");
        error.status = 400; error.code = "OAUTH_CANCELLED";
        throw error;
    }

    const profile = await discordOAuthService.exchangeCodeForProfile(query.code, { purpose: "link" });

    await require('./index').linkExternalIdentityForValidatedSession({
        userId: user.uuid,
        sessionId: user.sessionId,
        provider: "discord",
        subject: profile.subject,
        email: profile.email,
    });
};
