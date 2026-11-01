process.env.JWT_SECRET = "economy-route-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const express      = require("express");
const cookieParser = require("cookie-parser");
const jwt          = require("jsonwebtoken");

const { notFoundHandler, globalErrorHandler } = require("../../middleware/errorHandler");
const { createError } = require("../../utils/appError");
const userRepository = require("../../repositories/user.repositories");
const economyService  = require("../../services/economy");

const REPO_KEYS = ["findActiveSession", "checkActiveBan", "findByUuid"];

const stubAuthGate = (t, { accountsByUuid = {} } = {}) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    userRepository.findActiveSession = async (id, userId) => ({ id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null });
    userRepository.checkActiveBan = async () => null;
    userRepository.findByUuid = async (uuid) => accountsByUuid[uuid] ?? { uuid, role: "USER" };
    t.after(() => Object.assign(userRepository, originals));
};

const stubService = (t, overrides = {}) => {
    const keys = ["getWalletSummary", "listTransactions", "purchaseItem", "equipItem", "grantReward", "purchaseGold", "getPurchaseResult"];
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
    app.use("/economy", require("../../routes/economy.routes"));
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

test("AC-05: 소유하지 않은 상품 장착은 서비스가 던진 403을 그대로 응답한다", async (t) => {
    stubAuthGate(t);
    stubService(t, {
        equipItem: async () => { throw createError("보유하지 않은 상품은 장착할 수 없습니다.", 403, "ITEM_NOT_OWNED"); },
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/equip", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { slot: "PROFILE_BORDER", itemId: "profile-border-황제", expectedRevision: "server-rev-1" },
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
        body: { slot: "PROFILE_PHOTO", itemId: "../../../etc/passwd", expectedRevision: "server-rev-1" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "ITEM_TYPE_MISMATCH");
});

test("POST /economy/equip: expectedRevision이 없거나 빈 문자열이면 서비스 호출 전에 400(MISSING_EXPECTED_REVISION)으로 거부된다", async (t) => {
    stubAuthGate(t);
    const { calls } = stubService(t);
    const base = await startServer(t);

    const withoutField = await request(base, "/economy/equip", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { slot: "PLAYER_CARD_FRAME", itemId: "player-card-왕관" },
    });
    assert.equal(withoutField.status, 400);
    assert.equal(withoutField.json.code, "MISSING_EXPECTED_REVISION");

    const emptyField = await request(base, "/economy/equip", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { slot: "PLAYER_CARD_FRAME", itemId: "player-card-왕관", expectedRevision: "" },
    });
    assert.equal(emptyField.status, 400);
    assert.equal(emptyField.json.code, "MISSING_EXPECTED_REVISION");

    assert.equal(calls.filter((c) => c.name === "equipItem").length, 0, "expectedRevision 검증에 실패하면 서비스가 아예 호출되면 안 된다");
});

test("POST /economy/equip: 서버 CAS 충돌(409)이면 서비스가 던진 오류를 그대로 응답한다", async (t) => {
    stubAuthGate(t);
    stubService(t, {
        equipItem: async () => { throw createError("장착 상태가 다른 곳에서 이미 변경되었습니다.", 409, "SKIN_REVISION_CONFLICT"); },
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/equip", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원1-바이올렛", expectedRevision: "stale-rev" },
    });
    assert.equal(res.status, 409);
    assert.equal(res.json.code, "SKIN_REVISION_CONFLICT");
});

