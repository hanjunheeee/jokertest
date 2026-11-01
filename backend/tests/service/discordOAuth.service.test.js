const test  = require("node:test");
const assert = require("node:assert/strict");
const http  = require("node:http");
const { once } = require("node:events");

process.env.DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID     || "adapter-test-client-id";
process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "adapter-test-client-secret";
process.env.DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI  || "https://backend.example.test/auth/discord/callback";
process.env.DISCORD_LINK_REDIRECT_URI = process.env.DISCORD_LINK_REDIRECT_URI || "https://backend.example.test/auth/discord/link/callback";

const discordOAuthService = require("../../services/auth/oauth/discord");

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

const startMockDiscord = async (t, { tokenHandler, meHandler }) => {
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            if (req.url.startsWith("/token")) return tokenHandler(req, res, body);
            if (req.url.startsWith("/me")) return meHandler(req, res, body);
            res.writeHead(404, { "Connection": "close" }).end();
        });
    });
    await listenOnFetchablePort(server);
    t.after(() => {
        server.closeAllConnections?.();
        return new Promise((resolve) => server.close(resolve));
    });
    return `http://127.0.0.1:${server.address().port}`;
};

const withFetchRedirectedTo = (t, base) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
        const urlStr = String(url);
        if (urlStr.startsWith(discordOAuthService.DISCORD_TOKEN_ENDPOINT)) {
            return originalFetch(`${base}/token`, init);
        }
        if (urlStr.startsWith(discordOAuthService.DISCORD_USERINFO_ENDPOINT)) {
            return originalFetch(`${base}/me`, init);
        }
        return originalFetch(urlStr, init);
    };
    t.after(() => { globalThis.fetch = originalFetch; });
};

const jsonHandler = (status, body) => (req, res) => {
    res.writeHead(status, { "content-type": "application/json", "Connection": "close" });
    res.end(JSON.stringify(body));
};

test("실제 네트워크 왕복으로 code를 교환해 검증된 subject/email을 반환하고, 요청 본문·헤더가 계약대로 구성된다", async (t) => {
    let tokenRequest = null;
    let meAuth = null;
    const base = await startMockDiscord(t, {
        tokenHandler: (req, res, body) => {
            tokenRequest = { method: req.method, contentType: req.headers["content-type"], body };
            jsonHandler(200, { access_token: "real-access-token-1" })(req, res);
        },
        meHandler: (req, res) => {
            meAuth = req.headers["authorization"];
            jsonHandler(200, { id: "discord-id-1", email: "user@example.com", verified: true })(req, res);
        },
    });
    withFetchRedirectedTo(t, base);

    const profile = await discordOAuthService.exchangeCodeForProfile("real-auth-code");

    assert.deepEqual(profile, { subject: "discord-id-1", email: "user@example.com" });
    assert.equal(tokenRequest.method, "POST");
    assert.match(tokenRequest.contentType, /application\/x-www-form-urlencoded/);

    const params = new URLSearchParams(tokenRequest.body);
    assert.equal(params.get("code"), "real-auth-code");
    assert.equal(params.get("client_id"), process.env.DISCORD_CLIENT_ID);
    assert.equal(params.get("client_secret"), process.env.DISCORD_CLIENT_SECRET);
    assert.equal(params.get("redirect_uri"), process.env.DISCORD_REDIRECT_URI);
    assert.equal(params.get("grant_type"), "authorization_code");
    assert.equal(meAuth, "Bearer real-access-token-1", "프로필 조회는 발급받은 access_token을 Bearer로 실어야 합니다");
});

test("verified가 false면 이메일을 검증되지 않은 값으로 취급해 null을 반환한다(A-03: 검증된 식별자만 신뢰)", async (t) => {
    const base = await startMockDiscord(t, {
        tokenHandler: jsonHandler(200, { access_token: "token-2" }),
        meHandler: jsonHandler(200, { id: "discord-id-2", email: "unverified@example.com", verified: false }),
    });
    withFetchRedirectedTo(t, base);

    const profile = await discordOAuthService.exchangeCodeForProfile("code-2");
    assert.equal(profile.subject, "discord-id-2");
    assert.equal(profile.email, null);
});

