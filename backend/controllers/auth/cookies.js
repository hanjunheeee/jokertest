// OAuth 시도 쿠키 파일, 쿠키 이름 · 쿠키 옵션 (HTTP 쪽만)
// 시도 표 서명·확인·유효 시간은 services/auth/social로 옮김, 구글·디스코드·소셜 가입 컨트롤러가 씀

// OAuth 시도 표를 담는 쿠키 이름
const OAUTH_ATTEMPT_COOKIE = "oauthAttempt";

// httpOnly·Lax, 운영에서만 secure
const oauthAttemptCookieOptions = (maxAgeSeconds) => ({
    httpOnly: true,
    sameSite: "Lax",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   maxAgeSeconds * 1000,
});

module.exports = {
    OAUTH_ATTEMPT_COOKIE,
    oauthAttemptCookieOptions,
};
