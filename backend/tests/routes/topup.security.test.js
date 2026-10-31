process.env.JWT_SECRET = "topup-security-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const crypto       = require("node:crypto");
const nodeHttp     = require("node:http");
const fs           = require("node:fs");
const os           = require("node:os");
const path         = require("node:path");
const { spawnSync } = require("node:child_process");
const express      = require("express");
const cookieParser = require("cookie-parser");
const morgan       = require("morgan");
const jwt          = require("jsonwebtoken");

const { notFoundHandler, globalErrorHandler } = require("../../middleware/errorHandler");
const { createError } = require("../../utils/appError");
const userRepository = require("../../repositories/user.repositories");
const currencyProductsService = require("../../service/currencyProducts.service");
const topupService = require("../../service/topup.service");
const { createTossAdapter } = require("../../payments/tossAdapter");
const { listenOnFetchablePort } = require("../helpers/fetchablePort");

const RUN = crypto.randomBytes(8).toString("hex");
const CLIENT_KEY = `test_ck_public${RUN}0000`;
const SECRET = `test_sk_SECRETMARK${RUN}0000`;
const BASIC_SECRET = Buffer.from(SECRET, "utf8").toString("base64");
const BASIC_SECRET_COLON = Buffer.from(`${SECRET}:`, "utf8").toString("base64");
const BODY_MARK = `BODYMARK${RUN}`;
const NEEDLES = [SECRET, BASIC_SECRET, BASIC_SECRET_COLON, `SECRETMARK${RUN}`, BODY_MARK];

const USER = "uuid-user-security";
const ORDER_ID = "11111111-2222-4333-8444-555555555555";
const token = jwt.sign({ uuid: USER, role: "USER", sessionId: "s" }, process.env.JWT_SECRET, { expiresIn: "1d" });

const withEnv = (t, values) => {
    const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.assign(process.env, values);
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
};

const stubAuthGate = (t) => {
    const keys = ["findActiveSession", "checkActiveBan", "findByUuid"];
    const originals = Object.fromEntries(keys.map((key) => [key, userRepository[key]]));
    userRepository.findActiveSession = async (id, userId) => ({ id, user_id: userId, is_online: true, revoked_at: null, refresh_token_expires_at: null });
    userRepository.checkActiveBan = async () => null;
    userRepository.findByUuid = async (uuid) => ({ uuid, role: "USER" });
    t.after(() => Object.assign(userRepository, originals));
};

const stubServices = (t, behaviors) => {
    const targets = {
        listCurrencyProducts: currencyProductsService,
        createTopupOrder: topupService,
        confirmTopupOrder: topupService,
        getTopupOrder: topupService,
    };
    const originals = Object.fromEntries(Object.entries(targets).map(([key, owner]) => [key, owner[key]]));
    for (const [key, owner] of Object.entries(targets)) owner[key] = (...args) => behaviors[key](...args);
    t.after(() => { for (const [key, owner] of Object.entries(targets)) owner[key] = originals[key]; });
};

