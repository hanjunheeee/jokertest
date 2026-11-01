process.env.JWT_SECRET = "topup-route-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const nodeHttp     = require("node:http");
const express      = require("express");
const cookieParser = require("cookie-parser");
const jwt          = require("jsonwebtoken");

const { listenOnFetchablePort } = require("../helpers/fetchablePort");

const { notFoundHandler, globalErrorHandler } = require("../../middleware/errorHandler");
const { createError } = require("../../utils/appError");
const userRepository = require("../../repositories/user.repositories");
const currencyProductsService = require("../../service/currencyProducts.service");
const topupService = require("../../service/topup.service");
const economyService = require("../../service/economy.service");

const REPO_KEYS = ["findActiveSession", "checkActiveBan", "findByUuid"];

const stubAuthGate = (t) => {
    const originals = Object.fromEntries(REPO_KEYS.map((key) => [key, userRepository[key]]));
    userRepository.findActiveSession = async (id, userId) => ({ id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null });
    userRepository.checkActiveBan = async () => null;
    userRepository.findByUuid = async (uuid) => ({ uuid, role: "USER" });
    t.after(() => Object.assign(userRepository, originals));
};

const stubServices = (t, overrides = {}) => {
    const targets = {
        listCurrencyProducts: currencyProductsService,
        createTopupOrder: topupService,
        confirmTopupOrder: topupService,
        getTopupOrder: topupService,
    };
    const originals = Object.fromEntries(Object.entries(targets).map(([key, owner]) => [key, owner[key]]));
    const calls = [];
    for (const [key, owner] of Object.entries(targets)) {
        owner[key] = (...args) => {
            calls.push({ name: key, args });
            if (!overrides[key]) throw new Error(`stub for ${key} not provided`);
            return overrides[key](...args);
        };
    }
    t.after(() => {
        for (const [key, owner] of Object.entries(targets)) owner[key] = originals[key];
    });
    return {
        calls,
        callsOf: (name) => calls.filter((call) => call.name === name),
    };
};

const USER_A = "uuid-user-a";
const USER_B = "uuid-user-b";
const tokenFor = (uuid, extra = {}) => jwt.sign({ uuid, role: "USER", sessionId: `session-${uuid}`, ...extra }, process.env.JWT_SECRET, { expiresIn: "1d" });

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/economy", require("../../routes/economy.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = nodeHttp.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return url;
};

