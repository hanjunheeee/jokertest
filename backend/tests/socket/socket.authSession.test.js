process.env.JWT_SECRET = "socket-auth-session-test-secret";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const db = require("../../models");
const { generateToken } = require("../../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../../middlewares/errorHandler");

const socketLayer = require("../../socket/socket");
const matchmaking = require("../../socket/matchmaking");
const gameSessionSocketLayer = require("../../socket/gameSession");
const sessionLifecycle = require("../../auth/sessionLifecycle");
const { createFakeSocket, createFakeIo } = require("../helpers/matchmakingFixtures");

const UUID = "auth-session-uuid";
const SESSION_ID = "auth-session-1";

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

const stubAuthStorage = (t) => {
    const originals = {
        UserSession:    db.UserSession,
        UserBan:        db.UserBan,
        LoginHistory:   db.LoginHistory,
        OnlinePresence: db.OnlinePresence,
        Friendship:     db.Friendship,
    };

    const session = { id: SESSION_ID, user_id: UUID, is_online: true };
    const presenceWrites = [];

    db.UserSession = {
        findOne: async ({ where }) => {
            if (where.id !== session.id || where.user_id !== session.user_id) return null;
            if (where.is_online === true && session.is_online !== true) return null;
            return session;
        },
        update: async (values, { where }) => {
            if (where.user_id !== session.user_id) return [0];
            if (where.is_online === true && session.is_online !== true) return [0];
            Object.assign(session, values);
            return [1];
        },
    };
    db.UserBan        = { findOne: async () => null };
    db.LoginHistory   = { findOne: async () => null };
    db.OnlinePresence = { upsert: async (row) => { presenceWrites.push(row); return [row, true]; } };
    db.Friendship     = { findAll: async () => [] };

    t.after(() => Object.assign(db, originals));
    return { session, presenceWrites };
};

const authGet = (base, path, token) =>
    fetch(`${base}${path}`, { headers: { cookie: `accessToken=${token}` } });

