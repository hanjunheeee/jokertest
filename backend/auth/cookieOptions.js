const PERSISTENT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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

function clearSessionCookie(res) {
    res.clearCookie("accessToken", buildBaseCookieOptions());
}

module.exports = {
    PERSISTENT_SESSION_MAX_AGE_MS,
    buildSessionCookieOptions,
    clearSessionCookie,
};
