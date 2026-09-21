// F-06 R-IMPL #3 — googleOAuth.service.js의 실제 네트워크 왕복을 검증하는 어댑터 테스트다.
//
// backend/__tests__/googleAuth.route.test.js는 googleOAuthService 자체를 스텁으로 대체해
// 그 위 라우트 계층(순서·rememberMe·리다이렉트)만 검증한다 — 그 파일만으로는 exchangeCodeFor
// Profile이 실제로 Google에 어떤 요청을 보내는지, 실패 상태코드를 어떻게 다루는지, 응답이
// 지연될 때 정말로 포기하는지는 증명하지 못한다. 이 파일은 exports.exchangeCodeForProfile
// 자체를 스텁으로 바꾸지 않고 그대로 호출한다 — 대신 fetch의 목적지만 로컬 HTTP 서버
// (진짜 TCP/HTTP 왕복)로 돌려, 실제 요청 본문·헤더 구성과 실패·타임아웃 처리를 검증한다.

const test  = require("node:test");
const assert = require("node:assert/strict");
const http  = require("node:http");
const { once } = require("node:events");

process.env.GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "adapter-test-client-id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "adapter-test-client-secret";
process.env.GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI  || "https://backend.example.test/auth/google/callback";

const googleOAuthService = require("../service/googleOAuth.service");

// Fetch 표준의 "bad port" 목록 — undici(전역 fetch)는 이 포트로의 요청을 "bad port"로
// 거부한다. listen(0)이 우연히 이 중 하나를 받으면 시험이 불안정하게 실패하므로 다시 고른다.
const FETCH_BAD_PORTS = new Set([1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513,
    514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
    3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);

const listenOnFetchablePort = async (server) => {
    for (;;) {
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        if (!FETCH_BAD_PORTS.has(server.address().port)) return;
        await new Promise((resolve) => server.close(resolve));
    }
};

// Google의 token/userinfo 엔드포인트를 흉내 내는 실제 로컬 HTTP 서버를 띄운다.
const startMockGoogle = async (t, { tokenHandler, userinfoHandler }) => {
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            if (req.url.startsWith("/token")) return tokenHandler(req, res, body);
            if (req.url.startsWith("/userinfo")) return userinfoHandler(req, res, body);
            res.writeHead(404).end();
        });
    });
    await listenOnFetchablePort(server);
    t.after(() => {
        server.closeAllConnections?.();
        return new Promise((resolve) => server.close(resolve));
    });
    return `http://127.0.0.1:${server.address().port}`;
};

// exchangeCodeForProfile 자체는 건드리지 않고, 그 안에서 호출하는 global fetch의 목적지만
// (하드코딩된 실제 Google URL → 로컬 fixture 서버로) 바꾼다 — method/headers/body/signal은
// 그대로 전달되므로 실제 HTTP 요청 형태를 있는 그대로 검증할 수 있다.
const withFetchRedirectedTo = (t, base) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
        const urlStr = String(url);
        if (urlStr.startsWith(googleOAuthService.GOOGLE_TOKEN_ENDPOINT)) {
            return originalFetch(`${base}/token`, init);
        }
        if (urlStr.startsWith(googleOAuthService.GOOGLE_USERINFO_ENDPOINT)) {
            return originalFetch(`${base}/userinfo`, init);
        }
        return originalFetch(urlStr, init);
    };
    t.after(() => { globalThis.fetch = originalFetch; });
};

const jsonHandler = (status, body) => (req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
};

// ── 정상 왕복 ─────────────────────────────────────────────────────────────────

