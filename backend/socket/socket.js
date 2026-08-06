const { Server } = require("socket.io");
const jwt    = require("jsonwebtoken");
const cookie = require("cookie");

const presenceService = require("../service/presence.service");
const userRepository  = require("../repositories/user.repositories");
const matchmaking     = require("./matchmaking");
const gameSession     = require("./gameSession");
// NOTE: Room→GameSession 전환(matchmaking.js), disconnect·명시적 이탈(leave_game_session)에
// 의한 GameSession 종료(gameSession.js — registry/matchmaking 정리 + game_ended 알림 +
// channel 정리)는 구현됐습니다. 이후 턴/페이즈 동기화는 아직 없습니다.

const onlineUsers = new Map();
gameSession.setOnlineUsersRegistry(onlineUsers);

let _io = null;

function emitToUser(uuid, event, payload) {
    const socketId = onlineUsers.get(uuid);
    if (socketId && _io) {
        _io.to(socketId).emit(event, payload);
    }
}

function initSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin:      process.env.FRONTEND_URL,
            credentials: true,
            methods:     ["GET", "POST"],
        },
    });

    _io = io;

    io.use(authenticateSocket);
    io.on("connection", (socket) => registerConnectionHandlers(io, socket));

    return io;
}

/**
 * disconnect 리스너 등록만 담당한다(connection 시점 handleConnection과 분리).
 * 이렇게 나눠 두면 registerConnectionHandlers 전체를 거치지 않고 disconnect 배선만
 * 단위 테스트할 수 있다 — handleConnection은 즉시 presence/DB 작업을 시작하므로,
 * 배선만 검증하려는 테스트가 그 부수효과까지 떠안지 않게 하기 위함이다.
 */
function registerDisconnectHandler(io, socket, uuid) {
    socket.on("disconnect", () => {
        // gameSession.onDisconnect가 반드시 가장 먼저 실행돼야 한다 — handleDisconnect가
        // onlineUsers[uuid] 엔트리를 자신의 첫 await 이전에 동기적으로 지우므로, 순서를
        // 바꾸면 정당한(canonical) 소켓의 실제 disconnect조차 registry에서 자신을 찾지
        // 못해 게임 세션이 절대 종료되지 않는다.
        gameSession.onDisconnect(io, socket, uuid).catch((err) => {
            console.error("\x1b[31m[게임 소켓 종료 처리 에러]\x1b[0m", err);
        });
        handleDisconnect(io, socket, uuid).catch((err) => {
            console.error("\x1b[31m[소켓 종료 처리 에러]\x1b[0m", err);
        });
        matchmaking.onDisconnect(io, socket, uuid);
    });
}

function registerConnectionHandlers(io, socket) {
    const { uuid } = socket.data.user;

    handleConnection(io, socket, uuid).catch((err) => {
        console.error("\x1b[31m[소켓 접속 처리 에러]\x1b[0m", err);
    });

    // 재접속 시 기존 활성 세션의 channel·activeGameId를 재바인딩한다(권한 부여 아님 — 라우팅
    // 정보만 동기화하는 fire-and-forget 부수효과).
    gameSession.resyncSessionRouting(socket, uuid).catch((err) => {
        console.error("\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m", err);
    });

    matchmaking.registerMatchmakingHandlers(io, socket, uuid);
    gameSession.registerGameHandlers(io, socket, uuid);

    registerDisconnectHandler(io, socket, uuid);
}

function authenticateSocket(socket, next) {
    try {
        const { accessToken } = cookie.parse(socket.handshake.headers.cookie || "");
        if (!accessToken) return next(new Error("UNAUTHORIZED"));

        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
        socket.data.user = decoded;
        next();
    } catch {
        next(new Error("UNAUTHORIZED"));
    }
}

async function handleConnection(io, socket, uuid) {
    const existingSocketId = onlineUsers.get(uuid);

    // registry를 먼저 새 소켓으로 갱신한 뒤에 기존 소켓을 kick한다 — 순서를 바꾸면 기존
    // 소켓의 disconnect 처리(gameSession.onDisconnect 포함)가 registry에서 여전히 자기
    // 자신을 canonical로 관측해, 새로 교체된 소켓의 권한까지 함께 무너뜨릴 수 있다.
    onlineUsers.set(uuid, socket.id);

    if (existingSocketId && existingSocketId !== socket.id) {
        const existingSocket = io.sockets.sockets.get(existingSocketId);

        if (existingSocket) {
            existingSocket.data.forcedLogout = true;
            existingSocket.emit("force_disconnect", {
                message: "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.",
            });
            existingSocket.disconnect(true);
        }
    }

    // 서로 결과를 필요로 하지 않는 독립적인 작업이라 순차 await 대신 병렬로 처리합니다.
    await Promise.all([
        presenceService.setPresence(uuid, "ONLINE"),
        broadcastFriendStatus(io, uuid, "ONLINE"),
    ]);
}

async function handleDisconnect(io, socket, uuid) {
    if (socket.data.forcedLogout) return;
    if (onlineUsers.get(uuid) !== socket.id) return;

    onlineUsers.delete(uuid);
    await Promise.all([
        presenceService.setPresence(uuid, "OFFLINE"),
        broadcastFriendStatus(io, uuid, "OFFLINE"),
        userRepository.recordLogout(uuid),
    ]);
}

async function broadcastFriendStatus(io, uuid, status) {
    const friendUuids = await presenceService.getAcceptedFriendUuids(uuid);

    friendUuids.forEach((friendUuid) => {
        const friendSocketId = onlineUsers.get(friendUuid);
        if (friendSocketId) {
            io.to(friendSocketId).emit("friend_status_change", { uuid, status });
        }
    });
}

/** 테스트 전용: 라이브 onlineUsers Map 참조를 그대로 반환합니다(복제하지 않습니다). */
function __getOnlineUsersForTests() {
    return onlineUsers;
}

module.exports = {
    initSocket,
    emitToUser,
    __getOnlineUsersForTests,
    __testables: { registerConnectionHandlers, registerDisconnectHandler },
};