const request = async (base, path, { method = "GET", token, body, rawBody } = {}) => {
    const headers = {};
    if (token) headers.cookie = `accessToken=${token}`;
    if (body !== undefined || rawBody !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(new URL(path, base), {
        method,
        headers,
        body: rawBody !== undefined ? rawBody : (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, headers: res.headers };
};

const TEST_PRODUCT = { productId: "test-topup-1", kind: "DIAMOND_TOPUP", displayName: "시험 상품", payCurrency: "KRW", payAmount: 1000, grantCurrency: "DIAMOND", grantAmount: 100, bonusAmount: 10, version: 1 };
const ORDER_ID = "11111111-2222-4333-8444-555555555555";

const ENDPOINTS = [
    ["GET", "/economy/currency-products"],
    ["POST", "/economy/topup/orders", { productId: "test-topup-1", version: 1 }],
    ["POST", `/economy/topup/orders/${ORDER_ID}/confirm`, { paymentKey: "pay_key_1", amount: 1000 }],
    ["GET", `/economy/topup/orders/${ORDER_ID}`],
];

for (const [method, path, body] of ENDPOINTS) {
    test(`미인증: ${method} ${path.replace(ORDER_ID, ":orderId")}은 accessToken 쿠키가 없으면 401이고 서비스를 호출하지 않는다`, async (t) => {
        stubAuthGate(t);
        const stub = stubServices(t);
        const base = await startServer(t);

        const res = await request(base, path, { method, body });
        assert.equal(res.status, 401);
        assert.equal(stub.calls.length, 0);
    });

    test(`만료 인증: ${method} ${path.replace(ORDER_ID, ":orderId")}은 401 ACCESS_TOKEN_EXPIRED로 거부된다`, async (t) => {
        stubAuthGate(t);
        const stub = stubServices(t);
        const base = await startServer(t);
        const expired = jwt.sign({ uuid: USER_A, role: "USER", sessionId: "s" }, process.env.JWT_SECRET, { expiresIn: -10 });

        const res = await request(base, path, { method, body, token: expired });
        assert.equal(res.status, 401);
        assert.equal(res.json.code, "ACCESS_TOKEN_EXPIRED");
        assert.equal(stub.calls.length, 0);
    });

    test(`위조 인증: ${method} ${path.replace(ORDER_ID, ":orderId")}은 서명이 틀린 토큰이면 401이다`, async (t) => {
        stubAuthGate(t);
        const stub = stubServices(t);
        const base = await startServer(t);
        const forged = jwt.sign({ uuid: USER_A, role: "USER", sessionId: "s" }, "another-secret", { expiresIn: "1d" });

        const res = await request(base, path, { method, body, token: forged });
        assert.equal(res.status, 401);
        assert.equal(stub.calls.length, 0);
    });
}

test("정지된 계정은 인증 계층의 403(정지 안내)이 유지되고 서비스를 호출하지 않는다", async (t) => {
    const originals = { checkActiveBan: userRepository.checkActiveBan, markOnlineSessionsOffline: userRepository.markOnlineSessionsOffline };
    stubAuthGate(t);
    userRepository.checkActiveBan = async () => ({ reason: "시험 사유" });
    userRepository.markOnlineSessionsOffline = async () => {};
    t.after(() => Object.assign(userRepository, originals));
    const stub = stubServices(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/currency-products", { token: tokenFor(USER_A) });
    assert.equal(res.status, 403);
    assert.match(res.json.message, /^정지된 계정입니다\./);
    assert.equal(stub.calls.length, 0);
});

test("인증 uuid가 없는 토큰은 401로 거부되고(세션 검증·requireSelf 이중 방어) 서비스를 호출하지 않는다", async (t) => {
    stubAuthGate(t);
    const stub = stubServices(t);
    const base = await startServer(t);
    const noUuidToken = jwt.sign({ role: "USER", sessionId: "s" }, process.env.JWT_SECRET, { expiresIn: "1d" });

    for (const [method, path, body] of ENDPOINTS) {
        const res = await request(base, path, { method, body, token: noUuidToken });
        assert.equal(res.status, 401, `${method} ${path}`);
    }
    assert.equal(stub.calls.length, 0);
});

test("기존 계정별 경로의 requireSelf는 그대로 403(ECONOMY_FORBIDDEN)이다", async (t) => {
    stubAuthGate(t);
    const originalSummary = economyService.getWalletSummary;
    economyService.getWalletSummary = async () => { throw new Error("호출되면 안 된다"); };
    t.after(() => { economyService.getWalletSummary = originalSummary; });
    const base = await startServer(t);

    const res = await request(base, `/economy/accounts/${USER_B}/wallet`, { token: tokenFor(USER_A) });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "ECONOMY_FORBIDDEN");
});

test("상품 목록: 공개 필드만 직렬화한다(서비스가 내부 필드를 실어 와도 싣지 않는다)", async (t) => {
    stubAuthGate(t);
    const stub = stubServices(t, {
        listCurrencyProducts: async () => [{ ...TEST_PRODUCT, status: "ON_SALE", sortOrder: 3, secret: "must-not-leak", pay_amount: 1 }],
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/currency-products", { token: tokenFor(USER_A) });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true, products: [TEST_PRODUCT] });
    assert.deepEqual(stub.callsOf("listCurrencyProducts")[0].args, [{ kind: undefined }]);
});

test("상품 목록: 빈 목록은 products:[]로, kind 쿼리는 그대로 전달한다", async (t) => {
    stubAuthGate(t);
    const stub = stubServices(t, { listCurrencyProducts: async () => [] });
    const base = await startServer(t);

    const res = await request(base, "/economy/currency-products?kind=DIAMOND_TOPUP", { token: tokenFor(USER_A) });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true, products: [] });
    assert.deepEqual(stub.callsOf("listCurrencyProducts")[0].args, [{ kind: "DIAMOND_TOPUP" }]);
});

test("상품 목록: 알 수 없는 kind·배열 kind는 400이고 서비스를 호출하지 않는다", async (t) => {
    stubAuthGate(t);
    const stub = stubServices(t, { listCurrencyProducts: async () => [] });
    const base = await startServer(t);

    for (const query of ["kind=SKIN", "kind=", "kind=diamond_topup", "kind=DIAMOND_TOPUP&kind=GOLD_PURCHASE"]) {
        const res = await request(base, `/economy/currency-products?${query}`, { token: tokenFor(USER_A) });
        assert.equal(res.status, 400, query);
        assert.equal(res.json.code, "INVALID_PRODUCT_KIND", query);
    }
    assert.equal(stub.calls.length, 0);
});

test("상품 목록: DB 조회 실패는 빈 목록이 아니라 5xx다", async (t) => {
    stubAuthGate(t);
    stubServices(t, { listCurrencyProducts: async () => { throw new Error("ER_CON_COUNT_ERROR"); } });
    const base = await startServer(t);

    const res = await request(base, "/economy/currency-products", { token: tokenFor(USER_A) });
    assert.equal(res.status, 500);
    assert.equal(res.json.code, "SERVER_ERROR");
    assert.equal(res.json.products, undefined);
});

test("주문 생성: 인증 uuid와 productId·version만 서비스로 전달하고 공개 필드만 응답한다", async (t) => {
    stubAuthGate(t);
    const stub = stubServices(t, {
        createTopupOrder: async () => ({ orderId: ORDER_ID, amount: 1000, orderName: "시험 상품", clientKey: "test_ck_public", payment_key: "leak", secretKey: "leak" }),
    });
    const base = await startServer(t);

    const res = await request(base, "/economy/topup/orders", {
        method: "POST", token: tokenFor(USER_A), body: { productId: "test-topup-1", version: 1 },
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.json, { ok: true, orderId: ORDER_ID, amount: 1000, orderName: "시험 상품", clientKey: "test_ck_public" });
    assert.deepEqual(stub.callsOf("createTopupOrder")[0].args, [{ userId: USER_A, productId: "test-topup-1", version: 1 }]);
});

const BAD_ORDER_BODIES = [
    ["추가 userId", { productId: "p", version: 1, userId: USER_B }, "UNKNOWN_TOPUP_ORDER_FIELD"],
    ["추가 grantAmount", { productId: "p", version: 1, grantAmount: 999999 }, "UNKNOWN_TOPUP_ORDER_FIELD"],
    ["추가 amount", { productId: "p", version: 1, amount: 1 }, "UNKNOWN_TOPUP_ORDER_FIELD"],
    ["__proto__ 키", JSON.parse('{"productId":"p","version":1,"__proto__":{"x":1}}'), "UNKNOWN_TOPUP_ORDER_FIELD"],
    ["productId 누락", { version: 1 }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["productId 숫자", { productId: 1, version: 1 }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["productId 빈 문자열", { productId: "", version: 1 }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["productId 65자", { productId: "p".repeat(65), version: 1 }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["version 누락", { productId: "p" }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["version 문자열", { productId: "p", version: "1" }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["version 소수", { productId: "p", version: 1.5 }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["version 0", { productId: "p", version: 0 }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["version 음수", { productId: "p", version: -1 }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["version null", { productId: "p", version: null }, "INVALID_TOPUP_ORDER_REQUEST"],
    ["빈 본문", {}, "INVALID_TOPUP_ORDER_REQUEST"],
];

for (const [label, body, code] of BAD_ORDER_BODIES) {
    test(`주문 생성 거부(${label}): 400 ${code}이고 서비스를 호출하지 않는다`, async (t) => {
        stubAuthGate(t);
        const stub = stubServices(t, { createTopupOrder: async () => { throw new Error("호출되면 안 된다"); } });
        const base = await startServer(t);

        const res = await request(base, "/economy/topup/orders", { method: "POST", token: tokenFor(USER_A), body });
        assert.equal(res.status, 400);
        assert.equal(res.json.code, code);
        assert.equal(stub.calls.length, 0);
    });
}

test("주문 생성: 서비스 오류 코드는 고정 상태로 매핑되고 버전 불일치는 현재 상품의 공개 필드만 싣는다", async (t) => {
    stubAuthGate(t);
    const failures = {
        PRODUCT_NOT_FOUND: 404,
        PRODUCT_STOPPED: 409,
        PRODUCT_VERSION_MISMATCH: 409,
        CONFIG_MISSING: 503,
    };
    let current = null;
    stubServices(t, {
        createTopupOrder: async () => {
            throw Object.assign(createError("서비스 원문 메시지(노출되면 안 된다)", 418, current), current === "PRODUCT_VERSION_MISMATCH"
                ? { currentProduct: { ...TEST_PRODUCT, version: 2, status: "ON_SALE", sortOrder: 1, internalNote: "leak" } }
                : {});
        },
    });
    const base = await startServer(t);

    for (const [code, status] of Object.entries(failures)) {
        current = code;
        const res = await request(base, "/economy/topup/orders", {
            method: "POST", token: tokenFor(USER_A), body: { productId: "test-topup-1", version: 1 },
        });
        assert.equal(res.status, status, code);
        assert.equal(res.json.ok, false);
        assert.equal(res.json.code, code);
        assert.ok(!JSON.stringify(res.json).includes("서비스 원문"), "서비스 메시지는 그대로 노출되면 안 된다");
        if (code === "PRODUCT_VERSION_MISMATCH") {
            assert.deepEqual(res.json.product, { ...TEST_PRODUCT, version: 2 });
        } else {
            assert.equal(res.json.product, undefined);
        }
    }
});

test("confirm: 경로 orderId·인증 uuid·본문 paymentKey/amount만 서비스로 전달하고 GRANTED는 잔액만 싣는다", async (t) => {
    stubAuthGate(t);
    const stub = stubServices(t, {
        confirmTopupOrder: async () => ({ status: "GRANTED", balanceDiamond: 110, ledgerEntry: { id: 1 }, paymentKey: "leak" }),
    });
    const base = await startServer(t);

    const res = await request(base, `/economy/topup/orders/${ORDER_ID}/confirm`, {
        method: "POST", token: tokenFor(USER_A), body: { paymentKey: "pay_key_1", amount: 1000 },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true, status: "GRANTED", balanceDiamond: 110 });
    assert.deepEqual(stub.callsOf("confirmTopupOrder")[0].args, [
        { userId: USER_A, orderId: ORDER_ID, paymentKey: "pay_key_1", amount: 1000 },
    ]);
});

test("confirm: 지급 재시도 중이면 PENDING_GRANT만 응답한다", async (t) => {
    stubAuthGate(t);
    stubServices(t, { confirmTopupOrder: async () => ({ status: "PENDING_GRANT", balanceDiamond: 999 }) });
    const base = await startServer(t);

    const res = await request(base, `/economy/topup/orders/${ORDER_ID}/confirm`, {
        method: "POST", token: tokenFor(USER_A), body: { paymentKey: "pay_key_1", amount: 1000 },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true, status: "PENDING_GRANT" });
});

const BAD_CONFIRM_BODIES = [
    ["추가 userId", { paymentKey: "k", amount: 1000, userId: USER_B }, "UNKNOWN_TOPUP_CONFIRM_FIELD"],
    ["추가 grantAmount", { paymentKey: "k", amount: 1000, grantAmount: 999999 }, "UNKNOWN_TOPUP_CONFIRM_FIELD"],
    ["본문 orderId", { paymentKey: "k", amount: 1000, orderId: "other" }, "UNKNOWN_TOPUP_CONFIRM_FIELD"],
    ["amount 숫자 문자열", { paymentKey: "k", amount: "1000" }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["amount 소수", { paymentKey: "k", amount: 1000.5 }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["amount 음수", { paymentKey: "k", amount: -1000 }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["amount 0", { paymentKey: "k", amount: 0 }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["amount null", { paymentKey: "k", amount: null }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["amount 누락", { paymentKey: "k" }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["paymentKey 누락", { amount: 1000 }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["paymentKey 숫자", { paymentKey: 123, amount: 1000 }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["paymentKey 빈 문자열", { paymentKey: "", amount: 1000 }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["paymentKey 배열", { paymentKey: ["k"], amount: 1000 }, "INVALID_TOPUP_CONFIRM_REQUEST"],
    ["paymentKey 201자", { paymentKey: "k".repeat(201), amount: 1000 }, "INVALID_TOPUP_CONFIRM_REQUEST"],
];

for (const [label, body, code] of BAD_CONFIRM_BODIES) {
    test(`confirm 거부(${label}): 400 ${code}이고 서비스를 호출하지 않는다`, async (t) => {
        stubAuthGate(t);
        const stub = stubServices(t, { confirmTopupOrder: async () => { throw new Error("호출되면 안 된다"); } });
        const base = await startServer(t);

        const res = await request(base, `/economy/topup/orders/${ORDER_ID}/confirm`, { method: "POST", token: tokenFor(USER_A), body });
        assert.equal(res.status, 400);
        assert.equal(res.json.code, code);
        assert.equal(stub.calls.length, 0);
    });
}

test("confirm: 서비스 오류 코드는 계약의 고정 상태로 매핑되고 PAYMENT_PROCESSING은 재시도 가능한 503이다", async (t) => {
    stubAuthGate(t);
    const failures = {
        AMOUNT_MISMATCH: 400,
        ORDER_NOT_FOUND: 404,
        NOT_OWNER: 403,
        PAYMENT_FAILED: 402,
        PAYMENT_KEY_MISMATCH: 409,
        PAYMENT_KEY_CONFLICT: 409,
        PAYMENT_PROCESSING: 503,
        CONFIG_MISSING: 503,
    };
    let current = null;
    stubServices(t, { confirmTopupOrder: async () => { throw createError("원문 메시지", 200, current); } });
    const base = await startServer(t);

    for (const [code, status] of Object.entries(failures)) {
        current = code;
        const res = await request(base, `/economy/topup/orders/${ORDER_ID}/confirm`, {
            method: "POST", token: tokenFor(USER_A), body: { paymentKey: "pay_key_1", amount: 1000 },
        });
        assert.equal(res.status, status, code);
        assert.equal(res.json.ok, false);
        assert.equal(res.json.code, code);
        assert.ok(!JSON.stringify(res.json).includes("원문 메시지"));
        assert.equal(res.headers.get("cache-control"), "no-store");
        if (code === "PAYMENT_PROCESSING") assert.ok(res.headers.get("retry-after"));
    }
});

test("confirm: 계약에 없는 코드·예상 밖 오류는 SERVER_ERROR(500)로 수렴한다", async (t) => {
    stubAuthGate(t);
    let failure;
    stubServices(t, { confirmTopupOrder: async () => { throw failure; } });
    const base = await startServer(t);
    const call = () => request(base, `/economy/topup/orders/${ORDER_ID}/confirm`, {
        method: "POST", token: tokenFor(USER_A), body: { paymentKey: "pay_key_1", amount: 1000 },
    });

    for (failure of [
        createError("이상한 코드", 400, "SOMETHING_ELSE"),
        createError("코드 없는 409", 409),
        new Error("plain error"),
        Object.assign(new Error("db"), { name: "SequelizeDatabaseError", original: { sql: "SELECT secret" } }),
    ]) {
        const res = await call();
        assert.equal(res.status, 500, failure.message);
        assert.deepEqual(res.json, { ok: false, code: "SERVER_ERROR", message: "서버 내부에서 에러가 발생했습니다." });
    }
});

test("타인 계정 주문: 요청마다 그 요청의 인증 uuid가 서비스로 전달되어 소유자 판정에 쓰인다", async (t) => {
    stubAuthGate(t);
    const owner = USER_A;
    const stub = stubServices(t, {
        confirmTopupOrder: async ({ userId }) => {
            if (userId !== owner) throw createError("x", 200, "NOT_OWNER");
            return { status: "GRANTED", balanceDiamond: 110 };
        },
        getTopupOrder: async ({ userId }) => {
            if (userId !== owner) throw createError("x", 200, "NOT_OWNER");
            return { orderId: ORDER_ID, status: "CREATED", amount: 1000, orderName: "n", productId: "p", version: 1, grantAmount: 100, bonusAmount: 10, createdAt: new Date(0) };
        },
    });
    const base = await startServer(t);

    const confirmB = await request(base, `/economy/topup/orders/${ORDER_ID}/confirm`, {
        method: "POST", token: tokenFor(USER_B), body: { paymentKey: "pay_key_1", amount: 1000 },
    });
    assert.equal(confirmB.status, 403);
    assert.equal(confirmB.json.code, "NOT_OWNER");
    const getB = await request(base, `/economy/topup/orders/${ORDER_ID}`, { token: tokenFor(USER_B) });
    assert.equal(getB.status, 403);
    assert.equal(getB.json.code, "NOT_OWNER");

    const getA = await request(base, `/economy/topup/orders/${ORDER_ID}`, { token: tokenFor(USER_A) });
    assert.equal(getA.status, 200);
    assert.deepEqual(stub.callsOf("confirmTopupOrder").map((call) => call.args[0].userId), [USER_B]);
    assert.deepEqual(stub.callsOf("getTopupOrder").map((call) => call.args[0].userId), [USER_B, USER_A]);
});

test("주문 조회: 공개 필드만 싣고 GRANTED에서만 balanceDiamond를 싣는다(결제키·임대는 싣지 않는다)", async (t) => {
    stubAuthGate(t);
    const base_order = {
        orderId: ORDER_ID, amount: 1000, orderName: "시험 상품", productId: "test-topup-1", version: 1,
        grantAmount: 100, bonusAmount: 10, createdAt: new Date("2026-09-22T00:00:00Z"),
        payment_key: "leak", paymentKey: "leak", lease_token: "leak", secret: "leak",
    };
    let next = { ...base_order, status: "CREATED", balanceDiamond: null };
    stubServices(t, { getTopupOrder: async () => next });
    const base = await startServer(t);

    const created = await request(base, `/economy/topup/orders/${ORDER_ID}`, { token: tokenFor(USER_A) });
    assert.equal(created.status, 200);
    assert.deepEqual(created.json, {
        ok: true, orderId: ORDER_ID, status: "CREATED", amount: 1000, orderName: "시험 상품", productId: "test-topup-1",
        version: 1, grantAmount: 100, bonusAmount: 10, createdAt: "2026-09-22T00:00:00.000Z",
    });

    next = { ...base_order, status: "GRANTED", balanceDiamond: 110 };
    const granted = await request(base, `/economy/topup/orders/${ORDER_ID}`, { token: tokenFor(USER_A) });
    assert.equal(granted.json.status, "GRANTED");
    assert.equal(granted.json.balanceDiamond, 110);
    assert.ok(!JSON.stringify(granted.json).includes("leak"));
});

test("주문 조회: 결제창 복귀를 모사한 쿼리(paymentKey·orderId·amount)는 서비스로 전달되지 않는다", async (t) => {
    stubAuthGate(t);
    const stub = stubServices(t, {
        getTopupOrder: async () => ({ orderId: ORDER_ID, status: "CREATED", amount: 1000, orderName: "n", productId: "p", version: 1, grantAmount: 100, bonusAmount: 10, createdAt: new Date(0) }),
    });
    const base = await startServer(t);

    const res = await request(base, `/economy/topup/orders/${ORDER_ID}?paymentKey=pay_key_1&orderId=${ORDER_ID}&amount=1000&userId=${USER_B}`, { token: tokenFor(USER_A) });
    assert.equal(res.status, 200);
    assert.deepEqual(stub.callsOf("getTopupOrder")[0].args, [{ userId: USER_A, orderId: ORDER_ID }]);
    assert.equal(stub.callsOf("confirmTopupOrder").length, 0);
});

test("주문 조회: 없는 주문은 404 ORDER_NOT_FOUND, 쿼리·대소문자·후행 슬래시 변형도 같은 안전 오류 형식이다", async (t) => {
    stubAuthGate(t);
    stubServices(t, { getTopupOrder: async () => { throw createError("원문", 404, "ORDER_NOT_FOUND"); } });
    const base = await startServer(t);

    for (const path of [
        `/economy/topup/orders/${ORDER_ID}`,
        `/economy/topup/orders/${ORDER_ID}/`,
        `/economy/topup/orders/${ORDER_ID}?x=1`,
        `/ECONOMY/Topup/Orders/${ORDER_ID}`,
    ]) {
        const res = await request(base, path, { token: tokenFor(USER_A) });
        assert.equal(res.status, 404, path);
        assert.equal(res.json.code, "ORDER_NOT_FOUND", path);
        assert.equal(res.headers.get("cache-control"), "no-store", path);
    }
});

test("신규 범위의 없는 하위 경로는 404 NOT_FOUND 고정 응답이다", async (t) => {
    stubAuthGate(t);
    stubServices(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/topup/nothing-here", { token: tokenFor(USER_A) });
    assert.equal(res.status, 404);
    assert.equal(res.json.code, "NOT_FOUND");
    assert.ok(!JSON.stringify(res.json).includes("nothing-here"));
});

test("잘못된 JSON 본문은 원문 없이 400 INVALID_INPUT이고 서비스를 호출하지 않는다", async (t) => {
    stubAuthGate(t);
    const stub = stubServices(t);
    const base = await startServer(t);

    const res = await request(base, "/economy/topup/orders", {
        method: "POST", token: tokenFor(USER_A), rawBody: '{"productId": "SECRET_BODY_MARKER", ',
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "INVALID_INPUT");
    assert.ok(!JSON.stringify(res.json).includes("SECRET_BODY_MARKER"));
    assert.equal(stub.calls.length, 0);
});
