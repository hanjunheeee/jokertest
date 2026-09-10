process.env.JWT_SECRET = "google-auth-route-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱한다(연결은 시도하지 않는다).
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "https://frontend.example.test";

// F-06 AC-01/AC-02/AC-03/AC-04 — Google OAuth 시작·콜백 라우트의 서버 계약 HTTP 통합
// 테스트입니다.
//
// socialAuth.service.js(F-05)의 state·트랜잭션 로직 자체와 googleOAuth.service.js의 실제
// Google 네트워크 교환은 여기서 다시 검증하지 않고 스텁으로 대체합니다(socialAuth.route.
// test.js와 같은 패턴) — 이 파일은 그 위 계층, 즉 "버튼 클릭이 시작 라우트를 부르고, 콜백이
// 결과에 따라 올바른 쿠키·리다이렉트로 이어지는지"만 검증합니다.

const test         = require("node:test");
const assert       = require("node:assert/strict");
const http         = require("node:http");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");
const authService        = require("../service/auth.service");
const socialAuthService  = require("../service/socialAuth.service");
const googleOAuthService = require("../service/googleOAuth.service");

const SOCIAL_KEYS = ["issueOAuthState", "handleOAuthCallback"];
const GOOGLE_KEYS  = ["buildAuthorizationUrl", "exchangeCodeForProfile"];

const stubModule = (t, mod, keys, overrides = {}) => {
    const originals = Object.fromEntries(keys.map((key) => [key, mod[key]]));
    const calls = [];
    for (const key of keys) {
        mod[key] = overrides[key]
            ? (...args) => { calls.push({ name: key, args }); return overrides[key](...args); }
            : (...args) => { calls.push({ name: key, args }); throw new Error(`stub for ${key} not provided`); };
    }
    t.after(() => Object.assign(mod, originals));
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

// fetch(redirect:"manual")는 Node(undici)에서도 명세대로 opaqueredirect를 돌려줘 status/
// header를 읽을 수 없다 — Location·Set-Cookie를 직접 확인해야 하므로 http.request로 리다
// 이렉트를 그대로 받는다(따라가지 않는다).
const rawGet = (base, path, { cookie } = {}) => new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = http.request(url, { method: "GET", headers: cookie ? { cookie } : {} }, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
});

const setCookies = (headers) => headers["set-cookie"] ?? [];
const findSetCookie = (headers, name) => setCookies(headers).find((c) => c.startsWith(`${name}=`));

// ── GET /auth/google (AC-01: 시작) ───────────────────────────────────────────

test("GET /auth/google은 state를 발급해 Google 인가 URL로 302 리다이렉트하고 fp·rememberMe 쿠키를 세팅한다", async (t) => {
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        issueOAuthState: async () => ({ state: "raw-state-1", expiresAt: new Date() }),
    });
    const google = stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        buildAuthorizationUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google?rememberMe=true");

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, "https://accounts.google.com/o/oauth2/v2/auth?state=raw-state-1");

    const issueArgs = social.lastCall("issueOAuthState").args[0];
    assert.equal(issueArgs.purpose, "login");
    assert.ok(typeof issueArgs.browserFingerprint === "string" && issueArgs.browserFingerprint.length > 0);

    assert.equal(google.lastCall("buildAuthorizationUrl").args[0], "raw-state-1");

    const fpCookie = findSetCookie(res.headers, "oauthFp");
    assert.ok(fpCookie, "oauthFp 쿠키가 세팅되어야 합니다");
    assert.match(fpCookie, /HttpOnly/i);

    const rememberCookie = findSetCookie(res.headers, "oauthRememberMe");
    assert.match(rememberCookie, /^oauthRememberMe=1/);
});

test("rememberMe를 지정하지 않으면 oauthRememberMe 쿠키는 0으로 세팅된다", async (t) => {
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        issueOAuthState: async () => ({ state: "raw-state-2", expiresAt: new Date() }),
    });
    stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        buildAuthorizationUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google");

    assert.match(findSetCookie(res.headers, "oauthRememberMe"), /^oauthRememberMe=0/);
});

// ── GET /auth/google/callback (AC-01/AC-02: 재로그인·가입 보완) ──────────────

