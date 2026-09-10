process.env.JWT_SECRET = "discord-auth-route-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱한다(연결은 시도하지 않는다).
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "https://frontend.example.test";

// F-07 AC-01/AC-02/AC-03/AC-04 — Discord OAuth 시작·콜백 라우트의 서버 계약 HTTP 통합
// 테스트입니다. googleAuth.route.test.js(F-06)와 같은 구조로, socialAuth.service.js(F-05)의
// state·트랜잭션 로직 자체와 discordOAuth.service.js의 실제 Discord 네트워크 교환은 여기서
// 다시 검증하지 않고 스텁으로 대체합니다(discordOAuth.service.js 자체의 실제 네트워크
// 왕복은 discordOAuth.service.test.js가 로컬 fixture 서버로 검증합니다) — 이 파일은 그 위
// 계층, 즉 "버튼 클릭이 시작 라우트를 부르고, 콜백이 결과에 따라 올바른 쿠키·리다이렉트로
// 이어지는지"와 "state 소비·제공자 호출·계정 판정의 순서·재사용 방지·rememberMe 보존이
// 실제로 그 순서대로 이어지는지"(R-IMPL #2/#3)를 검증합니다.
//
// F-07 고유: user.controller.js가 oauthAttempt 쿠키에 provider를 함께 서명해, Google 시작
// 시도의 쿠키가 이 콜백에서 받아들여지지 않는지(제공자 바인딩)도 이 파일에서 검증합니다.
//
// AC-04: GET /auth/discord/link·/auth/discord/link/callback(로그인 후 명시적 연결)도 이
// 파일에서 같은 원칙(스텁 기반 컨트롤러 계약 테스트)으로 검증합니다 — verifyToken이 거치는
// sessionLifecycle.resolveSession은 userRepository.findActiveSession/checkActiveBan만 거치므로
// (socialAuth.route.test.js와 같은 패턴), 그 둘만 스텁하면 실제 미들웨어 체인을 그대로 태우면서
// "인증된 사용자만 연결을 시작·완료할 수 있다"를 검증할 수 있습니다. 실제 DB·실제
// discordOAuthService까지 전부 실제로 태운 링크 왕복의 더 강한 증거는
// backend/tests/db/f07-discord-oauth.integration.test.js에 있습니다.

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
const discordOAuthService = require("../service/discordOAuth.service");
const userRepository     = require("../repositories/user.repositories");

const SOCIAL_KEYS  = ["issueOAuthState", "consumeOAuthState", "resolveOAuthAccount", "linkExternalIdentity"];
const DISCORD_KEYS = ["buildAuthorizationUrl", "exchangeCodeForProfile"];
const REPO_KEYS     = ["findActiveSession", "checkActiveBan"];

// verifyToken(auth.middleware.js) → sessionLifecycle.resolveSession은 userRepository를 통해서만
// 세션 상태를 읽는다(socialAuth.route.test.js와 같은 패턴) — 이 둘만 스텁하면 "지금 유효한
// 세션"을 실제 미들웨어 체인을 그대로 태우면서 재현할 수 있다.
const stubAuthGate = (t, { sessionActive = true } = {}) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    userRepository.findActiveSession = async (id, userId) =>
        sessionActive ? { id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null } : null;
    userRepository.checkActiveBan = async () => null;
    t.after(() => Object.assign(userRepository, originals));
};

const LINK_UUID       = "link-uuid-1";
const LINK_SESSION_ID = "link-session-1";
const linkAccessTokenCookie = () =>
    `accessToken=${jwt.sign({ uuid: LINK_UUID, role: "USER", sessionId: LINK_SESSION_ID }, process.env.JWT_SECRET, { expiresIn: "1d" })}`;

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
const findSetCookie = (headers, name) => setCookies(headers).filter((c) => c.startsWith(`${name}=`)).at(-1);
const decodedAttemptCookie = (headers) => {
    const raw = findSetCookie(headers, "oauthAttempt");
    if (!raw) return null;
    const token = raw.split(";")[0].split("=")[1];
    return jwt.verify(token, process.env.JWT_SECRET);
};