test("실제 네트워크 왕복으로 code를 교환해 검증된 subject/email을 반환하고, 요청 본문·헤더가 계약대로 구성된다", async (t) => {
    let tokenRequest = null;
    let userinfoAuth = null;
    const base = await startMockGoogle(t, {
        tokenHandler: (req, res, body) => {
            tokenRequest = { method: req.method, contentType: req.headers["content-type"], body };
            jsonHandler(200, { access_token: "real-access-token-1" })(req, res);
        },
        userinfoHandler: (req, res) => {
            userinfoAuth = req.headers["authorization"];
            jsonHandler(200, { sub: "google-sub-1", email: "user@example.com", email_verified: true })(req, res);
        },
    });
    withFetchRedirectedTo(t, base);

    const profile = await googleOAuthService.exchangeCodeForProfile("real-auth-code");

    assert.deepEqual(profile, { subject: "google-sub-1", email: "user@example.com" });
    assert.equal(tokenRequest.method, "POST");
    assert.match(tokenRequest.contentType, /application\/x-www-form-urlencoded/);

    const params = new URLSearchParams(tokenRequest.body);
    assert.equal(params.get("code"), "real-auth-code");
    assert.equal(params.get("client_id"), process.env.GOOGLE_CLIENT_ID);
    assert.equal(params.get("client_secret"), process.env.GOOGLE_CLIENT_SECRET);
    assert.equal(params.get("redirect_uri"), process.env.GOOGLE_REDIRECT_URI);
    assert.equal(params.get("grant_type"), "authorization_code");
    assert.equal(userinfoAuth, "Bearer real-access-token-1", "프로필 조회는 발급받은 access_token을 Bearer로 실어야 합니다");
});

test("email_verified가 false면 이메일을 검증되지 않은 값으로 취급해 null을 반환한다(A-03: 검증된 식별자만 신뢰)", async (t) => {
    const base = await startMockGoogle(t, {
        tokenHandler: jsonHandler(200, { access_token: "token-2" }),
        userinfoHandler: jsonHandler(200, { sub: "sub-2", email: "unverified@example.com", email_verified: false }),
    });
    withFetchRedirectedTo(t, base);

    const profile = await googleOAuthService.exchangeCodeForProfile("code-2");
    assert.equal(profile.subject, "sub-2");
    assert.equal(profile.email, null);
});

// F-31 AC-01: 자체 메일 인증을 건너뛰는 유일한 근거는 "서버가 조회한 Google userinfo의
// email_verified가 boolean true"다 — 그 외(누락·문자열 'true'·truthy 값·이메일 미제공)는
// 전부 null로 넘겨 자체 인증 분기로 보내야 한다. null이 곧 "자체 인증 필요"라는 뜻이므로
// (socialAuth.service.js resolveOAuthAccount), 여기서 새는 값은 그대로 인증 생략이 된다.
for (const [label, userinfo] of [
    ["email_verified 누락", { sub: "sub-missing", email: "missing-flag@example.com" }],
    ["email_verified가 문자열 'true'", { sub: "sub-string", email: "string-flag@example.com", email_verified: "true" }],
    ["email_verified가 숫자 1", { sub: "sub-one", email: "one-flag@example.com", email_verified: 1 }],
    ["email_verified는 true지만 이메일 미제공", { sub: "sub-no-email", email_verified: true }],
    ["이메일이 문자열이 아님", { sub: "sub-obj-email", email: { value: "x@example.com" }, email_verified: true }],
]) {
    test(`AC-01: ${label}이면 email은 null이고 subject만 넘어간다(자체 인증 분기로 보낸다)`, async (t) => {
        const base = await startMockGoogle(t, {
            tokenHandler: jsonHandler(200, { access_token: `token-${userinfo.sub}` }),
            userinfoHandler: jsonHandler(200, userinfo),
        });
        withFetchRedirectedTo(t, base);

        const profile = await googleOAuthService.exchangeCodeForProfile(`code-${userinfo.sub}`);
        assert.equal(profile.subject, userinfo.sub);
        assert.equal(profile.email, null, "boolean true가 아닌 인증 표시는 이메일을 통과시키면 안 됩니다");
    });
}

// ── 실패 상태코드·잘못된 응답 ────────────────────────────────────────────────

test("토큰 엔드포인트가 실패 상태코드를 반환하면 GOOGLE_TOKEN_EXCHANGE_FAILED로 거부된다", async (t) => {
    const base = await startMockGoogle(t, {
        tokenHandler: jsonHandler(400, { error: "invalid_grant" }),
        userinfoHandler: () => { throw new Error("호출되면 안 됩니다"); },
    });
    withFetchRedirectedTo(t, base);

    await assert.rejects(
        () => googleOAuthService.exchangeCodeForProfile("bad-code"),
        (error) => error.code === "GOOGLE_TOKEN_EXCHANGE_FAILED",
    );
});

