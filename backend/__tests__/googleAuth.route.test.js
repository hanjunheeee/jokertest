process.env.JWT_SECRET = "google-auth-route-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱한다(연결은 시도하지 않는다).
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "https://frontend.example.test";

// F-06 AC-01/AC-02/AC-03/AC-04 — Google OAuth 시작·콜백 라우트의 서버 계약 HTTP 통합
// 테스트입니다.
//
// socialAuth.service.js(F-05)의 state·트랜잭션 로직 자체와 googleOAuth.service.js의 실제
// Google 네트워크 교환은 여기서 다시 검증하지 않고 스텁으로 대체합니다(googleOAuth.service.js
// 자체의 실제 네트워크 왕복은 googleOAuth.service.test.js가 로컬 fixture 서버로 검증합니다) —
// 이 파일은 그 위 계층, 즉 "버튼 클릭이 시작 라우트를 부르고, 콜백이 결과에 따라 올바른
// 쿠키·리다이렉트로 이어지는지"와 "state 소비·제공자 호출·계정 판정의 순서·재사용 방지·
// rememberMe 보존이 실제로 그 순서대로 이어지는지"(R-IMPL #2/#3)를 검증합니다.
//
// R-IMPL #2: 로그인 상태 유지 선택(rememberMe)과 state에 결합되는 browserFingerprint는 더
// 이상 평문 쿠키(oauthFp/oauthRememberMe)가 아니라, 서버가 서명한 단일 JWT 쿠키
// (oauthAttempt)에 담긴다 — 아래 loginAttemptCookie()가 실제 jsonwebtoken으로 이 쿠키를
// 만들어, 컨트롤러의 서명 검증 경로 자체를 실제로 태운다(값을 그대로 믿어주는 스텁이 아님).

const test         = require("node:test");
const assert       = require("node:assert/strict");
const http         = require("node:http");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");
const jwt          = require("jsonwebtoken");

const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");
const authService        = require("../service/auth.service");
const socialAuthService  = require("../service/socialAuth.service");
const googleOAuthService = require("../service/googleOAuth.service");

const SOCIAL_KEYS = ["issueOAuthState", "consumeOAuthState", "resolveOAuthAccount"];
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
// 같은 쿠키 이름에 clearCookie 뒤 다시 cookie()를 호출하면(예: SIGNUP_REQUIRED 분기) 응답에
// 같은 이름의 Set-Cookie가 두 번 실린다 — 브라우저는 마지막 값을 최종 상태로 반영하므로,
// 첫 번째가 아니라 마지막 일치 항목을 최종 상태로 취급해야 한다.
const findSetCookie = (headers, name) => setCookies(headers).filter((c) => c.startsWith(`${name}=`)).at(-1);
const decodedAttemptCookie = (headers) => {
    const raw = findSetCookie(headers, "oauthAttempt");
    if (!raw) return null;
    const token = raw.split(";")[0].split("=")[1];
    return jwt.verify(token, process.env.JWT_SECRET);
};

// 실제 googleAuthStart가 세팅하는 것과 같은 형태의 서명된 시도 쿠키를 만든다 — 컨트롤러의
// jwt.verify 검증 경로를 값 그대로 믿어주는 스텁이 아니라 실제로 태운다.
const loginAttemptCookie = (fp, rememberMe) =>
    `oauthAttempt=${jwt.sign({ fp, rememberMe, purpose: "login" }, process.env.JWT_SECRET, { expiresIn: 600 })}`;

// ── GET /auth/google (AC-01: 시작) ───────────────────────────────────────────

test("GET /auth/google은 state를 발급해 Google 인가 URL로 302 리다이렉트하고 서명된 oauthAttempt 쿠키를 세팅한다", async (t) => {
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

    const attemptCookieRaw = findSetCookie(res.headers, "oauthAttempt");
    assert.ok(attemptCookieRaw, "oauthAttempt 쿠키가 세팅되어야 합니다");
    assert.match(attemptCookieRaw, /HttpOnly/i);

    // R-IMPL #2: 쿠키는 값을 그대로 믿는 평문이 아니라 서버 서명이다 — 여기서 실제로
    // jwt.verify해 payload가 issueOAuthState에 넘긴 fp와 정확히 같은지, rememberMe가
    // 조작 없이 그대로 담겼는지 확인한다.
    const decoded = decodedAttemptCookie(res.headers);
    assert.equal(decoded.purpose, "login");
    assert.equal(decoded.rememberMe, true);
    assert.equal(decoded.fp, issueArgs.browserFingerprint);
});

