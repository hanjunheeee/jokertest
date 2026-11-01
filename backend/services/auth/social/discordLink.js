// 디스코드 계정 연결 흐름 파일, 시작 준비(지문·연결 state·시도 표) · 콜백 흐름(state 소비·세션 확인·취소 확인·프로필·연결)
// social 입구로 controllers/auth/discordLink.js가 부름, 쿠키·redirect·인가 주소는 컨트롤러 몫
const crypto = require("crypto");
const discordOAuthService = require("../oauth/discord");
const { signOAuthAttempt, clientMark } = require("./attempt");
const { ATTEMPT_TTL_SECONDS } = require("./constants");

// 지문 만들고 로그인한 세션으로 연결 state 발급 → 시도 표 서명
exports.startDiscordLink = async ({ userId, sessionId, client }) => {
    // 지문 원문은 시도 쿠키에만, state 행엔 해시 (다른 브라우저로 콜백 막기)
    const browserFingerprint = crypto.randomBytes(32).toString("base64url");

    // 연결 state는 지금 세션에 묶음 (입구 객체로 불러 시험 패치 먹게)
    const { state } = await require('./index').issueOAuthState({
        purpose: "link", userId, sessionId, browserFingerprint,
    });

    const attemptToken = signOAuthAttempt(
        { fp: browserFingerprint, purpose: "link", provider: "discord", ...clientMark(client) },
        ATTEMPT_TTL_SECONDS,
    );
    return { state, attemptToken };
};

// state 소비 → state 발급 세션과 같은지 → 취소 확인 → 프로필 → 연결
// 오류는 status·code 붙인 Error로 던짐 (컨트롤러가 code로 화면 돌려보냄)
exports.completeDiscordLink = async ({ attempt, query, user }) => {
    // 디스코드 연결 시도 표일 때만 지문 믿음 (아니면 지문 없음으로 state 소비 실패)
    const browserFingerprint = attempt?.purpose === "link" && attempt?.provider === "discord" ? attempt.fp : undefined;
    const rawState = query.state;

    // 취소여도 state 먼저 소비 (같은 state 다시 못 쓰게)
    const consumed = await require('./index').consumeOAuthState(rawState, { browserFingerprint, purpose: "link" });

    // 연결 시작한 세션과 지금 세션이 다르면 거절 (남의 연결 state 끼워 넣기 막기)
    if (consumed.userId !== user.uuid || consumed.sessionId !== user.sessionId) {
        const error = new Error("연결 요청 세션과 state 발급 세션이 일치하지 않습니다.");
        error.status = 400; error.code = "STATE_USER_MISMATCH";
        throw error;
    }

    // 디스코드 화면에서 취소했으면 프로필 안 받음
    if (query.error !== undefined) {
        const error = new Error("사용자가 계정 연결을 취소했습니다.");
        error.status = 400; error.code = "OAUTH_CANCELLED";
        throw error;
    }

    const profile = await discordOAuthService.exchangeCodeForProfile(query.code, { purpose: "link" });

    // 연결은 세션 다시 확인하고 붙임 (입구 객체로 불러 시험 패치 먹게)
    await require('./index').linkExternalIdentityForValidatedSession({
        userId: user.uuid,
        sessionId: user.sessionId,
        provider: "discord",
        subject: profile.subject,
        email: profile.email,
    });
};
