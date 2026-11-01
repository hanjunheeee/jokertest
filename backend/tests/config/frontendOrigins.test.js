// 프런트 주소 설정 시험, 목록(값 없음·있음) · CORS 허용·거절 · client 판정
// config/frontendOrigins.js를 env 바꿔 가며 봄
const test     = require("node:test");
const assert   = require("node:assert/strict");
const http     = require("node:http");
const { once } = require("node:events");
const express  = require("express");
const cors     = require("cors");

const {
    getAllowedOrigins, getCorsOrigin, parseClient, resolveFrontendBase,
} = require("../../config/frontendOrigins");

const DESKTOP = "http://localhost:5173";
const MOBILE  = "http://localhost:5174";

// 시험 하나 동안만 env 바꾸기 (undefined는 지움)
const withEnv = (t, values) => {
    const keys = Object.keys(values);
    const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const put = (k, v) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    for (const k of keys) put(k, values[k]);
    t.after(() => { for (const k of keys) put(k, before[k]); });
};

// index.js와 같은 cors 설정으로 서버 띄우기
const startCorsServer = async (t) => {
    const app = express();
    app.use(cors({ origin: getCorsOrigin(), credentials: true }));
    app.get("/ping", (req, res) => res.json({ ok: true }));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

// Origin 실어 보내고 허용 머리값만 꺼냄 (없으면 null)
const allowOriginFor = (base, origin) => new Promise((resolve, reject) => {
    const req = http.request(new URL("/ping", base), { method: "GET", headers: { Origin: origin } }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.headers["access-control-allow-origin"] ?? null));
    });
    req.on("error", reject);
    req.end();
});

test("모바일 값 없으면 목록은 데스크톱 하나, CORS origin은 FRONTEND_URL 문자열 그대로", (t) => {
    withEnv(t, { FRONTEND_URL: DESKTOP, FRONTEND_MOBILE_URL: undefined });
    assert.deepEqual(getAllowedOrigins(), [DESKTOP]);
    assert.equal(getCorsOrigin(), DESKTOP);
});

test("모바일 값이 빈 문자열·공백이어도 없는 걸로 봄", (t) => {
    withEnv(t, { FRONTEND_URL: DESKTOP, FRONTEND_MOBILE_URL: "   " });
    assert.deepEqual(getAllowedOrigins(), [DESKTOP]);
    assert.equal(getCorsOrigin(), DESKTOP);
});

test("모바일 값 있으면 목록은 데스크톱·모바일 (끝 슬래시 뺌)", (t) => {
    withEnv(t, { FRONTEND_URL: `${DESKTOP}/`, FRONTEND_MOBILE_URL: ` ${MOBILE}/ ` });
    assert.deepEqual(getAllowedOrigins(), [DESKTOP, MOBILE]);
    assert.deepEqual(getCorsOrigin(), [DESKTOP, MOBILE]);
});

test("CORS: 모바일 값 있으면 두 주소 허용, 모르는 주소·와일드카드 거절", async (t) => {
    withEnv(t, { FRONTEND_URL: DESKTOP, FRONTEND_MOBILE_URL: MOBILE });
    const base = await startCorsServer(t);

    assert.equal(await allowOriginFor(base, DESKTOP), DESKTOP);
    assert.equal(await allowOriginFor(base, MOBILE), MOBILE);
    assert.equal(await allowOriginFor(base, "http://evil.example"), null);
    assert.equal(await allowOriginFor(base, "http://localhost:5175"), null);
    assert.equal(await allowOriginFor(base, "*"), null);
});

test("CORS: 모바일 값 없으면 지금처럼 FRONTEND_URL만 내려줌 (모바일 주소는 안 맞음)", async (t) => {
    withEnv(t, { FRONTEND_URL: DESKTOP, FRONTEND_MOBILE_URL: undefined });
    const base = await startCorsServer(t);

    assert.equal(await allowOriginFor(base, DESKTOP), DESKTOP);
    assert.notEqual(await allowOriginFor(base, MOBILE), MOBILE);
});

test("client 판정: mobile만 mobile, 나머지는 desktop", () => {
    assert.equal(parseClient("mobile"), "mobile");
    assert.equal(parseClient("desktop"), "desktop");
    for (const v of [undefined, "", "MOBILE", "mobile ", "tablet", ["mobile"], { a: 1 }]) {
        assert.equal(parseClient(v), "desktop", `값 ${JSON.stringify(v)}`);
    }
});

test("돌아갈 주소: mobile이고 모바일 값 있을 때만 모바일, 아니면 FRONTEND_URL", (t) => {
    withEnv(t, { FRONTEND_URL: DESKTOP, FRONTEND_MOBILE_URL: MOBILE });
    assert.equal(resolveFrontendBase("mobile"), MOBILE);
    assert.equal(resolveFrontendBase("desktop"), DESKTOP);
    assert.equal(resolveFrontendBase(undefined), DESKTOP);
    assert.equal(resolveFrontendBase("http://evil.example"), DESKTOP);

    delete process.env.FRONTEND_MOBILE_URL;
    assert.equal(resolveFrontendBase("mobile"), DESKTOP);
});
