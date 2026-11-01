// 구글 로그인 흐름 파일, 시작 준비(지문·state·시도 표) · 콜백 흐름(state 소비·프로필·계정 찾기)
// social 입구로 controllers/auth/google.js가 부름
// 쿠키·redirect·인가 주소는 컨트롤러 몫 (쿠키 넣은 뒤 주소 만드는 순서 그대로)
const crypto = require("crypto");
const googleOAuthService = require("../oauth/google");
const { signOAuthAttempt, clientMark } = require("./attempt");
const { ATTEMPT_TTL_SECONDS, INTENT_TTL_SECONDS } = require("./constants");

// 지문 만들고 로그인 state 발급 → 시도 표 서명 (state 소비·계정 찾기는 입구 객체로 불러 시험 패치 먹게)
exports.startGoogleLogin = async ({ rememberMe, client }) => {
    // 지문 원문은 시도 쿠키에만, state 행엔 해시 (다른 브라우저로 콜백 막기)
    const browserFingerprint = crypto.randomBytes(32).toString("base64url");

    const { state } = await require('./index').issueOAuthState({ purpose: "login", browserFingerprint });

    const attemptToken = signOAuthAttempt(
        { fp: browserFingerprint, rememberMe, purpose: "login", provider: "google", ...clientMark(client) },
        ATTEMPT_TTL_SECONDS,
    );
    return { state, attemptToken };
};

// 시도 표의 지문·rememberMe → state 소비 → 취소 아니면 프로필 → 계정 찾기 → 가입 의도면 가입 시도 표
exports.completeGoogleLogin = async ({ attempt, query, reqInfo }) => {
    // 이 제공자 로그인 시도 표일 때만 지문·rememberMe 믿음 (아니면 지문 없음으로 state 소비 실패)
    const browserFingerprint = attempt?.purpose === "login" && attempt?.provider === "google" ? attempt.fp : undefined;
    const rememberMe = attempt?.purpose === "login" && attempt?.provider === "google" && attempt?.rememberMe === true;

    // 취소여도 state 먼저 소비 (같은 state 다시 못 쓰게)
    await require('./index').consumeOAuthState(query.state, { browserFingerprint, purpose: "login" });

    // 제공자 화면에서 취소했으면 프로필 안 받음 (취소 오류는 계정 찾기가 던짐)
    const cancelled = query.error !== undefined;
    let subject = null;
    let email = null;
    if (!cancelled) {
        const profile = await googleOAuthService.exchangeCodeForProfile(query.code);
        subject = profile.subject;
        email = profile.email;
    }

    const result = await require('./index').resolveOAuthAccount({
        provider: "google", subject, email, cancelled, rememberMe, reqInfo,
    });

    // 가입 필요면 가입 의도·rememberMe 담은 가입 시도 표 (가입 마무리 때 rememberMe 이어 씀)
    let intentAttemptToken = null;
    if (result.status === "SIGNUP_REQUIRED") {
        intentAttemptToken = signOAuthAttempt(
            { intentToken: result.intentToken, rememberMe, purpose: "signup", provider: "google" },
            INTENT_TTL_SECONDS,
        );
    }
    return { result, rememberMe, intentAttemptToken };
};
