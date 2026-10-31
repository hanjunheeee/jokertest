process.env.JWT_SECRET = "login-regression-test-secret";

const test   = require("node:test");
const assert = require("node:assert/strict");
const jwt    = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const userRepository = require("../repositories/user.repositories");
const authService    = require("../service/auth.service");
const { PERSISTENT_SESSION_MAX_AGE_MS, ACCESS_TOKEN_SHORT_TTL_SECONDS } = require("../auth/cookieOptions");

const PASSWORD  = "correct-horse";
const REQ_INFO  = { ip: "127.0.0.1", userAgent: "jest-ua", deviceType: "PC" };
const REPO_KEYS = [
    "withTransaction", "findByEmail", "checkActiveBan", "createLoginHistory",
    "updateUser", "markOnlineSessionsOffline", "createUserSession",
];

const stubRepo = (t, overrides = {}) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    const calls     = [];
    const record    = (name, result) => (...args) => { calls.push({ name, args }); return result; };

    const defaults = {
        withTransaction:           (work) => work({ id: "tx-1", LOCK: { UPDATE: "UPDATE" } }),
        findByEmail:               record("findByEmail", null),
        checkActiveBan:            record("checkActiveBan", null),
        createLoginHistory:        record("createLoginHistory", {}),
        updateUser:                record("updateUser", [1]),
        markOnlineSessionsOffline: record("markOnlineSessionsOffline", [1]),
        createUserSession:         record("createUserSession", {}),
    };

    for (const key of REPO_KEYS) {
        userRepository[key] = overrides[key]
            ? (...args) => { calls.push({ name: key, args }); return overrides[key](...args); }
            : defaults[key];
    }

    t.after(() => Object.assign(userRepository, originals));
    return { calls, names: () => calls.map((call) => call.name) };
};

const activeUser = async (extra = {}) => ({
    uuid:               "uuid-1",
    role:               "USER",
    password_hash:      await bcrypt.hash(PASSWORD, 10),
    failed_login_count: 0,
    locked_until:       null,
    ...extra,
});

test("정상 로그인은 세션을 만들고 sessionId가 담긴 토큰을 발급한다", async (t) => {
    const user = await activeUser();
    const { calls, names } = stubRepo(t, { findByEmail: () => user });

    const result = await authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO);

    assert.equal(result.user.uuid, "uuid-1");

    const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
    assert.equal(decoded.uuid, "uuid-1");
    assert.equal(decoded.role, "USER");
    assert.ok(decoded.sessionId, "토큰에 sessionId가 없으면 세션 검증이 조용히 무력화됩니다");

    const sessionArg = calls.find((call) => call.name === "createUserSession").args[0];
    assert.equal(sessionArg.id, decoded.sessionId);
    assert.equal(sessionArg.user_id, "uuid-1");
    assert.equal(sessionArg.is_online, true);

    assert.deepEqual(names(), [
        "findByEmail", "checkActiveBan", "createLoginHistory",
        "updateUser", "markOnlineSessionsOffline", "createUserSession",
    ]);

    assert.deepEqual(calls.find((call) => call.name === "createLoginHistory").args[0], {
        user_id: "uuid-1", ip_address: "127.0.0.1", user_agent: "jest-ua", success: true,
    });
});

test("F-03 AC-01: 로그인 유지를 선택하면 액세스 토큰은 짧게 살고, 대신 30일 절대 만료의 회전형 갱신 자격이 함께 발급된다", async (t) => {
    const user = await activeUser();
    const { calls } = stubRepo(t, { findByEmail: () => user });

    const result = await authService.login(
        { email: "a@b.com", password: PASSWORD, rememberMe: true }, REQ_INFO,
    );
    const decoded = jwt.verify(result.token, process.env.JWT_SECRET);

    assert.equal(decoded.exp - decoded.iat, ACCESS_TOKEN_SHORT_TTL_SECONDS);

    assert.ok(result.refreshToken, "로그인 유지 시 갱신 자격이 발급되어야 합니다");

    const sessionArg = calls.find((call) => call.name === "createUserSession").args[0];
    assert.ok(sessionArg.refresh_token_hash, "세션에 갱신 자격 해시가 저장되어야 합니다");
    assert.notEqual(sessionArg.refresh_token_hash, result.refreshToken, "원문을 그대로 저장하면 안 됩니다");
    assert.ok(sessionArg.refresh_token_expires_at instanceof Date);
    assert.equal(
        sessionArg.refresh_token_expires_at.getTime() - Date.now() >= PERSISTENT_SESSION_MAX_AGE_MS - 5_000,
        true,
        "절대 만료는 로그인 시점 기준 30일이어야 합니다",
    );
});

