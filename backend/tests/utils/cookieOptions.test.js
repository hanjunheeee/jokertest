const test = require("node:test");
const assert = require("node:assert/strict");
const {
    PERSISTENT_SESSION_MAX_AGE_MS,
    ACCESS_TOKEN_SHORT_TTL_SECONDS,
    buildSessionCookieOptions,
    buildRefreshCookieOptions,
    capAccessTokenTtlSeconds,
    clearSessionCookie,
} = require("../../utils/auth/cookieOptions");

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

test("absoluteExpiresAt이 주어지면 세션·갱신 쿠키 Max-Age가 남은 시간으로 캡된다(회전이 30일을 연장하지 않는다)", () => {
    const now = Date.now();
    const remainingMs = 3 * 24 * 60 * 60 * 1000;
    const absoluteExpiresAt = new Date(now + remainingMs);

    const session = buildSessionCookieOptions(true, absoluteExpiresAt);
    const refresh = buildRefreshCookieOptions(absoluteExpiresAt);

    assert.ok(session.maxAge <= remainingMs && session.maxAge > remainingMs - 5_000);
    assert.ok(refresh.maxAge <= remainingMs && refresh.maxAge > remainingMs - 5_000);
    assert.ok(session.maxAge < PERSISTENT_SESSION_MAX_AGE_MS, "회전이 Max-Age를 다시 꽉 찬 30일로 되돌리면 안 됩니다");
});

test("absoluteExpiresAt을 넘긴(과거) 경우 Max-Age는 음수가 아니라 0으로 캡된다", () => {
    const pastExpiry = new Date(Date.now() - 1_000);
    const refresh = buildRefreshCookieOptions(pastExpiry);
    assert.equal(refresh.maxAge, 0);
});

test("capAccessTokenTtlSeconds: 절대 기한이 없으면(로그인 유지가 아닌 세션) 기본 TTL을 그대로 쓴다", () => {
    assert.equal(capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, null), ACCESS_TOKEN_SHORT_TTL_SECONDS);
});

test("capAccessTokenTtlSeconds: 절대 기한이 충분히 남아있으면 기본 TTL을 그대로 쓴다", () => {
    const now = new Date();
    const farFuture = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    assert.equal(capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, farFuture, now), ACCESS_TOKEN_SHORT_TTL_SECONDS);
});

test("capAccessTokenTtlSeconds: 절대 기한이 임박하면 남은 초로 내림(반올림 아님) 캡된다", () => {
    const now = new Date();
    const almostExpired = new Date(now.getTime() + 5_400);
    assert.equal(capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, almostExpired, now), 5,
        "올림(6초)이 아니라 내림(5초)이어야 절대 기한을 넘지 않습니다");
});

test("capAccessTokenTtlSeconds: 정확히 경계(0초 남음)거나 이미 지났으면 0 이하다", () => {
    const now = new Date();
    assert.equal(capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, now, now), 0);
    assert.equal(capAccessTokenTtlSeconds(ACCESS_TOKEN_SHORT_TTL_SECONDS, new Date(now.getTime() - 1_000), now), 0);
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
