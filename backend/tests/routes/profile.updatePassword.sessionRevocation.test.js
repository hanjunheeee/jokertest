process.env.JWT_SECRET = "profile-password-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");
const bcrypt        = require("bcrypt");
const crypto         = require("node:crypto");

const db = require("../../models");
const { generateToken } = require("../../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../../middlewares/errorHandler");
const authService  = require("../../services/auth/account");
const socketLayer  = require("../../socket/socket");

const { Op } = db.Sequelize;

const TOKEN = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-1" });
const SESSION_2_TOKEN = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-2" });
const CURRENT_PASSWORD = "current-pw-123";
const ACCOUNT_EMAIL = "account-holder@example.com";

const RAW_REFRESH_TOKEN = "test-raw-refresh-token-before-password-change";
const REFRESH_TOKEN_HASH = crypto.createHash("sha256").update(RAW_REFRESH_TOKEN).digest("hex");
const RAW_REFRESH_TOKEN_2 = "test-raw-refresh-token-2-before-password-change";
const REFRESH_TOKEN_HASH_2 = crypto.createHash("sha256").update(RAW_REFRESH_TOKEN_2).digest("hex");

const FETCH_BAD_PORTS = new Set([1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513,
    514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
    3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);

const closeServer = (server) => {
    server.closeAllConnections?.();
    return new Promise((resolve) => server.close(resolve));
};

const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/user", require("../../routes/user.routes"));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    let server;
    for (;;) {
        server = app.listen(0, "127.0.0.1");
        await once(server, "listening");
        if (!FETCH_BAD_PORTS.has(server.address().port)) break;
        await closeServer(server);
    }
    t.after(() => closeServer(server));

    return `http://127.0.0.1:${server.address().port}`;
};

const patchPassword = (base, body) =>
    fetch(`${base}/user/me/password`, {
        method:  "PATCH",
        headers: { "content-type": "application/json", cookie: `accessToken=${TOKEN}`, Connection: "close" },
        body:    JSON.stringify(body),
    });

const getProfile = (base) =>
    fetch(`${base}/user/me/profile`, { headers: { cookie: `accessToken=${TOKEN}`, Connection: "close" } });