for (const [label, profileBody] of [
    ["verified 누락", { id: "discord-missing", email: "missing-flag@example.com" }],
    ["verified가 문자열 'true'", { id: "discord-string", email: "string-flag@example.com", verified: "true" }],
    ["verified가 숫자 1", { id: "discord-one", email: "one-flag@example.com", verified: 1 }],
    ["verified는 true지만 이메일 미제공", { id: "discord-no-email", verified: true }],
    ["이메일이 문자열이 아님", { id: "discord-obj-email", email: { value: "x@example.com" }, verified: true }],
]) {
    test(`AC-01: ${label}이면 email은 null이고 subject만 넘어간다(자체 인증 분기로 보낸다)`, async (t) => {
        const base = await startMockDiscord(t, {
            tokenHandler: jsonHandler(200, { access_token: `token-${profileBody.id}` }),
            meHandler: jsonHandler(200, profileBody),
        });
        withFetchRedirectedTo(t, base);

        const profile = await discordOAuthService.exchangeCodeForProfile(`code-${profileBody.id}`);
        assert.equal(profile.subject, profileBody.id);
        assert.equal(profile.email, null, "boolean true가 아닌 인증 표시는 이메일을 통과시키면 안 됩니다");
    });
}

test("토큰 엔드포인트가 실패 상태코드를 반환하면 DISCORD_TOKEN_EXCHANGE_FAILED로 거부된다", async (t) => {
    const base = await startMockDiscord(t, {
        tokenHandler: jsonHandler(400, { error: "invalid_grant" }),
        meHandler: () => { throw new Error("호출되면 안 됩니다"); },
    });
    withFetchRedirectedTo(t, base);

    await assert.rejects(
        () => discordOAuthService.exchangeCodeForProfile("bad-code"),
        (error) => error.code === "DISCORD_TOKEN_EXCHANGE_FAILED",
    );
});

test("토큰 응답에 access_token이 없으면 DISCORD_TOKEN_EXCHANGE_FAILED로 거부된다", async (t) => {
    const base = await startMockDiscord(t, {
        tokenHandler: jsonHandler(200, { token_type: "Bearer" }),
        meHandler: () => { throw new Error("호출되면 안 됩니다"); },
    });
    withFetchRedirectedTo(t, base);

    await assert.rejects(
        () => discordOAuthService.exchangeCodeForProfile("code-3"),
        (error) => error.code === "DISCORD_TOKEN_EXCHANGE_FAILED",
    );
});

test("프로필 엔드포인트가 실패 상태코드를 반환하면 DISCORD_PROFILE_FETCH_FAILED로 거부된다", async (t) => {
    const base = await startMockDiscord(t, {
        tokenHandler: jsonHandler(200, { access_token: "token-4" }),
        meHandler: jsonHandler(401, { error: "0: 401: Unauthorized" }),
    });
    withFetchRedirectedTo(t, base);

    await assert.rejects(
        () => discordOAuthService.exchangeCodeForProfile("code-4"),
        (error) => error.code === "DISCORD_PROFILE_FETCH_FAILED",
    );
});

test("프로필 응답에 id가 없으면 DISCORD_PROFILE_INVALID로 거부된다", async (t) => {
    const base = await startMockDiscord(t, {
        tokenHandler: jsonHandler(200, { access_token: "token-5" }),
        meHandler: jsonHandler(200, { email: "no-id@example.com" }),
    });
    withFetchRedirectedTo(t, base);

    await assert.rejects(
        () => discordOAuthService.exchangeCodeForProfile("code-5"),
        (error) => error.code === "DISCORD_PROFILE_INVALID",
    );
});

test("Discord 토큰 엔드포인트 응답이 지연되면 무기한 대기하지 않고 유한한 시간 안에 DISCORD_OAUTH_TIMEOUT으로 실패한다", async (t) => {
    const originalTimeoutMs = process.env.DISCORD_OAUTH_TIMEOUT_MS;
    process.env.DISCORD_OAUTH_TIMEOUT_MS = "150";
    t.after(() => {
        if (originalTimeoutMs === undefined) delete process.env.DISCORD_OAUTH_TIMEOUT_MS;
        else process.env.DISCORD_OAUTH_TIMEOUT_MS = originalTimeoutMs;
    });

    const base = await startMockDiscord(t, {
        tokenHandler: () => {},
        meHandler: jsonHandler(200, { id: "should-not-reach" }),
    });
    withFetchRedirectedTo(t, base);

    const startedAt = Date.now();
    await assert.rejects(
        () => discordOAuthService.exchangeCodeForProfile("code-timeout"),
        (error) => error.code === "DISCORD_OAUTH_TIMEOUT" && error.status === 504,
    );
    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs < 5000, `타임아웃 설정(150ms)보다 한참 오래 걸리면 안 됩니다(실측 ${elapsedMs}ms)`);
});

