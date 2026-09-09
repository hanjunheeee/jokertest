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

function buildSessionCookieOptions(rememberMe) {
    const options = buildBaseCookieOptions();
    if (rememberMe === true) options.maxAge = PERSISTENT_SESSION_MAX_AGE_MS;
    return options;
}

// 갱신 자격 쿠키는 로그인 유지를 선택했을 때만 발급되므로 항상 절대 만료(30일)와 같은
// Max-Age를 갖는다 — rememberMe===false 세션은 애초에 이 쿠키를 받지 않는다(AC-02).
function buildRefreshCookieOptions() {
    const options = buildBaseCookieOptions();
    options.maxAge = PERSISTENT_SESSION_MAX_AGE_MS;
    return options;
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
    clearSessionCookie,
};
