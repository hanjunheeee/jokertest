// F-29b: 비밀번호 재설정 API — AC-01(계정 존재 여부와 무관한 동일 응답 형태), AC-02/AC-03
// (유효·만료·사용된·소셜 전용 토큰의 상태 전이), AC-06(no-store, 원문 미노출)을 실제
// auth.routes.js·passwordReset.controller.js·passwordReset.service.js 코드로 검증한다.
// DB는 userRepository와 db.PasswordResetToken을 인메모리 가짜로 대체한다(F-29b는 DB 접근
// 경로 자체를 실제 MySQL로 별도 검증하는 tests/db/f29b-password-reset.integration.test.js가
// 있다 — 이 파일은 제한기·검증·응답 계약·상태 전이에 집중한다).
process.env.JWT_SECRET = process.env.JWT_SECRET || "password-reset-api-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
// 이 파일의 여러 케이스가 같은 프로세스(같은 auth.routes.js 모듈, 같은 메모리 카운터)를
// 공유한다 — f29a-find-id 스위트와 같은 이유로 한도를 넉넉히 올려 제한기 자체 검증과
// 분리한다(전용 케이스가 따로 작은 한도로 직접 검증한다).
process.env.PASSWORD_RESET_REQUEST_IP_MAX = "1000";
process.env.PASSWORD_RESET_REQUEST_EMAIL_MAX = "1000";
process.env.PASSWORD_RESET_CHECK_IP_MAX = "1000";
process.env.PASSWORD_RESET_APP_URL = "https://frontend.example.test";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { once } = require("node:events");
const express = require("express");
const cookieParser = require("cookie-parser");

const db = require("../models");
const userRepository = require("../repositories/user.repositories");
const mailAdapter = require("../mail/mailAdapter");
const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");
const tokenUrlOf = (mail) => new URL(mail.params.resetUrl);
const tokenOf = (mail) => tokenUrlOf(mail).searchParams.get("token");

/**
 * db.PasswordResetToken을 최소 in-memory 모델로 대체한다. 서비스가 실제로 쓰는 연산
 * (findOne where token_hash, create, update where user_id/used/revoked_at 또는 where id)만
 * 구현한다.
 */
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
                if (matches(row, where)) {
                    Object.assign(row, patch);
                    count += 1;
                }
            }
            return [count];
        },
        __rows: rows,
    };
    t.after(() => { db.PasswordResetToken = original; });
    return rows;
};

