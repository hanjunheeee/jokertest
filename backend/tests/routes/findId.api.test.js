process.env.JWT_SECRET = "find-id-api-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";
process.env.FIND_ID_IP_MAX = "1000";
process.env.FIND_ID_TARGET_MAX = "1000";

const test         = require("node:test");
const { mock }     = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const { notFoundHandler, globalErrorHandler } = require("../../middlewares/errorHandler");
const db = require("../../models");
const { maskEmail } = require("../../utils/maskEmail");

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

const stubDb = (t, { findOneImpl = async () => null, createImpl = async () => ({ id: 1 }) } = {}) => {
    const originalFindOne = db.User.findOne;
    const originalCreate = db.AccountFindRequest.create;
    const findOneCalls = [];
    const createCalls = [];

    db.User.findOne = async (...args) => { findOneCalls.push(args); return findOneImpl(...args); };
    db.AccountFindRequest.create = async (...args) => { createCalls.push(args); return createImpl(...args); };

    t.after(() => {
        db.User.findOne = originalFindOne;
        db.AccountFindRequest.create = originalCreate;
    });

    return { findOneCalls, createCalls };
};

const postJson = (base, path, body, extraHeaders = {}) =>
    fetch(`${base}${path}`, {
        method:  "POST",
        headers: { "content-type": "application/json", ...extraHeaders },
        body:    JSON.stringify(body ?? {}),
    });

const VALID_NICKNAME = "찾을닉네임";
const VALID_BIRTH_DATE = "2000-01-15";

test("닉네임·생년월일이 일치하면 200과 마스킹된 이메일 힌트만 응답한다(허용 키 외 없음)", async (t) => {
    const { createCalls, findOneCalls } = stubDb(t, {
        findOneImpl: async () => ({
            nickname: VALID_NICKNAME,
            email: "abc@example.com",
            birth_date: new Date(Date.UTC(2000, 0, 15)),
        }),
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME, birthDate: VALID_BIRTH_DATE });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["maskedEmail", "ok"]);
    assert.equal(body.ok, true);
    assert.equal(body.maskedEmail, maskEmail("abc@example.com"));
    assert.notEqual(body.maskedEmail, "abc@example.com");

    assert.equal(createCalls.length, 1, "조회 시도 자체를 기록해야 합니다");
    assert.equal(createCalls[0][0].email, null);
    assert.equal(createCalls[0][0].request_type, "FIND_ID");
    assert.equal(findOneCalls.length, 1);

    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.getSetCookie().length, 0, "아이디 찾기는 어떤 인증 쿠키도 발급하면 안 됩니다");
});

test("시(時)만 다른 같은 UTC 날짜는 일치로, 하루 전/후 날짜는 불일치로 판정한다", async (t) => {
    stubDb(t, {
        findOneImpl: async () => ({
            nickname: VALID_NICKNAME,
            email: "abc@example.com",
            birth_date: new Date(Date.UTC(2000, 0, 15, 23, 59, 59)),
        }),
    });
    const base = await startServer(t);

    const sameDay = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME, birthDate: "2000-01-15" });
    assert.equal((await sameDay.json()).ok, true);

    const dayBefore = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME, birthDate: "2000-01-14" });
    assert.equal((await dayBefore.json()).ok, false);

    const dayAfter = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME, birthDate: "2000-01-16" });
    assert.equal((await dayAfter.json()).ok, false);
});

test("계정 없음·생년월일 불일치·생년월일 미등록은 완전히 같은 응답을 돌려준다(AC-02)", async (t) => {
    const accountMissing = () => {
        stubDb(t, { findOneImpl: async () => null });
    };
    const dateMismatch = () => {
        stubDb(t, {
            findOneImpl: async () => ({
                nickname: VALID_NICKNAME, email: "abc@example.com", birth_date: new Date(Date.UTC(1999, 0, 1)),
            }),
        });
    };
    const dateMissing = () => {
        stubDb(t, {
            findOneImpl: async () => ({ nickname: VALID_NICKNAME, email: "abc@example.com", birth_date: null }),
        });
    };

    const base = await startServer(t);
    const responses = [];

    for (const setup of [accountMissing, dateMismatch, dateMissing]) {
        setup();
        const res = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME, birthDate: VALID_BIRTH_DATE });
        responses.push({ status: res.status, body: await res.json() });
    }

    for (const r of responses) {
        assert.equal(r.status, 200);
        assert.deepEqual(r.body, { ok: false, code: "NOT_FOUND" });
    }
});

test("DB 조회 기록(create) 실패는 원본 오류를 감추고 고정된 500으로 응답한다", async (t) => {
    stubDb(t, {
        createImpl: async () => {
            throw new Error("sensitive: SELECT * FROM users WHERE email='victim@example.com' failed, uuid=11111111-...");
        },
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME, birthDate: VALID_BIRTH_DATE });
    const bodyText = await res.text();

    assert.equal(res.status, 500);
    assert.deepEqual(JSON.parse(bodyText), { ok: false, code: "SERVER_ERROR" });
    assert.doesNotMatch(bodyText, /sensitive|victim@example\.com|SELECT|uuid=/i);
});

