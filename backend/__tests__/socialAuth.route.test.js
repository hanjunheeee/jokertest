process.env.JWT_SECRET = "social-auth-route-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱한다(연결은 시도하지 않는다).
// npm test는 --env-file=.env.test로 이 값을 주지만, 파일 하나만 직접 실행할 때도 동작하도록
// 없을 때만 더미 값을 채운다(profile.updatePassword.sessionRevocation.test.js와 동일).
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

// F-05 AC-04/AC-06 — 서버 라우트·쿠키 계약 HTTP 통합 테스트.
//
// backend/tests/db/f05-social-auth.integration.test.js는 socialAuth.service.js의 트랜잭션
// 로직을 격리 DB로 검증한다(이 저장소에서는 F01_TEST_DATABASE_URL이 없어 skip될 수 있다).
// 이 파일은 그와 다른 층을 검증한다 — completeSocialSignupApi(프론트)가 실제로 호출하는
// POST /auth/social/signup/complete 라우트가 존재하고, Set-Cookie 계약(login 컨트롤러와
// 동일한 원칙)을 지키는지, 그리고 AC-04의 핵심(연결 요청의 userId/sessionId는 요청 본문이
// 아니라 verifyToken이 검증한 req.user에서만 나온다)을 실제 Express 미들웨어 체인으로
// 확인한다. socialAuth.service.js 자체의 트랜잭션/state 로직은 여기서 다시 검증하지 않고
// 스텁으로 대체한다(auth.login.regression.test.js·profile.updatePassword.sessionRevocation
// .test.js와 같은 패턴).

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const { generateToken } = require("../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");
const userRepository    = require("../repositories/user.repositories");
const socialAuthService = require("../service/socialAuth.service");

const REPO_KEYS = ["findActiveSession", "checkActiveBan"];
const SERVICE_KEYS = ["completeSocialSignup", "issueOAuthState", "linkExternalIdentity"];

// verifyToken(auth.middleware.js) → sessionLifecycle.resolveSession은 userRepository를
// 통해서만 세션 상태를 읽는다. 이 두 함수만 스텁하면 "지금 유효한 세션"과 "이미 폐기된
// 세션"을 실제 미들웨어 체인을 그대로 태우면서 재현할 수 있다.
const stubAuthGate = (t, { sessionActive = true } = {}) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    userRepository.findActiveSession = async (id, userId) =>
        sessionActive ? { id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null } : null;
    userRepository.checkActiveBan = async () => null;
    t.after(() => Object.assign(userRepository, originals));
};

const stubSocialAuthService = (t, overrides = {}) => {
    const originals = Object.fromEntries(SERVICE_KEYS.map((key) => [key, socialAuthService[key]]));
    const calls = [];
    for (const key of SERVICE_KEYS) {
        socialAuthService[key] = overrides[key]
            ? (...args) => { calls.push({ name: key, args }); return overrides[key](...args); }
            : (...args) => { calls.push({ name: key, args }); throw new Error(`stub for ${key} not provided`); };
    }
    t.after(() => Object.assign(socialAuthService, originals));
    return { calls, lastCall: (name) => [...calls].reverse().find((c) => c.name === name) };
};

