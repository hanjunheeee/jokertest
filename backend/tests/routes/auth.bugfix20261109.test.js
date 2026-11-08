// 2026-11-09 인증·계정 버그 수정 시험 (DB 안 씀, 저장소·서비스 함수를 가짜로 갈아끼움)
// 로그인 잠금·정지 순서·입력 모양, 요청 수 제한, 비번 바꾸기 400·횟수, 로그아웃, 소셜 정지·기록·이메일 충돌
process.env.JWT_SECRET = "auth-bugfix-20261109-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
// 라우터 불러오기 전에 제한을 작게 (시험 안에서 한도 넘기기)
process.env.LOGIN_IP_MAX = "3";
process.env.CHECK_EMAIL_IP_MAX = "2";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const crypto       = require("node:crypto");
const express      = require("express");
const cookieParser = require("cookie-parser");
const bcrypt       = require("bcrypt");
const jwt          = require("jsonwebtoken");

const userRepository    = require("../../repositories/user");
const authService       = require("../../services/auth/account");
const socialAuthService = require("../../services/auth/social");
const passwordService   = require("../../services/auth/account/password");
const { notFoundHandler, globalErrorHandler } = require("../../middlewares/errorHandler.middleware");
// 약관 동의·만 14세 검사는 통과로 (그 검사는 member-약관 시험 몫)
require("../helpers/termsStub").passSignupTermsForFile();

const PASSWORD = "correct-horse";
const REQ_INFO = { ip: "127.0.0.1", userAgent: "node-test", deviceType: "PC" };

// 저장소 함수 갈아끼우기, 부른 순서 기록
const stubRepo = (t, overrides = {}) => {
    const keys = new Set([
        "withTransaction", "findByEmail", "findByUuid", "checkActiveBan", "createLoginHistory", "updateUser",
        "markOnlineSessionsOffline", "createUserSession", "findActiveSession", "recordLogout", "findSessionForRefresh",
        ...Object.keys(overrides),
    ]);
    const originals = Object.fromEntries([...keys].map((key) => [key, userRepository[key]]));
    const calls = [];
    const defaults = {
        withTransaction: (work) => work({ id: "tx-1", LOCK: { UPDATE: "UPDATE" } }),
        findByEmail: () => null,
        findByUuid: () => null,
        checkActiveBan: () => null,
        createLoginHistory: () => ({}),
        updateUser: () => [1],
        markOnlineSessionsOffline: () => [1],
        createUserSession: () => ({}),
        findActiveSession: (id, userId) => ({ id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null }),
        recordLogout: () => undefined,
        findSessionForRefresh: () => null,
    };
    for (const key of keys) {
        const impl = overrides[key] ?? defaults[key];
        userRepository[key] = async (...args) => { calls.push({ name: key, args }); return impl(...args); };
    }
    t.after(() => Object.assign(userRepository, originals));
    return { calls, names: () => calls.map((call) => call.name), argsOf: (name) => calls.find((c) => c.name === name)?.args };
};

const userRow = async (extra = {}) => ({
    uuid: "uuid-1", role: "USER", status: "ACTIVE",
    password_hash: await bcrypt.hash(PASSWORD, 4),
    failed_login_count: 0, locked_until: null, ...extra,
});

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/auth", require("../../routes/auth.routes"));
    app.use("/user", require("../../routes/user.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const send = (base, method, path, { body, cookie } = {}) => fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), Connection: "close" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
});

// ── 로그인 ──

test("BE-051: 로그인 email·password가 글자가 아니면 DB 안 가고 400 (trim·bcrypt TypeError 500 막기)", async (t) => {
    const { names } = stubRepo(t);
    for (const body of [{ email: 123, password: PASSWORD }, { email: "a@b.com", password: 12345678 }, { email: ["a"], password: {} }]) {
        await assert.rejects(authService.login(body, REQ_INFO), (error) => error.status === 400);
    }
    assert.deepEqual(names(), []);
});

