process.env.JWT_SECRET = "profile-password-test-secret";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");
const bcrypt        = require("bcrypt");

const db = require("../models");
const { generateToken } = require("../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");

const TOKEN = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-1" });
const CURRENT_PASSWORD = "current-pw-123";

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/user", require("../routes/user.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));

    return `http://127.0.0.1:${server.address().port}`;
};

const patchPassword = (base, body) =>
    fetch(`${base}/user/me/password`, {
        method:  "PATCH",
        headers: { "content-type": "application/json", cookie: `accessToken=${TOKEN}` },
        body:    JSON.stringify(body),
    });

const getProfile = (base) =>
    fetch(`${base}/user/me/profile`, { headers: { cookie: `accessToken=${TOKEN}` } });

// transaction은 work가 끝까지 성공해야만 staged 변경을 committed 상태(passwordHash,
// sessions)에 반영한다. work가 던지면 staged는 버려져 아무 것도 committed에 닿지 않는다 —
// 그래야 "폐기가 실패하면 비밀번호도 커밋되지 않는다(원자성, F-03 A-04)"와 "성공하면 같은
// 세션이 다음 요청부터 거부된다(재로그인 요구, AC-04)"를 둘 다 관찰할 수 있다.
const setupFakeDb = (t, { markOfflineFails = false } = {}) => {
    const original = {
        transaction: db.sequelize.transaction,
        User:        db.User,
        UserSession: db.UserSession,
        UserBan:     db.UserBan,
    };

    let passwordHash = bcrypt.hashSync(CURRENT_PASSWORD, 4);
    const sessions = new Map([
        ["session-1", { id: "session-1", user_id: "uuid-1", is_online: true }],
    ]);

    const calls = [];
    let staged = null;

    db.sequelize.transaction = async (work) => {
        staged = { passwordHash: null, revokedIds: [] };
        // profile.controller.js가 유저 행을 FOR UPDATE로 잠근 채 비밀번호를 확인한다
        // (F-03 R-IMPL #7: 동시 로그인과의 직렬화) — LOCK.UPDATE 참조가 필요하다.
        const tx = { id: "tx-1", LOCK: { UPDATE: "UPDATE" } };
        const result = await work(tx);
        if (staged.passwordHash !== null) passwordHash = staged.passwordHash;
        for (const id of staged.revokedIds) {
            const session = sessions.get(id);
            if (session) session.is_online = false;
        }
        staged = null;
        return result;
    };

    db.User = {
        findOne: async () => ({ uuid: "uuid-1", password_hash: passwordHash }),
        update: async (values, options) => {
            calls.push({ name: "User.update", values, options });
            assert.ok(staged, "User.update이 트랜잭션 밖에서 실행되었습니다");
            assert.ok(options?.transaction, "updateUser에 transaction 옵션이 전달되지 않았습니다");
            staged.passwordHash = values.password_hash;
            return [1];
        },
    };

    db.UserSession = {
        findOne: async ({ where }) => {
            const session = sessions.get(where.id);
            if (!session || session.user_id !== where.user_id || session.is_online !== where.is_online) return null;
            return { ...session };
        },
        update: async (values, options) => {
            calls.push({ name: "UserSession.update", values, options });
            assert.ok(staged, "UserSession.update이 트랜잭션 밖에서 실행되었습니다");
            assert.ok(options?.transaction, "markOnlineSessionsOffline에 transaction 옵션이 전달되지 않았습니다");
            if (markOfflineFails) throw new Error("세션 폐기 실패");
            const revoked = [];
            for (const [id, session] of sessions) {
                if (session.user_id === options.where.user_id && session.is_online === true) revoked.push(id);
            }
            staged.revokedIds.push(...revoked);
            return [revoked.length];
        },
    };

    db.UserBan = { findOne: async () => null };

    t.after(() => {
        db.sequelize.transaction = original.transaction;
        db.User        = original.User;
        db.UserSession = original.UserSession;
        db.UserBan     = original.UserBan;
    });

    return { calls, sessions, getPasswordHash: () => passwordHash };
};

test("비밀번호 변경 성공 시 새 비밀번호와 세션 전체 폐기가 같은 트랜잭션으로 커밋된다", async (t) => {
    const { calls, sessions, getPasswordHash } = setupFakeDb(t);
    const base = await startServer(t);

    const res  = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(await bcrypt.compare("new-pw-456", getPasswordHash()));
    assert.equal(sessions.get("session-1").is_online, false, "F-03 AC-04: 비밀번호 변경 전 세션이 폐기되어야 합니다");

    const userUpdate    = calls.find((c) => c.name === "User.update");
    const sessionUpdate = calls.find((c) => c.name === "UserSession.update");
    assert.equal(
        userUpdate.options.transaction, sessionUpdate.options.transaction,
        "비밀번호 갱신과 세션 폐기가 같은 트랜잭션으로 묶이지 않았습니다",
    );
});

test("세션 폐기가 실패하면 비밀번호 변경도 커밋되지 않는다(원자성)", async (t) => {
    const { sessions, getPasswordHash } = setupFakeDb(t, { markOfflineFails: true });
    const base = await startServer(t);

    const res = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });

    assert.equal(res.status, 500, "폐기 실패가 삼켜지고 성공 응답이 나가면 안 됩니다");
    assert.ok(
        await bcrypt.compare(CURRENT_PASSWORD, getPasswordHash()),
        "폐기가 실패했는데 비밀번호만 바뀌면 원자성이 깨집니다",
    );
    assert.equal(sessions.get("session-1").is_online, true);
});

test("현재 비밀번호가 틀리면 트랜잭션은 열리지만(동시 로그인과의 잠금 직렬화) 아무 것도 쓰지 않는다", async (t) => {
    // F-03 R-IMPL #7: login()도 같은 유저 행을 FOR UPDATE로 잠그고 최신 password_hash로
    // 비교해야 하므로, 비밀번호 확인 자체가 이 잠금 안에서 일어나야 한다 — "확인이 트랜잭션
    // 밖에서 끝난다"는 이전 가정은 그 직렬화를 무력화한다. 대신 확인만으로는 어떤 UPDATE도
    // 실행되지 않아야 한다(원자성 유지).
    const { calls } = setupFakeDb(t);
    const base = await startServer(t);

    const original = db.sequelize.transaction;
    let opened = false;
    db.sequelize.transaction = async (work) => { opened = true; return original(work); };
    t.after(() => { db.sequelize.transaction = original; });

    const res = await patchPassword(base, { currentPassword: "wrong", newPassword: "new-pw-456" });

    assert.equal(res.status, 401);
    assert.equal(opened, true, "비밀번호 확인도 동시 로그인과 직렬화되도록 유저 행을 잠근 트랜잭션 안에서 일어나야 합니다");
    assert.equal(calls.length, 0, "비밀번호가 틀리면 User.update/UserSession.update 중 어느 것도 실행되면 안 됩니다");
});

test("비밀번호 변경 이후 같은 세션의 accessToken으로는 보호 요청이 거부된다(재로그인 요구)", async (t) => {
    setupFakeDb(t);
    const base = await startServer(t);

    const changeRes = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    assert.equal(changeRes.status, 200);

    const profileRes = await getProfile(base);
    assert.equal(profileRes.status, 401, "비밀번호 변경 이후 이전 세션 토큰은 거부되어야 합니다");
});
