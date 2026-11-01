// OAuth 시도 쿠키 파일, 쿠키 이름 · 쿠키 옵션 (HTTP 쪽만)
// 구글·디스코드·디스코드 연결·소셜 가입 컨트롤러가 씀 (시도 표 서명·확인은 services/auth/social)

// OAuth 시도 표를 담는 쿠키 이름
const OAUTH_ATTEMPT_COOKIE = "oauthAttempt";

// 스크립트가 못 읽게 httpOnly, 제공자 콜백으로 돌아올 때도 실리게 Lax, 운영에서만 secure
const attemptCookieOptions = (maxAgeSeconds) => ({
    httpOnly: true,
    sameSite: "Lax",
    secure:   process.env.NODE_ENV === "production",
    maxAge:   maxAgeSeconds * 1000,
});

module.exports = {
    OAUTH_ATTEMPT_COOKIE,
    attemptCookieOptions,
};