test("Discord 프로필 엔드포인트 응답이 지연되면 유한한 시간 안에 DISCORD_OAUTH_TIMEOUT으로 실패한다", async (t) => {
    const originalTimeoutMs = process.env.DISCORD_OAUTH_TIMEOUT_MS;
    process.env.DISCORD_OAUTH_TIMEOUT_MS = "150";
    t.after(() => {
        if (originalTimeoutMs === undefined) delete process.env.DISCORD_OAUTH_TIMEOUT_MS;
        else process.env.DISCORD_OAUTH_TIMEOUT_MS = originalTimeoutMs;
    });

    const base = await startMockDiscord(t, {
        tokenHandler: jsonHandler(200, { access_token: "token-6" }),
        meHandler: () => {},
    });
    withFetchRedirectedTo(t, base);

    const startedAt = Date.now();
    await assert.rejects(
        () => discordOAuthService.exchangeCodeForProfile("code-timeout-2"),
        (error) => error.code === "DISCORD_OAUTH_TIMEOUT" && error.status === 504,
    );
    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs < 5000, `타임아웃 설정(150ms)보다 한참 오래 걸리면 안 됩니다(실측 ${elapsedMs}ms)`);
});

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

test("DISCORD_CLIENT_ID/REDIRECT_URI가 설정되어 있으면 인가 URL에 하드코딩 없이 그 값이 그대로 실린다", async (t) => {
    const originalId  = process.env.DISCORD_CLIENT_ID;
    const originalUri = process.env.DISCORD_REDIRECT_URI;
    process.env.DISCORD_CLIENT_ID = "env-client-id";
    process.env.DISCORD_REDIRECT_URI = "https://backend.example.test/auth/discord/callback";
    t.after(() => {
        if (originalId === undefined) delete process.env.DISCORD_CLIENT_ID; else process.env.DISCORD_CLIENT_ID = originalId;
        if (originalUri === undefined) delete process.env.DISCORD_REDIRECT_URI; else process.env.DISCORD_REDIRECT_URI = originalUri;
    });

    const url = discordOAuthService.buildAuthorizationUrl("state-abc");
    assert.match(url, /client_id=env-client-id/);
    assert.match(url, /redirect_uri=https/);
    assert.match(url, /state=state-abc/);
});

test("purpose:link로 인가 URL을 만들면 DISCORD_REDIRECT_URI가 아니라 DISCORD_LINK_REDIRECT_URI가 실린다(AC-04)", async (t) => {
    const loginUrl = discordOAuthService.buildAuthorizationUrl("state-login", { purpose: "login" });
    const linkUrl  = discordOAuthService.buildAuthorizationUrl("state-link", { purpose: "link" });

    const loginRedirect = new URL(loginUrl).searchParams.get("redirect_uri");
    const linkRedirect  = new URL(linkUrl).searchParams.get("redirect_uri");

    assert.equal(loginRedirect, process.env.DISCORD_REDIRECT_URI);
    assert.equal(linkRedirect, process.env.DISCORD_LINK_REDIRECT_URI);
    assert.notEqual(linkRedirect, loginRedirect,
        "로그인과 연결이 같은 redirect_uri를 쓰면 실제 Discord가 항상 로그인 콜백으로만 돌려줘 link 콜백이 purpose:link를 거부하게 된다");
});

test("DISCORD_LINK_REDIRECT_URI가 없으면 DISCORD_REDIRECT_URI가 설정되어 있어도 purpose:link 인가 URL 생성은 설정 오류로 거부된다", async (t) => {
    const original = process.env.DISCORD_LINK_REDIRECT_URI;
    delete process.env.DISCORD_LINK_REDIRECT_URI;
    t.after(() => {
        if (original === undefined) delete process.env.DISCORD_LINK_REDIRECT_URI; else process.env.DISCORD_LINK_REDIRECT_URI = original;
    });

    assert.throws(
        () => discordOAuthService.buildAuthorizationUrl("state-link", { purpose: "link" }),
        (error) => error.code === "DISCORD_OAUTH_NOT_CONFIGURED",
    );
});

test("purpose:link로 코드를 교환하면 토큰 요청 본문의 redirect_uri가 DISCORD_LINK_REDIRECT_URI다(AC-04, OAuth 명세: 인가 URL 발급 때와 같은 redirect_uri여야 한다)", async (t) => {
    let tokenRequestBody = null;
    const base = await startMockDiscord(t, {
        tokenHandler: (req, res, body) => {
            tokenRequestBody = body;
            jsonHandler(200, { access_token: "link-access-token-1" })(req, res);
        },
        meHandler: jsonHandler(200, { id: "discord-id-link-1", email: "link@example.com", verified: true }),
    });
    withFetchRedirectedTo(t, base);

    const profile = await discordOAuthService.exchangeCodeForProfile("link-auth-code", { purpose: "link" });

    assert.deepEqual(profile, { subject: "discord-id-link-1", email: "link@example.com" });
    const params = new URLSearchParams(tokenRequestBody);
    assert.equal(params.get("redirect_uri"), process.env.DISCORD_LINK_REDIRECT_URI);
    assert.notEqual(params.get("redirect_uri"), process.env.DISCORD_REDIRECT_URI);
});
