process.env.JWT_SECRET = "find-id-ratelimit-wiring-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
// F-29a(AC-05) 배선 전용 시험 — createRateLimiter 자체의 로직은 rateLimit.test.js가 순수
// 단위로, 정상/실패 응답 계약은 findId.api.test.js가 넉넉한 한도로 검증한다. 이 파일은 그
// 둘 사이의 빈틈, 즉 auth.routes.js가 실제로 제한기를 IP→검증→대상 순서로 연결했는지를
// 낮은 한도로 실제 HTTP 요청을 보내 확인한다. auth.routes.js가 require 시점에 환경변수를
// 읽으므로, 라우터를 require하기 전에 이 파일 전용 한도를 설정해야 한다.
process.env.FIND_ID_IP_MAX = "1000"; // IP 제한은 이 파일에서 검증하지 않는다 — 간섭을 없앤다.
process.env.FIND_ID_TARGET_MAX = "2";
process.env.FIND_ID_WINDOW_MS = "600000";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");
const db = require("../models");

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

const stubDb = (t) => {
    const originalFindOne = db.User.findOne;
    const originalCreate = db.AccountFindRequest.create;
    db.User.findOne = async () => null; // 항상 NOT_FOUND — 이 파일은 제한기 배선만 본다.
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

    // 형식이 잘못된 요청을 여러 번 보낸다 — 전부 400이고, 검증 미들웨어가 대상 제한기
    // 이전에 응답을 끝내므로 아래 대상 카운터에 영향을 주면 안 된다.
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
