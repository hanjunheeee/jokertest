// AC-03/AC-05/AC-06 — socket disconnect가 인증(HTTP 쿠키) 세션을 건드리지 않는지 확인합니다.
//
// 새로고침은 서버에게 socket disconnect + 새 connect로만 보입니다. 예전에는 disconnect
// 처리(handleDisconnect)가 userRepository.recordLogout(uuid)까지 호출해 user_sessions의
// is_online을 내렸고, verifyToken은 그 세션을 "이미 내려간 세션"으로 보고 401을 돌려줬습니다.
// 즉 새로고침 한 번으로 로그아웃되는 상태였습니다. 이 파일은 그 회귀를 막습니다.
//
// 기존 socket/__tests__/socket.test.js는 disconnect 배선(gameSession 정리 순서)만 다루고
// 인증 세션 축은 비어 있어, 같은 경로를 인증 관점에서 다시 검증하는 파일을 따로 둡니다.
process.env.JWT_SECRET = "socket-auth-session-test-secret";

const test         = require("node:test");
const assert       = require("node:assert/strict");
const { once }     = require("node:events");
const express      = require("express");
const cookieParser = require("cookie-parser");

const db = require("../models");
const { generateToken } = require("../utils/jwt");
const { notFoundHandler, globalErrorHandler } = require("../middleware/errorHandler");

const socketLayer = require("./socket");
const matchmaking = require("./matchmaking");
const gameSessionSocketLayer = require("./gameSession");

const UUID = "auth-session-uuid";
const SESSION_ID = "auth-session-1";

// index.js와 같은 순서로 미들웨어를 붙여 실제 요청 경로 그대로 상태 코드를 확인합니다.
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

/**
 * user_sessions를 흉내내는 메모리 저장소를 db에 꽂습니다. 세션 한 건을 "진짜 행"처럼
 * 들고 있어야 disconnect가 is_online을 바꿨는지/안 바꿨는지를 그대로 관찰할 수 있습니다.
 * presence(OnlinePresence)와 친구 조회도 실제 presenceService 경로를 그대로 태우기 위해
 * 여기서 함께 대체합니다 — 그래야 "presence는 내려가고 인증 세션은 그대로"를 한 번에 봅니다.
 */
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

/**
 * 실제 Socket.IO 서버 없이 disconnect 배선만 구동합니다. registerConnectionHandlers가 아니라
 * registerDisconnectHandler를 직접 부르는 이유는 socket.test.js와 같습니다 — connection
 * 경로의 부수효과를 떠안지 않고 disconnect만 태우기 위함입니다.
 */
const runDisconnect = async (uuid) => {
    const handlers = {};
    const fakeSocket = {
        id: `sock-${uuid}`,
        data: { user: { uuid } }, // forcedLogout 없음 → handleDisconnect 본문이 실제로 실행된다
        rooms: new Set(),
        on(event, cb) { handlers[event] = cb; },
    };
    const fakeIo = { sockets: { sockets: new Map([[fakeSocket.id, fakeSocket]]) }, to: () => ({ emit() {} }) };

    // handleDisconnect는 "지금 registry에 등록된 canonical 소켓"일 때만 본문을 실행한다.
    socketLayer.__getOnlineUsersForTests().set(uuid, fakeSocket.id);

    socketLayer.__testables.registerDisconnectHandler(fakeIo, fakeSocket, uuid);
    handlers.disconnect();

    // 핸들러는 promise를 await 없이 띄우므로 부수효과가 끝날 때까지 이벤트 루프를 흘려보낸다.
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

// ── F-03 AC-03/AC-05: authenticateSocket이 HTTP verifyToken과 같은 sessionLifecycle을
// 공유해, 폐기된 세션·정지된 계정을 동일하게 거부하는지 확인합니다. ─────────────────────

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
    // 같은 disconnect로 presence는 정상적으로 내려가야 한다 — 인증 세션과 presence는
    // 서로 다른 저장소이고, 이 변경으로 친구 목록의 온라인 표시까지 멈추면 안 된다.
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

// ── AC-09: 중복 로그인 ───────────────────────────────────────────────────────
// 새로고침(AC-05)과 달리, 같은 계정으로 다른 기기·브라우저에서 접속하면 이전 접속은
// 즉시 끊겨야 한다. 두 경로가 같은 disconnect 배선을 공유하므로 함께 고정해 둔다.

/** force_disconnect 수신과 강제 종료 호출을 관찰할 수 있는 최소 fake socket. */
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

    // registry가 먼저 새 소켓으로 바뀌어야, 곧 이어질 이전 소켓의 disconnect 처리가
    // 자신을 canonical로 오인해 새 세션의 상태까지 무너뜨리는 일이 없다.
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

// ── F-03 AC-05/AC-09: 이미 연결된 소켓의 후속 보호 동작도 세션 폐기를 즉시 반영한다 ──────

/** wrapSocketWithSessionGuard가 감싸는 socket.on을 흉내내는 최소 fake socket. */
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

    session.is_online = false; // 로그아웃/정지 등으로 세션이 폐기된 상태를 흉내낸다.
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
    // db.UserSession을 일부러 깨서, 재검증을 시도했다면 여기서 던졌을 것임을 보장한다.
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

    await socketLayer.__testables.handleConnection(io, fresh, UUID); // 여기서 existing.forcedLogout = true
    await socketLayer.__testables.handleDisconnect(io, existing, UUID);

    // ONLINE 한 번만 기록돼야 한다 — 강제 종료된 소켓이 OFFLINE을 덧쓰면 방금 로그인한
    // 기기가 친구 목록에서 곧바로 오프라인으로 보인다.
    assert.deepEqual(presenceWrites.map((row) => row.status), ["ONLINE"]);
    assert.equal(onlineUsers.get(UUID), fresh.id);
    assert.equal(session.is_online, true);
});
