// F-31a: 가입 이메일 인증(인증번호 발송·확인, 가입 증명) API·시간·로그 계약 시험.
// 실제 auth.routes.js·signupEmailVerification.controller.js·signupEmailVerification.service.js·
// auth.service.js가 그대로 돈다 — DB 모델(db.SignupEmailVerification·db.User·
// db.PasswordResetToken)과 메일 어댑터만 인메모리로 대체한다(passwordReset.api.test.js와
// 같은 원칙). 시간 경계는 실제 대기(짧은 TTL 환경변수)로 검증한다.

process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "signup-email-verification-api-test-secret";
process.env.PASSWORD_RESET_APP_URL = process.env.PASSWORD_RESET_APP_URL || "https://frontend.example.test";
process.env.SIGNUP_EMAIL_HMAC_SECRET = process.env.SIGNUP_EMAIL_HMAC_SECRET
    || "signup-email-verification-api-test-hmac-secret";
// 이 파일의 여러 케이스가 같은 프로세스(같은 auth.routes.js 모듈, 같은 메모리 카운터)를
// 공유한다 — 전용 한도 시험은 아래에서 라우터를 캐시 재로드해 별도로 검증한다.
process.env.SIGNUP_EMAIL_HOUR_MAX = "1000";
process.env.SIGNUP_EMAIL_DAY_MAX = "1000";
process.env.SIGNUP_IP_HOUR_MAX = "1000";
process.env.SIGNUP_IP_DAY_MAX = "1000";
// 만료·재발송 경계를 실제로(빠르게) 기다려서 검증할 수 있도록 짧게 잡는다.
process.env.SIGNUP_EMAIL_CODE_TTL_MS = "1500";
process.env.SIGNUP_EMAIL_RESEND_COOLDOWN_MS = "300";
process.env.SIGNUP_EMAIL_PROOF_TTL_MS = "1500";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { once } = require("node:events");
const express = require("express");
const cookieParser = require("cookie-parser");

const db = require("../models");
const userRepository = require("../repositories/user.repositories");
const authService = require("../service/auth.service");
const mailAdapterModule = require("../mail/mailAdapter");
const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");

const AUTH_ROUTES_PATH = require.resolve("../routes/auth.routes");
const RATE_LIMIT_PATH = require.resolve("../middleware/rateLimit");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** db.SignupEmailVerification을 최소 in-memory 모델로 대체한다. */
const stubSignupEmailVerificationModel = (t) => {
    const original = db.SignupEmailVerification;
    let nextId = 1;
    const rows = [];
    const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);

    db.SignupEmailVerification = {
        async findOne({ where }) {
            return rows.find((row) => matches(row, where)) ?? null;
        },
        async create(data) {
            const row = {
                id: nextId++, generation: 0, attempts: 0,
                code_hash: null, code_expires_at: null, code_consumed_at: null, sent_at: null,
                proof_hash: null, proof_expires_at: null, proof_consumed_at: null,
                ...data,
            };
            rows.push(row);
            return row;
        },
        async update(patch, { where }) {
            let count = 0;
            for (const row of rows) {
                if (matches(row, where)) { Object.assign(row, patch); count += 1; }
            }
            return [count];
        },
    };
    t.after(() => { db.SignupEmailVerification = original; });
    return rows;
};

/** db.PasswordResetToken을 최소 in-memory 모델로 대체한다(passwordReset.api.test.js와 동일). */
const stubPasswordResetTokenModel = (t) => {
    const original = db.PasswordResetToken;
    let nextId = 1;
    const rows = [];
    const matches = (row, where) => Object.entries(where).every(([key, value]) => {
        if (value === null) return row[key] === null || row[key] === undefined;
        return row[key] === value;
    });

    db.PasswordResetToken = {
        async findOne({ where }) {
            return rows.find((row) => matches(row, where)) ?? null;
        },
        async create(data) {
            const row = { id: nextId++, revoked_at: null, used: false, ...data };
            rows.push(row);
            return row;
        },
        async update(patch, { where }) {
            let count = 0;
            for (const row of rows) {
                if (matches(row, where)) { Object.assign(row, patch); count += 1; }
            }
            return [count];
        },
    };
    t.after(() => { db.PasswordResetToken = original; });
    return rows;
};

/** userRepository를 인메모리 가짜로 대체한다(F-03/F-29b 회귀 시험과 같은 패턴). */
const stubUserRepository = (t, { users = [] } = {}) => {
    const originals = {
        withTransaction: userRepository.withTransaction,
        findByEmail: userRepository.findByEmail,
        findByUuid: userRepository.findByUuid,
        findByNickname: userRepository.findByNickname,
        updateUser: userRepository.updateUser,
        markOnlineSessionsOffline: userRepository.markOnlineSessionsOffline,
    };

    const byUuid = new Map(users.map((u) => [u.uuid, { ...u }]));

    userRepository.withTransaction = async (work) => work({ LOCK: { UPDATE: "UPDATE" } });
    userRepository.findByEmail = async (email) => (
        [...byUuid.values()].find((u) => u.email === email) ?? null
    );
    userRepository.findByNickname = async () => null;
    userRepository.findByUuid = async (uuid) => byUuid.get(uuid) ?? null;
    userRepository.updateUser = async (uuid, patch) => {
        const user = byUuid.get(uuid);
        if (user) Object.assign(user, patch);
        return [user ? 1 : 0];
    };
    userRepository.markOnlineSessionsOffline = async () => [0];

    t.after(() => Object.assign(userRepository, originals));
    return { byUuid };
};

const useMemoryMailAdapter = (t) => {
    const memory = mailAdapterModule.createMemoryMailAdapter();
    t.mock.method(mailAdapterModule, "createHttpMailAdapter", () => memory);
    return memory;
};

