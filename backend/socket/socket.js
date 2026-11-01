// socket.io 서버 입구 파일
// 접속 목록·사용자 전송 + 연결·끊김 핸들러 등록, server.js가 initSocket을 부름
const { Server } = require("socket.io");
const cookie = require("cookie");

const sessionLifecycle = require("../auth/sessionLifecycle");
const presenceService = require("../services/presence/status");
const matchmaking     = require("./matchmaking");
const gameSession     = require("./gameSession");
const concurrencyService = require("../services/presence/concurrency");
const { logRejection } = require("./common/isolate");
// 접속 목록·io·사용자 전송은 emitter (서비스가 socket.js 안 거치고 보내게)
const { onlineUsers, setIo, emitToUser } = require("./emitter");

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

function wrapSocketWithSessionGuard(socket) {
    const registerListener = socket.on.bind(socket);
    socket.on = (event, listener) => {
        if (event === "disconnect") return registerListener(event, listener);

        return registerListener(event, async (...args) => {
            let result;
            try {
                result = await sessionLifecycle.resolveSession(socket.data.user);
            } catch (err) {
                console.error("\x1b[31m[소켓 세션 재검증 에러]\x1b[0m", err);
                return;
            }
            if (!result.ok) {
                socket.emit("force_disconnect", { message: result.message });
                socket.disconnect(true);
                return;
            }
            return listener(...args);
        });
    };
    return socket;
}

const SESSION_CHECK_INTERVAL_MS = 5000;

function startSessionRevocationWatcher(socket) {
    let checking = false;
    let stopped = false;

    const timer = setInterval(() => {
        if (checking || stopped) return;
        checking = true;

        sessionLifecycle.resolveSession(socket.data.user)
            .then((result) => {
                if (stopped) return;
                if (!result.ok) {
                    socket.emit("force_disconnect", { message: result.message });
                    socket.disconnect(true);
                }
            })
            .catch((err) => {
                if (stopped) return;
                console.error("\x1b[31m[소켓 세션 주기 검사 실패]\x1b[0m", err?.name ?? "UnknownError");
                socket.emit("force_disconnect", { message: "세션 상태를 확인할 수 없어 연결이 종료되었습니다." });
                socket.disconnect(true);
            })
            .finally(() => { checking = false; });
    }, SESSION_CHECK_INTERVAL_MS);
    if (typeof timer.unref === "function") timer.unref();

    return {
        stop() {
            stopped = true;
            clearInterval(timer);
        },
    };
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

function registerNotificationHandlers(socket, uuid) {
    socket.on("notifications_ready", (_payload, ack) => {
        const respond = (result) => {
            if (typeof ack === "function") {
                try { ack(result); } catch { /* ack가 던져도 알림 처리는 그대로 끝냄 */ }
            }
        };

        if (socket.data?.user?.uuid !== uuid || onlineUsers.get(uuid) !== socket.id) {
            respond({ ok: false, reason: "STALE_SOCKET" });
            return;
        }

        let notificationService;
        try {
            notificationService = require("../services/notification");
        } catch (err) {
            console.error("\x1b[31m[알림 서비스 로드 실패]\x1b[0m", err);
            respond({ ok: false, reason: "UNAVAILABLE" });
            return;
        }

        notificationService.ensureSystemWelcome(uuid).then(
            (result) => respond({ ok: true, created: result.created === true }),
            (err) => {
                console.error("\x1b[31m[시스템 알림 생산 실패]\x1b[0m", err);
                respond({ ok: false, reason: "FAILED" });
            },
        );
    });
}

async function authenticateSocket(socket, next) {
    try {
        const { accessToken } = cookie.parse(socket.handshake.headers.cookie || "");
        if (!accessToken) return next(new Error("UNAUTHORIZED"));

        const decoded = sessionLifecycle.verifyAccessToken(accessToken);
        const result   = await sessionLifecycle.resolveSession(decoded);
        if (!result.ok) return next(new Error("UNAUTHORIZED"));

        socket.data.user = decoded;
        next();
    } catch {
        next(new Error("UNAUTHORIZED"));
    }
}

async function handleConnection(io, socket, uuid) {
    const existingSocketId = onlineUsers.get(uuid);

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

    await Promise.all([
        presenceService.setPresence(uuid, "ONLINE"),
        broadcastFriendStatus(io, uuid, "ONLINE"),
        matchmaking.resyncRoomChannelOnReconnect(socket, uuid),
    ]);
}

async function handleDisconnect(io, socket, uuid) {
    if (socket.data.forcedLogout) return;
    if (onlineUsers.get(uuid) !== socket.id) return;

    onlineUsers.delete(uuid);
    await Promise.all([
        presenceService.setPresence(uuid, "OFFLINE"),
        broadcastFriendStatus(io, uuid, "OFFLINE"),
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
