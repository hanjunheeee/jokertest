process.env.JWT_SECRET = "find-id-ip-ratelimit-wiring-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.FIND_ID_IP_MAX = "3";
process.env.FIND_ID_TARGET_MAX = "1000";
process.env.FIND_ID_WINDOW_MS = "600000";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const { notFoundHandler, globalErrorHandler } = require("../../middlewares/errorHandler.middleware");
const db = require("../../models");

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

const stubDb = (t) => {
    const originalFindOne = db.User.findOne;
    const originalCreate = db.AccountFindRequest.create;
    db.User.findOne = async () => null;
    db.AccountFindRequest.create = async () => ({ id: 1 });
    t.after(() => {
        db.User.findOne = originalFindOne;
        db.AccountFindRequest.create = originalCreate;
    });
};

const postJson = (base, body, extraHeaders = {}) => fetch(`${base}/auth/find-id`, {
    method:  "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body:    JSON.stringify(body ?? {}),
});

test("실제 라우터 배선에서 IP 한도(FIND_ID_IP_MAX=3) 초과는 429이고, X-Forwarded-For를 바꿔도 그 429는 풀리지 않는다", async (t) => {
    stubDb(t);
    const base = await startServer(t);

    for (let i = 0; i < 3; i += 1) {
        const res = await postJson(base, { nickname: `IP한도시험${i}`, birthDate: "2000-01-01" });
        assert.equal(res.status, 200, `${i + 1}번째 요청은 통과해야 합니다`);
    }

    const fourth = await postJson(base, { nickname: "IP한도시험넷", birthDate: "2000-01-01" });
    assert.equal(fourth.status, 429);
    assert.deepEqual(await fourth.json(), { ok: false, code: "RATE_LIMITED" });

    for (const [i, xff] of ["10.0.0.1", "203.0.113.99", "198.51.100.7"].entries()) {
        const res = await postJson(
            base,
            { nickname: `헤더위조시험${i}`, birthDate: "2000-01-01" },
            { "x-forwarded-for": xff },
        );
        assert.equal(res.status, 429, `X-Forwarded-For=${xff}로 바꿔도 같은 연결이면 여전히 막혀야 합니다`);
        assert.deepEqual(await res.json(), { ok: false, code: "RATE_LIMITED" });
    }
});