// 실제 discordAuthStart가 세팅하는 것과 같은 형태의 서명된 시도 쿠키를 만든다 — 컨트롤러의
// jwt.verify 검증 경로를 값 그대로 믿어주는 스텁이 아니라 실제로 태운다.
const loginAttemptCookie = (fp, rememberMe, provider = "discord") =>
    `oauthAttempt=${jwt.sign({ fp, rememberMe, purpose: "login", provider }, process.env.JWT_SECRET, { expiresIn: 600 })}`;

// ── GET /auth/discord (AC-01: 시작) ──────────────────────────────────────────

test("GET /auth/discord은 state를 발급해 Discord 인가 URL로 302 리다이렉트하고 서명된 oauthAttempt 쿠키를 세팅한다", async (t) => {
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        issueOAuthState: async () => ({ state: "raw-state-1", expiresAt: new Date() }),
    });
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
        buildAuthorizationUrl: (state) => `https://discord.com/api/oauth2/authorize?state=${state}`,
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/discord?rememberMe=true");

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, "https://discord.com/api/oauth2/authorize?state=raw-state-1");

    const issueArgs = social.lastCall("issueOAuthState").args[0];
    assert.equal(issueArgs.purpose, "login");
    assert.ok(typeof issueArgs.browserFingerprint === "string" && issueArgs.browserFingerprint.length > 0);

    assert.equal(discord.lastCall("buildAuthorizationUrl").args[0], "raw-state-1");

    const attemptCookieRaw = findSetCookie(res.headers, "oauthAttempt");
    assert.ok(attemptCookieRaw, "oauthAttempt 쿠키가 세팅되어야 합니다");
    assert.match(attemptCookieRaw, /HttpOnly/i);

    const decoded = decodedAttemptCookie(res.headers);
    assert.equal(decoded.purpose, "login");
    assert.equal(decoded.provider, "discord");
    assert.equal(decoded.rememberMe, true);
    assert.equal(decoded.fp, issueArgs.browserFingerprint);
});

test("rememberMe를 지정하지 않으면 oauthAttempt 쿠키에 rememberMe:false가 서명된다", async (t) => {
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        issueOAuthState: async () => ({ state: "raw-state-2", expiresAt: new Date() }),
    });
    stubModule(t, discordOAuthService, DISCORD_KEYS, {
        buildAuthorizationUrl: (state) => `https://discord.com/api/oauth2/authorize?state=${state}`,
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/discord");

    const decoded = decodedAttemptCookie(res.headers);
    assert.equal(decoded.rememberMe, false);
});

// ── GET /auth/discord/callback (AC-01/AC-02: 재로그인·가입 보완, R-IMPL #2/#3: 순서·이중발급) ──

