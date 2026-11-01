// 로그인 쿠키 설정 파일, 세션 유지 시간 상수 + access·refresh 쿠키 옵션 + 쿠키 지우기
// 인증 컨트롤러가 쿠키 옵션을, 세션 발급·refresh 서비스가 시간 상수를 씀

// 로그인 유지 최대 30일 (refresh 절대 만료)
const PERSISTENT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// 로그인 유지일 때 access 토큰은 15분 (refresh로 다시 받음)
const ACCESS_TOKEN_SHORT_TTL_SECONDS = 15 * 60;

// 바로 전 refresh 토큰을 같은 결과로 봐주는 30초 (동시 요청·새로고침 경합 대비)
const REFRESH_TOKEN_GRACE_MS = 30 * 1000;

// 공통: 스크립트가 못 읽게 httpOnly, 운영에서만 https 전용, 다른 사이트 요청엔 안 실림(Lax)
function buildBaseCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
    };
}

// 절대 만료까지 남은 ms (만료 없으면 null, 지났으면 0)
const remainingMsUntil = (absoluteExpiresAt, now = new Date()) => {
    if (!absoluteExpiresAt) return null;
    return Math.max(0, absoluteExpiresAt.getTime() - now.getTime());
};

// access 쿠키: 로그인 유지면 refresh 만료까지 남기고, 아니면 브라우저 닫으면 사라지게 maxAge 없음
function buildSessionCookieOptions(rememberMe, absoluteExpiresAt) {
    const options = buildBaseCookieOptions();
    if (rememberMe === true) {
        const remaining = remainingMsUntil(absoluteExpiresAt);
        options.maxAge = remaining ?? PERSISTENT_SESSION_MAX_AGE_MS;
    }
    return options;
}

// refresh 쿠키: 절대 만료까지만 (회전해도 안 늘어남)
function buildRefreshCookieOptions(absoluteExpiresAt) {
    const options = buildBaseCookieOptions();
    const remaining = remainingMsUntil(absoluteExpiresAt);
    options.maxAge = remaining ?? PERSISTENT_SESSION_MAX_AGE_MS;
    return options;
}

// access 토큰 유효 시간을 refresh 절대 만료보다 길지 않게 자름 (만료 지난 토큰이 남지 않게)
function capAccessTokenTtlSeconds(shortTtlSeconds, absoluteExpiresAt, now = new Date()) {
    if (!absoluteExpiresAt) return shortTtlSeconds;
    const remainingSeconds = Math.floor(remainingMsUntil(absoluteExpiresAt, now) / 1000);
    return Math.max(0, Math.min(shortTtlSeconds, remainingSeconds));
}

// 로그아웃·refresh 실패: 두 쿠키 다 지움 (만들 때와 같은 옵션이어야 지워짐)
function clearSessionCookie(res) {
    res.clearCookie("accessToken", buildBaseCookieOptions());
    res.clearCookie("refreshToken", buildBaseCookieOptions());
}

// 로그인 유지 안 하고 로그인: 지난 로그인의 refresh 쿠키만 지움
function clearRefreshCookie(res) {
    res.clearCookie("refreshToken", buildBaseCookieOptions());
}

module.exports = {
    PERSISTENT_SESSION_MAX_AGE_MS,
    ACCESS_TOKEN_SHORT_TTL_SECONDS,
    REFRESH_TOKEN_GRACE_MS,
    buildSessionCookieOptions,
    buildRefreshCookieOptions,
    capAccessTokenTtlSeconds,
    clearSessionCookie,
    clearRefreshCookie,
};
