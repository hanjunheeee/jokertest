// OAuth 시도 쿠키 파일, 쿠키 이름·유효 시간·옵션 + 시도 표(JWT) 서명·확인
// 구글·디스코드·소셜 가입 컨트롤러가 같이 씀
const jwt                = require("jsonwebtoken");

// OAuth 시도 표를 담는 쿠키 이름
const OAUTH_ATTEMPT_COOKIE = "oauthAttempt";

// 로그인·연결 시도는 10분
const OAUTH_ATTEMPT_TTL_SECONDS = 10 * 60;

// 소셜 가입 마무리는 30분
const SOCIAL_SIGNUP_INTENT_TTL_SECONDS = 30 * 60;

// httpOnly·Lax, 운영에서만 secure
const oauthAttemptCookieOptions = (maxAgeSeconds) => ({
    httpOnly: true,
    sameSite: "Lax",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   maxAgeSeconds * 1000,
});

// 시도 표를 JWT_SECRET으로 서명
const signOAuthAttempt = (payload, ttlSeconds) =>
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ttlSeconds });

// 서명 틀리거나 만료면 null (던지지 않음)
const verifyOAuthAttempt = (token) => {
    if (typeof token !== "string" || !token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
};

module.exports = {
    OAUTH_ATTEMPT_COOKIE,
    OAUTH_ATTEMPT_TTL_SECONDS,
    SOCIAL_SIGNUP_INTENT_TTL_SECONDS,
    oauthAttemptCookieOptions,
    signOAuthAttempt,
    verifyOAuthAttempt,
};