test("F-03 AC-02: 로그인 유지를 선택하지 않으면 액세스 토큰은 기존처럼 1일 뒤에 만료되고, 갱신 자격은 발급되지 않는다", async (t) => {
    const user = await activeUser();
    const { calls } = stubRepo(t, { findByEmail: () => user });

    const result = await authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO);
    const decoded = jwt.verify(result.token, process.env.JWT_SECRET);

    assert.equal(decoded.exp - decoded.iat, 24 * 60 * 60);
    assert.equal(result.refreshToken, null, "로그인 유지를 선택하지 않으면 갱신 자격을 주면 안 됩니다(AC-02)");

    const sessionArg = calls.find((call) => call.name === "createUserSession").args[0];
    assert.equal(sessionArg.refresh_token_hash, null);
    assert.equal(sessionArg.refresh_token_expires_at, null);
});

test("가입되지 않은 이메일은 401이다", async (t) => {
    stubRepo(t);
    await assert.rejects(
        authService.login({ email: "none@b.com", password: PASSWORD }, REQ_INFO),
        (error) => error.status === 401
    );
});

test("빈 로그인 payload는 DB 조회 없이 400이다", async (t) => {
    const { names } = stubRepo(t);
    await assert.rejects(authService.login({}, REQ_INFO), (error) => error.status === 400);
    assert.deepEqual(names(), []);
});

test("잠긴 계정은 423이고 비밀번호 검사까지 가지 않는다", async (t) => {
    const user = await activeUser({ locked_until: new Date(Date.now() + 60_000) });
    const { names } = stubRepo(t, { findByEmail: () => user });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO),
        (error) => error.status === 423
    );
    assert.deepEqual(names(), ["findByEmail"]);
});

test("활성 밴 계정은 403이다", async (t) => {
    const user = await activeUser();
    stubRepo(t, { findByEmail: () => user, checkActiveBan: () => ({ reason: "욕설" }) });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO),
        (error) => error.status === 403 && /욕설/.test(error.message)
    );
});

test("비밀번호 불일치는 401이고 실패 횟수를 올린다", async (t) => {
    const user = await activeUser({ failed_login_count: 1 });
    const { calls } = stubRepo(t, { findByEmail: () => user });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: "wrong" }, REQ_INFO),
        (error) => error.status === 401 && /2\/5/.test(error.message)
    );

    assert.deepEqual(calls.find((call) => call.name === "updateUser").args[1], {
        failed_login_count: 2, locked_until: null,
    });
    assert.equal(calls.find((call) => call.name === "createLoginHistory").args[0].success, false);
});

test("5회째 실패는 계정을 잠그고 423을 반환한다", async (t) => {
    const user = await activeUser({ failed_login_count: 4 });
    const { calls } = stubRepo(t, { findByEmail: () => user });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: "wrong" }, REQ_INFO),
        (error) => error.status === 423
    );

    const update = calls.find((call) => call.name === "updateUser").args[1];
    assert.equal(update.failed_login_count, 5);
    assert.ok(update.locked_until instanceof Date);
});

const express      = require("express");
const cookieParser = require("cookie-parser");
const { once }     = require("node:events");
const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");

const startAuthServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/auth", require("../routes/auth.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));

    return `http://127.0.0.1:${server.address().port}`;
};

const findSetCookie = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

const postLogin = (base, body, extraHeaders = {}) =>
    fetch(`${base}/auth/login`, {
        method:  "POST",
        headers: { "content-type": "application/json", ...extraHeaders },
        body:    JSON.stringify(body),
    });

