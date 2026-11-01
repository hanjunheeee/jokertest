process.env.JWT_SECRET = "session-guard-test-secret";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const crypto       = require("node:crypto");
const jwt          = require("jsonwebtoken");
const express      = require("express");
const cookieParser = require("cookie-parser");

const db = require("../../models");
const { generateToken } = require("../../utils/auth/credentials");
const { notFoundHandler, globalErrorHandler } = require("../../middlewares/errorHandler.middleware");

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/auth", require("../../routes/auth.routes"));
    app.use("/user", require("../../routes/user.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));

    return `http://127.0.0.1:${server.address().port}`;
};

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

test("활성 밴은 이미 로그인된 토큰도 다음 REST 요청에서 403으로 막고, 전체 세션을 영구 폐기한다", async (t) => {
    const originalSession = db.UserSession;
    const originalBan = db.UserBan;
    const updateCalls = [];
    db.UserSession = {
        findOne: async () => ({ id: "session-1", user_id: "uuid-1", is_online: true }),
        update: async (values, options) => { updateCalls.push({ values, options }); return [1]; },
    };
    db.UserBan = { findOne: async () => ({ reason: "운영 정지" }) };
    t.after(() => { db.UserSession = originalSession; db.UserBan = originalBan; });

    const base = await startServer(t);
    const res = await authGet(base, "/auth/me", tokenFor("session-1"));
    const body = await res.json();

    assert.equal(res.status, 403);
    assert.match(body.message, /운영 정지/);
    assert.equal(updateCalls.length, 1, "밴 감지 시 세션 전체 폐기(UPDATE)가 실행되어야 밴 해제 후에도 복원되지 않습니다");
    assert.equal(updateCalls[0].values.is_online, false);
    assert.ok(updateCalls[0].values.revoked_at instanceof Date);
});

const findSessionRefreshWhereHash = (where) => {
    const { Op } = db.Sequelize;
    const orClauses = where?.[Op.or];
    if (!orClauses) return undefined;
    return orClauses[0]?.refresh_token_hash ?? orClauses[1]?.refresh_previous_hash;
};

const stubRefreshableSession = (t, session) => {
    const original = { UserSession: db.UserSession, User: db.User, UserBan: db.UserBan, transaction: db.sequelize.transaction };

    db.sequelize.transaction = async (work) => work({ LOCK: { UPDATE: "UPDATE" } });
    db.User = { findOne: async () => ({ uuid: session.user_id, role: "USER" }) };
    db.UserBan = { findOne: async () => null };
    db.UserSession = {
        findOne: async ({ where }) => {
            const presentedHash = findSessionRefreshWhereHash(where);
            if (presentedHash !== undefined) {
                const matched = presentedHash === session.refresh_token_hash
                    || (session.refresh_previous_hash && presentedHash === session.refresh_previous_hash);
                return matched ? { ...session } : null;
            }
            if (where.id !== session.id) return null;
            if (where.revoked_at === null && session.revoked_at) return null;
            if (where.is_online === true && session.is_online !== true) return null;
            return { ...session };
        },
        update: async (values) => { Object.assign(session, values); return [1]; },
    };

    t.after(() => {
        db.UserSession = original.UserSession;
        db.User = original.User;
        db.UserBan = original.UserBan;
        db.sequelize.transaction = original.transaction;
    });
};

test("F-03 실제 Chrome 재현: 만료된 액세스 토큰의 401 응답은 accessToken 쿠키를 지우지 않는다", async (t) => {
    stubSessions(t, async ({ where }) => ({ id: where.id, user_id: "uuid-1", is_online: true }));
    const base = await startServer(t);

    const expiredToken = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-1" }, { expiresIn: -10 });
    const res = await authGet(base, "/auth/me", expiredToken);
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.code, "ACCESS_TOKEN_EXPIRED", "만료가 아닌 다른 사유로 401이 나면 이 회귀와 무관합니다");

    const setCookies = res.headers.getSetCookie();
    assert.equal(
        setCookies.some((c) => c.startsWith("accessToken=")),
        false,
        "만료 응답이 accessToken 쿠키를 지우면, 갱신이 끝나기 전 도착하는 동시 요청이 쿠키 없음 상태로 떨어져 " +
        "정상 갱신 자격이 남아있어도 전역 로그아웃 경쟁에서 집니다(F-03 실제 Chrome 재현)",
    );
});