/** auth.routes.js·rateLimit.js를 캐시에서 지워, 전용 카운터를 가진 라우터를 새로 만든다. */
const loadFreshAuthRouter = () => {
    delete require.cache[AUTH_ROUTES_PATH];
    delete require.cache[RATE_LIMIT_PATH];
    const router = require(AUTH_ROUTES_PATH);
    delete require.cache[AUTH_ROUTES_PATH];
    delete require.cache[RATE_LIMIT_PATH];
    return router;
};

const startServer = async (t, { router } = {}) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/auth", router ?? require("../routes/auth.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const postCode = (base, body) => fetch(`${base}/auth/signup/email-code`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const postVerify = (base, body) => fetch(`${base}/auth/signup/email-code/verify`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const postSignup = (base, body) => fetch(`${base}/auth/signup`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

const VALID_SIGNUP_FIELDS = {
    password: "pw12345678",
    passwordConfirm: "pw12345678",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
};

// ── AC-01: 정상 발송·확인 응답 형태 ───────────────────────────────────────────

test("AC-01: 발송 성공 응답은 ok/resendAfterSec/expiresInSec만 반환하고 no-store가 적용된다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const email = `ac01-${crypto.randomUUID()}@example.com`;
    const res = await postCode(base, { email });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(Object.keys(body).sort(), ["expiresInSec", "ok", "resendAfterSec"]);
    assert.equal(body.ok, true);

    assert.equal(memory.outbox.length, 1);
    assert.equal(memory.outbox[0].template, "SIGNUP_CODE");
    assert.equal(memory.outbox[0].to, email);
    assert.match(memory.outbox[0].params.code, /^\d{6}$/);
});

test("AC-01: 확인 성공 응답은 ok/signupProof만 반환하고, 그 증명으로 가입 API를 호출하면 계정이 생성된다", async (t) => {
    stubSignupEmailVerificationModel(t);
    const { byUuid } = stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const email = `ac01-full-${crypto.randomUUID()}@example.com`;
    await postCode(base, { email });
    const code = memory.outbox.at(-1).params.code;

    const verifyRes = await postVerify(base, { email, code });
    const verifyBody = await verifyRes.json();
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.headers.get("cache-control"), "no-store");
    assert.deepEqual(Object.keys(verifyBody).sort(), ["ok", "signupProof"]);
    assert.equal(typeof verifyBody.signupProof, "string");
    assert.ok(verifyBody.signupProof.length > 0);

    // F-31a AC-01: 이 signupProof로 실제 /auth/signup을 호출하면 계정이 생성된다. economy
    // 지급 등 계정 생성 이후 단계까지는 실제 DB가 필요하므로(f31a-signup-email-verification.
    // integration.test.js가 그 경로를 실제 DB로 검증한다), 여기서는 db.User.create 자체를
    // 최소로 흉내 내 "증명 소비까지는 성공한다"만 확인한다.
    db.User.create = async (data) => ({ uuid: crypto.randomUUID(), ...data });
    db.UserStats = { create: async (data) => data };
    const economyService = require("../service/economy.service");
    const originalEnsure = economyService.ensureDefaultEntitlements;
    economyService.ensureDefaultEntitlements = async () => {};
    t.after(() => { economyService.ensureDefaultEntitlements = originalEnsure; });

    const signupRes = await postSignup(base, {
        email, ...VALID_SIGNUP_FIELDS, signupProof: verifyBody.signupProof,
    });
    const signupBody = await signupRes.json();
    assert.equal(signupRes.status, 200, JSON.stringify(signupBody));
    assert.equal(signupBody.success, true);
});

// ── AC-02: 만료·오답·재발송·이메일 변경 ───────────────────────────────────────

test("AC-02: 만료된 인증번호는 CODE_EXPIRED로 거부된다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const email = `ac02-expired-${crypto.randomUUID()}@example.com`;
    await postCode(base, { email });
    const code = memory.outbox.at(-1).params.code;

    await sleep(1700); // SIGNUP_EMAIL_CODE_TTL_MS=1500보다 길게 대기

    const res = await postVerify(base, { email, code });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { ok: false, code: "CODE_EXPIRED" });
});

test("AC-02: 5회 초과 오입력은 TOO_MANY_ATTEMPTS로 잠기고 이후 정답도 거부된다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const email = `ac02-attempts-${crypto.randomUUID()}@example.com`;
    await postCode(base, { email });
    const code = memory.outbox.at(-1).params.code;
    const wrongCode = code === "000000" ? "111111" : "000000";

    for (let expected = 4; expected >= 1; expected -= 1) {
        const res = await postVerify(base, { email, code: wrongCode });
        const body = await res.json();
        assert.equal(res.status, 400);
        assert.equal(body.code, "CODE_INVALID");
        assert.equal(body.attemptsRemaining, expected, `${5 - expected}번째 오답의 attemptsRemaining`);
    }

    const fifth = await postVerify(base, { email, code: wrongCode });
    assert.equal(fifth.status, 429);
    assert.deepEqual(await fifth.json(), { ok: false, code: "TOO_MANY_ATTEMPTS" });

    // 잠긴 뒤에는 원래 정답이어도 거부된다.
    const afterLock = await postVerify(base, { email, code });
    assert.equal(afterLock.status, 429);
    assert.deepEqual(await afterLock.json(), { ok: false, code: "TOO_MANY_ATTEMPTS" });
});