test("POST /economy/equip: 성공 응답은 서비스가 실제로 돌려준 loadout 행에서 selectedSkinsByJob·revision을 그대로 조립한다", async (t) => {
    stubAuthGate(t);
    stubService(t, {
        equipItem: async () => ({
            selected_profile_photo_id: null,
            selected_profile_border_id: null,
            selected_card_frame_id: "player-card-왕관",
            selected_skin_noble: "player-skin-귀족1-블러드",
            selected_skin_clown: null,
            selected_skin_guard: "player-skin-경비원1-바이올렛",
            selected_skin_doctor: null,
            selected_skin_witch_hunter: null,
            revision: "server-rev-2",
        }),
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/equip", {
        method: "POST",
        token: tokenFor(USER_A),
        body: { slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원1-바이올렛", expectedRevision: "server-rev-1" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.loadout.selectedSkinsByJob.guard, "player-skin-경비원1-바이올렛");
    assert.equal(res.json.loadout.selectedSkinsByJob.noble, "player-skin-귀족1-블러드", "요청하지 않은 다른 직업의 값도 서비스 반환값 그대로 실려야 한다");
    assert.equal(res.json.loadout.selectedSkinsByJob.clown, null);
    assert.equal(res.json.loadout.selectedCardFrameId, "player-card-왕관");
    assert.equal(res.json.loadout.revision, "server-rev-2");
});

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

const goldBody = (extra = {}) => ({ productId: "gold-1", version: 1, referenceEventId: "gold-ref-1", ...extra });

test("F-32b: 금액·수량 참고 필드는 버려지고 서비스에는 인증 userId·productId·version·referenceEventId 네 필드만 전달된다", async (t) => {
    stubAuthGate(t);
    const { calls, lastCall } = stubService(t, {
        purchaseGold: async () => ({ idempotent: false, balanceGold: 130, balanceDiamond: 70 }),
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/gold-purchases", {
        method: "POST",
        token: tokenFor(USER_A),
        body: goldBody({ price: 0, priceGold: -1, amount: 9, quantity: 100, payAmount: 0, grantAmount: 99999, bonusAmount: 99999 }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true, balanceGold: 130, balanceDiamond: 70 });
    assert.equal(calls.filter((c) => c.name === "purchaseGold").length, 1);
    assert.deepEqual(lastCall("purchaseGold").args[0], {
        userId: USER_A, productId: "gold-1", version: 1, referenceEventId: "gold-ref-1",
    });
});

test("F-32b: 미인증·미지 필드·잘못된 식별 필드는 서비스 호출 전에 실패한다", async (t) => {
    stubAuthGate(t);
    const { calls } = stubService(t);
    const base = await startServer(t);

    const anon = await request(base, "/economy/gold-purchases", { method: "POST", body: goldBody() });
    assert.equal(anon.status, 401);

    const unknown = await request(base, "/economy/gold-purchases", {
        method: "POST", token: tokenFor(USER_A), body: goldBody({ userId: USER_B }),
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.json.code, "UNKNOWN_GOLD_PURCHASE_FIELD");

    const invalidBodies = [
        goldBody({ productId: 1 }), goldBody({ productId: "" }), goldBody({ productId: "p".repeat(65) }),
        goldBody({ version: "1" }), goldBody({ version: 0 }), goldBody({ version: 1.5 }),
        goldBody({ referenceEventId: "" }), goldBody({ referenceEventId: "r".repeat(151) }), { productId: "gold-1", version: 1 },
    ];
    for (const body of invalidBodies) {
        const res = await request(base, "/economy/gold-purchases", { method: "POST", token: tokenFor(USER_A), body });
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(res.json.code, "INVALID_GOLD_PURCHASE_REQUEST");
    }
    assert.equal(calls.filter((c) => c.name === "purchaseGold").length, 0);
});

test("F-32b: 서비스 오류는 고정 상태·문구로 응답하고 예상 밖 DB 오류는 원문 없이 500이다", async (t) => {
    stubAuthGate(t);
    const cases = [
        [createError("secret detail", 400, "INSUFFICIENT_DIAMOND"), 400, "INSUFFICIENT_DIAMOND", "다이아 잔액이 부족합니다."],
        [createError("secret detail", 400, "BALANCE_LIMIT_EXCEEDED"), 400, "BALANCE_LIMIT_EXCEEDED", "잔액 한도를 초과했습니다."],
        [createError("secret detail", 409, "REFERENCE_EVENT_CONFLICT"), 409, "REFERENCE_EVENT_CONFLICT", "참조 사건 ID가 이미 다른 요청에 사용되었습니다."],
        [createError("secret detail", 409, "PRODUCT_STOPPED"), 409, "PRODUCT_STOPPED", "판매가 중지된 상품입니다."],
        [new Error("SQL syntax near secret"), 500, "SERVER_ERROR", "서버 내부에서 에러가 발생했습니다."],
    ];
    let thrown;
    stubService(t, { purchaseGold: async () => { throw thrown; } });
    const base = await startServer(t);
    for (const [error, status, code, message] of cases) {
        thrown = error;
        const res = await request(base, "/economy/gold-purchases", { method: "POST", token: tokenFor(USER_A), body: goldBody() });
        assert.equal(res.status, status, code);
        assert.equal(res.json.code, code);
        assert.equal(res.json.message, message);
        assert.doesNotMatch(JSON.stringify(res.json), /secret/);
    }

    const mismatch = Object.assign(createError("x", 409, "PRODUCT_VERSION_MISMATCH"), {
        currentProduct: {
            productId: "gold-1", kind: "GOLD_PURCHASE", displayName: "골드", payCurrency: "DIAMOND", payAmount: 30,
            grantCurrency: "GOLD", grantAmount: 100, bonusAmount: 10, version: 2, status: "ON_SALE",
        },
    });
    thrown = mismatch;
    const res = await request(base, "/economy/gold-purchases", { method: "POST", token: tokenFor(USER_A), body: goldBody() });
    assert.equal(res.status, 409);
    assert.equal(res.json.product.version, 2);
    assert.equal("status" in res.json.product, false);
});

test("F-32b: GET /purchases/:referenceEventId는 GOLD 결과에만 ok·저장된 두 잔액을 더하고 기존 SINGLE 응답은 그대로다", async (t) => {
    stubAuthGate(t);
    const entry = (currency, amount, balance) => ({
        id: 1, reason: "GOLD_PURCHASE", item_id: null, currency, amount, balance_after: balance, reference_event_id: "r", created_at: "2026-09-22T00:00:00.000Z",
    });
    const stored = {
        gold: { kind: "GOLD", results: [entry("DIAMOND", -30, 70), entry("GOLD", 110, 130)], createdAt: "2026-09-22T00:00:00.000Z" },
        single: { kind: "SINGLE", results: [entry("GOLD", -5, 3)], createdAt: "2026-09-22T00:00:00.000Z" },
    };
    const { lastCall } = stubService(t, {
        getPurchaseResult: async (userId, referenceEventId) => stored[referenceEventId] ?? null,
    });
    const base = await startServer(t);

    const gold = await request(base, "/economy/purchases/gold", { token: tokenFor(USER_A) });
    assert.equal(gold.status, 200);
    assert.equal(gold.json.ok, true);
    assert.equal(gold.json.balanceDiamond, 70);
    assert.equal(gold.json.balanceGold, 130);
    assert.equal(gold.json.kind, "GOLD");
    assert.deepEqual(gold.json.results.map((r) => r.balanceAfter), [70, 130]);
    assert.deepEqual(lastCall("getPurchaseResult").args.slice(0, 2), [USER_A, "gold"]);

    const single = await request(base, "/economy/purchases/single", { token: tokenFor(USER_A) });
    assert.deepEqual(Object.keys(single.json).sort(), ["createdAt", "kind", "results"]);

    const missing = await request(base, "/economy/purchases/none", { token: tokenFor(USER_A) });
    assert.equal(missing.status, 404);
});