test("F-03 AC-02 실제 Set-Cookie: 로그인 유지를 선택하면 accessToken·refreshToken 모두 영속(Max-Age 있음) 쿠키로 발급된다", async (t) => {
    const user = await activeUser();
    stubRepo(t, { findByEmail: () => user });
    const base = await startAuthServer(t);

    const res = await postLogin(base, { email: "a@b.com", password: PASSWORD, rememberMe: true });
    assert.equal(res.status, 200);

    const accessCookie  = findSetCookie(res, "accessToken");
    const refreshCookie = findSetCookie(res, "refreshToken");
    assert.ok(accessCookie, "accessToken 쿠키가 응답에 없습니다");
    assert.ok(refreshCookie, "로그인 유지 시 refreshToken 쿠키가 발급되어야 합니다(AC-01)");

    for (const cookie of [accessCookie, refreshCookie]) {
        assert.match(cookie, /Max-Age=\d+/, `로그인 유지는 영속 쿠키여야 합니다: ${cookie}`);
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /SameSite=Lax/i);
        assert.doesNotMatch(cookie, /Secure/i, `테스트 환경(NODE_ENV!=production)에서는 Secure를 붙이면 안 됩니다: ${cookie}`);
    }

    const maxAgeSeconds = Number(refreshCookie.match(/Max-Age=(\d+)/)[1]);
    assert.ok(maxAgeSeconds > 0 && maxAgeSeconds <= PERSISTENT_SESSION_MAX_AGE_MS / 1000 + 5,
        `refreshToken의 Max-Age는 절대 30일 이내여야 합니다: ${maxAgeSeconds}`);
});

test("F-03 AC-02 실제 Set-Cookie: 로그인 유지를 선택하지 않으면 accessToken은 세션 쿠키(Max-Age·Expires 없음)이고 refreshToken은 발급되지 않는다", async (t) => {
    const user = await activeUser();
    stubRepo(t, { findByEmail: () => user });
    const base = await startAuthServer(t);

    const res = await postLogin(base, { email: "a@b.com", password: PASSWORD });
    assert.equal(res.status, 200);

    const accessCookie  = findSetCookie(res, "accessToken");
    assert.ok(accessCookie);
    assert.doesNotMatch(accessCookie, /Max-Age/i, `로그인 유지를 선택하지 않으면 세션 쿠키여야 합니다: ${accessCookie}`);
    assert.doesNotMatch(accessCookie, /Expires/i, `로그인 유지를 선택하지 않으면 세션 쿠키여야 합니다: ${accessCookie}`);

    assert.equal(findSetCookie(res, "refreshToken")?.match(/^refreshToken=([^;]*)/)?.[1] ?? "", "",
        "로그인 유지를 선택하지 않으면 새 refreshToken 값을 발급하면 안 됩니다(AC-02)");
});

test("F-03 R-IMPL #6/AC-02: 이전 로그인 유지가 남긴 refreshToken 쿠키가 있어도, 이번에 유지를 선택하지 않으면 그 쿠키를 지운다", async (t) => {
    const user = await activeUser();
    stubRepo(t, { findByEmail: () => user });
    const base = await startAuthServer(t);

    const res = await postLogin(
        base,
        { email: "a@b.com", password: PASSWORD, rememberMe: false },
        { cookie: "refreshToken=stale-persistent-refresh-token" },
    );
    assert.equal(res.status, 200);

    const refreshCookie = findSetCookie(res, "refreshToken");
    assert.ok(refreshCookie, "이전 영속 refreshToken 쿠키를 지우는 Set-Cookie가 응답에 있어야 합니다");
    assert.match(refreshCookie, /^refreshToken=;/, "삭제 쿠키는 값이 비어 있어야 합니다");
    assert.match(refreshCookie, /Expires=/i, "삭제는 Max-Age가 아니라 과거 Expires로 즉시 만료시켜야 합니다");
    assert.doesNotMatch(refreshCookie, /Max-Age/i, "삭제 쿠키에 새 영속 Max-Age를 실어 보내면 안 됩니다");
});

test("F-03 AC-02 실제 Set-Cookie: production 환경에서는 Secure 속성이 붙는다", async (t) => {
    const user = await activeUser();
    stubRepo(t, { findByEmail: () => user });
    const base = await startAuthServer(t);

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    t.after(() => { process.env.NODE_ENV = originalEnv; });

    const res = await postLogin(base, { email: "a@b.com", password: PASSWORD, rememberMe: true });
    const refreshCookie = findSetCookie(res, "refreshToken");
    assert.ok(refreshCookie);
    assert.match(refreshCookie, /Secure/i, "production에서는 refreshToken 쿠키에 Secure가 있어야 합니다");
});
