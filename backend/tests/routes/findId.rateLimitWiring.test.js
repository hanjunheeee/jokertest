process.env.JWT_SECRET = "find-id-ratelimit-wiring-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.FIND_ID_IP_MAX = "1000";
process.env.FIND_ID_TARGET_MAX = "2";
process.env.FIND_ID_WINDOW_MS = "600000";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const { notFoundHandler, globalErrorHandler } = require("../../middleware/errorHandler");
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

const postJson = (base, body) => fetch(`${base}/auth/find-id`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
});

test("같은 닉네임(대상)으로 FIND_ID_TARGET_MAX(2)회를 넘기면 3번째부터 429다", async (t) => {
    stubDb(t);
    const base = await startServer(t);

    const first = await postJson(base, { nickname: "대상제한테스트", birthDate: "2000-01-01" });
    const second = await postJson(base, { nickname: "대상제한테스트", birthDate: "2000-01-01" });
    const third = await postJson(base, { nickname: "대상제한테스트", birthDate: "2000-01-01" });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.deepEqual(await third.json(), { ok: false, code: "RATE_LIMITED" });
});

test("검증에 실패한 요청은 대상 제한기에 도달하지 않으므로 카운트에 섞이지 않는다", async (t) => {
    stubDb(t);
    const base = await startServer(t);

    for (let i = 0; i < 5; i += 1) {
        const invalid = await postJson(base, { nickname: "a", birthDate: "not-a-date" });
        assert.equal(invalid.status, 400);
    }

    const first = await postJson(base, { nickname: "검증실패무관", birthDate: "2000-01-01" });
    const second = await postJson(base, { nickname: "검증실패무관", birthDate: "2000-01-01" });
    assert.equal(first.status, 200, "검증 실패 요청이 대상 제한 카운트를 먼저 채우면 안 됩니다");
    assert.equal(second.status, 200);

    const third = await postJson(base, { nickname: "검증실패무관", birthDate: "2000-01-01" });
    assert.equal(third.status, 429, "실제 유효 요청 2회 뒤에는 여전히 max(2)에서 막혀야 합니다");
});

test("다른 대상(닉네임)은 서로 독립적으로 제한된다", async (t) => {
    stubDb(t);
    const base = await startServer(t);

    for (const nickname of ["독립대상하나", "독립대상둘"]) {
        const first = await postJson(base, { nickname, birthDate: "2000-01-01" });
        const second = await postJson(base, { nickname, birthDate: "2000-01-01" });
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
    }
});