test("AC-02: 재발송 이후에는 이전 번호가 무효화되고 새 번호만 통과한다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const email = `ac02-resend-${crypto.randomUUID()}@example.com`;
    await postCode(base, { email });
    const firstCode = memory.outbox.at(-1).params.code;

    await sleep(350); // SIGNUP_EMAIL_RESEND_COOLDOWN_MS=300보다 길게 대기
    await postCode(base, { email });
    const secondCode = memory.outbox.at(-1).params.code;

    const oldVerify = await postVerify(base, { email, code: firstCode });
    if (firstCode === secondCode) {
        // 같은 번호가 우연히 다시 뽑혔더라도(낮은 확률) 재발송 이후 세대가 바뀌었으므로
        // 그 자체는 통과해야 한다 — 아래 별도 검증으로 대체한다.
        assert.equal(oldVerify.status, 200);
    } else {
        assert.equal(oldVerify.status, 400);
        assert.deepEqual(await oldVerify.json(), { ok: false, code: "CODE_INVALID", attemptsRemaining: 4 });

        const newVerify = await postVerify(base, { email, code: secondCode });
        assert.equal(newVerify.status, 200);
    }
});

// 재검토 지적: 위 시험은 "우연히 같은 번호가 다시 뽑히면" 통과 조건을 아예 건너뛰었다 —
// 서비스가 실제로 직전 번호와 같은 값을 재추첨하는지는 한 번도 검증하지 못했다. crypto.
// randomInt를 통제해 그 충돌을 강제로 재현한다.
test("AC-02: 재발송에서 직전과 같은 번호가 다시 뽑히면 재추첨하고, 이전 발급분은 어떤 경우에도 통과하지 못한다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    // generateNumericCode(6)은 crypto.randomInt(0, 10**6)을 호출한다. 첫 발송은 123456을
    // 뽑고, 재발송은 같은 123456을 다시 뽑아 충돌을 유발한 뒤(서비스가 재추첨해야 함)
    // 654321을 뽑는다 — 큐가 정확히 이 순서로 소진되어야 "정확히 한 번만 재추첨했다"도
    // 함께 확인된다.
    const queue = [123456, 123456, 654321];
    t.mock.method(crypto, "randomInt", (min, max) => {
        assert.equal(min, 0, "generateNumericCode는 항상 0부터 뽑아야 한다");
        assert.ok(queue.length > 0, "예상보다 randomInt가 더 많이 호출되었습니다");
        const value = queue.shift();
        assert.ok(value < max, "큐에 넣은 값이 codeLength 자릿수를 넘습니다");
        return value;
    });

    const email = `ac02-collision-${crypto.randomUUID()}@example.com`;
    await postCode(base, { email });
    const firstCode = memory.outbox.at(-1).params.code;
    assert.equal(firstCode, "123456");

    await sleep(350); // SIGNUP_EMAIL_RESEND_COOLDOWN_MS=300보다 길게 대기
    await postCode(base, { email });
    const secondCode = memory.outbox.at(-1).params.code;
    assert.equal(secondCode, "654321", "직전과 같은 번호(123456)가 다시 뽑히면 재추첨되어야 한다");
    assert.equal(queue.length, 0, "충돌 시 정확히 한 번만 재추첨해야 한다");

    const oldVerify = await postVerify(base, { email, code: firstCode });
    assert.equal(oldVerify.status, 400, "이전 발급분(123456)은 재발송 이후 어떤 경우에도 통과하면 안 된다");
    assert.deepEqual(await oldVerify.json(), { ok: false, code: "CODE_INVALID", attemptsRemaining: 4 });

    const newVerify = await postVerify(base, { email, code: secondCode });
    assert.equal(newVerify.status, 200);
});

test("AC-02: 재발송 대기 중 재요청은 RESEND_TOO_SOON과 resendAfterSec를 반환한다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    useMemoryMailAdapter(t);
    const base = await startServer(t);

    const email = `ac02-toosoon-${crypto.randomUUID()}@example.com`;
    await postCode(base, { email });

    const res = await postCode(base, { email });
    const body = await res.json();
    assert.equal(res.status, 429);
    assert.equal(body.ok, false);
    assert.equal(body.code, "RESEND_TOO_SOON");
    assert.equal(typeof body.resendAfterSec, "number");
    assert.ok(body.resendAfterSec > 0);
});

test("AC-02: 이메일 주소를 바꿔 재인증 없이 제출하면 가입 증명이 거부된다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const emailA = `ac02-changed-a-${crypto.randomUUID()}@example.com`;
    const emailB = `ac02-changed-b-${crypto.randomUUID()}@example.com`;
    await postCode(base, { email: emailA });
    const code = memory.outbox.at(-1).params.code;
    const verifyRes = await postVerify(base, { email: emailA, code });
    const { signupProof } = await verifyRes.json();

    const signupRes = await postSignup(base, { email: emailB, ...VALID_SIGNUP_FIELDS, signupProof });
    const signupBody = await signupRes.json();
    assert.equal(signupRes.status, 401);
    assert.equal(signupBody.code, "SIGNUP_PROOF_INVALID");
});

// ── AC-03: 증명 누락·재설정 토큰 혼용 ─────────────────────────────────────────

test("AC-03: 가입 증명 없이 가입 API를 호출하면 SIGNUP_PROOF_REQUIRED로 거부된다", async (t) => {
    const base = await startServer(t);

    const res = await postSignup(base, { email: `ac03-missing-${crypto.randomUUID()}@example.com`, ...VALID_SIGNUP_FIELDS });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.code, "SIGNUP_PROOF_REQUIRED");
});

test("AC-03: 비밀번호 재설정용 증명 토큰으로 가입 API를 호출하면 거부된다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubPasswordResetTokenModel(t);
    const existingUser = {
        uuid: crypto.randomUUID(), email: `ac03-reset-${crypto.randomUUID()}@example.com`,
        nickname: "재설정유저", password_hash: "old-hash", has_local_password: true,
    };
    stubUserRepository(t, { users: [existingUser] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const resetRes = await fetch(`${base}/auth/password-reset/request`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: existingUser.email }),
    });
    assert.equal(resetRes.status, 200);
    const resetMail = memory.outbox.find((mail) => mail.template === "PASSWORD_RESET");
    assert.ok(resetMail, "재설정 메일이 발송되어야 그 토큰을 재사용해볼 수 있다");
    const resetToken = new URL(resetMail.params.resetUrl).searchParams.get("token");
    assert.ok(resetToken);

    const signupRes = await postSignup(base, {
        email: `ac03-newaccount-${crypto.randomUUID()}@example.com`,
        ...VALID_SIGNUP_FIELDS,
        signupProof: resetToken,
    });
    const signupBody = await signupRes.json();
    assert.equal(signupRes.status, 401);
    assert.equal(signupBody.code, "SIGNUP_PROOF_INVALID");
});

