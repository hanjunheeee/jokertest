// 모바일 소셜 로그인 돌아갈 주소 시험, client=mobile 시도 표 · 콜백 redirect (구글·디스코드·디스코드 연결)
// 값 없으면 지금처럼 FRONTEND_URL, 모르는 client 값은 데스크톱
process.env.JWT_SECRET = "mobile-social-redirect-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "https://frontend.example.test";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const http         = require("node:http");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");
const jwt          = require("jsonwebtoken");

const { notFoundHandler, globalErrorHandler } = require("../../middlewares/errorHandler.middleware");
const socialAuthService   = require("../../services/auth/social");
const googleOAuthService  = require("../../services/auth/oauth/google");
const discordOAuthService = require("../../services/auth/oauth/discord");
const userRepository      = require("../../repositories/user");

const MOBILE = "https://mobile.example.test";

// 시험 하나 동안만 갈아끼우기
const patch = (t, mod, overrides) => {
    const originals = Object.fromEntries(Object.keys(overrides).map((k) => [k, mod[k]]));
    Object.assign(mod, overrides);
    t.after(() => Object.assign(mod, originals));
};

// 시험 하나 동안만 모바일 주소 넣기·빼기
const withMobileUrl = (t, value) => {
    const before = process.env.FRONTEND_MOBILE_URL;
    if (value === undefined) delete process.env.FRONTEND_MOBILE_URL; else process.env.FRONTEND_MOBILE_URL = value;
    t.after(() => {
        if (before === undefined) delete process.env.FRONTEND_MOBILE_URL; else process.env.FRONTEND_MOBILE_URL = before;
    });
};

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/auth", require("../../routes/auth.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const rawGet = (base, path, { cookie } = {}) => new Promise((resolve, reject) => {
    const req = http.request(new URL(path, base), { method: "GET", headers: cookie ? { cookie } : {} }, (res) => {
        res.resume();
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
});

// 응답의 마지막 oauthAttempt 쿠키 (이름=값만)
const attemptCookieOf = (headers) =>
    (headers["set-cookie"] ?? []).filter((c) => c.startsWith("oauthAttempt=")).at(-1)?.split(";")[0];
const decodeAttempt = (cookie) => jwt.verify(cookie.split("=")[1], process.env.JWT_SECRET);

// 로그인 흐름 갈아끼우기 (state 발급·소비·계정 찾기·제공자)
const stubLogin = (t) => {
    patch(t, socialAuthService, {
        issueOAuthState: async () => ({ state: "s-1", expiresAt: new Date() }),
        consumeOAuthState: async () => ({ purpose: "login", userId: null, sessionId: null }),
        resolveOAuthAccount: async () => ({
            status: "LOGIN", user: { uuid: "u-1", role: "USER" },
            token: "access-1", refreshToken: null, refreshTokenExpiresAt: null,
        }),
    });
    for (const mod of [googleOAuthService, discordOAuthService]) {
        patch(t, mod, {
            buildAuthorizationUrl: (state) => `https://provider.example/auth?state=${state}`,
            exchangeCodeForProfile: async () => ({ subject: "sub-1", email: "a@b.com" }),
        });
    }
};

// 시작 → 시도 쿠키 → 콜백까지 한 번에
const runLogin = async (base, provider, query) => {
    const start = await rawGet(base, `/auth/${provider}${query}`);
    const cookie = attemptCookieOf(start.headers);
    const callback = await rawGet(base, `/auth/${provider}/callback?code=c-1&state=s-1`, { cookie });
    return { cookie, callback };
};

for (const provider of ["google", "discord"]) {
    test(`${provider}: client=mobile이고 모바일 값 있으면 시도 표에 client 넣고 모바일 /lobby로`, async (t) => {
        withMobileUrl(t, MOBILE);
        stubLogin(t);
        const base = await startServer(t);

        const { cookie, callback } = await runLogin(base, provider, "?client=mobile&rememberMe=true");

        assert.equal(decodeAttempt(cookie).client, "mobile");
        assert.equal(callback.statusCode, 302);
        assert.equal(callback.headers.location, `${MOBILE}/lobby`);
    });

    test(`${provider}: client 없음·desktop·모르는 값은 시도 표 그대로, FRONTEND_URL로`, async (t) => {
        withMobileUrl(t, MOBILE);
        stubLogin(t);
        const base = await startServer(t);

        for (const query of ["", "?client=desktop", "?client=evil", "?client=MOBILE", `?client=${encodeURIComponent(MOBILE)}`]) {
            const { cookie, callback } = await runLogin(base, provider, query);
            assert.equal("client" in decodeAttempt(cookie), false, `query ${query}`);
            assert.equal(callback.headers.location, `${process.env.FRONTEND_URL}/lobby`, `query ${query}`);
        }
    });

    test(`${provider}: 모바일 값 없으면 client=mobile이어도 FRONTEND_URL로 (오류 redirect도)`, async (t) => {
        withMobileUrl(t, undefined);
        stubLogin(t);
        const base = await startServer(t);

        const { callback } = await runLogin(base, provider, "?client=mobile");
        assert.equal(callback.headers.location, `${process.env.FRONTEND_URL}/lobby`);

        // 오류 redirect도 데스크톱 /login
        patch(t, socialAuthService, {
            consumeOAuthState: async () => { const e = new Error("reused"); e.code = "STATE_REUSED"; throw e; },
        });
        const failed = await runLogin(base, provider, "?client=mobile");
        assert.equal(failed.callback.headers.location, `${process.env.FRONTEND_URL}/login?socialError=STATE_REUSED`);
    });

    test(`${provider}: 모바일 시도 표의 오류 redirect도 모바일 /login으로`, async (t) => {
        withMobileUrl(t, MOBILE);
        stubLogin(t);
        patch(t, socialAuthService, {
            consumeOAuthState: async () => { const e = new Error("reused"); e.code = "STATE_REUSED"; throw e; },
        });
        const base = await startServer(t);

        const { callback } = await runLogin(base, provider, "?client=mobile");
        assert.equal(callback.headers.location, `${MOBILE}/login?socialError=STATE_REUSED`);
    });
}

test("discord 연결: client=mobile이면 모바일 /account로, 아니면 FRONTEND_URL", async (t) => {
    withMobileUrl(t, MOBILE);
    patch(t, userRepository, {
        findActiveSession: async (id, userId) => ({ id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null }),
        checkActiveBan: async () => null,
    });
    patch(t, socialAuthService, {
        issueOAuthState: async () => ({ state: "ls-1", expiresAt: new Date() }),
        consumeOAuthState: async () => ({ purpose: "link", userId: "lu-1", sessionId: "lsess-1" }),
        linkExternalIdentityForValidatedSession: async () => ({ provider: "discord" }),
    });
    patch(t, discordOAuthService, {
        buildAuthorizationUrl: (state) => `https://provider.example/auth?state=${state}`,
        exchangeCodeForProfile: async () => ({ subject: "d-1", email: "d@b.com" }),
    });
    const base = await startServer(t);
    const access = `accessToken=${jwt.sign({ uuid: "lu-1", role: "USER", sessionId: "lsess-1" }, process.env.JWT_SECRET, { expiresIn: "1d" })}`;

    for (const [query, expected] of [["?client=mobile", MOBILE], ["", process.env.FRONTEND_URL]]) {
        const start = await rawGet(base, `/auth/discord/link${query}`, { cookie: access });
        const attempt = attemptCookieOf(start.headers);
        const callback = await rawGet(base, "/auth/discord/link/callback?code=c&state=ls-1", { cookie: `${access}; ${attempt}` });
        assert.equal(callback.headers.location, `${expected}/account?socialLinkSuccess=discord`, `query ${query}`);
    }
});