const startServer = async (t) => {
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

const TOKEN = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-1" });

const postJson = (base, path, body, extraHeaders = {}) =>
    fetch(`${base}${path}`, {
        method:  "POST",
        headers: { "content-type": "application/json", ...extraHeaders },
        body:    JSON.stringify(body ?? {}),
    });

// ── POST /auth/social/signup/complete ────────────────────────────────────────

test("가입 완료 성공 시 accessToken 세션 쿠키를 발급하고 이전 영속 refreshToken 쿠키를 지운다", async (t) => {
    stubSocialAuthService(t, {
        completeSocialSignup: async () => ({
            user: { uuid: "new-uuid", nickname: "소셜닉", role: "USER" },
            token: "fake-access-token",
            refreshToken: null,
            refreshTokenExpiresAt: null,
        }),
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/signup/complete",
        { intentToken: "intent-1", nickname: "소셜닉" },
        { cookie: "refreshToken=stale-persistent-refresh-token" },
    );
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data.user, { uuid: "new-uuid", nickname: "소셜닉", role: "USER" });

    const accessCookie = findSetCookie(res, "accessToken");
    assert.ok(accessCookie, "accessToken 쿠키가 응답에 없습니다");
    assert.match(accessCookie, /^accessToken=fake-access-token/);
    assert.doesNotMatch(accessCookie, /Max-Age/i, "소셜 가입 완료는 rememberMe:false이므로 세션 쿠키여야 합니다");

    const refreshCookie = findSetCookie(res, "refreshToken");
    assert.ok(refreshCookie, "이전 영속 refreshToken 쿠키를 지우는 Set-Cookie가 있어야 합니다");
    assert.match(refreshCookie, /^refreshToken=;/, "삭제 쿠키는 값이 비어 있어야 합니다");
    assert.match(refreshCookie, /Expires=/i);
});

test("가입 자격이 만료되면(INTENT_EXPIRED) 서비스 오류의 status·code가 그대로 응답에 실린다", async (t) => {
    stubSocialAuthService(t, {
        completeSocialSignup: async () => {
            const error = new Error("가입 가능 시간이 만료되었습니다. 다시 로그인해주세요.");
            error.status = 400;
            error.code = "INTENT_EXPIRED";
            throw error;
        },
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/signup/complete", { intentToken: "expired", nickname: "닉" });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.code, "INTENT_EXPIRED");
    assert.equal(findSetCookie(res, "accessToken"), undefined, "실패 시 세션 쿠키를 발급하면 안 됩니다");
});

// ── POST /auth/social/link/state ─────────────────────────────────────────────

test("인증 쿠키 없이 링크 state 발급을 요청하면 401이고 서비스는 호출되지 않는다", async (t) => {
    const { calls } = stubSocialAuthService(t);
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link/state", { browserFingerprint: "fp-1" });

    assert.equal(res.status, 401);
    assert.equal(calls.length, 0, "인증되지 않은 요청은 서비스 계층까지 도달하면 안 됩니다");
});

test("로그아웃(세션 폐기)된 토큰으로는 링크 state 발급 요청 자체가 verifyToken에서 401로 거부된다", async (t) => {
    stubAuthGate(t, { sessionActive: false });
    const { calls } = stubSocialAuthService(t);
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link/state", { browserFingerprint: "fp-1" },
        { cookie: `accessToken=${TOKEN}` });

    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
});

test("링크 state 발급은 verifyToken이 검증한 req.user의 uuid·sessionId만 쓰고 요청 본문 값은 무시한다", async (t) => {
    stubAuthGate(t, { sessionActive: true });
    const { lastCall } = stubSocialAuthService(t, {
        issueOAuthState: async () => ({ state: "raw-state", expiresAt: new Date() }),
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link/state",
        { browserFingerprint: "fp-1", userId: "attacker-uuid", sessionId: "attacker-session" },
        { cookie: `accessToken=${TOKEN}` },
    );
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.data.state, "raw-state");

    const call = lastCall("issueOAuthState");
    assert.equal(call.args[0].userId, "uuid-1", "req.user.uuid가 아니라 요청 본문의 값을 썼습니다");
    assert.equal(call.args[0].sessionId, "session-1", "req.user.sessionId가 아니라 요청 본문의 값을 썼습니다");
    assert.equal(call.args[0].purpose, "link");
});

// ── POST /auth/social/link ───────────────────────────────────────────────────

test("인증 쿠키 없이 연결 실행을 요청하면 401이고 서비스는 호출되지 않는다", async (t) => {
    const { calls } = stubSocialAuthService(t);
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link",
        { provider: "google", subject: "sub-1", rawState: "state-1", browserFingerprint: "fp-1" });

    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
});

test("로그아웃(세션 폐기)된 토큰으로는 연결 실행 요청 자체가 verifyToken에서 401로 거부된다", async (t) => {
    stubAuthGate(t, { sessionActive: false });
    const { calls } = stubSocialAuthService(t);
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link",
        { provider: "google", subject: "sub-1", rawState: "state-1", browserFingerprint: "fp-1" },
        { cookie: `accessToken=${TOKEN}` },
    );

    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
});

test("연결 실행은 verifyToken이 검증한 req.user의 uuid·sessionId만 쓰고 요청 본문의 userId·sessionId는 무시한다", async (t) => {
    stubAuthGate(t, { sessionActive: true });
    const { lastCall } = stubSocialAuthService(t, {
        linkExternalIdentity: async () => ({ id: 1, provider: "google", subject: "sub-1", user_id: "uuid-1" }),
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link", {
        provider: "google", subject: "sub-1", rawState: "state-1", browserFingerprint: "fp-1",
        userId: "attacker-uuid", sessionId: "attacker-session",
    }, { cookie: `accessToken=${TOKEN}` });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.data.user_id, "uuid-1");

    const call = lastCall("linkExternalIdentity");
    assert.equal(call.args[0].userId, "uuid-1");
    assert.equal(call.args[0].sessionId, "session-1");
});

test("이미 다른 계정에 연결된 소셜 계정이면(IDENTITY_ALREADY_LINKED) 409가 그대로 응답에 실린다", async (t) => {
    stubAuthGate(t, { sessionActive: true });
    stubSocialAuthService(t, {
        linkExternalIdentity: async () => {
            const error = new Error("이미 다른 계정에 연결된 소셜 계정입니다.");
            error.status = 409;
            error.code = "IDENTITY_ALREADY_LINKED";
            throw error;
        },
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link",
        { provider: "google", subject: "sub-1", rawState: "state-1", browserFingerprint: "fp-1" },
        { cookie: `accessToken=${TOKEN}` },
    );
    const body = await res.json();

    assert.equal(res.status, 409);
    assert.equal(body.code, "IDENTITY_ALREADY_LINKED");
});
