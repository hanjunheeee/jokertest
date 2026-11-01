process.env.JWT_SECRET = "social-auth-route-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");
const jwt          = require("jsonwebtoken");

const { generateToken } = require("../../utils/auth/credentials");
const { notFoundHandler, globalErrorHandler } = require("../../middlewares/errorHandler.middleware");
const userRepository    = require("../../repositories/user");
const socialAuthService = require("../../services/auth/social");

const REPO_KEYS = ["findActiveSession", "checkActiveBan"];
const SERVICE_KEYS = ["completeSocialSignup", "getSocialSignupIntent", "issueOAuthState", "linkExternalIdentity"];

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
    app.use("/auth", require("../../routes/auth.routes"));
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

test("닉네임 중복(재시도 가능한 실패)이 나면 oauthAttempt 쿠키를 지우지 않아 재시도에서도 rememberMe가 보존된다(CODEX-1 AC-02)", async (t) => {
    stubSocialAuthService(t, {
        completeSocialSignup: async () => {
            const error = new Error("이미 사용 중인 닉네임입니다.");
            error.status = 409;
            throw error;
        },
    });
    const base = await startServer(t);

    const attemptCookie = signAttempt({ intentToken: "intent-1", rememberMe: true, purpose: "signup" });
    const res = await postJson(base, "/auth/social/signup/complete",
        { intentToken: "intent-1", nickname: "중복닉" },
        { cookie: `oauthAttempt=${attemptCookie}` },
    );

    assert.equal(res.status, 409);
    assert.equal(findSetCookie(res, "oauthAttempt"), undefined,
        "실패해도 재시도 가능한 오류라면 oauthAttempt 쿠키를 다시 지우면 안 됩니다 — 브라우저에 원래 서명 쿠키가 그대로 남아야 재시도가 rememberMe를 유지합니다");
});

test("가입 완료에 성공하면 그제서야 oauthAttempt 쿠키를 지운다(CODEX-1 AC-02)", async (t) => {
    stubSocialAuthService(t, {
        completeSocialSignup: async () => ({
            user: { uuid: "new-uuid", nickname: "소셜닉", role: "USER" },
            token: "fake-access-token", refreshToken: null, refreshTokenExpiresAt: null,
        }),
    });
    const base = await startServer(t);

    const attemptCookie = signAttempt({ intentToken: "intent-1", rememberMe: true, purpose: "signup" });
    const res = await postJson(base, "/auth/social/signup/complete",
        { intentToken: "intent-1", nickname: "소셜닉" },
        { cookie: `oauthAttempt=${attemptCookie}` },
    );

    assert.equal(res.status, 200);
    const clearedAttempt = findSetCookie(res, "oauthAttempt");
    assert.ok(clearedAttempt, "성공했으면 더 이상 필요 없는 oauthAttempt 쿠키를 지워야 합니다");
    assert.match(clearedAttempt, /^oauthAttempt=;/, "삭제 쿠키는 값이 비어 있어야 합니다");
});

test("완료 요청에 email_verified·verified·provider·subject·rememberMe를 주입해도 서비스 입력에 전달되지 않는다(AC-03)", async (t) => {
    const { calls } = stubSocialAuthService(t, {
        completeSocialSignup: async () => ({
            user: { uuid: "new-uuid", nickname: "소셜닉", role: "USER" },
            token: "fake-access-token", refreshToken: null, refreshTokenExpiresAt: null,
        }),
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/signup/complete", {
        intentToken: "intent-1",
        nickname: "소셜닉",
        birthDate: "2000-01-01",
        email: "claimed@example.com",
        signupProof: "proof-1",
        email_verified: true,
        emailVerified: true,
        verified: true,
        provider: "google",
        subject: "attacker-subject",
        rememberMe: true,
    });

    assert.equal(res.status, 200);
    const passed = calls[0].args[0];
    assert.deepEqual(Object.keys(passed).sort(), ["birthDate", "email", "intentToken", "nickname", "rememberMe", "reqInfo", "signupProof"],
        "컨트롤러는 허용한 가입 필드와 서버가 만든 rememberMe·reqInfo만 서비스에 넘겨야 합니다");
    assert.equal(passed.email_verified, undefined);
    assert.equal(passed.emailVerified, undefined);
    assert.equal(passed.verified, undefined);
    assert.equal(passed.provider, undefined);
    assert.equal(passed.subject, undefined);
    assert.equal(passed.rememberMe, false, "rememberMe는 서명 쿠키에서만 읽으므로 본문 주장은 무시되어야 합니다");
    assert.equal(passed.email, "claimed@example.com", "email은 전달되지만, 실제 사용 여부는 서비스가 잠근 intent가 판정합니다");
    assert.equal(passed.signupProof, "proof-1");
});

test("서비스가 증명을 거부하면(SIGNUP_PROOF_REQUIRED/INVALID) 401 code가 그대로 실리고 세션 쿠키를 발급하지 않는다(AC-03)", async (t) => {
    for (const code of ["SIGNUP_PROOF_REQUIRED", "SIGNUP_PROOF_INVALID"]) {
        await t.test(code, async (t2) => {
            stubSocialAuthService(t2, {
                completeSocialSignup: async () => {
                    const error = new Error("이메일 인증 증명이 유효하지 않습니다.");
                    error.status = 401;
                    error.code = code;
                    throw error;
                },
            });
            const base = await startServer(t2);

            const res = await postJson(base, "/auth/social/signup/complete",
                { intentToken: "intent-1", nickname: "소셜닉", birthDate: "2000-01-01", email: "a@example.com" });
            const body = await res.json();

            assert.equal(res.status, 401);
            assert.equal(body.success, false);
            assert.equal(body.code, code);
            assert.equal(findSetCookie(res, "accessToken"), undefined, "증명 거부는 세션을 발급하면 안 됩니다");
        });
    }
});

test("intent 조회는 intentToken만 서비스에 넘기고 emailVerificationRequired만 no-store로 응답한다(AC-02)", async (t) => {
    const { calls } = stubSocialAuthService(t, {
        getSocialSignupIntent: async () => ({ emailVerificationRequired: true }),
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/signup/intent", {
        intentToken: "intent-1",
        emailVerificationRequired: false,
        email_verified: true,
        provider: "google",
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(calls[0].args[0], { intentToken: "intent-1" }, "조회 서비스에는 intentToken만 넘어가야 합니다");
    assert.deepEqual(body, { success: true, data: { emailVerificationRequired: true } },
        "응답에는 화면 분기용 boolean만 실려야 합니다(이메일·provider·subject 비노출)");
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(findSetCookie(res, "accessToken"), undefined, "조회는 세션을 발급하지 않습니다");
});

test("만료·소비된 intent 조회는 서비스 오류의 status·code가 그대로 실린다(AC-02)", async (t) => {
    stubSocialAuthService(t, {
        getSocialSignupIntent: async () => {
            const error = new Error("이미 처리된 가입 요청입니다.");
            error.status = 409;
            error.code = "INTENT_CONSUMED";
            throw error;
        },
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/social/signup/intent", { intentToken: "consumed" });
    const body = await res.json();

    assert.equal(res.status, 409);
    assert.equal(body.code, "INTENT_CONSUMED");
});

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