test("재로그인(LOGIN) 콜백은 세션 쿠키를 세팅하고 /lobby로 리다이렉트한다", async (t) => {
    const google = stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => ({ subject: "sub-1", email: "a@b.com" }),
    });
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        handleOAuthCallback: async () => ({
            status: "LOGIN",
            user: { uuid: "uuid-1", role: "USER" },
            token: "fake-access-token",
            refreshToken: null,
            refreshTokenExpiresAt: null,
        }),
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google/callback?code=auth-code-1&state=state-1", {
        cookie: "oauthFp=fp-1; oauthRememberMe=0",
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/lobby`);

    const accessCookie = findSetCookie(res.headers, "accessToken");
    assert.match(accessCookie, /^accessToken=fake-access-token/);
    assert.doesNotMatch(accessCookie, /Max-Age/i, "rememberMe:0이면 세션 쿠키여야 합니다");

    assert.equal(google.lastCall("exchangeCodeForProfile").args[0], "auth-code-1");
    const callbackArgs = social.lastCall("handleOAuthCallback").args[0];
    assert.equal(callbackArgs.provider, "google");
    assert.equal(callbackArgs.subject, "sub-1");
    assert.equal(callbackArgs.email, "a@b.com");
    assert.equal(callbackArgs.rawState, "state-1");
    assert.equal(callbackArgs.browserFingerprint, "fp-1");
    assert.equal(callbackArgs.cancelled, false);

    // 왕복 전용 쿠키는 콜백 한 번으로 지워져야 한다.
    assert.match(findSetCookie(res.headers, "oauthFp"), /^oauthFp=;/);
    assert.match(findSetCookie(res.headers, "oauthRememberMe"), /^oauthRememberMe=;/);
});

test("재로그인 + rememberMe=1 쿠키가 있으면 로그인 유지 세션으로 다시 발급한다(AC-02)", async (t) => {
    stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => ({ subject: "sub-1", email: "a@b.com" }),
    });
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        handleOAuthCallback: async () => ({
            status: "LOGIN",
            user: { uuid: "uuid-1", role: "USER" },
            token: "non-remembered-token",
            refreshToken: null,
            refreshTokenExpiresAt: null,
        }),
    });

    const originalIssue = authService.issueSessionForUser;
    const issueCalls = [];
    authService.issueSessionForUser = async (user, opts, reqInfo) => {
        issueCalls.push({ user, opts, reqInfo });
        return {
            token: "remembered-access-token",
            refreshToken: "remembered-refresh-token",
            refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        };
    };
    t.after(() => { authService.issueSessionForUser = originalIssue; });

    const base = await startServer(t);
    const res = await rawGet(base, "/auth/google/callback?code=auth-code-1&state=state-1", {
        cookie: "oauthFp=fp-1; oauthRememberMe=1",
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/lobby`);
    assert.equal(issueCalls.length, 1);
    assert.equal(issueCalls[0].user.uuid, "uuid-1");
    assert.deepEqual(issueCalls[0].opts, { rememberMe: true });

    const accessCookie = findSetCookie(res.headers, "accessToken");
    assert.match(accessCookie, /^accessToken=remembered-access-token/);
    assert.match(accessCookie, /Max-Age/i, "rememberMe:1이면 영속 쿠키여야 합니다");

    const refreshCookie = findSetCookie(res.headers, "refreshToken");
    assert.match(refreshCookie, /^refreshToken=remembered-refresh-token/);
});