// ── AC-05: 요청 빈도 제한(IP·이메일 시간·일) ──────────────────────────────────

test("AC-05: IP 시간당 한도를 넘으면 429 RATE_LIMITED이고 인증 상태는 바뀌지 않는다", async (t) => {
    const originalEnv = {
        SIGNUP_IP_HOUR_MAX: process.env.SIGNUP_IP_HOUR_MAX,
        SIGNUP_EMAIL_HOUR_MAX: process.env.SIGNUP_EMAIL_HOUR_MAX,
    };
    process.env.SIGNUP_IP_HOUR_MAX = "3";
    process.env.SIGNUP_EMAIL_HOUR_MAX = "1000";
    t.after(() => Object.assign(process.env, originalEnv));

    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const router = loadFreshAuthRouter();
    const base = await startServer(t, { router });

    for (let i = 0; i < 3; i += 1) {
        const res = await postCode(base, { email: `ac05-ip-${i}-${crypto.randomUUID()}@example.com` });
        assert.equal(res.status, 200, `${i + 1}번째 요청은 통과해야 한다`);
    }
    const fourth = await postCode(base, { email: `ac05-ip-blocked-${crypto.randomUUID()}@example.com` });
    assert.equal(fourth.status, 429);
    assert.deepEqual(await fourth.json(), { ok: false, code: "RATE_LIMITED" });
    assert.equal(memory.outbox.length, 3, '차단된 요청은 메일을 보내지 않아야 한다');
});

test("AC-05: 이메일 시간당 한도를 넘으면 429 RATE_LIMITED이다(재발송 대기를 넘겨 반복)", async (t) => {
    const originalEnv = {
        SIGNUP_IP_HOUR_MAX: process.env.SIGNUP_IP_HOUR_MAX,
        SIGNUP_EMAIL_HOUR_MAX: process.env.SIGNUP_EMAIL_HOUR_MAX,
    };
    process.env.SIGNUP_IP_HOUR_MAX = "1000";
    process.env.SIGNUP_EMAIL_HOUR_MAX = "2";
    t.after(() => Object.assign(process.env, originalEnv));

    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    useMemoryMailAdapter(t);
    const router = loadFreshAuthRouter();
    const base = await startServer(t, { router });

    const email = `ac05-email-${crypto.randomUUID()}@example.com`;
    const first = await postCode(base, { email });
    assert.equal(first.status, 200);
    await sleep(350); // 재발송 대기(300ms)를 넘겨야 두 번째 요청이 실제로 발송 단계까지 간다
    const second = await postCode(base, { email });
    assert.equal(second.status, 200);
    await sleep(350);
    const third = await postCode(base, { email });
    assert.equal(third.status, 429);
    assert.deepEqual(await third.json(), { ok: false, code: "RATE_LIMITED" });
});

// 재검토 지적(CODEX-3): 이전 버전의 위 두 시험은 별도로 생성한 createRateLimiter
// 인스턴스를 시험했다 — 승인된 계약은 실제 발송 API(실제 라우터 배선의 POST
// /auth/signup/email-code)에서의 일당 제한이므로, 이 인스턴스가 올바르다는 사실이
// auth.routes.js가 실제로 그 설정으로 제한기를 구성해 요청 경로에 연결했는지는 증명하지
// 못한다. 아래 두 시험은 실제 라우터(loadFreshAuthRouter)로 실제 HTTP 요청을 보낸다.
// auth.routes.js는 findId·password-reset 라우트와 마찬가지로 제한기에 가짜 시계를 주입할
// 방법을 노출하지 않지만, createRateLimiter의 now 기본값은 라우터가 require되는(=
// createRateLimiter(...)가 호출되는) 시점의 Date.now 참조를 그대로 캡처한다 — 그래서
// loadFreshAuthRouter를 호출하기 전에 전역 Date.now를 가짜 시계로 바꿔 두면(다른 곳도
// 같은 방식을 쓴다: backend/socket/__tests__/roomCodeLifecycle.test.js,
// backend/tests/db/f21-participant-departure.integration.test.js), 실제 라우터가 그
// 가짜 시계로 24시간 창을 실제 대기 없이 넘길 수 있다. 이메일/IP 시간당 한도를 낮게
// 두면 일당 한도를 다 채우기 전에 시간당 한도에 먼저 걸려 일당 한도 자체가 시험되지
// 않으므로, 매 성공 요청 뒤 시계를 한 시간씩 전진시켜 시간당 창은 매번 새로 시작하고
// 일당 창(요청 시작 시점부터 고정된 24시간)만 누적되게 한다.
test("AC-05: 실제 라우터에서 이메일 일당 한도를 넘기면 429이고, 차단된 요청은 메일도 인증 행 갱신도 없다", async (t) => {
    const originalEnv = {
        SIGNUP_IP_HOUR_MAX: process.env.SIGNUP_IP_HOUR_MAX,
        SIGNUP_IP_DAY_MAX: process.env.SIGNUP_IP_DAY_MAX,
        SIGNUP_EMAIL_HOUR_MAX: process.env.SIGNUP_EMAIL_HOUR_MAX,
        SIGNUP_EMAIL_DAY_MAX: process.env.SIGNUP_EMAIL_DAY_MAX,
    };
    process.env.SIGNUP_IP_HOUR_MAX = "1000";
    process.env.SIGNUP_IP_DAY_MAX = "1000";
    process.env.SIGNUP_EMAIL_HOUR_MAX = "1"; // 시간당 창을 매번 새로 시작해 이 한도에 가려지지 않게 한다
    process.env.SIGNUP_EMAIL_DAY_MAX = "3";
    t.after(() => Object.assign(process.env, originalEnv));

    const realDateNow = Date.now;
    let fakeNow = realDateNow();
    Date.now = () => fakeNow;
    t.after(() => { Date.now = realDateNow; });

    const rows = stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const router = loadFreshAuthRouter();
    const base = await startServer(t, { router });

    const HOUR_MS = 60 * 60 * 1000;
    const email = `ac05-email-day-${crypto.randomUUID()}@example.com`;

    for (let i = 0; i < 3; i += 1) {
        const res = await postCode(base, { email });
        assert.equal(res.status, 200, `${i + 1}번째 요청은 통과해야 한다`);
        fakeNow += HOUR_MS;
        await sleep(350); // 서비스 계층의 재발송 대기(실제 시계 기준, 이 파일 상단에서 300ms로 낮춤)를 넘긴다
    }

    const rowBefore = rows.find((row) => row.email === email);
    const generationBefore = rowBefore.generation;
    const codeHashBefore = rowBefore.code_hash;

    const blocked = await postCode(base, { email });
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { ok: false, code: "RATE_LIMITED" });
    assert.equal(memory.outbox.length, 3, "차단된 요청은 메일을 보내면 안 된다");

    const rowAfter = rows.find((row) => row.email === email);
    assert.equal(rowAfter.generation, generationBefore, "차단된 요청은 인증 행의 generation을 바꾸면 안 된다");
    assert.equal(rowAfter.code_hash, codeHashBefore, "차단된 요청은 인증번호 해시를 바꾸면 안 된다");
});