test("서명이 위조되거나 형식이 잘못된 토큰은 여전히 accessToken 쿠키를 지운다(복구 불가능한 오류는 그대로 정리)", async (t) => {
    stubSessions(t, async () => null);
    const base = await startServer(t);

    const foreignToken = jwt.sign({ uuid: "uuid-1" }, "다른-비밀키");
    const res = await authGet(base, "/auth/me", foreignToken);
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.code, undefined, "위조 토큰은 갱신 대상이 아니므로 code가 없어야 합니다");

    const setCookies = res.headers.getSetCookie();
    assert.ok(
        setCookies.some((c) => c.startsWith("accessToken=")),
        "복구 불가능한 오류(서명 위조·형식 오류)는 쿠키를 지워 무의미한 갱신 재시도를 막아야 합니다",
    );
});

test("F-03 실제 Chrome 재현: 만료 응답 이후에도 쿠키가 남아 있어 동시/후속 요청이 계속 복구 가능한 코드를 받고, 갱신 후 정상 API가 복원되며, 새 자격 발급 이후 도착한 늦은 만료 응답도 그 새 쿠키를 건드리지 않는다", async (t) => {
    const now = new Date();
    const rawRefreshToken = "race-recovery-raw-refresh-token";
    const session = {
        id: "session-race",
        user_id: "uuid-1",
        is_online: true,
        revoked_at: null,
        refresh_token_hash: crypto.createHash("sha256").update(rawRefreshToken).digest("hex"),
        refresh_previous_hash: null,
        refresh_previous_expires_at: null,
        refresh_token_expires_at: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
    };
    stubRefreshableSession(t, session);
    const base = await startServer(t);

    const expiredToken = generateToken({ uuid: "uuid-1", role: "USER", sessionId: session.id }, { expiresIn: -10 });

    const first = await authGet(base, "/auth/me", expiredToken);
    assert.equal(first.status, 401);
    assert.equal((await first.json()).code, "ACCESS_TOKEN_EXPIRED");
    assert.equal(first.headers.getSetCookie().some((c) => c.startsWith("accessToken=")), false);

    const concurrent = await authGet(base, "/auth/me", expiredToken);
    assert.equal(concurrent.status, 401);
    assert.equal((await concurrent.json()).code, "ACCESS_TOKEN_EXPIRED",
        "동시 요청이 쿠키 없음 상태로 떨어지면 code 없는 401을 받아 전역 로그아웃이 먼저 발생합니다");

    const refreshRes = await fetch(`${base}/auth/refresh`, {
        method: "POST",
        headers: { cookie: `refreshToken=${rawRefreshToken}` },
    });
    assert.equal(refreshRes.status, 200);
    const newAccessCookie = refreshRes.headers.getSetCookie().find((c) => c.startsWith("accessToken="));
    assert.ok(newAccessCookie, "갱신 성공 시 새 accessToken 쿠키가 발급되어야 합니다");
    const newAccessToken = newAccessCookie.match(/^accessToken=([^;]*)/)[1];

    const restored = await authGet(base, "/auth/me", newAccessToken);
    assert.equal(restored.status, 200, "갱신 성공 후에는 실제 API 응답이 복원되어야 합니다");
    assert.deepEqual((await restored.json()).data, { uuid: "uuid-1", role: "USER" });

    const late = await authGet(base, "/auth/me", expiredToken);
    assert.equal(late.status, 401);
    assert.equal(late.headers.getSetCookie().some((c) => c.startsWith("accessToken=")), false,
        "새 자격 발급 이후 도착한 늦은 만료 응답이 쿠키를 지우면, 브라우저의 새 accessToken 쿠키를 되돌릴 수 있습니다");

    session.revoked_at = new Date();
    session.is_online = false;

    const afterRevoke = await authGet(base, "/auth/me", newAccessToken);
    assert.equal(afterRevoke.status, 401, "세션이 폐기된 뒤에는 방금 발급받은 자격도 거부되어야 합니다");

    const refreshAfterRevoke = await fetch(`${base}/auth/refresh`, {
        method: "POST",
        headers: { cookie: `refreshToken=${rawRefreshToken}` },
    });
    assert.equal(refreshAfterRevoke.status, 401, "세션이 폐기된 뒤에는 갱신도 거부되어야 합니다(확정 로그아웃)");
});
