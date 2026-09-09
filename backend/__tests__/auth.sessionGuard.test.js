// JWT_SECRET은 generateToken/verifyToken이 호출 시점에 읽으므로 require보다 먼저면 됩니다.
process.env.JWT_SECRET = "session-guard-test-secret";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const db = require("../models");
const { generateToken } = require("../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");

// index.js와 같은 순서로 미들웨어를 붙여, 라우트 → verifyToken → globalErrorHandler까지
// 실제 요청 경로 그대로 상태 코드를 확인합니다.
const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/auth", require("../routes/auth.routes"));
    app.use("/user", require("../routes/user.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));

    return `http://127.0.0.1:${server.address().port}`;
};

// 이 테스트에서 쓰이는 메서드만 가진 대체 객체를 꽂습니다. Sequelize 모델은 클래스라
// 스프레드로 복제되지 않으므로, 흉내내는 척하지 않고 필요한 것만 정의합니다.
const stubSessions = (t, findOne) => {
    const original = db.UserSession;
    const originalBan = db.UserBan;
    db.UserSession = { findOne };
    db.UserBan = { findOne: async () => null };
    t.after(() => { db.UserSession = original; db.UserBan = originalBan; });
};

const authGet = (base, path, token) =>
    fetch(`${base}${path}`, { headers: token ? { cookie: `accessToken=${token}` } : {} });

const tokenFor = (sessionId) => generateToken({ uuid: "uuid-1", role: "USER", sessionId });

test("is_online:false 세션의 토큰은 서명이 유효해도 401이다", async (t) => {
    stubSessions(t, async ({ where }) => ({ id: where.id, user_id: "uuid-1", is_online: false }));
    const base = await startServer(t);

    const res  = await authGet(base, "/auth/me", tokenFor("session-offline"));
    const body = await res.json();

    assert.equal(res.status, 401, "내려간 세션이 토큰 만료까지 통과하고 있습니다");
    assert.equal(body.success, false);
});

test("세션 행이 아예 없는 토큰도 401이다", async (t) => {
    stubSessions(t, async () => null);
    const base = await startServer(t);

    assert.equal((await authGet(base, "/auth/me", tokenFor("gone"))).status, 401);
});

test("sessionId 클레임이 없는 토큰은 401이다", async (t) => {
    let lookups = 0;
    stubSessions(t, async () => { lookups += 1; return null; });
    const base = await startServer(t);

    const token = generateToken({ uuid: "uuid-1", role: "USER" });
    assert.equal((await authGet(base, "/auth/me", token)).status, 401);
    assert.equal(lookups, 0, "sessionId가 없으면 DB를 조회할 필요가 없습니다");
});

test("is_online:true 세션이면 기존처럼 통과한다", async (t) => {
    stubSessions(t, async ({ where }) => {
        assert.deepEqual(where, { id: "session-online", user_id: "uuid-1", is_online: true, revoked_at: null });
        return { id: where.id, user_id: where.user_id, is_online: true };
    });
    const base = await startServer(t);

    const res  = await authGet(base, "/auth/me", tokenFor("session-online"));
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body.data, { uuid: "uuid-1", role: "USER" });
});

test("is_online을 1/0으로 돌려주는 드라이버에서도 판정이 뒤집히지 않는다", async (t) => {
    stubSessions(t, async ({ where }) => ({ id: where.id, is_online: where.id === "on" ? 1 : 0 }));
    const base = await startServer(t);

    assert.equal((await authGet(base, "/auth/me", tokenFor("on"))).status, 200);
    assert.equal((await authGet(base, "/auth/me", tokenFor("off"))).status, 401);
});

test("쿠키가 없으면 세션 조회 없이 401이다", async (t) => {
    let lookups = 0;
    stubSessions(t, async () => { lookups += 1; return null; });
    const base = await startServer(t);

    const res = await authGet(base, "/auth/me", null);
    assert.equal(res.status, 401);
    assert.equal(lookups, 0);
});

test("세션 조회가 DB 오류로 실패하면 401이 아니라 5xx로 올라간다", async (t) => {
    // DB 장애를 401로 바꾸면 접속자 전원이 로그아웃되고 진짜 원인이 가려집니다.
    stubSessions(t, async () => { throw new Error("ETIMEDOUT"); });
    const base = await startServer(t);

    const res = await authGet(base, "/auth/me", tokenFor("session-1"));
    assert.equal(res.status, 500);
});

test("로그아웃 흐름은 회귀 없이 동작한다", async (t) => {
    const originalSession = db.UserSession;
    const originalHistory = db.LoginHistory;
    const originalBan = db.UserBan;
    const updates = [];
    const sessions = new Map([
        ["session-1", { id: "session-1", user_id: "uuid-1", is_online: true }],
        ["session-2", { id: "session-2", user_id: "uuid-1", is_online: true }],
    ]);

    db.UserSession = {
        findOne: async ({ where }) => sessions.get(where.id) ?? null,
        update:  async (values, options) => {
            updates.push({ values, options });
            const session = sessions.get(options.where.id);
            if (!session || session.user_id !== options.where.user_id || session.is_online !== true) return [0];
            Object.assign(session, values);
            return [1];
        },
    };
    db.LoginHistory = { findOne: async () => null };
    db.UserBan = { findOne: async () => null };
    t.after(() => {
        db.UserSession = originalSession;
        db.LoginHistory = originalHistory;
        db.UserBan = originalBan;
    });

    const base = await startServer(t);
    const res  = await fetch(`${base}/auth/logout`, {
        method:  "POST",
        headers: { cookie: `accessToken=${tokenFor("session-1")}` },
    });

    assert.equal(res.status, 200);
    assert.equal((await res.json()).success, true);
    assert.equal(updates.at(-1).values.is_online, false);
    assert.ok(updates.at(-1).values.revoked_at instanceof Date, "로그아웃은 revoked_at도 기록해야 갱신 자격도 함께 막힙니다");
    assert.deepEqual(updates.at(-1).options.where, {
        id: "session-1",
        user_id: "uuid-1",
        is_online: true,
    });
    assert.equal(sessions.get("session-1").is_online, false);
    assert.equal(sessions.get("session-2").is_online, true, "다른 유효 세션까지 종료하면 안 됩니다");
});

test("활성 밴은 이미 로그인된 토큰도 다음 REST 요청에서 403으로 막는다", async (t) => {
    const originalSession = db.UserSession;
    const originalBan = db.UserBan;
    db.UserSession = { findOne: async () => ({ id: "session-1", user_id: "uuid-1", is_online: true }) };
    db.UserBan = { findOne: async () => ({ reason: "운영 정지" }) };
    t.after(() => { db.UserSession = originalSession; db.UserBan = originalBan; });

    const base = await startServer(t);
    const res = await authGet(base, "/auth/me", tokenFor("session-1"));
    const body = await res.json();

    assert.equal(res.status, 403);
    assert.match(body.message, /운영 정지/);
});