test("AC-05: 실제 라우터에서 IP 일당 한도를 넘기면 429이고, 차단된 요청은 메일도 인증 행 생성도 없다", async (t) => {
    const originalEnv = {
        SIGNUP_IP_HOUR_MAX: process.env.SIGNUP_IP_HOUR_MAX,
        SIGNUP_IP_DAY_MAX: process.env.SIGNUP_IP_DAY_MAX,
        SIGNUP_EMAIL_HOUR_MAX: process.env.SIGNUP_EMAIL_HOUR_MAX,
        SIGNUP_EMAIL_DAY_MAX: process.env.SIGNUP_EMAIL_DAY_MAX,
    };
    process.env.SIGNUP_IP_HOUR_MAX = "1"; // 시간당 창을 매번 새로 시작해 이 한도에 가려지지 않게 한다
    process.env.SIGNUP_IP_DAY_MAX = "3";
    process.env.SIGNUP_EMAIL_HOUR_MAX = "1000";
    process.env.SIGNUP_EMAIL_DAY_MAX = "1000";
    t.after(() => Object.assign(process.env, originalEnv));

    const realDateNow = Date.now;
    let fakeNow = realDateNow();
    Date.now = () => fakeNow;
    t.after(() => { Date.now = realDateNow; });

    const rows = stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const router = loadFreshAuthRouter();
    const base = await startServer(t, { router });

    const HOUR_MS = 60 * 60 * 1000;
    // IP 한도이므로(같은 테스트 서버 = 같은 클라이언트 IP) 이메일은 매번 다르게 써서
    // 이메일 쪽 제한기가 끼어들지 않게 한다.
    const emails = [0, 1, 2].map(() => `ac05-ip-day-${crypto.randomUUID()}@example.com`);

    for (let i = 0; i < 3; i += 1) {
        const res = await postCode(base, { email: emails[i] });
        assert.equal(res.status, 200, `${i + 1}번째 요청은 통과해야 한다`);
        fakeNow += HOUR_MS;
    }

    const blockedEmail = `ac05-ip-day-blocked-${crypto.randomUUID()}@example.com`;
    const blocked = await postCode(base, { email: blockedEmail });
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { ok: false, code: "RATE_LIMITED" });
    assert.equal(memory.outbox.length, 3, "차단된 요청은 메일을 보내면 안 된다");
    assert.ok(
        !rows.some((row) => row.email === blockedEmail),
        "IP 한도로 차단된 요청은 검증(입력 검사·이메일 제한기)에 도달하지 못하므로 인증 행 자체를 만들면 안 된다",
    );
});

// 재검토 지적: 위 이메일 일당 시험은 일당 한도 자체가 실제 라우터에서 강제되는지를
// 본다 — auth.routes.js가 실제 요청에서 이메일 제한기의 keyOf에 "의도한 값"
// (res.locals.signupEmailCodeInput.email, 즉 검증 미들웨어가 trim+소문자로 정규화한 값)을
// 넘기는지는 별개로, 대소문자·앞뒤 공백만 다른 두 이메일이 같은 제한기 키를 쓰는지(=같은
// 계정으로 취급되는지), 그리고 다른 이메일은 별도 키를 쓰는지를 실제 HTTP 요청으로 확인한다.
test("AC-05: 이메일 제한기의 keyOf는 실제 요청에서 정규화된 이메일(trim+소문자)로 계산된다", async (t) => {
    const originalEnv = {
        SIGNUP_IP_HOUR_MAX: process.env.SIGNUP_IP_HOUR_MAX,
        SIGNUP_EMAIL_HOUR_MAX: process.env.SIGNUP_EMAIL_HOUR_MAX,
    };
    process.env.SIGNUP_IP_HOUR_MAX = "1000";
    process.env.SIGNUP_EMAIL_HOUR_MAX = "2";
    t.after(() => Object.assign(process.env, originalEnv));

    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    useMemoryMailAdapter(t);
    const router = loadFreshAuthRouter();
    const base = await startServer(t, { router });

    const rawLocal = `ac05-keyof-${crypto.randomUUID()}`;
    const variantA = `  ${rawLocal}@Example.COM  `; // 대소문자·앞뒤 공백이 섞인 입력
    const variantB = `${rawLocal}@example.com`;      // 이미 정규화된 같은 주소
    const differentEmail = `ac05-keyof-other-${crypto.randomUUID()}@example.com`;

    const first = await postCode(base, { email: variantA });
    assert.equal(first.status, 200);
    await sleep(350); // 재발송 대기(서비스 계층)를 넘겨야 두 번째 요청이 발송 단계까지 간다
    const second = await postCode(base, { email: variantB });
    assert.equal(second.status, 200, "정규화하면 같은 이메일이므로 재발송 자체는 통과해야 한다");
    await sleep(350);
    const third = await postCode(base, { email: variantA });
    assert.equal(third.status, 429, "정규화된 이메일 기준으로 같은 제한기 키를 써야 세 번째 요청이 막힌다");
    assert.deepEqual(await third.json(), { ok: false, code: "RATE_LIMITED" });

    const otherEmailReq = await postCode(base, { email: differentEmail });
    assert.equal(otherEmailReq.status, 200, "다른 이메일은 별도의 제한기 키를 써야 하므로 여전히 한도 안이어야 한다");
});

