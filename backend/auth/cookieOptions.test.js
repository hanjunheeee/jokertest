const test = require("node:test");
const assert = require("node:assert/strict");
const {
    PERSISTENT_SESSION_MAX_AGE_MS,
    buildSessionCookieOptions,
    clearSessionCookie,
} = require("./cookieOptions");

test("rememberMe true는 persistent cookie를, false는 session cookie를 만든다", () => {
    const persistent = buildSessionCookieOptions(true);
    const session = buildSessionCookieOptions(false);

    assert.equal(persistent.httpOnly, true);
    assert.equal(persistent.sameSite, "Lax");
    assert.equal(persistent.maxAge, PERSISTENT_SESSION_MAX_AGE_MS);
    assert.equal(Object.hasOwn(session, "maxAge"), false);
    assert.equal(Object.hasOwn(session, "expires"), false);
});

test("쿠키 제거는 발급과 같은 보안 속성으로 accessToken만 제거한다", () => {
    const calls = [];
    clearSessionCookie({ clearCookie: (...args) => calls.push(args) });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "accessToken");
    assert.equal(calls[0][1].httpOnly, true);
    assert.equal(calls[0][1].sameSite, "Lax");
});
