process.env.JWT_SECRET = "find-id-ip-ratelimit-wiring-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
// F-29a(AC-05) IP 제한 배선 전용 시험 — findId.rateLimitWiring.test.js는 대상(닉네임) 제한
// 배선만 보려고 IP 한도를 1000으로 올려 IP 제한 자체는 검증하지 않는다. 이 파일은 그 반대로
// 대상 한도를 넉넉히 올리고 IP 한도만 낮게 잡아, auth.routes.js가 실제로 req.ip 기반 IP
// 제한을 연결했는지(초과 시 429)와, X-Forwarded-For 헤더를 바꿔도 같은 연결의 요청이 같은
// 키로 세어지는지(우회 불가)를 실제 HTTP 요청으로 확인한다. auth.routes.js가 require
// 시점에 환경변수를 읽으므로 라우터를 require하기 전에 설정해야 한다.
process.env.FIND_ID_IP_MAX = "3";
process.env.FIND_ID_TARGET_MAX = "1000";
process.env.FIND_ID_WINDOW_MS = "600000";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");
const db = require("../models");

// 실제 backend/index.js와 같은 `trust proxy` 설정을 일부러 두지 않는다 — Express 기본값
// (trust proxy 미설정)에서는 req.ip가 X-Forwarded-For를 절대 읽지 않고 소켓의 실제 연결
// 주소만 쓴다. 예전 getClientIp 기반 키는 이 설정과 무관하게 X-Forwarded-For 첫 값을
// 무조건 신뢰했으므로, 아래 "헤더를 바꿔도 우회되지 않는다" 시험은 req.ip로 바뀐 실제
// 동작을 그대로 검증한다.
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

const postJson = (base, body, extraHeaders = {}) => fetch(`${base}/auth/find-id`, {
    method:  "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body:    JSON.stringify(body ?? {}),
});

// 두 관심사(① 실제 배선에서 IP 한도 초과가 429가 되는가, ② X-Forwarded-For를 바꿔도
// 우회되지 않는가)를 한 시험 안에서 이어서 확인한다 — 이 파일의 IP 제한기는
// auth.routes.js가 require 시점에 한 번만 만드는 모듈 싱글턴이라, 같은 프로세스 안의
// 다른 test()로 쪼개면 앞선 test가 이미 소비한 카운트가 뒤 test의 판정을 오염시킨다.
test("실제 라우터 배선에서 IP 한도(FIND_ID_IP_MAX=3) 초과는 429이고, X-Forwarded-For를 바꿔도 그 429는 풀리지 않는다", async (t) => {
    stubDb(t);
    const base = await startServer(t);

    // 매번 다른 닉네임을 써서 대상(닉네임) 제한과 섞이지 않게 한다 — 이 시험은 IP 키만 본다.
    for (let i = 0; i < 3; i += 1) {
        const res = await postJson(base, { nickname: `IP한도시험${i}`, birthDate: "2000-01-01" });
        assert.equal(res.status, 200, `${i + 1}번째 요청은 통과해야 합니다`);
    }

    const fourth = await postJson(base, { nickname: "IP한도시험넷", birthDate: "2000-01-01" });
    assert.equal(fourth.status, 429);
    assert.deepEqual(await fourth.json(), { ok: false, code: "RATE_LIMITED" });

    // 이미 한도를 넘긴 같은 연결에서, 매 요청마다 다른 X-Forwarded-For를 실어 보낸다. 예전
    // getClientIp 기반 키였다면 이 헤더만으로 서로 다른 IP처럼 취급되어 한도가 풀렸다 —
    // req.ip 기반 키는 (trust proxy 미설정인 이 시험 서버에서도) 이 헤더를 무시하고 같은
    // 소켓 연결을 같은 키로 세므로 계속 429여야 한다.
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