test("rememberMe를 지정하지 않으면 oauthAttempt 쿠키에 rememberMe:false가 서명된다", async (t) => {
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        issueOAuthState: async () => ({ state: "raw-state-2", expiresAt: new Date() }),
    });
    stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        buildAuthorizationUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google");

    const decoded = decodedAttemptCookie(res.headers);
    assert.equal(decoded.rememberMe, false);
});

// ── GET /auth/google/callback (AC-01/AC-02: 재로그인·가입 보완, R-IMPL #2/#3: 순서·이중발급) ──

test("재로그인(LOGIN) 콜백은 state를 먼저 소비한 뒤 제공자를 불러 세션 쿠키를 세팅하고 /lobby로 리다이렉트한다(AC-01, R-IMPL #3 순서)", async (t) => {
    const callOrder = [];
    const google = stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async (code) => {
            callOrder.push("exchange");
            assert.equal(code, "auth-code-1");
            return { subject: "sub-1", email: "a@b.com" };
        },
    });
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async () => { callOrder.push("consume"); return { purpose: "login", userId: null, sessionId: null }; },
        resolveOAuthAccount: async () => ({
            status: "LOGIN",
            user: { uuid: "uuid-1", role: "USER" },
            token: "fake-access-token",
            refreshToken: null,
            refreshTokenExpiresAt: null,
        }),
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google/callback?code=auth-code-1&state=state-1", {
        cookie: loginAttemptCookie("fp-1", false),
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/lobby`);
    assert.deepEqual(callOrder, ["consume", "exchange"], "state 소비가 제공자 호출보다 먼저 일어나야 합니다(R-IMPL #3)");

    const accessCookie = findSetCookie(res.headers, "accessToken");
    assert.match(accessCookie, /^accessToken=fake-access-token/);
    assert.doesNotMatch(accessCookie, /Max-Age/i, "rememberMe:false면 세션 쿠키여야 합니다");

    const consumeArgs = social.lastCall("consumeOAuthState").args;
    assert.equal(consumeArgs[0], "state-1");
    assert.equal(consumeArgs[1].browserFingerprint, "fp-1");
    assert.equal(consumeArgs[1].purpose, "login");

    const resolveArgs = social.lastCall("resolveOAuthAccount").args[0];
    assert.equal(resolveArgs.provider, "google");
    assert.equal(resolveArgs.subject, "sub-1");
    assert.equal(resolveArgs.email, "a@b.com");
    assert.equal(resolveArgs.cancelled, false);
    assert.equal(resolveArgs.rememberMe, false);

    // 왕복 전용 쿠키는 콜백 한 번으로 지워져야 한다.
    assert.match(findSetCookie(res.headers, "oauthAttempt"), /^oauthAttempt=;/);
});

test("재로그인 콜백은 컨트롤러에서 세션을 직접 발급하지 않는다 — resolveOAuthAccount 한 곳에서만 발급된다(R-IMPL #2: 이중 발급 금지)", async (t) => {
    const originalIssue = authService.issueSessionForUser;
    const issueCalls = [];
    authService.issueSessionForUser = async (...args) => { issueCalls.push(args); return originalIssue(...args); };
    t.after(() => { authService.issueSessionForUser = originalIssue; });

    stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => ({ subject: "sub-1", email: "a@b.com" }),
    });
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async () => ({ purpose: "login" }),
        resolveOAuthAccount: async () => ({
            status: "LOGIN", user: { uuid: "uuid-1", role: "USER" },
            token: "t", refreshToken: null, refreshTokenExpiresAt: null,
        }),
    });
    const base = await startServer(t);

    await rawGet(base, "/auth/google/callback?code=c&state=s", { cookie: loginAttemptCookie("fp-1", true) });

    assert.equal(issueCalls.length, 0,
        "컨트롤러가 authService.issueSessionForUser를 직접 호출하면 세션이 두 번(가짜 세션 + 진짜 세션) 발급될 위험이 있습니다");
});

test("재로그인 + rememberMe:true 쿠키는 resolveOAuthAccount에 rememberMe:true로 전달되고 그 결과가 그대로 영속 쿠키로 반영된다(AC-02)", async (t) => {
    stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => ({ subject: "sub-1", email: "a@b.com" }),
    });
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async () => ({ purpose: "login" }),
        resolveOAuthAccount: async () => ({
            status: "LOGIN",
            user: { uuid: "uuid-1", role: "USER" },
            token: "remembered-access-token",
            refreshToken: "remembered-refresh-token",
            refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }),
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google/callback?code=auth-code-1&state=state-1", {
        cookie: loginAttemptCookie("fp-1", true),
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/lobby`);
    assert.equal(social.lastCall("resolveOAuthAccount").args[0].rememberMe, true);

    const accessCookie = findSetCookie(res.headers, "accessToken");
    assert.match(accessCookie, /^accessToken=remembered-access-token/);
    assert.match(accessCookie, /Max-Age/i, "rememberMe:true면 영속 쿠키여야 합니다");

    const refreshCookie = findSetCookie(res.headers, "refreshToken");
    assert.match(refreshCookie, /^refreshToken=remembered-refresh-token/);
});

