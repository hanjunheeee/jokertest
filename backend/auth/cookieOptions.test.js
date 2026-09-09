const test = require("node:test");
const assert = require("node:assert/strict");
const {
    PERSISTENT_SESSION_MAX_AGE_MS,
    buildSessionCookieOptions,
    buildRefreshCookieOptions,
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

test("갱신 자격 쿠키는 항상 절대 만료(30일)의 persistent cookie다", () => {
    const options = buildRefreshCookieOptions();
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "Lax");
    assert.equal(options.maxAge, PERSISTENT_SESSION_MAX_AGE_MS);
});

test("쿠키 제거는 발급과 같은 보안 속성으로 accessToken과 refreshToken을 모두 제거한다", () => {
    const calls = [];
    clearSessionCookie({ clearCookie: (...args) => calls.push(args) });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call[0]), ["accessToken", "refreshToken"]);
    for (const call of calls) {
        assert.equal(call[1].httpOnly, true);
        assert.equal(call[1].sameSite, "Lax");
    }
});
