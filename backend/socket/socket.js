const { Server } = require("socket.io");
const jwt    = require("jsonwebtoken");
const cookie = require("cookie");

const presenceService = require("../service/presence.service");
const userRepository  = require("../repositories/user.repositories");
const matchmaking     = require("./matchmaking");
const gameSession     = require("./gameSession");
// NOTE: Room→GameSession 전환(matchmaking.js)과 disconnect에 의한 GameSession 정리
// (gameSession.js의 onDisconnect — registry 삭제 + game_ended 알림 + channel 정리)는
// 구현됐지만, 인게임 진입 후의 실시간 턴/페이즈 동기화(registerGameHandlers)는 아직
// 없어 등록하지 않습니다.

const onlineUsers = new Map();

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
        handleDisconnect(io, socket, uuid).catch((err) => {
            console.error("\x1b[31m[소켓 종료 처리 에러]\x1b[0m", err);
        });
        matchmaking.onDisconnect(io, uuid);
        gameSession.onDisconnect(io, uuid).catch((err) => {
            console.error("\x1b[31m[게임 소켓 종료 처리 에러]\x1b[0m", err);
        });
    });
}

function registerConnectionHandlers(io, socket) {
    const { uuid } = socket.data.user;

    handleConnection(io, socket, uuid).catch((err) => {
        console.error("\x1b[31m[소켓 접속 처리 에러]\x1b[0m", err);
    });

    matchmaking.registerMatchmakingHandlers(io, socket, uuid);
    // gameSession.registerGameHandlers(io, socket, uuid); // 다음 슬라이스(턴/페이즈 등)

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

    onlineUsers.set(uuid, socket.id);
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

module.exports = { initSocket, emitToUser, __testables: { registerConnectionHandlers, registerDisconnectHandler } };
