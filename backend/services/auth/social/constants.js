// 소셜 로그인 상수 파일, state·가입 의도 유효 시간 · state 목적
// state·가입 의도 파일이 씀

// state는 10분 안에 돌아와야 함
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// 소셜 가입 마무리는 30분 안에
const SOCIAL_SIGNUP_INTENT_TTL_MS = 30 * 60 * 1000;

// OAuth 시도 표(쿠키)는 로그인·연결 10분
const OAUTH_ATTEMPT_TTL_SECONDS = 10 * 60;

// 소셜 가입 시도 표(쿠키)는 30분
const SOCIAL_SIGNUP_INTENT_TTL_SECONDS = 30 * 60;

// state 목적은 로그인·계정 연결 둘뿐
const VALID_PURPOSES = new Set(["login", "link"]);

module.exports = {
    OAUTH_STATE_TTL_MS,
    SOCIAL_SIGNUP_INTENT_TTL_MS,
    VALID_PURPOSES,
    OAUTH_ATTEMPT_TTL_SECONDS,
    SOCIAL_SIGNUP_INTENT_TTL_SECONDS,
};
