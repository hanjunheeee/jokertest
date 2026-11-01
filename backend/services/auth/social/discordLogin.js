// 디스코드 로그인 흐름 파일, 시작 준비(지문·state·시도 표) · 콜백 흐름(state 소비·프로필·계정 찾기)
// 디스코드 컨트롤러가 부름, 쿠키·redirect·인가 주소는 컨트롤러 몫 (쿠키 넣은 뒤 주소 만드는 순서 그대로)
const crypto = require("crypto");
const discordOAuthService = require("../oauth/discord");
const { signOAuthAttempt } = require("./attempt");
const { ATTEMPT_TTL_SECONDS, INTENT_TTL_SECONDS } = require("./constants");

// 지문 만들고 로그인 state 발급 → 시도 표 서명 (state 소비·계정 찾기는 입구 객체로 불러 시험 패치 먹게)
exports.startDiscordLogin = async ({ rememberMe }) => {
    const browserFingerprint = crypto.randomBytes(32).toString("base64url");

    const { state } = await require('./index').issueOAuthState({ purpose: "login", browserFingerprint });

    const attemptToken = signOAuthAttempt(
        { fp: browserFingerprint, rememberMe, purpose: "login", provider: "discord" },
        ATTEMPT_TTL_SECONDS,
    );
    return { state, attemptToken };
};

// 시도 표의 지문·rememberMe → state 소비 → 취소 아니면 프로필 → 계정 찾기 → 가입 의도면 가입 시도 표
exports.completeDiscordLogin = async ({ attempt, query, reqInfo }) => {
    const browserFingerprint = attempt?.purpose === "login" && attempt?.provider === "discord" ? attempt.fp : undefined;
    const rememberMe = attempt?.purpose === "login" && attempt?.provider === "discord" && attempt?.rememberMe === true;

    await require('./index').consumeOAuthState(query.state, { browserFingerprint, purpose: "login" });

    const cancelled = query.error !== undefined;
    let subject = null;
    let email = null;
    if (!cancelled) {
        const profile = await discordOAuthService.exchangeCodeForProfile(query.code);
        subject = profile.subject;
        email = profile.email;
    }

    const result = await require('./index').resolveOAuthAccount({
        provider: "discord", subject, email, cancelled, rememberMe, reqInfo,
    });

    let intentAttemptToken = null;
    if (result.status === "SIGNUP_REQUIRED") {
        intentAttemptToken = signOAuthAttempt(
            { intentToken: result.intentToken, rememberMe, purpose: "signup", provider: "discord" },
            INTENT_TTL_SECONDS,
        );
    }
    return { result, rememberMe, intentAttemptToken };
};