const runDisconnect = async (uuid) => {
    const handlers = {};
    const fakeSocket = {
        id: `sock-${uuid}`,
        data: { user: { uuid } },
        rooms: new Set(),
        on(event, cb) { handlers[event] = cb; },
    };
    const fakeIo = { sockets: { sockets: new Map([[fakeSocket.id, fakeSocket]]) }, to: () => ({ emit() {} }) };

    socketLayer.__getOnlineUsersForTests().set(uuid, fakeSocket.id);

    socketLayer.__testables.registerDisconnectHandler(fakeIo, fakeSocket, uuid);
    handlers.disconnect();

    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const resetSocketRegistries = () => {
    matchmaking.__resetStateForTests();
    gameSessionSocketLayer.__resetStateForTests();
    gameSessionSocketLayer.setOnlineUsersRegistry(socketLayer.__getOnlineUsersForTests());
    socketLayer.__getOnlineUsersForTests().delete(UUID);
};

test.beforeEach(resetSocketRegistries);
test.after(resetSocketRegistries);

const fakeHandshakeSocket = (token) => ({ handshake: { headers: { cookie: `accessToken=${token}` } }, data: {} });

const runAuthenticateSocket = (socket) =>
    new Promise((resolve) => socketLayer.__testables.authenticateSocket(socket, resolve));

test("F-03 AC-05: 세션이 폐기되면 authenticateSocket도 HTTP와 동일하게 거부한다", async (t) => {
    const { session } = stubAuthStorage(t);
    session.is_online = false;
    const token = generateToken({ uuid: UUID, role: "USER", sessionId: SESSION_ID });

    const socket = fakeHandshakeSocket(token);
    const err = await runAuthenticateSocket(socket);

    assert.ok(err instanceof Error, "폐기된 세션의 토큰은 소켓 인증도 거부해야 합니다");
    assert.equal(socket.data.user, undefined);
});

test("F-03 AC-03/AC-05: 정지된 계정은 socket 인증에서도 거부된다", async (t) => {
    stubAuthStorage(t);
    db.UserBan = { findOne: async () => ({ reason: "운영 정지" }) };
    const token = generateToken({ uuid: UUID, role: "USER", sessionId: SESSION_ID });

    const socket = fakeHandshakeSocket(token);
    const err = await runAuthenticateSocket(socket);

    assert.ok(err instanceof Error, "정지된 계정의 토큰은 소켓 인증도 거부해야 합니다");
    assert.equal(socket.data.user, undefined);
});

test("F-03 AC-05: 유효한 세션이면 authenticateSocket이 정상 통과한다", async (t) => {
    stubAuthStorage(t);
    const token = generateToken({ uuid: UUID, role: "USER", sessionId: SESSION_ID });

    const socket = fakeHandshakeSocket(token);
    const err = await runAuthenticateSocket(socket);

    assert.equal(err, undefined);
    assert.equal(socket.data.user.uuid, UUID);
});

test("AC-06: socket disconnect는 auth session의 is_online을 바꾸지 않는다", async (t) => {
    const { session, presenceWrites } = stubAuthStorage(t);

    await runDisconnect(UUID);

    assert.equal(session.is_online, true, "disconnect가 인증 세션을 내리면 새로고침만으로 로그아웃됩니다");
    assert.deepEqual(presenceWrites.map((row) => row.status), ["OFFLINE"]);
    assert.equal(presenceWrites[0].user_id, UUID);
});
test("AC-05/AC-03: socket disconnect 후에도 같은 토큰으로 /auth/me가 성공한다", async (t) => {
    const { session } = stubAuthStorage(t);
    const base  = await startServer(t);
    const token = generateToken({ uuid: UUID, role: "USER", sessionId: SESSION_ID });

    assert.equal((await authGet(base, "/auth/me", token)).status, 200, "사전 조건: 로그인 상태여야 합니다");

    await runDisconnect(UUID);

    const res = await authGet(base, "/auth/me", token);
    const body = await res.json();

    assert.equal(res.status, 200, "새로고침(=disconnect) 후 /auth/me가 401이면 세션이 복구되지 않습니다");
    assert.deepEqual(body.data, { uuid: UUID, role: "USER" });
    assert.equal(session.is_online, true);
});

test("AC-05: disconnect가 여러 번 반복돼도 인증 세션은 그대로다", async (t) => {
    const { session } = stubAuthStorage(t);
    const base  = await startServer(t);
    const token = generateToken({ uuid: UUID, role: "USER", sessionId: SESSION_ID });

    await runDisconnect(UUID);
    await runDisconnect(UUID);
    await runDisconnect(UUID);

    assert.equal((await authGet(base, "/auth/me", token)).status, 200);
    assert.equal(session.is_online, true);
});

const makeSocket = (id) => ({
    id,
    data: { user: { uuid: UUID } },
    emitted: [],
    disconnectCalls: 0,
    emit(event, payload) { this.emitted.push({ event, payload }); },
    disconnect() { this.disconnectCalls += 1; },
    join() {},
});

test("AC-09: 같은 계정으로 새 소켓이 접속하면 이전 소켓에 force_disconnect를 알리고 끊는다", async (t) => {
    stubAuthStorage(t);
    const onlineUsers = socketLayer.__getOnlineUsersForTests();

    const existing = makeSocket("sock-old");
    const fresh    = makeSocket("sock-new");
    const io = {
        sockets: { sockets: new Map([["sock-old", existing], ["sock-new", fresh]]) },
        to: () => ({ emit() {} }),
    };
    onlineUsers.set(UUID, existing.id);

    await socketLayer.__testables.handleConnection(io, fresh, UUID);

    assert.equal(onlineUsers.get(UUID), fresh.id);
    assert.deepEqual(existing.emitted.map((entry) => entry.event), ["force_disconnect"]);
    assert.equal(existing.data.forcedLogout, true);
    assert.equal(existing.disconnectCalls, 1);
    assert.equal(fresh.disconnectCalls, 0);
});

test("AC-09: force_disconnect 안내에는 토큰·쿠키 같은 값이 들어가지 않는다", async (t) => {
    stubAuthStorage(t);
    const onlineUsers = socketLayer.__getOnlineUsersForTests();

    const existing = makeSocket("sock-old");
    const fresh    = makeSocket("sock-new");
    const io = { sockets: { sockets: new Map([["sock-old", existing]]) }, to: () => ({ emit() {} }) };
    onlineUsers.set(UUID, existing.id);

    await socketLayer.__testables.handleConnection(io, fresh, UUID);

    const payload = existing.emitted[0].payload;
    assert.deepEqual(Object.keys(payload), ["message"]);
    assert.equal(/token|cookie|password/i.test(JSON.stringify(payload)), false);
});

const makeGuardedSocket = (uuid) => {
    const handlers = {};
    return {
        data: { user: { uuid, sessionId: SESSION_ID } },
        emitted: [],
        disconnectCalls: 0,
        on(event, cb) { handlers[event] = cb; },
        emit(event, payload) { this.emitted.push({ event, payload }); },
        disconnect() { this.disconnectCalls += 1; },
        _handlers: handlers,
    };
};

test("F-03 AC-09: 연결된 소켓의 보호 이벤트는 세션이 폐기되면 실행되지 않고 강제 종료된다", async (t) => {
    const { session } = stubAuthStorage(t);
    const socket = makeGuardedSocket(UUID);
    socketLayer.__testables.wrapSocketWithSessionGuard(socket);

    let ran = false;
    socket.on("game_action", () => { ran = true; });

    session.is_online = false;
    await socket._handlers.game_action();

    assert.equal(ran, false, "폐기된 세션에서는 이벤트 핸들러 본문이 실행되면 안 됩니다");
    assert.deepEqual(socket.emitted.map((e) => e.event), ["force_disconnect"]);
    assert.equal(socket.disconnectCalls, 1);
});

test("F-03 AC-09: 유효한 세션이면 보호 이벤트가 그대로 실행된다", async (t) => {
    stubAuthStorage(t);
    const socket = makeGuardedSocket(UUID);
    socketLayer.__testables.wrapSocketWithSessionGuard(socket);

    let ran = false;
    socket.on("game_action", () => { ran = true; });
    await socket._handlers.game_action();

    assert.equal(ran, true);
    assert.equal(socket.disconnectCalls, 0);
});

test("F-03 AC-09: disconnect 이벤트는 세션 재검증 없이 그대로 등록된다", async (t) => {
    stubAuthStorage(t);
    const socket = makeGuardedSocket(UUID);
    socketLayer.__testables.wrapSocketWithSessionGuard(socket);

    let ran = false;
    socket.on("disconnect", () => { ran = true; });
    db.UserSession = { findOne: async () => { throw new Error("재검증이 호출되면 안 됩니다"); } };
    await socket._handlers.disconnect();

    assert.equal(ran, true);
});

test("AC-09/AC-06: 강제 종료된 이전 소켓의 disconnect는 새 세션의 presence를 덮지 않는다", async (t) => {
    const { session, presenceWrites } = stubAuthStorage(t);
    const onlineUsers = socketLayer.__getOnlineUsersForTests();

    const existing = makeSocket("sock-old");
    const fresh    = makeSocket("sock-new");
    const io = {
        sockets: { sockets: new Map([["sock-old", existing], ["sock-new", fresh]]) },
        to: () => ({ emit() {} }),
    };
    onlineUsers.set(UUID, existing.id);

    await socketLayer.__testables.handleConnection(io, fresh, UUID);
    await socketLayer.__testables.handleDisconnect(io, existing, UUID);

    assert.deepEqual(presenceWrites.map((row) => row.status), ["ONLINE"]);
    assert.equal(onlineUsers.get(UUID), fresh.id);
    assert.equal(session.is_online, true);
});

test("F-29b AC-04: 유효한 검사 이후 클라이언트 이벤트 없이 세션이 폐기되면 다음 검사에서 강제 종료된다", async (t) => {
    const { session } = stubAuthStorage(t);
    t.mock.timers.enable({ apis: ["setInterval"] });
    const socket = makeGuardedSocket(UUID);

    const watcher = socketLayer.__testables.startSessionRevocationWatcher(socket);
    t.after(() => watcher.stop());

    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(socket.disconnectCalls, 0, "첫 검사는 세션이 유효하므로 종료하면 안 됩니다");
    assert.equal(socket.emitted.length, 0);

    session.is_online = false;
    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(socket.emitted.map((e) => e.event), ["force_disconnect"]);
    assert.equal(socket.disconnectCalls, 1);
});

test("F-29b AC-04: stop() 이후 늦게 끝난 검사는 emit·disconnect를 만들지 않는다", async (t) => {
    stubAuthStorage(t);
    const socket = makeGuardedSocket(UUID);

    let resolveCheck;
    t.mock.method(sessionLifecycle, "resolveSession", () => new Promise((resolve) => { resolveCheck = resolve; }));

    t.mock.timers.enable({ apis: ["setInterval"] });
    const watcher = socketLayer.__testables.startSessionRevocationWatcher(socket);
    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS);

    watcher.stop();
    resolveCheck({ ok: false, status: 401, message: "폐기됨" });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(socket.emitted.length, 0);
    assert.equal(socket.disconnectCalls, 0);
});