test("토큰 응답에 access_token이 없으면 GOOGLE_TOKEN_EXCHANGE_FAILED로 거부된다", async (t) => {
    const base = await startMockGoogle(t, {
        tokenHandler: jsonHandler(200, { token_type: "Bearer" }),
        userinfoHandler: () => { throw new Error("호출되면 안 됩니다"); },
    });
    withFetchRedirectedTo(t, base);

    await assert.rejects(
        () => googleOAuthService.exchangeCodeForProfile("code-3"),
        (error) => error.code === "GOOGLE_TOKEN_EXCHANGE_FAILED",
    );
});

test("프로필 엔드포인트가 실패 상태코드를 반환하면 GOOGLE_PROFILE_FETCH_FAILED로 거부된다", async (t) => {
    const base = await startMockGoogle(t, {
        tokenHandler: jsonHandler(200, { access_token: "token-4" }),
        userinfoHandler: jsonHandler(401, { error: "invalid_token" }),
    });
    withFetchRedirectedTo(t, base);

    await assert.rejects(
        () => googleOAuthService.exchangeCodeForProfile("code-4"),
        (error) => error.code === "GOOGLE_PROFILE_FETCH_FAILED",
    );
});

test("프로필 응답에 sub가 없으면 GOOGLE_PROFILE_INVALID로 거부된다", async (t) => {
    const base = await startMockGoogle(t, {
        tokenHandler: jsonHandler(200, { access_token: "token-5" }),
        userinfoHandler: jsonHandler(200, { email: "no-sub@example.com" }),
    });
    withFetchRedirectedTo(t, base);

    await assert.rejects(
        () => googleOAuthService.exchangeCodeForProfile("code-5"),
        (error) => error.code === "GOOGLE_PROFILE_INVALID",
    );
});

// ── 타임아웃 (R-IMPL #3: 무기한 대기 금지) ───────────────────────────────────

test("Google 토큰 엔드포인트 응답이 지연되면 무기한 대기하지 않고 유한한 시간 안에 GOOGLE_OAUTH_TIMEOUT으로 실패한다", async (t) => {
    const originalTimeoutMs = process.env.GOOGLE_OAUTH_TIMEOUT_MS;
    process.env.GOOGLE_OAUTH_TIMEOUT_MS = "150";
    t.after(() => {
        if (originalTimeoutMs === undefined) delete process.env.GOOGLE_OAUTH_TIMEOUT_MS;
        else process.env.GOOGLE_OAUTH_TIMEOUT_MS = originalTimeoutMs;
    });

    const base = await startMockGoogle(t, {
        // 응답을 절대 보내지 않는다 — 연결만 열어 둔 채 hang.
        tokenHandler: () => {},
        userinfoHandler: jsonHandler(200, { sub: "should-not-reach" }),
    });
    withFetchRedirectedTo(t, base);

    const startedAt = Date.now();
    await assert.rejects(
        () => googleOAuthService.exchangeCodeForProfile("code-timeout"),
        (error) => error.code === "GOOGLE_OAUTH_TIMEOUT" && error.status === 504,
    );
    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs < 5000, `타임아웃 설정(150ms)보다 한참 오래 걸리면 안 됩니다(실측 ${elapsedMs}ms)`);
});

test("Google 프로필 엔드포인트 응답이 지연되면 유한한 시간 안에 GOOGLE_OAUTH_TIMEOUT으로 실패한다", async (t) => {
    const originalTimeoutMs = process.env.GOOGLE_OAUTH_TIMEOUT_MS;
    process.env.GOOGLE_OAUTH_TIMEOUT_MS = "150";
    t.after(() => {
        if (originalTimeoutMs === undefined) delete process.env.GOOGLE_OAUTH_TIMEOUT_MS;
        else process.env.GOOGLE_OAUTH_TIMEOUT_MS = originalTimeoutMs;
    });

    const base = await startMockGoogle(t, {
        tokenHandler: jsonHandler(200, { access_token: "token-6" }),
        userinfoHandler: () => {},
    });
    withFetchRedirectedTo(t, base);

    const startedAt = Date.now();
    await assert.rejects(
        () => googleOAuthService.exchangeCodeForProfile("code-timeout-2"),
        (error) => error.code === "GOOGLE_OAUTH_TIMEOUT" && error.status === 504,
    );
    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs < 5000, `타임아웃 설정(150ms)보다 한참 오래 걸리면 안 됩니다(실측 ${elapsedMs}ms)`);
});
