// socket.io 서버 입구 파일, 연결·끊김 처리기 조립 + 사용자 전송·시험 손잡이 내보내기
// server.js가 initSocket을 부름, 연결 인증·접속 상태·알림 준비는 connection 폴더
const { Server } = require("socket.io");

// connection 파일은 옛 require 자리에 둠 (인증 → sessionLifecycle, 접속 상태 → presence 서비스·matchmaking 순서 그대로 불러옴)
const {
    authenticateSocket, wrapSocketWithSessionGuard, startSessionRevocationWatcher, SESSION_CHECK_INTERVAL_MS,
} = require("./connection/auth");
const { handleConnection, handleDisconnect } = require("./connection/presence");
const matchmaking     = require("./matchmaking");
const gameSession     = require("./gameSession");
const concurrencyService = require("../services/presence/concurrency");
const { logRejection } = require("./common/isolate");
// 접속 목록·io·사용자 전송은 emitter (서비스가 socket.js 안 거치고 보내게)
const { onlineUsers, setIo, emitToUser } = require("./emitter");
const { registerNotificationHandlers } = require("./connection/notifications");

gameSession.setOnlineUsersRegistry(onlineUsers);
matchmaking.setOnlineUsersRegistry(onlineUsers);

gameSession.setEmitToUser(emitToUser);

function initSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin:      process.env.FRONTEND_URL,
            credentials: true,
            methods:     ["GET", "POST"],
        },
    });

    setIo(io);

    io.use(authenticateSocket);
    io.on("connection", (socket) => registerConnectionHandlers(io, socket));

    concurrencyService.startConcurrentSnapshotScheduler({
        onlineUsers,
        getGameSnapshot: gameSession.getActiveGamePresenceSnapshot,
    });

    return io;
}

function registerDisconnectHandler(io, socket, uuid, sessionWatcher) {
    socket.on("disconnect", () => {
        sessionWatcher?.stop();
        gameSession.onDisconnect(io, socket, uuid).catch(logRejection("\x1b[31m[게임 소켓 종료 처리 에러]\x1b[0m"));
        handleDisconnect(io, socket, uuid).catch(logRejection("\x1b[31m[소켓 종료 처리 에러]\x1b[0m"));
        matchmaking.onDisconnect(io, socket, uuid);
    });
}

function registerConnectionHandlers(io, socket) {
    const { uuid } = socket.data.user;

    wrapSocketWithSessionGuard(socket);

    const sessionWatcher = startSessionRevocationWatcher(socket);

    handleConnection(io, socket, uuid).catch(logRejection("\x1b[31m[소켓 접속 처리 에러]\x1b[0m"));

    gameSession.resyncSessionRouting(socket, uuid).catch(logRejection("\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m"));

    matchmaking.registerMatchmakingHandlers(io, socket, uuid, {
        getCurrentSocketId: (accountUuid) => onlineUsers.get(accountUuid) ?? null,
    });
    gameSession.registerGameHandlers(io, socket, uuid);
    registerNotificationHandlers(socket, uuid);

    registerDisconnectHandler(io, socket, uuid, sessionWatcher);
}

function __getOnlineUsersForTests() {
    return onlineUsers;
}

module.exports = {
    initSocket,
    emitToUser,
    __getOnlineUsersForTests,
    __testables: {
        registerConnectionHandlers, registerDisconnectHandler, handleConnection, handleDisconnect,
        authenticateSocket, wrapSocketWithSessionGuard, registerNotificationHandlers,
        startSessionRevocationWatcher, SESSION_CHECK_INTERVAL_MS,
    },
};
