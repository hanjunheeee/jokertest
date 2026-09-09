const PERSISTENT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// 로그인 유지 세션의 액세스 토큰은 일부러 짧게 만료시킨다. 실제로 회전형 갱신 자격
// (refreshToken)이 30일 절대 만료를 책임지므로, 액세스 토큰 자체를 30일로 늘리면
// "쿠키만 오래 살고 갱신은 한 번도 실행되지 않는" 상태가 되어 폐기·재사용 감지가
// 액세스 토큰 만료 전까지 사실상 시험되지 않는다(F-03 A-01).
const ACCESS_TOKEN_SHORT_TTL_SECONDS = 15 * 60;

// 갱신 자격 회전 응답이 유실되거나(네트워크 단절) 같은 자격으로 동시에 두 요청이
// 들어왔을 때, 방금 대체된 이전 해시를 이 시간 동안만 유효한 것으로 취급해 재시도를
// 허용한다. 이 창을 벗어나 이전 해시가 다시 제시되면 재사용(탈취)으로 간주한다(F-03 A-08).
const REFRESH_TOKEN_GRACE_MS = 30 * 1000;

function buildBaseCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
    };
}

// 로그인 시점의 절대 만료(absoluteExpiresAt)가 주어지면 그때까지 남은 시간만큼만 쿠키가
// 살게 한다. 회전(POST /auth/refresh)마다 Max-Age를 다시 30일 꽉 채워 계산하면 서버 DB의
// refresh_token_expires_at은 그대로인데 브라우저 쿠키만 계속 30일씩 갱신되어, 결과적으로
// "회전이 절대 30일 창을 연장하지 않는다"는 계약(F-03 A-01/A-03)이 쿠키 수명에서는
// 지켜지지 않는 구멍이 생긴다(R-IMPL #4). absoluteExpiresAt이 없으면(로그인 순간처럼
// 아직 세션이 만들어지지 않았거나 로그인 유지 세션이 아닌 호출부) 고정 30일을 그대로 쓴다.
const remainingMsUntil = (absoluteExpiresAt, now = new Date()) => {
    if (!absoluteExpiresAt) return null;
    return Math.max(0, absoluteExpiresAt.getTime() - now.getTime());
};

function buildSessionCookieOptions(rememberMe, absoluteExpiresAt) {
    const options = buildBaseCookieOptions();
    if (rememberMe === true) {
        const remaining = remainingMsUntil(absoluteExpiresAt);
        options.maxAge = remaining ?? PERSISTENT_SESSION_MAX_AGE_MS;
    }
    return options;
}

// 갱신 자격 쿠키는 로그인 유지를 선택했을 때만 발급되므로 항상 절대 만료(30일)와 같은
// Max-Age를 갖는다 — rememberMe===false 세션은 애초에 이 쿠키를 받지 않는다(AC-02).
// absoluteExpiresAt을 넘기면(회전 응답) 로그인 시점 기준 남은 시간만, 생략하면(로그인
// 응답, 그 자리에서 절대 만료가 막 새로 시작하는 시점) 고정 30일을 쓴다.
function buildRefreshCookieOptions(absoluteExpiresAt) {
    const options = buildBaseCookieOptions();
    const remaining = remainingMsUntil(absoluteExpiresAt);
    options.maxAge = remaining ?? PERSISTENT_SESSION_MAX_AGE_MS;
    return options;
}

// 새 액세스 토큰(JWT)의 exp가 로그인 시점의 절대 30일 기한을 넘지 않도록 초 단위로
// 자른다(내림) — jsonwebtoken의 iat도 초 단위로 내림 계산되므로, 두 내림이 겹쳐도 계산된
// exp(ms)는 항상 absoluteExpiresAt 이하로 유지된다. absoluteExpiresAt이 없으면(로그인
// 유지가 아닌 세션) 캡을 적용하지 않는다.
function capAccessTokenTtlSeconds(shortTtlSeconds, absoluteExpiresAt, now = new Date()) {
    if (!absoluteExpiresAt) return shortTtlSeconds;
    const remainingSeconds = Math.floor(remainingMsUntil(absoluteExpiresAt, now) / 1000);
    return Math.max(0, Math.min(shortTtlSeconds, remainingSeconds));
}

function clearSessionCookie(res) {
    res.clearCookie("accessToken", buildBaseCookieOptions());
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
};
