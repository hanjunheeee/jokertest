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

const REPO_KEYS = ["findActiveSession", "checkActiveBan", "findByUuid"];

// R-IMPL(2026-09-10, 반송): 관리자 전용 지급 경로는 더 이상 JWT의 req.user.role을 그대로
// 믿지 않고, 매 요청마다 실제 계정 행(userRepository.findByUuid)을 다시 읽어 그 시점의
// role로 판정한다("Existing permission identity must be verified from real server
// session/account data"). accountsByUuid가 없는 uuid는 계정이 존재하지 않는 것으로
// 취급된다(기본값은 role: "USER").
const stubAuthGate = (t, { accountsByUuid = {} } = {}) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    userRepository.findActiveSession = async (id, userId) => ({ id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null });
    userRepository.checkActiveBan = async () => null;
    userRepository.findByUuid = async (uuid) => accountsByUuid[uuid] ?? { uuid, role: "USER" };
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
        getWalletSummary: async (userId) => ({ balanceGold: 42, balanceDiamond: 7, entitlements: [], loadout: {} }),
    });
    const base = await startServer(t);

    const res = await request(base, `/economy/accounts/${USER_A}/wallet`, { token: tokenFor(USER_A) });
    assert.equal(res.status, 200);
    assert.equal(res.json.balanceGold, 42);
    assert.equal(res.json.balanceDiamond, 7, 'F-08 요구사항: DIAMOND 잔액도 응답에 포함되어야 한다');
});

// ── AC-04: 구매 요청은 itemId·referenceEventId만 서비스로 전달한다 ─────────
// CODEX-2 재검토: "서비스에는 문서화된 필드만 전달된다"는 것만으로는 부족했다 — 이전
// 버전은 price·balance 같은 변조 필드를 조용히 무시하고도 201을 돌려줬는데, 무시와
// 거부는 다르다. 지금은 문서화된 필드(itemId/referenceEventId) 밖의 값이 하나라도
// 있으면 서비스를 호출하기 전에 400으로 거부해야 한다.

test("AC-04(CODEX-2): 구매 요청에 price·balance 등 알 수 없는 필드가 포함되면 서비스 호출 전에 400으로 거부된다", async (t) => {
    stubAuthGate(t);
    const { calls } = stubService(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/purchase", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { itemId: "profile-border-남작", referenceEventId: "ref-1", price: 1, balance: 999999 },
    });

    assert.equal(res.status, 400);
    assert.equal(res.json.code, "UNKNOWN_PURCHASE_FIELD");
    assert.equal(calls.filter((c) => c.name === "purchaseItem").length, 0, "변조된 요청은 서비스를 호출하면 안 된다");
});

test("AC-04(CODEX-2): price·priceGold·priceAmount·balance·balanceGold·balanceDiamond·amount·currency 등 어떤 알 수 없는 필드도 구매 요청에서 거부된다", async (t) => {
    stubAuthGate(t);
    const { calls } = stubService(t);
    const base = await startServer(t);

    const tamperFields = ["price", "priceGold", "priceAmount", "balance", "balanceGold", "balanceDiamond", "amount", "currency", "rewardAmount"];
    for (const field of tamperFields) {
        const res = await request(base, "/economy/purchase", {
            method: "POST",
            token: tokenFor(USER_A),
            body: { itemId: "profile-border-남작", referenceEventId: `ref-${field}`, [field]: 1 },
        });
        assert.equal(res.status, 400, `${field} 필드가 있으면 400이어야 한다`);
        assert.equal(res.json.code, "UNKNOWN_PURCHASE_FIELD");
    }
    assert.equal(calls.filter((c) => c.name === "purchaseItem").length, 0);
});