test("신규 계정(SIGNUP_REQUIRED) 콜백은 세션 쿠키 없이 intentToken을 실어 로그인 화면으로 리다이렉트한다(AC-02)", async (t) => {
    stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => ({ subject: "sub-2", email: "new@b.com" }),
    });
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        handleOAuthCallback: async () => ({
            status: "SIGNUP_REQUIRED", intentToken: "intent-token-1", email: "new@b.com", expiresAt: new Date(),
        }),
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google/callback?code=auth-code-2&state=state-2", {
        cookie: "oauthFp=fp-1; oauthRememberMe=0",
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialIntent=intent-token-1`);
    assert.equal(findSetCookie(res.headers, "accessToken"), undefined, "가입 보완 전에는 세션 쿠키를 발급하면 안 됩니다");
});

// ── AC-04: 취소·잘못된 state·재사용된 콜백·이메일 충돌 ───────────────────────

test("사용자가 Google 동의 화면에서 취소하면(error 파라미터) 코드 교환 없이 취소로 처리되어 오류 리다이렉트된다", async (t) => {
    const google = stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => { throw new Error("취소된 콜백에서는 호출되면 안 됩니다"); },
    });
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        handleOAuthCallback: async ({ cancelled }) => {
            assert.equal(cancelled, true);
            const error = new Error("사용자가 로그인을 취소했습니다.");
            error.status = 400; error.code = "OAUTH_CANCELLED";
            throw error;
        },
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google/callback?error=access_denied&state=state-3", {
        cookie: "oauthFp=fp-1; oauthRememberMe=0",
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=OAUTH_CANCELLED`);
    assert.equal(google.calls.length, 0);
    assert.equal(findSetCookie(res.headers, "accessToken"), undefined);
});

for (const [scenario, code, status] of [
    ["잘못된(위조된) state", "STATE_INVALID", 400],
    ["재사용된 콜백", "STATE_REUSED", 409],
    ["기존 이메일과의 충돌", "EMAIL_CONFLICT", 409],
]) {
    test(`${scenario}는 자동 병합·세션 발급 없이 socialError=${code}로 리다이렉트된다(AC-04)`, async (t) => {
        stubModule(t, googleOAuthService, GOOGLE_KEYS, {
            exchangeCodeForProfile: async () => ({ subject: "sub-x", email: "x@y.com" }),
        });
        stubModule(t, socialAuthService, SOCIAL_KEYS, {
            handleOAuthCallback: async () => {
                const error = new Error(`시뮬레이션된 ${code}`);
                error.status = status; error.code = code;
                throw error;
            },
        });
        const base = await startServer(t);

        const res = await rawGet(base, "/auth/google/callback?code=auth-code-x&state=state-x", {
            cookie: "oauthFp=fp-1; oauthRememberMe=0",
        });

        assert.equal(res.statusCode, 302);
        assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=${code}`);
        assert.equal(findSetCookie(res.headers, "accessToken"), undefined);
    });
}

// ── AC-03: 클라이언트 비밀키는 환경변수로만 주입된다 ─────────────────────────

test("GOOGLE_CLIENT_SECRET 환경변수가 없으면 코드 교환이 하드코딩된 값 없이 설정 오류로 거부된다", async (t) => {
    const originalId     = process.env.GOOGLE_CLIENT_ID;
    const originalSecret = process.env.GOOGLE_CLIENT_SECRET;
    const originalUri    = process.env.GOOGLE_REDIRECT_URI;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    delete process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_REDIRECT_URI = "https://backend.example.test/auth/google/callback";
    t.after(() => {
        if (originalId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = originalId;
        if (originalSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = originalSecret;
        if (originalUri === undefined) delete process.env.GOOGLE_REDIRECT_URI; else process.env.GOOGLE_REDIRECT_URI = originalUri;
    });

    await assert.rejects(
        () => googleOAuthService.exchangeCodeForProfile("some-code"),
        (error) => error.code === "GOOGLE_OAUTH_NOT_CONFIGURED",
    );
});

test("GOOGLE_CLIENT_ID/REDIRECT_URI가 설정되어 있으면 인가 URL에 하드코딩 없이 그 값이 그대로 실린다", async (t) => {
    const originalId  = process.env.GOOGLE_CLIENT_ID;
    const originalUri = process.env.GOOGLE_REDIRECT_URI;
    process.env.GOOGLE_CLIENT_ID = "env-client-id";
    process.env.GOOGLE_REDIRECT_URI = "https://backend.example.test/auth/google/callback";
    t.after(() => {
        if (originalId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = originalId;
        if (originalUri === undefined) delete process.env.GOOGLE_REDIRECT_URI; else process.env.GOOGLE_REDIRECT_URI = originalUri;
    });

    const url = googleOAuthService.buildAuthorizationUrl("state-abc");
    assert.match(url, /client_id=env-client-id/);
    assert.match(url, /redirect_uri=https/);
    assert.match(url, /state=state-abc/);
});
