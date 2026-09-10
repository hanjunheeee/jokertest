process.env.JWT_SECRET = "profile-password-test-secret";
// models/index.js는 require 시점에 DATABASE_URL을 파싱합니다(연결은 하지 않습니다).
// npm test는 --env-file=.env.test로 이 값을 주지만, 파일 하나만 직접 실행할 때도
// 동작하도록 없을 때만 더미 값을 채웁니다.
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");
const bcrypt        = require("bcrypt");
const crypto         = require("node:crypto");

const db = require("../models");
const { generateToken } = require("../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");
const authService  = require("../service/auth.service");
const socketLayer  = require("../socket/socket");

const { Op } = db.Sequelize;

const TOKEN = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-1" });
// F-04 AC-05 재검토 지적: 세션 fixture가 session-1 하나뿐이면 "전체 세션 폐기"를 증명하지
// 못한다(하나짜리 목록은 우연히 다 지워져도 "전체"와 "하나"를 구분할 수 없다). 다른
// 기기/브라우저에서 로그인한 두 번째 온라인 세션을 별도 토큰으로 둔다.
const SESSION_2_TOKEN = generateToken({ uuid: "uuid-1", role: "USER", sessionId: "session-2" });
const CURRENT_PASSWORD = "current-pw-123";
const ACCOUNT_EMAIL = "account-holder@example.com";