test("User 조회가 attributes 밖의 필드(uuid·phone 등)를 돌려줘도 응답에는 절대 섞이지 않는다", async (t) => {
    stubDb(t, {
        findOneImpl: async () => ({
            nickname: VALID_NICKNAME,
            email: "abc@example.com",
            birth_date: new Date(Date.UTC(2000, 0, 15)),
            uuid: "11111111-2222-3333-4444-555555555555",
            phone: "010-1234-5678",
            password_hash: "should-never-leak",
        }),
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME, birthDate: VALID_BIRTH_DATE });
    const bodyText = await res.text();

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(JSON.parse(bodyText)).sort(), ["maskedEmail", "ok"]);
    assert.doesNotMatch(bodyText, /1111-2222|010-1234-5678|should-never-leak|abc@example\.com/);
});

test("잘못된 JSON 본문은 원본 파싱 오류를 감추고 고정된 400 INVALID_INPUT으로 응답한다", async (t) => {
    const base = await startServer(t);

    const res = await fetch(`${base}/auth/find-id`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-valid-json",
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.deepEqual(body, { ok: false, code: "INVALID_INPUT" });
});

test("쿼리스트링·후행 슬래시가 붙은 /auth/find-id 변형도 잘못된 JSON 본문을 같은 고정 400으로 감춘다(로그도 무결)", async (t) => {
    const base = await startServer(t);

    const consoleErrorMock = mock.method(console, "error", () => {});
    t.after(() => consoleErrorMock.mock.restore());

    const sensitiveFragment = "leaked-secret-fragment-9f3c";
    const malformedBody = `{not-valid-json,"nickname":"${sensitiveFragment}"`;

    for (const path of ["/auth/find-id?x=1", "/auth/find-id/", "/auth/find-id/?x=1"]) {
        const res = await fetch(`${base}${path}`, {
            method:  "POST",
            headers: { "content-type": "application/json" },
            body:    malformedBody,
        });
        const bodyText = await res.text();

        assert.equal(res.status, 400, `${path}는 400이어야 합니다`);
        assert.deepEqual(JSON.parse(bodyText), { ok: false, code: "INVALID_INPUT" });
        assert.doesNotMatch(bodyText, new RegExp(sensitiveFragment));
    }

    const loggedText = consoleErrorMock.mock.calls
        .map((call) => call.arguments.map((arg) => String(arg)).join(" "))
        .join("\n");
    assert.doesNotMatch(loggedText, new RegExp(sensitiveFragment), "캡처한 로그에도 요청 본문 값이 없어야 합니다");
});

test("마스킹 힌트는 인증 토큰으로 쓸 수 없다 — 그 값을 accessToken 쿠키로 보내도 보호 라우트는 401이다", async (t) => {
    stubDb(t, {
        findOneImpl: async () => ({
            nickname: VALID_NICKNAME, email: "abc@example.com", birth_date: new Date(Date.UTC(2000, 0, 15)),
        }),
    });
    const base = await startServer(t);

    const findRes = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME, birthDate: VALID_BIRTH_DATE });
    const { maskedEmail } = await findRes.json();

    const meRes = await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${maskedEmail}` } });
    assert.equal(meRes.status, 401);
});

test("형식이 잘못된 입력(짧은 닉네임/이상한 날짜)은 400이고 DB를 전혀 건드리지 않는다", async (t) => {
    const { findOneCalls, createCalls } = stubDb(t);
    const base = await startServer(t);

    const shortNickname = await postJson(base, "/auth/find-id", { nickname: "a", birthDate: VALID_BIRTH_DATE });
    assert.equal(shortNickname.status, 400);
    assert.deepEqual(await shortNickname.json(), { ok: false, code: "INVALID_INPUT" });

    const badDate = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME, birthDate: "01-15-2000" });
    assert.equal(badDate.status, 400);
    assert.deepEqual(await badDate.json(), { ok: false, code: "INVALID_INPUT" });

    const missingField = await postJson(base, "/auth/find-id", { nickname: VALID_NICKNAME });
    assert.equal(missingField.status, 400);

    assert.equal(findOneCalls.length, 0, "검증에 실패한 요청은 서비스/DB까지 도달하면 안 됩니다");
    assert.equal(createCalls.length, 0);
});

test("8자를 넘는 닉네임(가입 상한 초과)도 형식 검증은 통과해 서비스까지 도달한다(AC-04)", async (t) => {
    const longNickname = "아홉글자닉네임아홉자";
    const { findOneCalls } = stubDb(t, {
        findOneImpl: async () => ({
            nickname: longNickname, email: "abc@example.com", birth_date: new Date(Date.UTC(2000, 0, 15)),
        }),
    });
    const base = await startServer(t);

    const res = await postJson(base, "/auth/find-id", { nickname: longNickname, birthDate: VALID_BIRTH_DATE });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(findOneCalls.length, 1, "8자 초과 닉네임도 검증을 통과해 실제 조회까지 가야 합니다");
});