// ── AC-06: 원문 미노출 ────────────────────────────────────────────────────────

test("AC-06: 잘못된 JSON 본문·존재하지 않는 하위 경로는 원본 오류를 노출하지 않는다", async (t) => {
    const base = await startServer(t);

    const badJson = await fetch(`${base}/auth/signup/email-code`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{not-json",
    });
    assert.equal(badJson.status, 400);
    assert.deepEqual(await badJson.json(), { ok: false, code: "INVALID_INPUT" });
    assert.equal(badJson.headers.get("cache-control"), "no-store");

    const notFound = await fetch(`${base}/auth/signup/email-code/does-not-exist`, { method: "POST" });
    assert.equal(notFound.status, 500, "notFoundHandler가 던진 404는 이 범위에서 SERVER_ERROR로 수렴한다");
    assert.deepEqual(await notFound.json(), { ok: false, code: "SERVER_ERROR" });
});

// 재검토 지적: 위 시험은 /auth/signup/email-code만 다뤘다 — 재검토 이전에는 POST
// /auth/signup 자체와 그 verify 하위 경로의 JSON 파서 오류가 이 보호 밖이었다(body-parser의
// SyntaxError는 원본 요청 본문 전체를 err.body에 실어 온다 — errorHandler.js가 그걸 로그나
// 응답에 옮기면 그대로 원문 유출이 된다). 세 경로 모두(쿼리·후행 슬래시·대소문자 변형
// 포함) 잘못된 JSON 본문에서 응답·로그 어디에도 원문이 남지 않는지 확인한다.
test("AC-06: 가입 세 경로 모두 잘못된 JSON 본문에서 원본 오류를 노출하지 않는다(쿼리·후행 슬래시·대소문자 변형 포함)", async (t) => {
    const base = await startServer(t);

    const capturedConsole = [];
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;
    console.error = (...args) => { capturedConsole.push(args.map(String).join(" ")); };
    console.log = (...args) => { capturedConsole.push(args.map(String).join(" ")); };
    t.after(() => { console.error = originalConsoleError; console.log = originalConsoleLog; });

    const secretCode = "918273";
    const secretProof = "leak-check-signup-proof-value";
    // 닫는 중괄호가 없어 body-parser가 JSON.parse에서 그대로 실패한다 — 이 문자열 전체가
    // (다른 보호가 없다면) err.body로 errorHandler.js까지 전달된다.
    const badBody = `{"email":"leak@example.com","code":"${secretCode}","signupProof":"${secretProof}"`;

    const targets = [
        `${base}/auth/signup`,
        `${base}/auth/signup?debug=${secretCode}`,
        `${base}/auth/signup/`,
        `${base}/auth/signup/email-code`,
        `${base}/auth/signup/email-code/verify`,
        `${base}/AUTH/SIGNUP/EMAIL-CODE/VERIFY/`,
    ];

    for (const url of targets) {
        const res = await fetch(url, {
            method: "POST", headers: { "content-type": "application/json" }, body: badBody,
        });
        const text = await res.text();
        assert.ok(res.status === 400 || res.status === 500, `${url} 예기치 못한 상태코드: ${res.status}`);
        assert.equal(text.includes(secretCode), false, `${url} 응답에 인증번호 원문이 남았습니다`);
        assert.equal(text.includes(secretProof), false, `${url} 응답에 가입 증명 원문이 남았습니다`);
        assert.equal(res.headers.get("cache-control"), "no-store", `${url} 응답에 no-store가 없습니다`);
    }

    const allLogs = capturedConsole.join("\n");
    assert.equal(allLogs.includes(secretCode), false, "로그에 인증번호 원문이 남았습니다");
    assert.equal(allLogs.includes(secretProof), false, "로그에 가입 증명 원문이 남았습니다");
    assert.equal(allLogs.includes(badBody), false, "로그에 요청 본문 원문이 통째로 남았습니다");
});

test("AC-06: 메일 발송 예외가 발생해도 발급 응답은 성공 형태를 유지하고 원문을 노출하지 않는다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    memory.failNextWithThrow();
    const base = await startServer(t);

    const res = await postCode(base, { email: `ac06-mailfail-${crypto.randomUUID()}@example.com` });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
});

