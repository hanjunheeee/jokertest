process.env.JWT_SECRET = "economy-route-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱한다(연결은 시도하지 않는다).
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

// F-08 backend/routes/economy.routes.js HTTP 계약 시험. 실제 경제 로직(잠금·재처리 방지
// 키·카탈로그 가격)은 backend/service/economy.service.test.js가 fake db로 이미 검증하므로,
// 여기서는 economyService 자체를 스텁하고(discordAuth.route.test.js와 같은 패턴) 라우트
// 계층의 책임만 확인한다: 인증 게이트, 본인 계정만 접근 가능(AC-06), 요청 필드 검증,
// 서비스 오류 코드 → HTTP 상태 매핑. sessionLifecycle.resolveSession은
// userRepository.findActiveSession/checkActiveBan만 거치므로 그 둘만 스텁하면 실제
// verifyToken 미들웨어 체인을 그대로 태울 수 있다(discordAuth.route.test.js와 같은 근거).

const test         = require("node:test");
const assert       = require("node:assert/strict");
const express      = require("express");
const cookieParser = require("cookie-parser");
const jwt          = require("jsonwebtoken");

const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");
const { createError } = require("../utils/appError");
const userRepository = require("../repositories/user.repositories");
const economyService  = require("../service/economy.service");

const REPO_KEYS = ["findActiveSession", "checkActiveBan"];

const stubAuthGate = (t) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    userRepository.findActiveSession = async (id, userId) => ({ id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null });
    userRepository.checkActiveBan = async () => null;
    t.after(() => Object.assign(userRepository, originals));
};

const stubService = (t, overrides = {}) => {
    const keys = ["getWalletSummary", "listTransactions", "purchaseItem", "equipItem", "grantReward"];
    const originals = Object.fromEntries(keys.map((key) => [key, economyService[key]]));
    const calls = [];
    for (const key of keys) {
        economyService[key] = overrides[key]
            ? (...args) => { calls.push({ name: key, args }); return overrides[key](...args); }
            : (...args) => { calls.push({ name: key, args }); throw new Error(`stub for ${key} not provided`); };
    }
    t.after(() => Object.assign(economyService, originals));
    return { calls, lastCall: (name) => [...calls].reverse().find((c) => c.name === name) };
};

const USER_A = "uuid-user-a";
const USER_B = "uuid-user-b";
const tokenFor = (uuid, role = "USER") => jwt.sign({ uuid, role, sessionId: `session-${uuid}` }, process.env.JWT_SECRET, { expiresIn: "1d" });

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/economy", require("../routes/economy.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const request = async (base, path, { method = "GET", token, body } = {}) => {
    const headers = {};
    if (token) headers.cookie = `accessToken=${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(new URL(path, base), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
};

// ── AC-06: 인증/본인 계정 검증 ──────────────────────────────────────────────

test("AC-06: accessToken 쿠키가 없으면 401로 거부된다", async (t) => {
    stubAuthGate(t);
    const base = await startServer(t);
    const res = await request(base, `/economy/accounts/${USER_A}/wallet`);
    assert.equal(res.status, 401);
});

test("AC-06: 다른 계정의 지갑에 접근하면 403으로 거부된다", async (t) => {
    stubAuthGate(t);
    stubService(t);
    const base = await startServer(t);

    const res = await request(base, `/economy/accounts/${USER_B}/wallet`, { token: tokenFor(USER_A) });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "ECONOMY_FORBIDDEN");
});

test("AC-06: 다른 계정의 거래 내역·소유품에 접근하면 403으로 거부된다", async (t) => {
    stubAuthGate(t);
    stubService(t);
    const base = await startServer(t);

    const tx = await request(base, `/economy/accounts/${USER_B}/transactions`, { token: tokenFor(USER_A) });
    assert.equal(tx.status, 403);
    const ent = await request(base, `/economy/accounts/${USER_B}/entitlements`, { token: tokenFor(USER_A) });
    assert.equal(ent.status, 403);
});

test("AC-06: 본인 계정 조회는 200으로 허용된다", async (t) => {
    stubAuthGate(t);
    stubService(t, {
        getWalletSummary: async (userId) => ({ balanceGold: 42, entitlements: [], loadout: {} }),
    });
    const base = await startServer(t);

    const res = await request(base, `/economy/accounts/${USER_A}/wallet`, { token: tokenFor(USER_A) });
    assert.equal(res.status, 200);
    assert.equal(res.json.balanceGold, 42);
});

// ── AC-04: 구매 요청은 itemId·referenceEventId만 서비스로 전달한다 ─────────

test("AC-04: 구매 요청에 price 등 임의 필드를 함께 보내도 서비스에는 itemId·referenceEventId만 전달된다", async (t) => {
    stubAuthGate(t);
    const { lastCall } = stubService(t, {
        purchaseItem: async () => ({ idempotent: false, ledgerEntry: { id: 1 } }),
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/purchase", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { itemId: "profile-border-남작", referenceEventId: "ref-1", price: 1, balance: 999999 },
    });

    assert.equal(res.status, 201);
    const call = lastCall("purchaseItem");
    assert.deepEqual(call.args[0], { userId: USER_A, itemId: "profile-border-남작", referenceEventId: "ref-1" });
});

test("구매 요청에 itemId가 없으면 400으로 거부된다", async (t) => {
    stubAuthGate(t);
    stubService(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/purchase", { method: "POST", token: tokenFor(USER_A), body: { referenceEventId: "ref-1" } });
    assert.equal(res.status, 400);
});

// ── AC-05: 장착 요청은 서비스의 소유권/종류 거부를 그대로 상태 코드로 반영한다 ─

test("AC-05: 소유하지 않은 상품 장착은 서비스가 던진 403을 그대로 응답한다", async (t) => {
    stubAuthGate(t);
    stubService(t, {
        equipItem: async () => { throw createError("보유하지 않은 상품은 장착할 수 없습니다.", 403, "ITEM_NOT_OWNED"); },
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/equip", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { slot: "PROFILE_BORDER", itemId: "profile-border-황제" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "ITEM_NOT_OWNED");
});

test("AC-05: 임의 파일 경로를 itemId로 보내면 서비스가 던진 400을 그대로 응답한다", async (t) => {
    stubAuthGate(t);
    stubService(t, {
        equipItem: async () => { throw createError("존재하지 않는 상품이거나 이 슬롯에 장착할 수 없는 종류입니다.", 400, "ITEM_TYPE_MISMATCH"); },
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/equip", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { slot: "PROFILE_PHOTO", itemId: "../../../etc/passwd" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "ITEM_TYPE_MISMATCH");
});

// ── 관리자 전용 지급 경로 ────────────────────────────────────────────────────

test("일반 USER 권한은 관리자 지급 경로를 사용할 수 없다", async (t) => {
    stubAuthGate(t);
    stubService(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/admin/grant", {
        method: "POST",
        token: tokenFor(USER_A, "USER"),
        body: { userId: USER_B, amountGold: 100, referenceEventId: "grant-1" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "ECONOMY_ADMIN_ONLY");
});

test("QA 권한은 관리자 지급 경로를 사용할 수 있다", async (t) => {
    stubAuthGate(t);
    const { lastCall } = stubService(t, {
        grantReward: async () => ({ idempotent: false, ledgerEntry: { id: 1 } }),
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/admin/grant", {
        method: "POST",
        token: tokenFor(USER_A, "QA"),
        body: { userId: USER_B, amountGold: 100, referenceEventId: "grant-1" },
    });
    assert.equal(res.status, 201);
    assert.equal(lastCall("grantReward").args[0].userId, USER_B);
});