test("F-29b AC-04: 검사가 아직 끝나지 않았으면 다음 tick은 중복 조회를 시작하지 않는다", async (t) => {
    stubAuthStorage(t);
    const socket = makeGuardedSocket(UUID);

    let callCount = 0;
    let resolveFirst;
    t.mock.method(sessionLifecycle, "resolveSession", () => {
        callCount += 1;
        if (callCount === 1) return new Promise((resolve) => { resolveFirst = resolve; });
        return Promise.resolve({ ok: true });
    });

    t.mock.timers.enable({ apis: ["setInterval"] });
    const watcher = socketLayer.__testables.startSessionRevocationWatcher(socket);
    t.after(() => watcher.stop());

    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS);
    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS);
    assert.equal(callCount, 1, "진행 중인 검사가 있으면 새 조회를 시작하면 안 됩니다");

    resolveFirst({ ok: true });
    await new Promise((resolve) => setImmediate(resolve));

    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(callCount, 2, "이전 검사가 끝난 뒤에는 다음 tick에서 다시 조회해야 합니다");
});

test("F-29b AC-04: 주기 검사 중 예외가 발생해도 연결을 유지하지 않고 강제 종료하며, 원문 오류는 로그에 남기지 않는다", async (t) => {
    stubAuthStorage(t);
    const socket = makeGuardedSocket(UUID);

    const sensitiveMessage = "DB 커넥션 끊김: 10.0.0.5:3306 사용자=admin";
    t.mock.method(sessionLifecycle, "resolveSession", async () => { throw new Error(sensitiveMessage); });
    t.mock.timers.enable({ apis: ["setInterval"] });

    const loggedArgs = [];
    const originalConsoleError = console.error;
    console.error = (...args) => { loggedArgs.push(args); };
    t.after(() => { console.error = originalConsoleError; });

    const watcher = socketLayer.__testables.startSessionRevocationWatcher(socket);
    t.after(() => watcher.stop());

    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(socket.emitted.map((e) => e.event), ["force_disconnect"], "검사 예외에서도 연결을 종료해야 합니다");
    assert.equal(socket.disconnectCalls, 1);

    const loggedText = JSON.stringify(loggedArgs);
    assert.equal(loggedText.includes(sensitiveMessage), false, "원문 오류 메시지가 로그에 남으면 안 됩니다");
    assert.equal(loggedText.includes("10.0.0.5"), false, "오류 상세(주소 등)가 로그에 남으면 안 됩니다");
});