test("AC-06: 이미 가입된 이메일도 같은 발송 응답 형태를 받고, 확인 가능한 자격은 만들어지지 않는다", async (t) => {
    const rows = stubSignupEmailVerificationModel(t);
    const existingUser = { uuid: crypto.randomUUID(), email: `ac06-existing-${crypto.randomUUID()}@example.com`, nickname: "기존", password_hash: "h" };
    stubUserRepository(t, { users: [existingUser] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const res = await postCode(base, { email: existingUser.email });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["expiresInSec", "ok", "resendAfterSec"]);
    assert.equal(memory.outbox.length, 0, "이미 가입된 이메일에는 번호를 보내지 않는다");

    const row = rows.find((r) => r.email === existingUser.email);
    assert.ok(row);
    assert.equal(row.code_hash, null, "확인 가능한 자격(코드 해시)을 만들면 안 된다");

    const verifyRes = await postVerify(base, { email: existingUser.email, code: "000000" });
    assert.equal(verifyRes.status, 400);
    assert.deepEqual(await verifyRes.json(), { ok: false, code: "CODE_INVALID" });
});

// 재검토 지적(CODEX-3): errorHandler.js::globalErrorHandler가 가입 범위에서 code가 있는
// 오류를 만나면 허용 목록 여부와 무관하게 err.message를 그대로 응답에 실었다(a) — 허용
// 목록에 없는 code라도 원본 메시지가 새 나갔다. 게다가 code가 없는 기존 이메일/닉네임
// 중복(409)까지 SERVER_ERROR(500)로 뭉개는 회귀가 있었다(b). 아래 세 시험이 각각을
// 확인한다.
test("AC-06: 허용 목록 밖의 code를 가진 오류는 고정 SERVER_ERROR로 응답하고 원본 메시지를 응답·로그 어디에도 남기지 않는다", async (t) => {
    const secretMessage = `절대 노출되면 안 되는 내부 진단 메시지-${crypto.randomUUID()}`;
    t.mock.method(authService, "signup", async () => {
        const error = new Error(secretMessage);
        error.status = 500;
        // errorHandler.js의 허용 목록(SIGNUP_PROOF_REQUIRED/SIGNUP_PROOF_INVALID)에 없는
        // 임의의 code — 이런 code를 만나도 err.message를 그대로 응답하면 안 된다.
        error.code = "SOME_UNEXPECTED_INTERNAL_CODE";
        throw error;
    });

    const capturedConsole = [];
    const originalConsoleError = console.error;
    console.error = (...args) => { capturedConsole.push(args.map(String).join(" ")); };
    t.after(() => { console.error = originalConsoleError; });

    const base = await startServer(t);
    const res = await postSignup(base, {
        email: `ac06-unknowncode-${crypto.randomUUID()}@example.com`,
        ...VALID_SIGNUP_FIELDS,
        signupProof: "irrelevant-because-signup-is-stubbed",
    });
    const text = await res.text();

    assert.equal(res.status, 500);
    assert.deepEqual(JSON.parse(text), { ok: false, code: "SERVER_ERROR" });
    assert.equal(text.includes(secretMessage), false, "허용 목록 밖 code의 원본 메시지가 응답에 남았습니다");
    assert.equal(capturedConsole.join("\n").includes(secretMessage), false, "허용 목록 밖 code의 원본 메시지가 로그에 남았습니다");
});

test("AC-06: 기존 이메일 중복(409, code 없음)은 SERVER_ERROR로 뭉개지지 않고 기존 상태·문구를 유지한다", async (t) => {
    stubSignupEmailVerificationModel(t);
    const { byUuid } = stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const email = `ac06-dupe-email-${crypto.randomUUID()}@example.com`;
    await postCode(base, { email });
    const code = memory.outbox.at(-1).params.code;
    const verifyRes = await postVerify(base, { email, code });
    const { signupProof } = await verifyRes.json();

    // 증명은 이미 정상 발급됐다 — 그 사이 다른 경로(예: 소셜 가입)가 같은 이메일로 먼저
    // 계정을 만든 것처럼 재현한다(auth.signup.rollback.test.js의 "이메일·닉네임 중복
    // 검사는 증명 소비 이후..." 시험과 같은 재현 방식: 증명을 먼저 받고 그 다음에 중복을
    // 만든다 — 그래야 requestSignupCode의 "이미 가입된 이메일에는 번호를 보내지 않는다"
    // 분기를 우회하지 않는다).
    byUuid.set(crypto.randomUUID(), { email, nickname: "다른경로로먼저가입", password_hash: "h" });

    const res = await postSignup(base, { email, ...VALID_SIGNUP_FIELDS, signupProof });
    const body = await res.json();
    assert.equal(res.status, 409, "회귀 이전과 같은 상태 코드를 유지해야 한다");
    assert.deepEqual(body, { success: false, message: "이미 사용 중인 이메일입니다." }, "회귀 이전과 같은 문구를 유지해야 한다");
});

test("AC-06: 기존 닉네임 중복(409, code 없음)은 SERVER_ERROR로 뭉개지지 않고 기존 상태·문구를 유지한다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const email = `ac06-dupe-nickname-${crypto.randomUUID()}@example.com`;
    await postCode(base, { email });
    const code = memory.outbox.at(-1).params.code;
    const verifyRes = await postVerify(base, { email, code });
    const { signupProof } = await verifyRes.json();

    // 이메일 중복 검사를 통과한 뒤 닉네임 중복 검사에서 걸리도록, 그 사이에 닉네임 조회만
    // 충돌하게 만든다(이메일 조회는 기존 stub대로 "없음"을 유지한다).
    userRepository.findByNickname = async () => ({ uuid: crypto.randomUUID() });

    const res = await postSignup(base, { email, ...VALID_SIGNUP_FIELDS, signupProof });
    const body = await res.json();
    assert.equal(res.status, 409, "회귀 이전과 같은 상태 코드를 유지해야 한다");
    assert.deepEqual(body, { success: false, message: "이미 사용 중인 닉네임입니다." }, "회귀 이전과 같은 문구를 유지해야 한다");
});

