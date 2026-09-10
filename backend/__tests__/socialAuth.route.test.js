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
// 동일한 원칙)을 지키는지 확인한다. socialAuth.service.js 자체의 트랜잭션/state 로직은
// 여기서 다시 검증하지 않고 스텁으로 대체한다(auth.login.regression.test.js·
// profile.updatePassword.sessionRevocation.test.js와 같은 패턴).
//
// R-IMPL(운영자 코드 검토): POST /auth/social/link·/auth/social/link/state는 이전 회차에
// 등록되어 있었으나, 인증된 사용자라도 요청 본문의 provider/subject/email은 서버가 검증한
// 적 없는 클라이언트 주장일 뿐이었다 — state·세션 검증을 통과해도 그 값 자체의 진위는
// 증명되지 않아, 로그인한 사용자가 임의의 소셜 identity를 자기 계정에 선점할 수 있었다.
// 이번 회차는 그 두 라우트를 auth.routes.js에서 제거했다(내부 전용 서비스 계약으로만
// 남김). 아래 테스트는 "제거됨"을 회귀로 고정한다 — 인증·유효 state가 있어도 조작한
// provider/subject로는 이 경로를 통해 identity를 만들 수 없음을(라우트 자체가 없어 서비스
// 계층에 도달조차 하지 않음을) 검증한다.

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");
const jwt          = require("jsonwebtoken");

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

// ── F-06 R-IMPL #2: googleAuthCallback이 SIGNUP_REQUIRED에서 다시 서명해 둔 oauthAttempt
// 쿠키로 rememberMe 선택이 이 완료 단계까지 보존되는지 검증한다. 요청 본문에 rememberMe를
// 실어도 무시되어야 한다 — 서버가 로그인 시작 시점에 서명한 값만 신뢰한다.

const signAttempt = (payload, ttlSeconds = 1800) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ttlSeconds });

test("SIGNUP_REQUIRED 콜백이 남긴 서명 쿠키에 rememberMe:true가 있으면 완료 서비스에 그대로 전달되고 영속 쿠키로 반영된다(AC-02)", async (t) => {
    const { calls } = stubSocialAuthService(t, {
        completeSocialSignup: async () => ({
            user: { uuid: "new-uuid", nickname: "소셜닉", role: "USER" },
            token: "remembered-access-token",
            refreshToken: "remembered-refresh-token",
            refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }),
    });
    const base = await startServer(t);

    const attemptCookie = signAttempt({ intentToken: "intent-1", rememberMe: true, purpose: "signup" });
    const res = await postJson(base, "/auth/social/signup/complete",
        { intentToken: "intent-1", nickname: "소셜닉" },
        { cookie: `oauthAttempt=${attemptCookie}` },
    );

    assert.equal(res.status, 200);
    assert.equal(calls[0].args[0].rememberMe, true, "완료 서비스는 서명 쿠키의 rememberMe를 그대로 받아야 합니다");

    const accessCookie = findSetCookie(res, "accessToken");
    assert.match(accessCookie, /Max-Age/i, "rememberMe:true면 영속 쿠키여야 합니다");
    const refreshCookie = findSetCookie(res, "refreshToken");
    assert.match(refreshCookie, /^refreshToken=remembered-refresh-token/);
});

test("쿠키의 intentToken이 지금 제출된 것과 다르면(다른 시도의 쿠키 재사용) rememberMe는 false로 떨어진다", async (t) => {
    const { calls } = stubSocialAuthService(t, {
        completeSocialSignup: async () => ({
            user: { uuid: "new-uuid", nickname: "소셜닉", role: "USER" },
            token: "fake-access-token", refreshToken: null, refreshTokenExpiresAt: null,
        }),
    });
    const base = await startServer(t);

    const attemptCookie = signAttempt({ intentToken: "other-intent", rememberMe: true, purpose: "signup" });
    const res = await postJson(base, "/auth/social/signup/complete",
        { intentToken: "intent-1", nickname: "소셜닉" },
        { cookie: `oauthAttempt=${attemptCookie}` },
    );

    assert.equal(res.status, 200);
    assert.equal(calls[0].args[0].rememberMe, false);
});

test("서명 쿠키가 없거나 다른 비밀키로 위조되었으면 요청 본문의 rememberMe는 무시되고 항상 false가 전달된다(F-06 R-IMPL #2)", async (t) => {
    const { calls } = stubSocialAuthService(t, {
        completeSocialSignup: async () => ({
            user: { uuid: "new-uuid", nickname: "소셜닉", role: "USER" },
            token: "fake-access-token", refreshToken: null, refreshTokenExpiresAt: null,
        }),
    });
    const base = await startServer(t);

    const noCookieRes = await postJson(base, "/auth/social/signup/complete",
        { intentToken: "intent-1", nickname: "소셜닉", rememberMe: true });
    assert.equal(calls[0].args[0].rememberMe, false);

    const forged = jwt.sign({ intentToken: "intent-1", rememberMe: true, purpose: "signup" }, "wrong-secret", { expiresIn: 1800 });
    const forgedRes = await postJson(base, "/auth/social/signup/complete",
        { intentToken: "intent-1", nickname: "소셜닉", rememberMe: true },
        { cookie: `oauthAttempt=${forged}` },
    );
    assert.equal(calls[1].args[0].rememberMe, false);

    assert.equal(noCookieRes.status, 200);
    assert.equal(forgedRes.status, 200);
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

// ── POST /auth/social/link/state, POST /auth/social/link (R-IMPL: 라우트 제거됨) ─────

test("인증 없이 링크 state 발급을 요청해도 라우트가 없어 404이고 서비스는 호출되지 않는다", async (t) => {
    const { calls } = stubSocialAuthService(t);
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link/state", { browserFingerprint: "fp-1" });

    assert.equal(res.status, 404);
    assert.equal(calls.length, 0, "제거된 라우트는 서비스 계층까지 도달하면 안 됩니다");
});

test("유효한 세션 쿠키로 링크 state 발급을 요청해도 라우트가 없어 404이고 서비스는 호출되지 않는다", async (t) => {
    stubAuthGate(t, { sessionActive: true });
    const { calls } = stubSocialAuthService(t);
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link/state", { browserFingerprint: "fp-1" },
        { cookie: `accessToken=${TOKEN}` });

    assert.equal(res.status, 404);
    assert.equal(calls.length, 0);
});

test("인증·유효 state가 있다고 주장해도 연결 실행 라우트가 없어 조작한 provider/subject로 identity를 만들 수 없다(404, 서비스 미호출)", async (t) => {
    stubAuthGate(t, { sessionActive: true });
    const { calls } = stubSocialAuthService(t);
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link", {
        provider: "google", subject: "attacker-forged-subject", email: "victim@example.com",
        rawState: "state-1", browserFingerprint: "fp-1",
    }, { cookie: `accessToken=${TOKEN}` });

    assert.equal(res.status, 404);
    assert.equal(calls.length, 0, "조작한 provider/subject를 실어도 socialAuthService.linkExternalIdentity가 호출되면 안 됩니다");
});

test("로그아웃(세션 폐기)된 토큰으로도 연결 실행 라우트는 여전히 존재하지 않는다(404)", async (t) => {
    stubAuthGate(t, { sessionActive: false });
    const { calls } = stubSocialAuthService(t);
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/link",
        { provider: "google", subject: "sub-1", rawState: "state-1", browserFingerprint: "fp-1" },
        { cookie: `accessToken=${TOKEN}` },
    );

    assert.equal(res.status, 404);
    assert.equal(calls.length, 0);
});