const setupFakeDb = (t, { markOfflineFails = false } = {}) => {
    const original = {
        transaction:  db.sequelize.transaction,
        User:         db.User,
        UserSession:  db.UserSession,
        UserBan:      db.UserBan,
        LoginHistory: db.LoginHistory,
    };

    let passwordHash = bcrypt.hashSync(CURRENT_PASSWORD, 4);
    const FUTURE_EXPIRY = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const sessions = new Map([
        ["session-1", {
            id: "session-1", user_id: "uuid-1", is_online: true, revoked_at: null,
            refresh_token_hash: REFRESH_TOKEN_HASH, refresh_previous_hash: null,
            refresh_token_expires_at: FUTURE_EXPIRY,
        }],
        ["session-2", {
            id: "session-2", user_id: "uuid-1", is_online: true, revoked_at: null,
            refresh_token_hash: REFRESH_TOKEN_HASH_2, refresh_previous_hash: null,
            refresh_token_expires_at: FUTURE_EXPIRY,
        }],
    ]);

    const calls = [];
    let staged = null;

    db.sequelize.transaction = async (work) => {
        staged = { passwordHash: null, revokedIds: [], newSessions: [] };
        const tx = { id: "tx-1", LOCK: { UPDATE: "UPDATE" } };
        const result = await work(tx);
        if (staged.passwordHash !== null) passwordHash = staged.passwordHash;
        for (const id of staged.revokedIds) {
            const session = sessions.get(id);
            if (session) { session.is_online = false; session.revoked_at = new Date(); }
        }
        for (const session of staged.newSessions) sessions.set(session.id, session);
        staged = null;
        return result;
    };

    db.User = {
        findOne: async ({ where } = {}) => {
            if (where?.email) {
                if (where.email !== ACCOUNT_EMAIL) return null;
                return {
                    uuid: "uuid-1", email: ACCOUNT_EMAIL, role: "USER",
                    password_hash: passwordHash, failed_login_count: 0, locked_until: null,
                };
            }
            return { uuid: "uuid-1", role: "USER", password_hash: passwordHash };
        },
        update: async (values, options) => {
            calls.push({ name: "User.update", values, options });
            assert.ok(staged, "User.update이 트랜잭션 밖에서 실행되었습니다");
            assert.ok(options?.transaction, "updateUser에 transaction 옵션이 전달되지 않았습니다");
            if (Object.prototype.hasOwnProperty.call(values, "password_hash")) {
                staged.passwordHash = values.password_hash;
            }
            return [1];
        },
    };

    db.UserSession = {
        findOne: async ({ where }) => {
            if (where[Op.or]) {
                const hash = where[Op.or][0]?.refresh_token_hash;
                for (const session of sessions.values()) {
                    if (session.refresh_token_hash === hash || session.refresh_previous_hash === hash) {
                        return { ...session };
                    }
                }
                return null;
            }
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
        create: async (sessionData) => {
            calls.push({ name: "UserSession.create", sessionData });
            assert.ok(staged, "createUserSession이 트랜잭션 밖에서 실행되었습니다");
            staged.newSessions.push({ ...sessionData, revoked_at: null });
            return { ...sessionData };
        },
    };

    db.UserBan = { findOne: async () => null };
    db.LoginHistory = { create: async () => ({}) };

    t.after(() => {
        db.sequelize.transaction = original.transaction;
        db.User         = original.User;
        db.UserSession  = original.UserSession;
        db.UserBan      = original.UserBan;
        db.LoginHistory = original.LoginHistory;
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
    assert.equal(sessions.get("session-2").is_online, false, "F-04 AC-05: session-1이 아닌 다른 기존 온라인 세션도 함께 폐기되어야 합니다");

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

test("F-04 AC-04: 새 비밀번호가 8자 미만이면 트랜잭션을 열지 않고 400으로 거부된다", async (t) => {
    const { calls, sessions, getPasswordHash } = setupFakeDb(t);
    const base = await startServer(t);

    const res  = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "short" });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.equal(calls.length, 0, "정책 위반 새 비밀번호는 해시·세션 쓰기로 이어지면 안 됩니다");
    assert.ok(await bcrypt.compare(CURRENT_PASSWORD, getPasswordHash()), "비밀번호 해시가 그대로 유지되어야 합니다");
    assert.equal(sessions.get("session-1").is_online, true, "세션이 폐기되면 안 됩니다");
});

test("F-04 AC-04: 새 비밀번호가 bcrypt 72바이트를 넘으면 400으로 거부된다", async (t) => {
    const tooManyBytes = "가".repeat(25);
    const { calls, sessions, getPasswordHash } = setupFakeDb(t);
    const base = await startServer(t);

    const res  = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: tooManyBytes });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.equal(calls.length, 0);
    assert.ok(await bcrypt.compare(CURRENT_PASSWORD, getPasswordHash()));
    assert.equal(sessions.get("session-1").is_online, true);
});