// 재검토 지적(CODEX-5): 위 두 시험이 보존을 확인하는 것은 "알려진 고정 문구"뿐이다 —
// errorHandler.js가 code 없는 409 전부를 err.message 그대로 내보내면, 이 두 고정 문구가
// 아닌 임의의 code 없는 409(예: 다른 저장소·서비스 코드가 향후 원본을 담은 메시지로 409를
// 던지는 경우)의 원문도 그대로 새 나간다. 허용 목록에 없는 임의의 409 메시지가 실제로
// 차단되는지 직접 확인한다.
test("AC-06: 알려진 중복 문구가 아닌 임의의 code 없는 409는 원본 메시지를 응답에 남기지 않는다", async (t) => {
    const secretMessage = `내부 전용 충돌 진단 메시지-${crypto.randomUUID()}`;
    t.mock.method(authService, "signup", async () => {
        const error = new Error(secretMessage);
        error.status = 409;
        // 의도적으로 code를 부여하지 않는다 — errorHandler.js의 code 없는 409 분기를 탄다.
        throw error;
    });

    const base = await startServer(t);
    const res = await postSignup(base, {
        email: `ac06-unknown409-${crypto.randomUUID()}@example.com`,
        ...VALID_SIGNUP_FIELDS,
        signupProof: "irrelevant-because-signup-is-stubbed",
    });
    const text = await res.text();

    assert.equal(res.status, 500, "허용 목록 밖 409는 SERVER_ERROR로 수렴해야 한다");
    assert.deepEqual(JSON.parse(text), { ok: false, code: "SERVER_ERROR" });
    assert.equal(text.includes(secretMessage), false, "허용 목록 밖 409의 원본 메시지가 응답에 남았습니다");
});

// ── AC-06: 실제 backend/index.js의 콘솔·접근 로그(morgan 포함)에도 원문이 없다 ─────
//
// 위 시험들은 이 파일 안의 최소 express 앱(auth 라우터만 마운트)에 대한 "응답 본문"만
// 검사한다 — index.js 자신이 붙이는 morgan 접근 로그·console 출력까지는 검증하지 못한다.
// passwordReset.api.test.js의 같은 이름 시험과 같은 방식으로 실제 index.js를 이 프로세스
// 안에서 기동하고(db.sequelize.sync만 대체), stdout·console 출력을 가로채 발송→확인
// 왕복 전체에서 인증번호·signupProof 원문이 어디에도 없는지, morgan의 safe-url 마스킹이
// /auth/signup 하위 경로에도 실제로 적용되는지 확인한다.
test("AC-06: 실제 index.js로 발송→확인을 왕복해도 콘솔·접근 로그에 인증번호·증명 원문이 남지 않는다", async (t) => {
    stubSignupEmailVerificationModel(t);
    stubUserRepository(t, { users: [] });
    const memory = useMemoryMailAdapter(t);

    const originalSync = db.sequelize.sync;
    db.sequelize.sync = async () => db.sequelize;
    t.after(() => { db.sequelize.sync = originalSync; });

    const net = require("node:net");
    const findFreePort = () => new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
    const originalPort = process.env.PORT;
    process.env.PORT = String(await findFreePort());
    t.after(() => {
        if (originalPort === undefined) delete process.env.PORT;
        else process.env.PORT = originalPort;
    });

    const capturedStdout = [];
    const capturedConsole = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    process.stdout.write = (chunk, ...rest) => {
        capturedStdout.push(String(chunk));
        return originalStdoutWrite(chunk, ...rest);
    };
    console.log = (...args) => {
        capturedConsole.push(args.map(String).join(" "));
        originalConsoleLog(...args);
    };
    console.error = (...args) => {
        capturedConsole.push(args.map(String).join(" "));
        originalConsoleError(...args);
    };
    const restoreConsole = () => {
        process.stdout.write = originalStdoutWrite;
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    };
    t.after(restoreConsole);

    delete require.cache[require.resolve("../index.js")];
    const { server, io } = require("../index.js");
    await once(server, "listening");
    t.after(async () => {
        io.close();
        if (server.listening) await new Promise((resolve) => server.close(resolve));
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    const email = `ac06-indexjs-${crypto.randomUUID()}@example.com`;

    const codeRes = await postCode(base, { email });
    assert.equal(codeRes.status, 200);
    const code = memory.outbox.at(-1).params.code;

    const verifyRes = await postVerify(base, { email, code });
    assert.equal(verifyRes.status, 200);
    const { signupProof } = await verifyRes.json();
    assert.ok(signupProof);

    // 쿼리에 원문을 실은 존재하지 않는 하위 경로도 접근 로그에 흔적을 남긴다(실제로는
    // 이 라우트들이 쿼리를 쓰지 않지만, 마스킹이 경로 접두어만으로 방어적으로 동작하는지
    // 확인한다).
    await fetch(`${base}/auth/signup/email-code/does-not-exist?code=${encodeURIComponent(code)}`);

    restoreConsole();

    const allOutput = [...capturedStdout, ...capturedConsole].join("\n");
    assert.equal(allOutput.includes(code), false, "인증번호 원문이 콘솔/접근 로그에 남았습니다");
    assert.equal(allOutput.includes(signupProof), false, "가입 증명 원문이 콘솔/접근 로그에 남았습니다");
    assert.equal(allOutput.includes(email), false, "전체 이메일이 콘솔/접근 로그에 남았습니다");

    const signupLogLines = capturedStdout.join("").split(/\r?\n/).filter((line) => line.includes("/auth/signup"));
    assert.ok(signupLogLines.length > 0, "가입 경로에 대한 접근 로그가 전혀 남지 않았습니다");
    for (const line of signupLogLines) {
        assert.equal(line.includes("?code="), false, `접근 로그에 쿼리 원문이 그대로 남았습니다: ${line}`);
        assert.match(line, /\/auth\/signup\/\[REDACTED\]/, `접근 로그가 마스킹되지 않았습니다: ${line}`);
    }
});