test("known-issues 잠금 뒤 실패 횟수: 잠금이 끝난 계정은 한 번 틀려도 다시 잠기지 않고 1/5부터 센다", async (t) => {
    const user = await userRow({ failed_login_count: 5, locked_until: new Date(Date.now() - 1000) });
    const { argsOf } = stubRepo(t, { findByEmail: () => user });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: "wrong" }, REQ_INFO),
        (error) => error.status === 401 && /1\/5/.test(error.message),
    );
    assert.deepEqual(argsOf("updateUser")[1], { failed_login_count: 1, locked_until: null });
});

test("known-issues 정지 사유: 비번이 틀리면 정지 확인 전에 401로 끝나 사유·세션 끊기가 없다", async (t) => {
    const user = await userRow();
    const { names } = stubRepo(t, { findByEmail: () => user, checkActiveBan: () => ({ reason: "욕설" }) });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: "wrong" }, REQ_INFO),
        (error) => error.status === 401 && !/욕설/.test(error.message),
    );
    assert.equal(names().includes("checkActiveBan"), false, "비번 틀리면 정지 확인까지 가면 안 됩니다");
    assert.equal(names().includes("markOnlineSessionsOffline"), false);
});

test("known-issues 정지 사유: 비번이 맞으면 정지 사유와 함께 403, 세션 안 줌", async (t) => {
    const user = await userRow();
    const { names } = stubRepo(t, { findByEmail: () => user, checkActiveBan: () => ({ reason: "욕설" }) });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO),
        (error) => error.status === 403 && /욕설/.test(error.message),
    );
    assert.equal(names().includes("createUserSession"), false);
});

test("BE-058: status가 ACTIVE가 아닌 계정은 비번이 맞아도 403 ACCOUNT_INACTIVE", async (t) => {
    const user = await userRow({ status: "DELETED" });
    const { names } = stubRepo(t, { findByEmail: () => user });

    await assert.rejects(
        authService.login({ email: "a@b.com", password: PASSWORD }, REQ_INFO),
        (error) => error.status === 403 && error.code === "ACCOUNT_INACTIVE",
    );
    assert.equal(names().includes("createUserSession"), false);
});

test("BE-009: 같은 IP의 로그인이 한도를 넘으면 429와 화면에 띄울 문구", async (t) => {
    stubRepo(t);
    const base = await startServer(t);
    for (let i = 0; i < 3; i += 1) {
        const res = await send(base, "POST", "/auth/login", { body: { email: "none@b.com", password: "x" } });
        assert.equal(res.status, 401);
    }
    const res = await send(base, "POST", "/auth/login", { body: { email: "none@b.com", password: "x" } });
    const body = await res.json();
    assert.equal(res.status, 429);
    assert.equal(body.code, "RATE_LIMITED");
    assert.match(body.message, /로그인 시도가 너무 많습니다/);
});

test("BE-009: 이메일 중복 확인도 IP 한도를 넘으면 429", async (t) => {
    stubRepo(t);
    const base = await startServer(t);
    for (let i = 0; i < 2; i += 1) {
        assert.equal((await send(base, "GET", "/auth/check-email?email=a%40b.com")).status, 200);
    }
    assert.equal((await send(base, "GET", "/auth/check-email?email=a%40b.com")).status, 429);
});

// ── 비번 바꾸기 ──

const accessCookie = (sessionId = "session-1", extra = {}) =>
    `accessToken=${jwt.sign({ uuid: "uuid-1", role: "USER", sessionId, ...extra }, process.env.JWT_SECRET)}`;