const captureLogs = (t) => {
    const lines = [];
    const names = ["log", "info", "warn", "error", "debug"];
    const originals = Object.fromEntries(names.map((name) => [name, console[name]]));
    for (const name of names) {
        console[name] = (...args) => { lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")); };
    }
    t.after(() => Object.assign(console, originals));
    return lines;
};

const startServer = async (t, accessLog) => {
    const app = express();
    app.use(morgan(":method :url :status", { stream: { write: (line) => accessLog.push(line) } }));
    app.use(express.json());
    app.use(cookieParser());
    app.use("/economy", require("../../routes/economy.routes"));
    app.get("/other-area/boom", () => { throw new Error("outside-scope-boom"); });
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = nodeHttp.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return url;
};

const call = async (base, requestPath, { method = "GET", body, rawBody } = {}) => {
    const headers = { cookie: `accessToken=${token}` };
    if (body !== undefined || rawBody !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(new URL(requestPath, base), {
        method, headers, body: rawBody !== undefined ? rawBody : (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    return { status: res.status, text, headers: [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n") };
};

const assertNoNeedle = (haystack, label) => {
    for (const needle of NEEDLES) {
        assert.ok(!haystack.includes(needle), `${label}에 표식(${needle.slice(0, 16)}…)이 있으면 안 된다`);
    }
};

const adapterError = () => Object.assign(new Error(`adapter failed ${SECRET} Authorization: Basic ${BASIC_SECRET_COLON}`), {
    status: 502,
    code: "PROVIDER_ERROR_X",
    response: { data: { secret: SECRET } },
    config: { headers: { Authorization: `Basic ${BASIC_SECRET_COLON}` } },
});
const dbError = () => Object.assign(new Error(`insert failed near '${SECRET}'`), {
    name: "SequelizeDatabaseError",
    sql: `INSERT INTO t VALUES ('${SECRET}')`,
    parent: { sqlMessage: SECRET, sql: `SELECT '${SECRET}'` },
    original: { code: "ER_PARSE_ERROR" },
});
const explicitError = () => Object.assign(createError(`SERVER ${SECRET}`, 500, "PAYMENT_FAILED_WITH_SECRET"), { stack: `Error: ${SECRET}\n at ${BASIC_SECRET}` });
const explicitKnownCodeError = () => Object.assign(createError(`known ${SECRET}`, 402, "PAYMENT_FAILED"), { data: { secret: SECRET } });

const FAILURES = { adapterError, dbError, explicitError, explicitKnownCodeError };

const CASES = [
    ["GET", "/economy/currency-products", undefined, "listCurrencyProducts"],
    ["POST", "/economy/topup/orders", { productId: "test-topup-1", version: 1 }, "createTopupOrder"],
    ["POST", `/economy/topup/orders/${ORDER_ID}/confirm`, { paymentKey: "pay_key_1", amount: 1000 }, "confirmTopupOrder"],
    ["GET", `/economy/topup/orders/${ORDER_ID}`, undefined, "getTopupOrder"],
];

for (const nodeEnv of ["development", "production", "test"]) {
    test(`NODE_ENV=${nodeEnv}: 표식이 실린 어댑터·DB·명시 오류가 응답·로그에 남지 않고 SERVER_ERROR로 수렴한다`, async (t) => {
        withEnv(t, { NODE_ENV: nodeEnv, TOSS_TEST_CLIENT_KEY: CLIENT_KEY, TOSS_TEST_SECRET_KEY: SECRET });
        stubAuthGate(t);
        const logs = captureLogs(t);
        const accessLog = [];
        let failure;
        stubServices(t, Object.fromEntries(CASES.map(([, , , name]) => [name, async () => { throw failure(); }])));
        const base = await startServer(t, accessLog);

        for (const [failureName, makeFailure] of Object.entries(FAILURES)) {
            failure = makeFailure;
            for (const [method, requestPath, body] of CASES) {
                for (const variant of [requestPath, `${requestPath}/`, `${requestPath}?x=1`, requestPath.toUpperCase().replace(ORDER_ID.toUpperCase(), ORDER_ID)]) {
                    const res = await call(base, variant, { method, body });
                    const label = `${failureName} ${method} ${variant}`;
                    assertNoNeedle(res.text, `${label} 응답 본문`);
                    assertNoNeedle(res.headers, `${label} 응답 헤더`);
                    const parsed = JSON.parse(res.text);
                    assert.equal(parsed.ok, false, label);
                    assert.equal(parsed.error, undefined, `${label}: 스택 필드가 없어야 한다`);
                    assert.equal(parsed.stack, undefined, label);
                    if (failureName === "explicitKnownCodeError") {
                        assert.equal(res.status, 402, label);
                        assert.equal(parsed.code, "PAYMENT_FAILED", label);
                    } else {
                        assert.equal(res.status, 500, label);
                        assert.equal(parsed.code, "SERVER_ERROR", label);
                    }
                    assert.match(res.headers, /cache-control: no-store/i, label);
                }
            }
        }
        assertNoNeedle(logs.join("\n"), "캡처한 콘솔 로그");
        assertNoNeedle(accessLog.join(""), "morgan 접근 로그");
        assert.ok(accessLog.length > 0, "접근 로그가 실제로 캡처되어야 한다");
    });

    test(`NODE_ENV=${nodeEnv}: 잘못된 JSON 본문(표식 포함)의 파서 오류가 응답·로그에 남지 않는다`, async (t) => {
        withEnv(t, { NODE_ENV: nodeEnv, TOSS_TEST_CLIENT_KEY: CLIENT_KEY, TOSS_TEST_SECRET_KEY: SECRET });
        stubAuthGate(t);
        const logs = captureLogs(t);
        const accessLog = [];
        stubServices(t, Object.fromEntries(CASES.map(([, , , name]) => [name, async () => { throw new Error("호출되면 안 된다"); }])));
        const base = await startServer(t, accessLog);

        for (const [method, requestPath] of CASES.filter(([method]) => method === "POST")) {
            for (const rawBody of [
                `{"paymentKey": "${BODY_MARK}", "secret": "${SECRET}", `,
                `not json ${SECRET} ${BASIC_SECRET_COLON}`,
            ]) {
                const res = await call(base, requestPath, { method, rawBody });
                assert.equal(res.status, 400, requestPath);
                assert.equal(JSON.parse(res.text).code, "INVALID_INPUT");
                assertNoNeedle(res.text, `${requestPath} 파서 오류 응답`);
                assertNoNeedle(res.headers, `${requestPath} 파서 오류 응답 헤더`);
            }
        }
        assertNoNeedle(logs.join("\n"), "캡처한 콘솔 로그");
        assertNoNeedle(accessLog.join(""), "morgan 접근 로그");
    });

    test(`NODE_ENV=${nodeEnv}: 정상 주문 응답은 공개 clientKey만 싣고 secret·결제키·서비스 내부 값은 싣지 않는다`, async (t) => {
        withEnv(t, { NODE_ENV: nodeEnv, TOSS_TEST_CLIENT_KEY: CLIENT_KEY, TOSS_TEST_SECRET_KEY: SECRET });
        stubAuthGate(t);
        const logs = captureLogs(t);
        const accessLog = [];
        stubServices(t, {
            listCurrencyProducts: async () => [],
            createTopupOrder: async () => ({
                orderId: ORDER_ID, amount: 1000, orderName: "시험 상품", clientKey: CLIENT_KEY,
                secretKey: SECRET, authorization: `Basic ${BASIC_SECRET_COLON}`, payment_key: BODY_MARK,
            }),
            confirmTopupOrder: async () => ({ status: "GRANTED", balanceDiamond: 110, secretKey: SECRET }),
            getTopupOrder: async () => ({
                orderId: ORDER_ID, status: "GRANTED", amount: 1000, orderName: "n", productId: "p", version: 1, grantAmount: 100, bonusAmount: 10,
                balanceDiamond: 110, createdAt: new Date(0), payment_key: BODY_MARK, secretKey: SECRET,
            }),
        });
        const base = await startServer(t, accessLog);

        const created = await call(base, "/economy/topup/orders", { method: "POST", body: { productId: "test-topup-1", version: 1 } });
        assert.equal(created.status, 201);
        assert.equal(JSON.parse(created.text).clientKey, CLIENT_KEY);
        assertNoNeedle(created.text, "주문 생성 응답");
        assertNoNeedle(created.headers, "주문 생성 응답 헤더");

        const confirmed = await call(base, `/economy/topup/orders/${ORDER_ID}/confirm`, { method: "POST", body: { paymentKey: "pay_key_1", amount: 1000 } });
        assert.equal(confirmed.status, 200);
        assertNoNeedle(confirmed.text, "confirm 응답");

        const fetched = await call(base, `/economy/topup/orders/${ORDER_ID}`);
        assert.equal(fetched.status, 200);
        assertNoNeedle(fetched.text, "주문 조회 응답");
        assertNoNeedle(logs.join("\n") + accessLog.join(""), "로그");
    });
}

test("신규 범위 밖의 경로는 기존 일반 오류 분기를 그대로 쓴다(개발 환경에서 메시지·스택 응답)", async (t) => {
    withEnv(t, { NODE_ENV: "development" });
    stubAuthGate(t);
    captureLogs(t);
    const base = await startServer(t, []);

    const res = await fetch(new URL("/other-area/boom", base));
    const json = await res.json();
    assert.equal(res.status, 500);
    assert.equal(json.message, "outside-scope-boom");
    assert.ok(typeof json.error === "string" && json.error.includes("outside-scope-boom"), "기존 분기는 개발 환경에서 stack을 돌려준다");
});

test("실제 어댑터의 전송 오류·응답에 표식이 있어도 승인 불명 결과와 오류 처리기 응답에 남지 않는다", async (t) => {
    withEnv(t, { NODE_ENV: "development", TOSS_TEST_CLIENT_KEY: CLIENT_KEY, TOSS_TEST_SECRET_KEY: SECRET });
    stubAuthGate(t);
    const logs = captureLogs(t);
    const accessLog = [];
    const adapter = createTossAdapter({
        transport: async () => { throw Object.assign(new Error(`socket hang up ${SECRET} ${BASIC_SECRET_COLON}`), { config: { headers: { Authorization: `Basic ${BASIC_SECRET_COLON}` } } }); },
    });
    stubServices(t, {
        listCurrencyProducts: async () => [],
        createTopupOrder: async () => { throw new Error("호출되면 안 된다"); },
        getTopupOrder: async () => { throw new Error("호출되면 안 된다"); },
        confirmTopupOrder: async () => {
            const result = await adapter.confirmPayment({ paymentKey: "pay_key_1", orderId: ORDER_ID, amount: 1000 });
            assertNoNeedle(JSON.stringify(result), "어댑터 결과");
            assert.equal(result.outcome, "UNKNOWN");
            throw createError("결제 확인이 진행 중입니다.", 503, "PAYMENT_PROCESSING");
        },
    });
    const base = await startServer(t, accessLog);

    const res = await call(base, `/economy/topup/orders/${ORDER_ID}/confirm`, { method: "POST", body: { paymentKey: "pay_key_1", amount: 1000 } });
    assert.equal(res.status, 503);
    assert.equal(JSON.parse(res.text).code, "PAYMENT_PROCESSING");
    assertNoNeedle(res.text, "응답");
    assertNoNeedle(logs.join("\n") + accessLog.join(""), "로그");
});

const listFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
});

test("서버 전용 secret 환경변수를 준 프런트 production build 산출물에 표식이 없다", { timeout: 600_000 }, (t) => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "f32a-front-build-"));
    t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));

    const build = spawnSync(
        `npm --prefix frontend run build -- --outDir "${outDir}" --emptyOutDir`,
        {
            cwd: repoRoot,
            shell: true,
            encoding: "utf8",
            timeout: 540_000,
            env: { ...process.env, NODE_ENV: "production", TOSS_TEST_SECRET_KEY: SECRET, TOSS_TEST_CLIENT_KEY: CLIENT_KEY },
        },
    );
    assert.equal(build.status, 0, `frontend build 실패(status=${build.status}): ${String(build.stderr).slice(-1500)}`);

    const files = listFiles(outDir);
    assert.ok(files.some((file) => path.basename(file) === "index.html"), "index.html이 생성되어야 한다");
    assert.ok(files.some((file) => file.endsWith(".js")), "번들 JS가 생성되어야 한다");
    const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
    assert.ok(totalBytes > 1000, `산출물이 비어 있으면 안 된다(${totalBytes}바이트)`);

    for (const file of files) {
        const bytes = fs.readFileSync(file);
        for (const needle of NEEDLES) {
            assert.ok(!bytes.includes(Buffer.from(needle, "utf8")), `${path.relative(outDir, file)}에 표식(${needle.slice(0, 16)}…)이 있으면 안 된다`);
        }
    }
});