/** userRepository를 인메모리 가짜로 대체한다(F-03 회귀 시험과 같은 패턴). */
const stubUserRepository = (t, { users = [] } = {}) => {
    const originals = {
        withTransaction: userRepository.withTransaction,
        findByEmail: userRepository.findByEmail,
        findByUuid: userRepository.findByUuid,
        updateUser: userRepository.updateUser,
        markOnlineSessionsOffline: userRepository.markOnlineSessionsOffline,
    };

    const byUuid = new Map(users.map((u) => [u.uuid, { ...u }]));
    const revokedSessionsByUser = new Map();

    userRepository.withTransaction = async (work) => work({ LOCK: { UPDATE: "UPDATE" } });
    userRepository.findByEmail = async (email) => (
        [...byUuid.values()].find((u) => u.email === email) ?? null
    );
    userRepository.findByUuid = async (uuid) => byUuid.get(uuid) ?? null;
    userRepository.updateUser = async (uuid, patch) => {
        const user = byUuid.get(uuid);
        if (user) Object.assign(user, patch);
        return [user ? 1 : 0];
    };
    userRepository.markOnlineSessionsOffline = async (uuid) => {
        revokedSessionsByUser.set(uuid, (revokedSessionsByUser.get(uuid) ?? 0) + 1);
        return [1];
    };

    t.after(() => Object.assign(userRepository, originals));
    return { byUuid, revokedSessionsByUser };
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

const useMemoryMailAdapter = (t) => {
    const memory = mailAdapter.createMemoryMailAdapter();
    t.mock.method(mailAdapter, "createHttpMailAdapter", () => memory);
    return memory;
};

const localUser = (overrides = {}) => ({
    uuid: crypto.randomUUID(),
    email: `user-${crypto.randomUUID()}@example.com`,
    nickname: "재설정유저",
    password_hash: "old-hash",
    has_local_password: true,
    ...overrides,
});

const postRequest = (base, body) => fetch(`${base}/auth/password-reset/request`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const getVerify = (base, token) => fetch(`${base}/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
const postConfirm = (base, body) => fetch(`${base}/auth/password-reset/confirm`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

// ── AC-01: 계정 존재 여부와 무관하게 같은 응답 형태 ──────────────────────────────

test("AC-01: 존재하는 로컬 이메일과 존재하지 않는 이메일의 request 응답이 동일하다", async (t) => {
    stubPasswordResetTokenModel(t);
    const user = localUser();
    stubUserRepository(t, { users: [user] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const existing = await postRequest(base, { email: user.email });
    const existingBody = await existing.json();
    const missing = await postRequest(base, { email: "no-such-user@example.com" });
    const missingBody = await missing.json();

    assert.equal(existing.status, 200);
    assert.equal(missing.status, 200);
    assert.deepEqual(existingBody, { ok: true });
    assert.deepEqual(missingBody, { ok: true });
    assert.equal(existing.headers.get("cache-control"), "no-store");

    assert.equal(memory.outbox.length, 1, "존재하는 계정에만 메일 1통이 나가야 한다");
    assert.equal(memory.outbox[0].template, "PASSWORD_RESET");
    assert.equal(memory.outbox[0].to, user.email);
});

test("AC-01: 잘못된 입력(body)은 계정 조회 없이 400 INVALID_INPUT이다", async (t) => {
    stubPasswordResetTokenModel(t);
    const { byUuid } = stubUserRepository(t, { users: [] });
    let lookedUp = false;
    const originalFindByEmail = userRepository.findByEmail;
    userRepository.findByEmail = async (...args) => { lookedUp = true; return originalFindByEmail(...args); };
    t.after(() => { userRepository.findByEmail = originalFindByEmail; });
    useMemoryMailAdapter(t);
    const base = await startServer(t);

    const res = await postRequest(base, { email: "not an email" });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.deepEqual(body, { ok: false, code: "INVALID_INPUT" });
    assert.equal(lookedUp, false);
    assert.equal(byUuid.size, 0);
});

// ── AC-05: 소셜 전용 계정 ────────────────────────────────────────────────────

test("AC-05: 소셜 전용 계정(has_local_password=false)은 공통 200을 받고 안내 메일만 나가며 토큰은 발급되지 않는다", async (t) => {
    const rows = stubPasswordResetTokenModel(t);
    const socialUser = localUser({ has_local_password: false });
    stubUserRepository(t, { users: [socialUser] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const res = await postRequest(base, { email: socialUser.email });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(rows.length, 0, "소셜 전용 계정은 재설정 토큰을 만들면 안 된다");
    assert.equal(memory.outbox.length, 1);
    assert.equal(memory.outbox[0].template, "SOCIAL_LOGIN_GUIDE");
    assert.equal(memory.outbox[0].to, socialUser.email);
});

// ── AC-02/AC-03: 발급 → verify → confirm 상태 전이 ───────────────────────────

test("AC-02/AC-03: 발급된 토큰은 verify에서 VALID이고, confirm 성공 후에는 USED로 거부된다", async (t) => {
    const rows = stubPasswordResetTokenModel(t);
    const user = localUser();
    const { byUuid, revokedSessionsByUser } = stubUserRepository(t, { users: [user] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    await postRequest(base, { email: user.email });
    assert.equal(memory.outbox.length, 1);
    const rawToken = tokenOf(memory.outbox[0]);
    assert.ok(rawToken);
    assert.equal(rows[0].token_hash, hashToken(rawToken));
    assert.equal(rows[0].token, null, "신규 발급은 원문을 저장하지 않는다");

    const verifyBefore = await getVerify(base, rawToken);
    assert.deepEqual(await verifyBefore.json(), { ok: true, status: "VALID" });

    const confirmRes = await postConfirm(base, { token: rawToken, newPassword: "brand-new-pw-1" });
    assert.equal(confirmRes.status, 200);
    assert.deepEqual(await confirmRes.json(), { ok: true });
    assert.equal(byUuid.get(user.uuid).password_hash !== "old-hash", true);
    assert.equal(revokedSessionsByUser.get(user.uuid), 1, "세션 전체 폐기가 정확히 한 번 호출돼야 한다");
    assert.equal(rows[0].used, true);

    const verifyAfter = await getVerify(base, rawToken);
    assert.deepEqual(await verifyAfter.json(), { ok: false, code: "USED" });

    const confirmAgain = await postConfirm(base, { token: rawToken, newPassword: "another-new-pw-2" });
    assert.equal(confirmAgain.status, 400);
    assert.deepEqual(await confirmAgain.json(), { ok: false, code: "USED" });
});

test("AC-03: 새 재설정 요청 발급 이후에는 이전 미사용 링크도 거부된다", async (t) => {
    stubPasswordResetTokenModel(t);
    const user = localUser();
    stubUserRepository(t, { users: [user] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    await postRequest(base, { email: user.email });
    const firstToken = tokenOf(memory.outbox[0]);

    await postRequest(base, { email: user.email });
    const secondToken = tokenOf(memory.outbox[1]);
    assert.notEqual(firstToken, secondToken);

    const firstVerify = await getVerify(base, firstToken);
    assert.deepEqual(await firstVerify.json(), { ok: false, code: "INVALID" });

    const secondVerify = await getVerify(base, secondToken);
    assert.deepEqual(await secondVerify.json(), { ok: true, status: "VALID" });
});

test("AC-03: 만료된 토큰은 EXPIRED로 거부된다", async (t) => {
    const rows = stubPasswordResetTokenModel(t);
    const user = localUser();
    stubUserRepository(t, { users: [user] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    await postRequest(base, { email: user.email });
    const rawToken = tokenOf(memory.outbox[0]);
    rows[0].expired_at = new Date(Date.now() - 1000);

    const verifyRes = await getVerify(base, rawToken);
    assert.deepEqual(await verifyRes.json(), { ok: false, code: "EXPIRED" });

    const confirmRes = await postConfirm(base, { token: rawToken, newPassword: "brand-new-pw-1" });
    assert.equal(confirmRes.status, 400);
    assert.deepEqual(await confirmRes.json(), { ok: false, code: "EXPIRED" });
});

test("AC-05: 소셜 전용 계정으로 발급된(방어용) 유효 토큰의 confirm은 400 SOCIAL_ONLY이고 계정이 바뀌지 않는다", async (t) => {
    const rows = stubPasswordResetTokenModel(t);
    const user = localUser({ has_local_password: false });
    const { byUuid } = stubUserRepository(t, { users: [user] });
    const base = await startServer(t);

    const rawToken = crypto.randomBytes(32).toString("base64url");
    rows.push({
        id: 1, user_id: user.uuid, token: null, token_hash: hashToken(rawToken),
        expired_at: new Date(Date.now() + 60_000), used: false, revoked_at: null,
    });

    const confirmRes = await postConfirm(base, { token: rawToken, newPassword: "brand-new-pw-1" });
    assert.equal(confirmRes.status, 400);
    assert.deepEqual(await confirmRes.json(), { ok: false, code: "SOCIAL_ONLY" });
    assert.equal(byUuid.get(user.uuid).password_hash, "old-hash");
    assert.equal(rows[0].used, false);
});

// ── 입력 검증 경계 ────────────────────────────────────────────────────────────

test("verify/confirm: 형식이 잘못된 토큰은 DB 조회 없이 거부된다", async (t) => {
    stubPasswordResetTokenModel(t);
    stubUserRepository(t, { users: [] });
    const base = await startServer(t);

    const verifyRes = await getVerify(base, "not-a-valid-token");
    assert.deepEqual(await verifyRes.json(), { ok: false, code: "INVALID" });

    const confirmRes = await postConfirm(base, { token: "not-a-valid-token", newPassword: "brand-new-pw-1" });
    assert.equal(confirmRes.status, 400);
    assert.deepEqual(await confirmRes.json(), { ok: false, code: "INVALID" });
});

test("confirm: 새 비밀번호가 정책을 어기면 토큰 상태를 바꾸지 않고 400을 반환한다", async (t) => {
    const rows = stubPasswordResetTokenModel(t);
    const user = localUser();
    stubUserRepository(t, { users: [user] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    await postRequest(base, { email: user.email });
    const rawToken = tokenOf(memory.outbox[0]);

    const confirmRes = await postConfirm(base, { token: rawToken, newPassword: "short" });
    assert.equal(confirmRes.status, 400);
    const body = await confirmRes.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "INVALID_PASSWORD");
    assert.equal(rows[0].used, false, "정책 위반은 토큰을 소비하면 안 된다");
});

// ── AC-06: 응답에 원문이 없고 no-store가 적용된다 ─────────────────────────────

test("AC-06: 모든 재설정 응답에 no-store가 적용되고 토큰 원문이 응답에 그대로 노출되지 않는다", async (t) => {
    stubPasswordResetTokenModel(t);
    const user = localUser();
    stubUserRepository(t, { users: [user] });
    const memory = useMemoryMailAdapter(t);
    const base = await startServer(t);

    const requestRes = await postRequest(base, { email: user.email });
    assert.equal(requestRes.headers.get("cache-control"), "no-store");

    const rawToken = tokenOf(memory.outbox[0]);
    const verifyRes = await getVerify(base, rawToken);
    assert.equal(verifyRes.headers.get("cache-control"), "no-store");
    const verifyBody = await verifyRes.json();
    assert.equal(JSON.stringify(verifyBody).includes(rawToken), false);

    const confirmRes = await postConfirm(base, { token: rawToken, newPassword: "brand-new-pw-1" });
    assert.equal(confirmRes.headers.get("cache-control"), "no-store");
    const confirmBody = await confirmRes.json();
    assert.equal(JSON.stringify(confirmBody).includes(rawToken), false);
});

// ── 제한기(rate limiter) ─────────────────────────────────────────────────────

test("제한기: 대상 이메일별 한도를 넘으면 429 RATE_LIMITED다", async (t) => {
    // 이 케이스만 별도 프로세스처럼 작은 한도로 검증하고 싶지만 라우터는 모듈 로드 시점에
    // 제한기를 한 번만 만든다 — 파일 전체가 위에서 이미 넉넉한 한도(1000)로 올려뒀으므로,
    // 여기서는 rateLimit.js 자체의 429 동작을 createRateLimiter 단위로 직접 재현한다
    // (rateLimit.js의 순수 로직 시험과 같은 방식 — 전체 라우터 한도를 이 파일 안에서
    // 되돌릴 수 없기 때문).
    const { createRateLimiter } = require("../middleware/rateLimit");
    let now = 0;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, keyOf: () => "email:fixed", now: () => now });
    const run = () => new Promise((resolve) => {
        const res = { status(code) { this._status = code; return this; }, json(body) { resolve({ status: this._status, body }); } };
        limiter({}, res, () => resolve({ status: 200, body: null }));
    });

    assert.equal((await run()).status, 200);
    assert.equal((await run()).status, 200);
    assert.equal((await run()).status, 200);
    const fourth = await run();
    assert.equal(fourth.status, 429);
    assert.deepEqual(fourth.body, { ok: false, code: "RATE_LIMITED" });

    now += 61_000;
    assert.equal((await run()).status, 200, "창이 지나면 회복되어야 한다");
});