for (const rememberMe of [false, true]) {
    test(`신규 계정(SIGNUP_REQUIRED, rememberMe:${rememberMe}) 콜백은 세션 쿠키 없이 intentToken을 실어 로그인 화면으로 리다이렉트하고, rememberMe 선택을 가입 보완용 서명 쿠키로 들고 간다(AC-02, R-IMPL #2)`, async (t) => {
        stubModule(t, googleOAuthService, GOOGLE_KEYS, {
            exchangeCodeForProfile: async () => ({ subject: "sub-2", email: "new@b.com" }),
        });
        stubModule(t, socialAuthService, SOCIAL_KEYS, {
            consumeOAuthState: async () => ({ purpose: "login" }),
            resolveOAuthAccount: async (args) => {
                assert.equal(args.rememberMe, rememberMe, "가입 여부 판정 이전에도 rememberMe는 그대로 전달되어야 합니다");
                return { status: "SIGNUP_REQUIRED", intentToken: "intent-token-1", email: "new@b.com", expiresAt: new Date() };
            },
        });
        const base = await startServer(t);

        const res = await rawGet(base, "/auth/google/callback?code=auth-code-2&state=state-2", {
            cookie: loginAttemptCookie("fp-1", rememberMe),
        });

        assert.equal(res.statusCode, 302);
        assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialIntent=intent-token-1`);
        assert.equal(findSetCookie(res.headers, "accessToken"), undefined, "가입 보완 전에는 세션 쿠키를 발급하면 안 됩니다");

        const decoded = decodedAttemptCookie(res.headers);
        assert.ok(decoded, "가입 보완 동안 rememberMe를 들고 갈 새 서명 쿠키가 세팅되어야 합니다");
        assert.equal(decoded.purpose, "signup");
        assert.equal(decoded.intentToken, "intent-token-1");
        assert.equal(decoded.rememberMe, rememberMe);
    });
}

// ── AC-04/R-IMPL #3: 취소·잘못된 state·재사용·이메일 충돌, 순서·재생 방지 ─────────

test("사용자가 Google 동의 화면에서 취소하면(error 파라미터) state는 소비되지만 코드 교환은 호출되지 않는다", async (t) => {
    const google = stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => { throw new Error("취소된 콜백에서는 호출되면 안 됩니다"); },
    });
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async () => ({ purpose: "login" }),
        resolveOAuthAccount: async ({ cancelled }) => {
            assert.equal(cancelled, true);
            const error = new Error("사용자가 로그인을 취소했습니다.");
            error.status = 400; error.code = "OAUTH_CANCELLED";
            throw error;
        },
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google/callback?error=access_denied&state=state-3", {
        cookie: loginAttemptCookie("fp-1", false),
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=OAUTH_CANCELLED`);
    assert.equal(google.calls.length, 0);
    assert.ok(social.lastCall("consumeOAuthState"), "취소된 콜백도 state는 소비되어야 재사용을 막을 수 있습니다");
    assert.equal(findSetCookie(res.headers, "accessToken"), undefined);
});