// auth.service.js의 hashRefreshToken과 같은 계산(sha256 hex)을 그대로 재현한다 — 그 함수는
// export되지 않으므로, 세션의 refresh_token_hash를 미리 "이 원문을 넣으면 나올 값"으로
// 심어 두려면 여기서도 같은 공식을 써야 한다.
const RAW_REFRESH_TOKEN = "test-raw-refresh-token-before-password-change";
const REFRESH_TOKEN_HASH = crypto.createHash("sha256").update(RAW_REFRESH_TOKEN).digest("hex");
const RAW_REFRESH_TOKEN_2 = "test-raw-refresh-token-2-before-password-change";
const REFRESH_TOKEN_HASH_2 = crypto.createHash("sha256").update(RAW_REFRESH_TOKEN_2).digest("hex");

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
        // 다른 기기/브라우저에서 로그인한 두 번째 온라인 세션. markOnlineSessionsOffline은
        // is_online===true인 모든 세션을 user_id로만 걸러 폐기하므로(id를 지정하지 않는다),
        // 이 fixture가 있어야 "session-1만 우연히 지워졌다"가 아니라 "이 사용자의 모든 기존
        // 세션이 폐기됐다"를 구분해서 증명할 수 있다.
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
        // profile.controller.js가 유저 행을 FOR UPDATE로 잠근 채 비밀번호를 확인한다
        // (F-03 R-IMPL #7: 동시 로그인과의 직렬화) — LOCK.UPDATE 참조가 필요하다.
        const tx = { id: "tx-1", LOCK: { UPDATE: "UPDATE" } };
        const result = await work(tx);
        if (staged.passwordHash !== null) passwordHash = staged.passwordHash;
        for (const id of staged.revokedIds) {
            const session = sessions.get(id);
            // markOnlineSessionsOffline은 is_online과 revoked_at을 함께 기록한다 — 이 자리에서
            // is_online만 내리면 revoked_at을 읽는 auth.service.refresh()의 "revoked" 판정을
            // 이 fake가 실제로는 절대 재현하지 못하는 채로 통과시킨 것처럼 보이게 된다.
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
            // auth.service.refresh()의 findSessionForRefresh가 쓰는 모양이다 — 제시된 해시가
            // 현재/직전 갱신 자격 중 하나와 일치하는 세션을 찾는다(revoked_at 여부는 여기서
            // 거르지 않는다 — 실제 DB도 폐기된 행을 지우지 않고 남겨 둔다).
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
    // 한글은 UTF-8로 글자당 3바이트라, 25자만 되어도 75바이트로 72바이트 한도를 넘는다.
    // 문자 수 상한(64)만 검사했다면 이 값은 통과했을 것이다.
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

test("F-04 AC-05: 비밀번호 변경 이후 같은 세션의 갱신 토큰으로는 회전이 거부된다", async (t) => {
    setupFakeDb(t);
    const base = await startServer(t);

    const changeRes = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    assert.equal(changeRes.status, 200);

    // auth.service.refresh()는 HTTP 미들웨어(verifyToken)와는 다른 경로(POST /auth/refresh)로
    // 들어오므로, 액세스 토큰 거부(위 테스트)와 별개로 직접 확인해야 한다. 세션이 이미 이
    // 요청 이전에 revoked_at을 갖게 됐으므로 findSessionForRefresh가 세션을 찾아도
    // "revoked"로 판정해 거부해야 한다.
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

    // socket.js의 authenticateSocket은 HTTP의 verifyToken과 같은 sessionLifecycle.resolveSession을
    // 쓴다(F-03 AC-05) — 그래도 배선이 실수로 갈라지지 않았는지 소켓 경로에서 직접 확인한다.
    let passedToNext = "not-called";
    const fakeSocket = { handshake: { headers: { cookie: `accessToken=${TOKEN}` } } };
    await socketLayer.__testables.authenticateSocket(fakeSocket, (err) => { passedToNext = err; });

    assert.ok(passedToNext instanceof Error, "비밀번호 변경 후에는 소켓 인증도 실패해야 합니다");
    assert.equal(passedToNext.message, "UNAUTHORIZED");
});

test("F-04 AC-05: 비밀번호 변경 이후에는 변경에 쓰이지 않은 다른 기존 세션(다른 기기)의 accessToken도 거부된다", async (t) => {
    // 재검토 지적: 세션 fixture가 session-1 하나뿐이면 "전체 폐기"와 "이 요청에 쓰인 세션만
    // 폐기"를 구분할 수 없다. 비밀번호 변경 요청 자체는 session-1의 쿠키로 보내고, 그 요청과
    // 아무 관련 없는 session-2(다른 기기에서 로그인해 둔 세션)의 토큰으로도 이후 보호 요청이
    // 막히는지 직접 확인한다.
    setupFakeDb(t);
    const base = await startServer(t);

    const changeRes = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    assert.equal(changeRes.status, 200);

    const otherSessionRes = await fetch(`${base}/user/me/profile`, {
        headers: { cookie: `accessToken=${SESSION_2_TOKEN}` },
    });
    assert.equal(
        otherSessionRes.status, 401,
        "비밀번호 변경에 쓰이지 않은 다른 기존 세션도 거부되어야 합니다(전체 세션 폐기, 세션 하나만 폐기가 아님)",
    );
});

test("F-04 AC-05: 비밀번호 변경 이전부터 이미 연결되어 있던 소켓은 새 인증 시도가 아니라 다음 보호 이벤트에서 즉시 차단된다", async (t) => {
    // 재검토 지적: 위 소켓 테스트는 "비밀번호 변경 이후 새로 authenticateSocket을 호출하면
    // 거부된다"만 증명했다 — 이는 신규 연결 시도를 막을 뿐, 비밀번호 변경 *이전부터* 이미
    // 연결되어 handshake를 통과해 둔 소켓이 계속 살아남아 보호 기능을 쓰는 경우는 별개다.
    // socket.js의 wrapSocketWithSessionGuard가 바로 그 경우를 막는 배선이다(연결 이후 이벤트마다
    // resolveSession을 다시 검사) — 여기서는 handshake를 통과한 것처럼 socket.data.user를
    // 미리 채워 둔 소켓에 보호 이벤트 리스너를 등록한 뒤, 비밀번호를 변경하고, 그 다음에야
    // 이 기존 소켓에서 이벤트를 발생시켜 리스너가 차단되는지 본다.
    setupFakeDb(t);
    const base = await startServer(t);

    const listeners = {};
    const emitted = [];
    let disconnectedWithForce = null;
    const fakeSocket = {
        // authenticateSocket이 handshake 시점에 이미 채워 뒀을 값 — 비밀번호 변경 이전에
        // 연결이 성사된 상태를 흉내낸다.
        data: { user: { uuid: "uuid-1", sessionId: "session-1", role: "USER" } },
        on(event, listener) { listeners[event] = listener; },
        emit(event, payload) { emitted.push({ event, payload }); },
        disconnect(force) { disconnectedWithForce = force; },
    };
    socketLayer.__testables.wrapSocketWithSessionGuard(fakeSocket);

    let protectedActionCalled = false;
    fakeSocket.on("send_chat_message", () => { protectedActionCalled = true; });

    // 소켓은 비밀번호 변경 *이전에* 이미 이 보호 이벤트를 등록해 뒀다.
    assert.equal(typeof listeners.send_chat_message, "function");

    const changeRes = await patchPassword(base, { currentPassword: CURRENT_PASSWORD, newPassword: "new-pw-456" });
    assert.equal(changeRes.status, 200);

    // 비밀번호 변경 이후, 이미 연결되어 있던 바로 그 소켓에서 보호 이벤트가 발생한다 — 새로
    // authenticateSocket을 태우지 않는다(신규 연결이 아니라 기존 연결의 후속 이벤트).
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