test("F-29b AC-04: registerConnectionHandlers를 거치면 주기 검사가 실제로 시작되고 disconnect에서 정리된다", async (t) => {
    const { session } = stubAuthStorage(t);
    t.mock.timers.enable({ apis: ["setInterval"] });

    const fakeSocket = createFakeSocket(UUID);
    fakeSocket.data.user = { uuid: UUID, sessionId: SESSION_ID };
    let disconnectCalls = 0;
    fakeSocket.disconnect = () => { disconnectCalls += 1; };
    const io = createFakeIo([fakeSocket]);

    socketLayer.__testables.registerConnectionHandlers(io, fakeSocket);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(disconnectCalls, 0, "registerConnectionHandlers를 거친 연결도 유효한 첫 검사에서 종료되면 안 됩니다");

    session.is_online = false;
    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(disconnectCalls, 1, "registerConnectionHandlers로 시작된 주기 검사가 세션 폐기를 반영하지 못했습니다");

    session.is_online = true;
    fakeSocket.trigger("disconnect");
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    session.is_online = false;
    t.mock.timers.tick(socketLayer.__testables.SESSION_CHECK_INTERVAL_MS * 2);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(disconnectCalls, 1, "disconnect 이후에도 주기 검사 타이머가 정리되지 않았습니다(clearInterval 누락)");
});
