const PERSISTENT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const ACCESS_TOKEN_SHORT_TTL_SECONDS = 15 * 60;

const REFRESH_TOKEN_GRACE_MS = 30 * 1000;

function buildBaseCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
    };
}

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

function buildRefreshCookieOptions(absoluteExpiresAt) {
    const options = buildBaseCookieOptions();
    const remaining = remainingMsUntil(absoluteExpiresAt);
    options.maxAge = remaining ?? PERSISTENT_SESSION_MAX_AGE_MS;
    return options;
}

function capAccessTokenTtlSeconds(shortTtlSeconds, absoluteExpiresAt, now = new Date()) {
    if (!absoluteExpiresAt) return shortTtlSeconds;
    const remainingSeconds = Math.floor(remainingMsUntil(absoluteExpiresAt, now) / 1000);
    return Math.max(0, Math.min(shortTtlSeconds, remainingSeconds));
}

function clearSessionCookie(res) {
    res.clearCookie("accessToken", buildBaseCookieOptions());
    res.clearCookie("refreshToken", buildBaseCookieOptions());
}

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