for (const [scenario, code, status] of [
    ["잘못된(위조된) state", "STATE_INVALID", 400],
    ["재사용된 콜백", "STATE_REUSED", 409],
    ["state 지문 불일치", "STATE_FINGERPRINT_MISMATCH", 400],
    ["만료된 state", "STATE_EXPIRED", 400],
]) {
    test(`${scenario}는 Google을 부르기 전에 거부되어 자동 병합·세션 발급 없이 socialError=${code}로 리다이렉트된다(AC-04, R-IMPL #3)`, async (t) => {
        const google = stubModule(t, googleOAuthService, GOOGLE_KEYS, {
            exchangeCodeForProfile: async () => { throw new Error("state가 유효하지 않은 콜백에서는 호출되면 안 됩니다"); },
        });
        stubModule(t, socialAuthService, SOCIAL_KEYS, {
            consumeOAuthState: async () => {
                const error = new Error(`시뮬레이션된 ${code}`);
                error.status = status; error.code = code;
                throw error;
            },
        });
        const base = await startServer(t);

        const res = await rawGet(base, "/auth/google/callback?code=auth-code-x&state=state-x", {
            cookie: loginAttemptCookie("fp-1", false),
        });

        assert.equal(res.statusCode, 302);
        assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=${code}`);
        assert.equal(google.calls.length, 0, "state가 유효하지 않으면 Google 코드 교환을 시도하면 안 됩니다");
        assert.equal(findSetCookie(res.headers, "accessToken"), undefined);
    });
}

test("기존 이메일과의 충돌(EMAIL_CONFLICT)은 제공자 교환 이후 판정되며 자동 병합·세션 발급 없이 오류로 리다이렉트된다(AC-04)", async (t) => {
    const google = stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => ({ subject: "sub-x", email: "x@y.com" }),
    });
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async () => ({ purpose: "login" }),
        resolveOAuthAccount: async () => {
            const error = new Error("이미 가입된 이메일입니다.");
            error.status = 409; error.code = "EMAIL_CONFLICT";
            throw error;
        },
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/google/callback?code=auth-code-x&state=state-x", {
        cookie: loginAttemptCookie("fp-1", false),
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=EMAIL_CONFLICT`);
    assert.equal(google.calls.length, 1, "이메일 충돌은 실제 제공자 프로필을 받아본 뒤에야 판정되므로 교환은 호출되어야 합니다");
    assert.equal(findSetCookie(res.headers, "accessToken"), undefined);
});

test("실패한 제공자 교환 이후에도 같은 state는 재사용할 수 없다(R-IMPL #3: 소비가 교환보다 먼저 원자적으로 커밋된다)", async (t) => {
    const consumed = new Set();
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async (rawState) => {
            if (consumed.has(rawState)) {
                const error = new Error("이미 사용된 state입니다.");
                error.status = 409; error.code = "STATE_REUSED";
                throw error;
            }
            consumed.add(rawState);
            return { purpose: "login" };
        },
    });
    stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => { throw new Error("네트워크 실패"); },
    });
    const base = await startServer(t);

    const first = await rawGet(base, "/auth/google/callback?code=c1&state=replay-state", {
        cookie: loginAttemptCookie("fp-1", false),
    });
    assert.equal(first.statusCode, 302);
    assert.equal(first.headers.location, `${process.env.FRONTEND_URL}/login?socialError=OAUTH_FAILED`,
        "실패한 교환은 code가 없는 예상 밖 오류로 취급되어 기본 코드로 리다이렉트됩니다");

    const second = await rawGet(base, "/auth/google/callback?code=c1&state=replay-state", {
        cookie: loginAttemptCookie("fp-1", false),
    });
    assert.equal(second.statusCode, 302);
    assert.equal(second.headers.location, `${process.env.FRONTEND_URL}/login?socialError=STATE_REUSED`,
        "실패한 첫 시도가 state를 재사용 가능한 채로 남겨두면 안 됩니다");
});

test("oauthAttempt 쿠키가 없거나 위조되면 fingerprint 없이 state 소비 자체가 거부되어 Google을 부르지 않는다(R-IMPL #2/#3)", async (t) => {
    const google = stubModule(t, googleOAuthService, GOOGLE_KEYS, {
        exchangeCodeForProfile: async () => { throw new Error("호출되면 안 됩니다"); },
    });
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async (rawState, { browserFingerprint } = {}) => {
            assert.equal(browserFingerprint, undefined, "위조/누락된 쿠키는 fp 없이 전달되어야 합니다");
            const error = new Error("state가 없습니다.");
            error.status = 400; error.code = "STATE_MISSING";
            throw error;
        },
    });
    const base = await startServer(t);

    const noCookie = await rawGet(base, "/auth/google/callback?code=c&state=s");
    assert.equal(noCookie.headers.location, `${process.env.FRONTEND_URL}/login?socialError=STATE_MISSING`);

    const forged = `oauthAttempt=${jwt.sign({ fp: "fp-1", rememberMe: false, purpose: "login" }, "wrong-secret", { expiresIn: 600 })}`;
    const forgedRes = await rawGet(base, "/auth/google/callback?code=c&state=s", { cookie: forged });
    assert.equal(forgedRes.headers.location, `${process.env.FRONTEND_URL}/login?socialError=STATE_MISSING`);

    assert.equal(google.calls.length, 0);
});

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