test("현재 비밀번호가 틀리면 트랜잭션은 열리지만(동시 로그인과의 잠금 직렬화) 아무 것도 쓰지 않는다", async (t) => {
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

test("F-04 AC-05: 비밀번호 변경 이후 같은 세션의 갱신 토큰으로는 회전이 거부된다", async (t) => {
    setupFakeDb(t);
    const base = await startServer(t);

    const changeRes = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    assert.equal(changeRes.status, 200);

    await assert.rejects(
        () => authService.refresh(RAW_REFRESH_TOKEN),
        (error) => {
            assert.equal(error.status, 401, "비밀번호 변경 후 이전 갱신 토큰은 401로 거부되어야 합니다");
            return true;
        },
    );
});

test("F-04 AC-05: 비밀번호 변경 이후 같은 세션의 소켓 인증도 거부된다", async (t) => {
    setupFakeDb(t);
    const base = await startServer(t);

    const changeRes = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    assert.equal(changeRes.status, 200);

    let passedToNext = "not-called";
    const fakeSocket = { handshake: { headers: { cookie: `accessToken=${TOKEN}` } } };
    await socketLayer.__testables.authenticateSocket(fakeSocket, (err) => { passedToNext = err; });

    assert.ok(passedToNext instanceof Error, "비밀번호 변경 후에는 소켓 인증도 실패해야 합니다");
    assert.equal(passedToNext.message, "UNAUTHORIZED");
});

test("F-04 AC-05: 비밀번호 변경 이후에는 변경에 쓰이지 않은 다른 기존 세션(다른 기기)의 accessToken도 거부된다", async (t) => {
    setupFakeDb(t);
    const base = await startServer(t);

    const changeRes = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    assert.equal(changeRes.status, 200);

    const otherSessionRes = await fetch(`${base}/user/me/profile`, {
        headers: { cookie: `accessToken=${SESSION_2_TOKEN}`, Connection: "close" },
    });
    assert.equal(
        otherSessionRes.status, 401,
        "비밀번호 변경에 쓰이지 않은 다른 기존 세션도 거부되어야 합니다(전체 세션 폐기, 세션 하나만 폐기가 아님)",
    );
});

test("F-04 AC-05: 비밀번호 변경 이전부터 이미 연결되어 있던 소켓은 새 인증 시도가 아니라 다음 보호 이벤트에서 즉시 차단된다", async (t) => {
    setupFakeDb(t);
    const base = await startServer(t);

    const listeners = {};
    const emitted = [];
    let disconnectedWithForce = null;
    const fakeSocket = {
        data: { user: { uuid: "uuid-1", sessionId: "session-1", role: "USER" } },
        on(event, listener) { listeners[event] = listener; },
        emit(event, payload) { emitted.push({ event, payload }); },
        disconnect(force) { disconnectedWithForce = force; },
    };
    socketLayer.__testables.wrapSocketWithSessionGuard(fakeSocket);

    let protectedActionCalled = false;
    fakeSocket.on("send_chat_message", () => { protectedActionCalled = true; });

    assert.equal(typeof listeners.send_chat_message, "function");

    const changeRes = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    assert.equal(changeRes.status, 200);

    await listeners.send_chat_message();

    assert.equal(protectedActionCalled, false, "비밀번호 변경으로 폐기된 세션의 소켓에서는 보호 이벤트 리스너가 실행되면 안 됩니다");
    assert.ok(emitted.some((e) => e.event === "force_disconnect"), "폐기된 세션의 소켓에는 force_disconnect가 전달되어야 합니다");
    assert.equal(disconnectedWithForce, true, "폐기된 세션의 소켓은 강제 종료되어야 합니다");
});

test("F-04 AC-05: 비밀번호 변경 후 새 비밀번호로는 재로그인에 성공하고 옛 비밀번호로는 실패한다", async (t) => {
    setupFakeDb(t);
    const base = await startServer(t);

    const changeRes = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    assert.equal(changeRes.status, 200);

    const reqInfo = { ip: "127.0.0.1", userAgent: "node-test" };

    const loginResult = await authService.login({ email: ACCOUNT_EMAIL, password: "new-pw-456" }, reqInfo);
    assert.ok(loginResult.token, "새 비밀번호 재로그인은 성공해 새 액세스 토큰을 받아야 합니다");

    await assert.rejects(
        () => authService.login({ email: ACCOUNT_EMAIL, password: CURRENT_PASSWORD }, reqInfo),
        (error) => {
            assert.equal(error.status, 401, "옛 비밀번호로는 더 이상 로그인할 수 없어야 합니다");
            return true;
        },
    );
});