test("재로그인(LOGIN) 콜백은 state를 먼저 소비한 뒤 제공자를 불러 세션 쿠키를 세팅하고 /lobby로 리다이렉트한다(AC-01, R-IMPL #3 순서)", async (t) => {
    const callOrder = [];
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
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

    const res = await rawGet(base, "/auth/discord/callback?code=auth-code-1&state=state-1", {
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
    assert.equal(resolveArgs.provider, "discord");
    assert.equal(resolveArgs.subject, "sub-1");
    assert.equal(resolveArgs.email, "a@b.com");
    assert.equal(resolveArgs.cancelled, false);
    assert.equal(resolveArgs.rememberMe, false);

    assert.match(findSetCookie(res.headers, "oauthAttempt"), /^oauthAttempt=;/);
});

test("재로그인 콜백은 컨트롤러에서 세션을 직접 발급하지 않는다 — resolveOAuthAccount 한 곳에서만 발급된다(R-IMPL #2: 이중 발급 금지)", async (t) => {
    const originalIssue = authService.issueSessionForUser;
    const issueCalls = [];
    authService.issueSessionForUser = async (...args) => { issueCalls.push(args); return originalIssue(...args); };
    t.after(() => { authService.issueSessionForUser = originalIssue; });

    stubModule(t, discordOAuthService, DISCORD_KEYS, {
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

    await rawGet(base, "/auth/discord/callback?code=c&state=s", { cookie: loginAttemptCookie("fp-1", true) });

    assert.equal(issueCalls.length, 0,
        "컨트롤러가 authService.issueSessionForUser를 직접 호출하면 세션이 두 번(가짜 세션 + 진짜 세션) 발급될 위험이 있습니다");
});

test("재로그인 + rememberMe:true 쿠키는 resolveOAuthAccount에 rememberMe:true로 전달되고 그 결과가 그대로 영속 쿠키로 반영된다(AC-02)", async (t) => {
    stubModule(t, discordOAuthService, DISCORD_KEYS, {
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

    const res = await rawGet(base, "/auth/discord/callback?code=auth-code-1&state=state-1", {
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
        stubModule(t, discordOAuthService, DISCORD_KEYS, {
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

        const res = await rawGet(base, "/auth/discord/callback?code=auth-code-2&state=state-2", {
            cookie: loginAttemptCookie("fp-1", rememberMe),
        });

        assert.equal(res.statusCode, 302);
        assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialIntent=intent-token-1`);
        assert.equal(findSetCookie(res.headers, "accessToken"), undefined, "가입 보완 전에는 세션 쿠키를 발급하면 안 됩니다");

        const decoded = decodedAttemptCookie(res.headers);
        assert.ok(decoded, "가입 보완 동안 rememberMe를 들고 갈 새 서명 쿠키가 세팅되어야 합니다");
        assert.equal(decoded.purpose, "signup");
        assert.equal(decoded.provider, "discord");
        assert.equal(decoded.intentToken, "intent-token-1");
        assert.equal(decoded.rememberMe, rememberMe);
    });
}

// ── AC-04/R-IMPL #3: 취소·잘못된 state·재사용·이메일 충돌, 순서·재생 방지 ─────────

test("사용자가 Discord 동의 화면에서 취소하면(error 파라미터) state는 소비되지만 코드 교환은 호출되지 않는다", async (t) => {
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
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

    const res = await rawGet(base, "/auth/discord/callback?error=access_denied&state=state-3", {
        cookie: loginAttemptCookie("fp-1", false),
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=OAUTH_CANCELLED`);
    assert.equal(discord.calls.length, 0);
    assert.ok(social.lastCall("consumeOAuthState"), "취소된 콜백도 state는 소비되어야 재사용을 막을 수 있습니다");
    assert.equal(findSetCookie(res.headers, "accessToken"), undefined);
});

for (const [scenario, code, status] of [
    ["잘못된(위조된) state", "STATE_INVALID", 400],
    ["재사용된 콜백", "STATE_REUSED", 409],
    ["state 지문 불일치", "STATE_FINGERPRINT_MISMATCH", 400],
    ["만료된 state", "STATE_EXPIRED", 400],
]) {
    test(`${scenario}는 Discord를 부르기 전에 거부되어 자동 병합·세션 발급 없이 socialError=${code}로 리다이렉트된다(AC-04, R-IMPL #3)`, async (t) => {
        const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
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

        const res = await rawGet(base, "/auth/discord/callback?code=auth-code-x&state=state-x", {
            cookie: loginAttemptCookie("fp-1", false),
        });

        assert.equal(res.statusCode, 302);
        assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=${code}`);
        assert.equal(discord.calls.length, 0, "state가 유효하지 않으면 Discord 코드 교환을 시도하면 안 됩니다");
        assert.equal(findSetCookie(res.headers, "accessToken"), undefined);
    });
}

test("기존 이메일과의 충돌(EMAIL_CONFLICT)은 제공자 교환 이후 판정되며 자동 병합·세션 발급 없이 오류로 리다이렉트된다(AC-04)", async (t) => {
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
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

    const res = await rawGet(base, "/auth/discord/callback?code=auth-code-x&state=state-x", {
        cookie: loginAttemptCookie("fp-1", false),
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=EMAIL_CONFLICT`);
    assert.equal(discord.calls.length, 1, "이메일 충돌은 실제 제공자 프로필을 받아본 뒤에야 판정되므로 교환은 호출되어야 합니다");
    assert.equal(findSetCookie(res.headers, "accessToken"), undefined);
});

// CODEX-1 재검토 지적(AC-03): discordOAuth.service.js의 verified:false → email:null 자체는
// discordOAuth.service.test.js가 검증하고, EMAIL_MISSING을 던지는 socialAuthService.
// resolveOAuthAccount 자체는 f05-social-auth.integration.test.js(provider='google')가
// 실제 DB로 검증한다 — 이 파일에는 그 둘을 "discordOAuth.service.js가 null을 반환한 뒤
// 컨트롤러가 그 null을 그대로 공통 서비스로 넘겨 EMAIL_MISSING으로 거부하는" 실행 경로
// 자체를 잇는 테스트가 빠져 있었다. 아래는 그 경로를 이 컨트롤러 계약 수준에서 고정한다 —
// discordOAuthService 스텁이 실제 verified:false 응답과 같은 모양(email:null)을 돌려주고,
// socialAuthService 스텁은 그 null을 그대로 받았는지 단언한 뒤 실제 resolveOAuthAccount와
// 같은 오류(EMAIL_MISSING)를 던진다. 실제 DB·실제 discordOAuthService까지 전부 실제로 태운
// 같은 경로의 더 강한 증거는 backend/tests/db/f07-discord-oauth.integration.test.js에 있다.
test("이메일을 받지 못하면(email:null) 컨트롤러가 그 값을 그대로 공통 서비스에 넘기고, EMAIL_MISSING으로 거부되어 세션 쿠키 없이 리다이렉트된다(AC-03)", async (t) => {
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
        exchangeCodeForProfile: async () => ({ subject: "sub-unverified", email: null }),
    });
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async () => ({ purpose: "login" }),
        resolveOAuthAccount: async ({ email }) => {
            assert.equal(email, null, "discordOAuthService가 검증되지 않은 이메일을 null로 반환하면 컨트롤러는 그 값을 가공하지 않고 그대로 넘겨야 합니다");
            const error = new Error("제공자로부터 이메일을 받지 못했습니다.");
            error.status = 400; error.code = "EMAIL_MISSING";
            throw error;
        },
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/discord/callback?code=auth-code-unverified&state=state-unverified", {
        cookie: loginAttemptCookie("fp-1", false),
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=EMAIL_MISSING`);
    assert.equal(discord.calls.length, 1);
    assert.equal(social.lastCall("resolveOAuthAccount").args[0].subject, "sub-unverified");
    assert.equal(findSetCookie(res.headers, "accessToken"), undefined, "이메일 미제공은 세션을 발급하면 안 됩니다");
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
    stubModule(t, discordOAuthService, DISCORD_KEYS, {
        exchangeCodeForProfile: async () => { throw new Error("네트워크 실패"); },
    });
    const base = await startServer(t);

    const first = await rawGet(base, "/auth/discord/callback?code=c1&state=replay-state", {
        cookie: loginAttemptCookie("fp-1", false),
    });
    assert.equal(first.statusCode, 302);
    assert.equal(first.headers.location, `${process.env.FRONTEND_URL}/login?socialError=OAUTH_FAILED`,
        "실패한 교환은 code가 없는 예상 밖 오류로 취급되어 기본 코드로 리다이렉트됩니다");

    const second = await rawGet(base, "/auth/discord/callback?code=c1&state=replay-state", {
        cookie: loginAttemptCookie("fp-1", false),
    });
    assert.equal(second.statusCode, 302);
    assert.equal(second.headers.location, `${process.env.FRONTEND_URL}/login?socialError=STATE_REUSED`,
        "실패한 첫 시도가 state를 재사용 가능한 채로 남겨두면 안 됩니다");
});

test("oauthAttempt 쿠키가 없거나 위조되면 fingerprint 없이 state 소비 자체가 거부되어 Discord를 부르지 않는다(R-IMPL #2/#3)", async (t) => {
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
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

    const noCookie = await rawGet(base, "/auth/discord/callback?code=c&state=s");
    assert.equal(noCookie.headers.location, `${process.env.FRONTEND_URL}/login?socialError=STATE_MISSING`);

    const forged = `oauthAttempt=${jwt.sign({ fp: "fp-1", rememberMe: false, purpose: "login", provider: "discord" }, "wrong-secret", { expiresIn: 600 })}`;
    const forgedRes = await rawGet(base, "/auth/discord/callback?code=c&state=s", { cookie: forged });
    assert.equal(forgedRes.headers.location, `${process.env.FRONTEND_URL}/login?socialError=STATE_MISSING`);

    assert.equal(discord.calls.length, 0);
});

// ── F-07 고유: 제공자 바인딩 — 다른 제공자로 시작한 시도의 쿠키를 받아들이지 않는다 ────

test("Google 시작 시도의 oauthAttempt 쿠키(provider:google)는 Discord 콜백에서 fp 없이 취급되어 Discord를 부르지 않는다(제공자 바인딩)", async (t) => {
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
        exchangeCodeForProfile: async () => { throw new Error("호출되면 안 됩니다"); },
    });
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async (rawState, { browserFingerprint } = {}) => {
            assert.equal(browserFingerprint, undefined, "다른 제공자의 쿠키는 fp 없이 전달되어야 합니다");
            const error = new Error("state가 없습니다.");
            error.status = 400; error.code = "STATE_MISSING";
            throw error;
        },
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/discord/callback?code=c&state=s", {
        cookie: loginAttemptCookie("fp-1", false, "google"),
    });

    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/login?socialError=STATE_MISSING`);
    assert.equal(discord.calls.length, 0, "provider가 일치하지 않으면 Discord 코드 교환을 시도하면 안 됩니다");
});

// ── AC-03: 클라이언트 비밀키는 환경변수로만 주입된다 ─────────────────────────

test("DISCORD_CLIENT_SECRET 환경변수가 없으면 코드 교환이 하드코딩된 값 없이 설정 오류로 거부된다", async (t) => {
    const originalId     = process.env.DISCORD_CLIENT_ID;
    const originalSecret = process.env.DISCORD_CLIENT_SECRET;
    const originalUri    = process.env.DISCORD_REDIRECT_URI;
    process.env.DISCORD_CLIENT_ID = "test-client-id";
    delete process.env.DISCORD_CLIENT_SECRET;
    process.env.DISCORD_REDIRECT_URI = "https://backend.example.test/auth/discord/callback";
    t.after(() => {
        if (originalId === undefined) delete process.env.DISCORD_CLIENT_ID; else process.env.DISCORD_CLIENT_ID = originalId;
        if (originalSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET; else process.env.DISCORD_CLIENT_SECRET = originalSecret;
        if (originalUri === undefined) delete process.env.DISCORD_REDIRECT_URI; else process.env.DISCORD_REDIRECT_URI = originalUri;
    });

    await assert.rejects(
        () => discordOAuthService.exchangeCodeForProfile("some-code"),
        (error) => error.code === "DISCORD_OAUTH_NOT_CONFIGURED",
    );
});

// ── GET /auth/discord/link, /auth/discord/link/callback (AC-04: 로그인 후 명시적 연결) ──
//
// CODEX-1 재검토 지적: 이 라우트 자체가 등록되어 있지 않아 "로그인 후 명시적 연결"이 실행
// 가능한 경로로 존재하지 않았다. 아래는 그 라우트가 (1) 인증을 강제하고, (2) 클라이언트가
// 아니라 discordOAuthService가 검증한 subject/email만 socialAuthService.linkExternalIdentity에
// 넘기며, (3) 취소·재사용·이미 연결된 identity를 자동 병합 없이 거부하는지 컨트롤러 계약
// 수준에서 고정한다.

test("GET /auth/discord/link은 인증 없이 호출하면 401이고 state는 발급되지 않는다", async (t) => {
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {});
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/discord/link");

    assert.equal(res.statusCode, 401);
    assert.equal(social.calls.length, 0, "인증되지 않은 요청은 issueOAuthState까지 도달하면 안 됩니다");
});

test("GET /auth/discord/link은 인증된 사용자의 uuid/sessionId로 purpose:link state를 발급하고 Discord 인가 URL로 리다이렉트한다(AC-04)", async (t) => {
    stubAuthGate(t);
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        issueOAuthState: async () => ({ state: "link-raw-state-1", expiresAt: new Date() }),
    });
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
        buildAuthorizationUrl: (state) => `https://discord.com/api/oauth2/authorize?state=${state}`,
    });
    const base = await startServer(t);

    const res = await rawGet(base, "/auth/discord/link", { cookie: linkAccessTokenCookie() });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, "https://discord.com/api/oauth2/authorize?state=link-raw-state-1");

    const issueArgs = social.lastCall("issueOAuthState").args[0];
    assert.equal(issueArgs.purpose, "link");
    assert.equal(issueArgs.userId, LINK_UUID, "요청 body가 아니라 인증된 세션의 uuid만 써야 합니다");
    assert.equal(issueArgs.sessionId, LINK_SESSION_ID, "요청 body가 아니라 인증된 세션의 sessionId만 써야 합니다");
    assert.equal(discord.lastCall("buildAuthorizationUrl").args[0], "link-raw-state-1");

    const decoded = decodedAttemptCookie(res.headers);
    assert.equal(decoded.purpose, "link");
    assert.equal(decoded.provider, "discord");
});

test("GET /auth/discord/link/callback 성공 시 서버가 검증한 subject/email만 linkExternalIdentity에 전달하고 세션 쿠키 변경 없이 성공 리다이렉트한다(AC-04)", async (t) => {
    stubAuthGate(t);
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
        buildAuthorizationUrl: (state) => `https://discord.com/api/oauth2/authorize?state=${state}`,
        exchangeCodeForProfile: async (code) => {
            assert.equal(code, "link-code-1");
            return { subject: "discord-sub-verified", email: "verified@discord.example" };
        },
    });
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        issueOAuthState: async () => ({ state: "link-state-1", expiresAt: new Date() }),
        linkExternalIdentity: async () => ({ provider: "discord", subject: "discord-sub-verified", user_id: LINK_UUID }),
    });
    const base = await startServer(t);

    const startRes = await rawGet(base, "/auth/discord/link", { cookie: linkAccessTokenCookie() });
    const attemptCookie = findSetCookie(startRes.headers, "oauthAttempt").split(";")[0];
    const res = await rawGet(base, "/auth/discord/link/callback?code=link-code-1&state=link-state-1", {
        cookie: `${linkAccessTokenCookie()}; ${attemptCookie}`,
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/lobby?socialLinkSuccess=discord`);
    assert.equal(findSetCookie(res.headers, "accessToken"), undefined, "연결은 새 세션을 발급하면 안 됩니다(이미 로그인해 있다)");

    const linkArgs = social.lastCall("linkExternalIdentity").args[0];
    assert.equal(linkArgs.userId, LINK_UUID);
    assert.equal(linkArgs.sessionId, LINK_SESSION_ID);
    assert.equal(linkArgs.provider, "discord");
    assert.equal(linkArgs.subject, "discord-sub-verified", "클라이언트가 아니라 discordOAuthService가 검증한 subject여야 합니다");
    assert.equal(linkArgs.email, "verified@discord.example");
    assert.equal(discord.calls.filter((c) => c.name === "exchangeCodeForProfile").length, 1);
});

test("이미 다른 계정에 연결된 identity는 GET /auth/discord/link/callback에서도 자동 병합 없이 오류로 리다이렉트된다(AC-04)", async (t) => {
    stubAuthGate(t);
    stubModule(t, discordOAuthService, DISCORD_KEYS, {
        buildAuthorizationUrl: (state) => `https://discord.com/api/oauth2/authorize?state=${state}`,
        exchangeCodeForProfile: async () => ({ subject: "discord-sub-owned", email: "owned@discord.example" }),
    });
    stubModule(t, socialAuthService, SOCIAL_KEYS, {
        issueOAuthState: async () => ({ state: "link-state-owned", expiresAt: new Date() }),
        linkExternalIdentity: async () => {
            const error = new Error("이미 다른 계정에 연결된 소셜 계정입니다.");
            error.status = 409; error.code = "IDENTITY_ALREADY_LINKED";
            throw error;
        },
    });
    const base = await startServer(t);

    const startRes = await rawGet(base, "/auth/discord/link", { cookie: linkAccessTokenCookie() });
    const attemptCookie = findSetCookie(startRes.headers, "oauthAttempt").split(";")[0];
    const res = await rawGet(base, "/auth/discord/link/callback?code=c&state=s", {
        cookie: `${linkAccessTokenCookie()}; ${attemptCookie}`,
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, `${process.env.FRONTEND_URL}/lobby?socialLinkError=IDENTITY_ALREADY_LINKED`);
});