test("known-issues 1-4: 현재 비번이 틀리면 401이 아니라 400 CURRENT_PASSWORD_INVALID (화면 공통 401 처리가 로그아웃 안 시키게)", async (t) => {
    passwordService.__resetWrongPasswordAttemptsForTests();
    const user = await userRow();
    stubRepo(t, { findByUuid: () => user });
    const base = await startServer(t);

    const res = await send(base, "PATCH", "/user/me/password", {
        body: { currentPassword: "wrong-pw-1", newPassword: "new-pw-456" }, cookie: accessCookie(),
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.code, "CURRENT_PASSWORD_INVALID");
    assert.equal(body.message, "현재 비밀번호가 올바르지 않습니다.");
});

test("BE-057: 현재 비번을 5번 틀리면 그 뒤로는 비교 없이 429 PASSWORD_CHANGE_LOCKED", async (t) => {
    passwordService.__resetWrongPasswordAttemptsForTests();
    t.after(() => passwordService.__resetWrongPasswordAttemptsForTests());
    const user = await userRow();
    const { names } = stubRepo(t, { findByUuid: () => user });
    const base = await startServer(t);

    for (let i = 0; i < 5; i += 1) {
        const res = await send(base, "PATCH", "/user/me/password", {
            body: { currentPassword: `wrong-${i}`, newPassword: "new-pw-456" }, cookie: accessCookie(),
        });
        assert.equal(res.status, 400);
    }
    const lookupsBefore = names().filter((name) => name === "findByUuid").length;
    const res = await send(base, "PATCH", "/user/me/password", {
        body: { currentPassword: PASSWORD, newPassword: "new-pw-456" }, cookie: accessCookie(),
    });
    assert.equal(res.status, 429);
    assert.equal((await res.json()).code, "PASSWORD_CHANGE_LOCKED");
    assert.equal(names().filter((name) => name === "findByUuid").length, lookupsBefore, "잠긴 동안은 비번 비교까지 가면 안 됩니다");
});

test("BE-051: 비번 바꾸기 currentPassword가 글자가 아니면 500이 아니라 400", async (t) => {
    stubRepo(t);
    const base = await startServer(t);
    const res = await send(base, "PATCH", "/user/me/password", {
        body: { currentPassword: 12345678, newPassword: "new-pw-456" }, cookie: accessCookie(),
    });
    assert.equal(res.status, 400);
});

test("known-issues 본문 없는 요청: 닉네임·비번 바꾸기에 본문이 없어도 500이 아니라 400", async (t) => {
    stubRepo(t);
    const base = await startServer(t);
    assert.equal((await send(base, "PATCH", "/user/me/nickname", { cookie: accessCookie() })).status, 400);
    assert.equal((await send(base, "PATCH", "/user/me/password", { cookie: accessCookie() })).status, 400);
});

test("비번 바꾸기 성공 응답에 다시 로그인 필요 표시를 더함 (지금 세션도 끊기는 설계)", async (t) => {
    passwordService.__resetWrongPasswordAttemptsForTests();
    const user = await userRow();
    stubRepo(t, { findByUuid: () => user });
    const base = await startServer(t);

    const res = await send(base, "PATCH", "/user/me/password", {
        body: { currentPassword: PASSWORD, newPassword: "new-pw-456" }, cookie: accessCookie(),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.reloginRequired, true);
});

// ── 로그아웃 ──

test("BE-056: access가 만료된 채 로그아웃해도 그 세션을 끊고 두 쿠키를 지운다", async (t) => {
    const { argsOf } = stubRepo(t);
    const base = await startServer(t);
    const expired = jwt.sign({ uuid: "uuid-1", role: "USER", sessionId: "session-9", exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);

    const res = await send(base, "POST", "/auth/logout", { cookie: `accessToken=${expired}; refreshToken=raw-r` });

    assert.equal(res.status, 200);
    assert.deepEqual(argsOf("recordLogout"), ["uuid-1", "session-9"]);
    const cleared = res.headers.getSetCookie();
    assert.ok(cleared.some((c) => c.startsWith("accessToken=;")));
    assert.ok(cleared.some((c) => c.startsWith("refreshToken=;")));
});

test("BE-056: access 없이 refresh 쿠키만 있어도 그 refresh의 세션을 찾아 끊는다", async (t) => {
    const raw = "raw-refresh-only";
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const { argsOf } = stubRepo(t, {
        findSessionForRefresh: (presented) => (presented === hash ? { id: "session-r", user_id: "uuid-1", revoked_at: null } : null),
    });
    const base = await startServer(t);

    const res = await send(base, "POST", "/auth/logout", { cookie: `refreshToken=${raw}` });

    assert.equal(res.status, 200);
    assert.deepEqual(argsOf("recordLogout"), ["uuid-1", "session-r"]);
    assert.ok(res.headers.getSetCookie().some((c) => c.startsWith("refreshToken=;")));
});

test("BE-055: 이미 끊긴 세션의 로그아웃은 로그인 기록을 닫지 않는다 (새 기기 기록 보호)", async (t) => {
    const db = require("../../models");
    const originals = { UserSession: db.UserSession, LoginHistory: db.LoginHistory };
    let historyClosed = false;
    db.UserSession = { update: async () => [0] };
    db.LoginHistory = { findOne: async () => ({ update: async () => { historyClosed = true; } }) };
    t.after(() => Object.assign(db, originals));

    await require("../../repositories/user/session").recordLogout("uuid-1", "old-session");
    assert.equal(historyClosed, false);

    db.UserSession = { update: async () => [1] };
    await require("../../repositories/user/session").recordLogout("uuid-1", "live-session");
    assert.equal(historyClosed, true);
});

// ── 소셜 ──

test("known-issues 소셜 정지: 연결된 계정이 정지 중이면 세션 없이 403 ACCOUNT_BANNED (사유는 안 실음)", async (t) => {
    const issued = [];
    const original = authService.issueSessionForUser;
    authService.issueSessionForUser = async (...args) => { issued.push(args); return { token: "t" }; };
    t.after(() => { authService.issueSessionForUser = original; });
    stubRepo(t, {
        findExternalIdentity: () => ({ provider: "google", subject: "s", user_id: "uuid-1" }),
        findByUuid: () => ({ uuid: "uuid-1", status: "ACTIVE" }),
        checkActiveBan: () => ({ reason: "비밀 사유" }),
    });

    await assert.rejects(
        socialAuthService.resolveOAuthAccount({ provider: "google", subject: "s", email: null, cancelled: false }),
        (error) => error.status === 403 && error.code === "ACCOUNT_BANNED" && !/비밀 사유/.test(error.message),
    );
    assert.equal(issued.length, 0);
});

test("known-issues 소셜 로그인 기록: 연결된 계정 로그인은 로그인 기록을 남긴 뒤 세션을 준다", async (t) => {
    const original = authService.issueSessionForUser;
    authService.issueSessionForUser = async () => ({ token: "t", refreshToken: null, refreshTokenExpiresAt: null });
    t.after(() => { authService.issueSessionForUser = original; });
    const { argsOf } = stubRepo(t, {
        findExternalIdentity: () => ({ provider: "discord", subject: "s", user_id: "uuid-1" }),
        findByUuid: () => ({ uuid: "uuid-1", status: "ACTIVE" }),
    });

    const result = await socialAuthService.resolveOAuthAccount({
        provider: "discord", subject: "s", email: null, cancelled: false, reqInfo: { ip: "1.2.3.4", userAgent: "ua" },
    });
    assert.equal(result.status, "LOGIN");
    assert.deepEqual(argsOf("createLoginHistory")[0], { user_id: "uuid-1", ip_address: "1.2.3.4", user_agent: "ua", success: true });
});

test("known-issues 소셜 가입 이메일: 제공자 이메일로 그사이 가입한 계정이 있으면 일반 409 대신 EMAIL_CONFLICT", async (t) => {
    const intent = {
        id: 7, provider: "google", subject: "s", email: "taken@example.com",
        consumed_at: null, expires_at: new Date(Date.now() + 60_000),
    };
    const { names } = stubRepo(t, {
        findIntentByHash: () => intent,
        findByEmail: (email) => (email === "taken@example.com" ? { uuid: "other" } : null),
        findByNickname: () => null,
        createUser: () => { throw new Error("만들면 안 됨"); },
    });

    await assert.rejects(
        socialAuthService.completeSocialSignup({ intentToken: "i", nickname: "새닉네임", birthDate: "2000-01-01" }),
        (error) => error.status === 409 && error.code === "EMAIL_CONFLICT",
    );
    assert.equal(names().includes("createUser"), false);
});

test("BE-008: 가입 의도 확인도 이 브라우저의 가입 시도 쿠키가 없으면 INTENT_EXPIRED로 거절", async (t) => {
    const original = socialAuthService.getSocialSignupIntent;
    let called = false;
    socialAuthService.getSocialSignupIntent = async () => { called = true; return { emailVerificationRequired: false }; };
    t.after(() => { socialAuthService.getSocialSignupIntent = original; });
    const base = await startServer(t);

    const res = await send(base, "POST", "/auth/social/signup/intent", { body: { intentToken: "attacker-intent" } });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.code, "INTENT_EXPIRED");
    assert.equal(called, false);
});
