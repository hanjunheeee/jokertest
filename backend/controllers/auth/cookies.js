// OAuth 시도 쿠키 파일, 쿠키 이름 · 쿠키 옵션 + 시작 실패 때 화면으로 돌려보내기 (HTTP 쪽만)
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

// 시작 주소 실패(키 없음·DB 오류)는 화면 주소에 code만 붙여 돌려보냄 (브라우저가 바로 여는 주소라 JSON 500 화면 막기)
// 코드 없는 오류만 로그, 화면엔 OAUTH_FAILED (내부 문구 안 보이기)
const redirectStartError = (res, frontendBase, error, { page = "login", param = "socialError" } = {}) => {
    if (!error?.code) {
        console.error('[31m%s[0m', error?.stack || error);
    }
    const code = error?.code || "OAUTH_FAILED";
    return res.redirect(`${frontendBase}/${page}?${param}=${encodeURIComponent(code)}`);
};

module.exports = {
    OAUTH_ATTEMPT_COOKIE,
    attemptCookieOptions,
    redirectStartError,
};