test("연결을 취소하면(error 파라미터) state는 소비되지만 linkExternalIdentity는 호출되지 않고, 같은 state는 재사용할 수 없다(AC-04)", async (t) => {
    stubAuthGate(t);
    const discord = stubModule(t, discordOAuthService, DISCORD_KEYS, {
        exchangeCodeForProfile: async () => { throw new Error("취소된 콜백에서는 호출되면 안 됩니다"); },
    });
    const consumed = new Set();
    const social = stubModule(t, socialAuthService, SOCIAL_KEYS, {
        consumeOAuthState: async (rawState) => {
            if (consumed.has(rawState)) {
                const error = new Error("이미 사용된 state입니다.");
                error.status = 409; error.code = "STATE_REUSED";
                throw error;
            }
            consumed.add(rawState);
            return { purpose: "link" };
        },
        linkExternalIdentity: async () => { throw new Error("취소된 콜백에서는 호출되면 안 됩니다"); },
    });
    const base = await startServer(t);

    const cookie = linkAccessTokenCookie();
    const first = await rawGet(base, "/auth/discord/link/callback?error=access_denied&state=cancel-state-1", {
        cookie: `${cookie}; oauthAttempt=${jwt.sign({ fp: "link-fp-1", purpose: "link", provider: "discord" }, process.env.JWT_SECRET, { expiresIn: 600 })}`,
    });
    assert.equal(first.headers.location, `${process.env.FRONTEND_URL}/lobby?socialLinkError=OAUTH_CANCELLED`);
    assert.equal(discord.calls.length, 0);
    assert.equal(social.calls.filter((c) => c.name === "linkExternalIdentity").length, 0);

    const second = await rawGet(base, "/auth/discord/link/callback?error=access_denied&state=cancel-state-1", {
        cookie: `${cookie}; oauthAttempt=${jwt.sign({ fp: "link-fp-1", purpose: "link", provider: "discord" }, process.env.JWT_SECRET, { expiresIn: 600 })}`,
    });
    assert.equal(second.headers.location, `${process.env.FRONTEND_URL}/lobby?socialLinkError=STATE_REUSED`,
        "취소된 콜백도 state를 소비해야 같은 state로의 재시도가 막힙니다");
});