test("AC-04: 문서화된 필드(itemId·referenceEventId)만 있는 정상 구매 요청은 서비스로 그대로 전달되고 201로 성공한다(positive control)", async (t) => {
    stubAuthGate(t);
    const { lastCall } = stubService(t, {
        purchaseItem: async () => ({ idempotent: false, ledgerEntry: { id: 1 } }),
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/purchase", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { itemId: "profile-border-남작", referenceEventId: "ref-1" },
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
// R-IMPL(2026-09-10): 권한은 토큰이 아니라 실제 계정 행(userRepository.findByUuid)의
// role로 판정된다 — 아래 테스트들은 토큰의 role 클레임과 DB의 실제 role을 일부러 다르게
// 둬서, 라우트가 토큰이 아니라 DB 값을 본다는 것을 직접 증명한다.
//
// R-IMPL(2026-09-10, AC-04 재검토): 클라이언트는 더 이상 amount·currency를 직접 보낼 수
// 없다 — reason은 backend/economy/catalog.js의 REWARD_CATALOG 키여야 하고, 실제 지급
// 금액·재화는 항상 그 카탈로그 값이다(구매 경로가 itemId로 카탈로그 가격을 찾는 것과
// 같은 패턴). 아래 테스트들은 이 계약으로 갱신됐다.

test("일반 USER 권한은 관리자 지급 경로를 사용할 수 없다", async (t) => {
    stubAuthGate(t, { accountsByUuid: { [USER_A]: { uuid: USER_A, role: "USER" } } });
    stubService(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/admin/grant", {
        method: "POST",
        token: tokenFor(USER_A, "USER"),
        body: { userId: USER_B, reason: "QA_TEST_GRANT_GOLD", referenceEventId: "grant-1" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "ECONOMY_ADMIN_ONLY");
});

test("토큰 클레임이 QA/ADMIN이어도 실제 계정의 현재 role이 아니면 거부된다(토큰이 아니라 DB를 신뢰한다)", async (t) => {
    // 토큰은 발급 당시 role=QA를 실어 나르지만, 그 뒤 권한이 회수되어 실제 계정은
    // 지금 USER다 — 이 라우트는 토큰이 아니라 실제 계정 행을 다시 조회해야 이 회수를
    // 반영할 수 있다.
    stubAuthGate(t, { accountsByUuid: { [USER_A]: { uuid: USER_A, role: "USER" } } });
    stubService(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/admin/grant", {
        method: "POST",
        token: tokenFor(USER_A, "QA"),
        body: { userId: USER_B, reason: "QA_TEST_GRANT_GOLD", referenceEventId: "grant-1" },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "ECONOMY_ADMIN_ONLY");
});

test("QA 권한은 관리자 지급 경로를 사용할 수 있다 — 실제 지급 금액은 항상 서버 보상 카탈로그 값이다", async (t) => {
    stubAuthGate(t, { accountsByUuid: { [USER_A]: { uuid: USER_A, role: "QA" } } });
    const { lastCall } = stubService(t, {
        grantReward: async () => ({ idempotent: false, ledgerEntry: { id: 1 } }),
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/admin/grant", {
        method: "POST",
        // 토큰 자체는 role을 USER로 실어도(또는 아무 값이어도) 실제 계정 행이 QA이므로
        // 통과해야 한다 — 판정 기준이 토큰이 아니라 DB임을 반대 방향으로도 증명한다.
        token: tokenFor(USER_A, "USER"),
        body: { userId: USER_B, reason: "QA_TEST_GRANT_GOLD", referenceEventId: "grant-1" },
    });
    assert.equal(res.status, 201);
    assert.equal(lastCall("grantReward").args[0].userId, USER_B);
    assert.equal(lastCall("grantReward").args[0].amount, 100000, 'amount는 서버 카탈로그(QA_TEST_GRANT_GOLD) 값이어야 한다');
    assert.equal(lastCall("grantReward").args[0].currency, "GOLD");
});

test("ADMIN 권한도 관리자 지급 경로를 사용할 수 있다", async (t) => {
    stubAuthGate(t, { accountsByUuid: { [USER_A]: { uuid: USER_A, role: "ADMIN" } } });
    const { lastCall } = stubService(t, {
        grantReward: async () => ({ idempotent: false, ledgerEntry: { id: 1 } }),
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/admin/grant", {
        method: "POST",
        token: tokenFor(USER_A, "ADMIN"),
        body: { userId: USER_B, reason: "QA_TEST_GRANT_DIAMOND", referenceEventId: "grant-diamond-1" },
    });
    assert.equal(res.status, 201);
    assert.equal(lastCall("grantReward").args[0].currency, "DIAMOND");
    assert.equal(lastCall("grantReward").args[0].amount, 1000, 'amount는 서버 카탈로그(QA_TEST_GRANT_DIAMOND) 값이어야 한다');
});

// CODEX-2 재검토: 이전 버전은 amount·currency가 함께 와도 "무시하고 카탈로그 값을
// 쓴다"는 이유로 201을 기대했다 — 하지만 무시는 거부가 아니다. 문서화된 필드
// (userId/reason/referenceEventId) 밖의 값이 하나라도 있으면 grantReward를 호출하기
// 전에 400으로 거부해야 한다.
test("AC-04(CODEX-2): amount·currency·balance 등 알 수 없는 필드가 있으면 관리자 지급 요청도 서비스 호출 전에 400으로 거부된다", async (t) => {
    stubAuthGate(t, { accountsByUuid: { [USER_A]: { uuid: USER_A, role: "ADMIN" } } });
    const { calls } = stubService(t);
    const base = await startServer(t);

    const tamperFields = ["amount", "currency", "balance", "balanceGold", "balanceDiamond", "priceGold"];
    for (const field of tamperFields) {
        const res = await request(base, "/economy/admin/grant", {
            method: "POST",
            token: tokenFor(USER_A, "ADMIN"),
            body: { userId: USER_B, reason: "QA_TEST_GRANT_GOLD", referenceEventId: `ref-${field}`, [field]: 1 },
        });
        assert.equal(res.status, 400, `${field} 필드가 있으면 400이어야 한다`);
        assert.equal(res.json.code, "UNKNOWN_GRANT_FIELD");
    }
    assert.equal(calls.filter((c) => c.name === "grantReward").length, 0, "변조된 요청은 서비스를 호출하면 안 된다");
});

test("AC-04(CODEX-2): 프로토타입 체인에서 우연히 값이 발견되는 reason(toString 등)은 보상 사유로 인정되지 않는다(own-property safe lookup)", async (t) => {
    stubAuthGate(t, { accountsByUuid: { [USER_A]: { uuid: USER_A, role: "ADMIN" } } });
    const { calls } = stubService(t);
    const base = await startServer(t);

    for (const reason of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
        const res = await request(base, "/economy/admin/grant", {
            method: "POST",
            token: tokenFor(USER_A, "ADMIN"),
            body: { userId: USER_B, reason, referenceEventId: `proto-${reason}` },
        });
        assert.equal(res.status, 400, `reason=${reason}는 400으로 거부되어야 한다`);
        assert.equal(res.json.code, "UNKNOWN_REWARD_REASON");
    }
    assert.equal(calls.filter((c) => c.name === "grantReward").length, 0);
});

test("AC-04(R-IMPL): 보상 카탈로그에 없는 reason은 400으로 거부되고 grantReward는 호출되지 않는다", async (t) => {
    stubAuthGate(t, { accountsByUuid: { [USER_A]: { uuid: USER_A, role: "ADMIN" } } });
    const { calls } = stubService(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/admin/grant", {
        method: "POST",
        token: tokenFor(USER_A, "ADMIN"),
        body: { userId: USER_B, reason: "FREE_MONEY", referenceEventId: "grant-unknown" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "UNKNOWN_REWARD_REASON");
    assert.equal(calls.filter((c) => c.name === "grantReward").length, 0);
});
