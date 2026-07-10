/**
 * @file socket.js
 * @desc Socket.io 서버 초기화 · 다중 접속 제어 · 친구 상태 실시간 동기화
 *
 * 정책 요약:
 *  - 동일 유저는 소켓 1개만 유지 (기존 소켓은 force_disconnect 후 강제 종료)
 *  - connect → ONLINE, 완전한 disconnect → OFFLINE
 *  - 상태 변경 시 ACCEPTED 친구에게만 브로드캐스트
 */

const { Server } = require("socket.io");
const jwt    = require("jsonwebtoken");
const cookie = require("cookie");

const presenceService = require("../service/presence.service");
const userRepository  = require("../repositories/user.repositories");
const matchmaking     = require("./matchmaking");
const gameSession     = require("./gameSession");

/**
 * uuid → socket.id 매핑. 다중 접속 제어와 브로드캐스트 대상 판단에 사용되는 단일 진실 공급원.
 * 멀티 인스턴스로 스케일 아웃 시 Redis 등 외부 저장소로 교체 필요.
 * @type {Map<string, string>}
 */
const onlineUsers = new Map();

/** initSocket 이후 채워지는 io 참조 — 컨트롤러에서 단방향 push에 사용 */
let _io = null;

/**
 * 유저가 온라인이면 소켓 이벤트를 전송합니다. 오프라인이거나 미초기화면 무시합니다.
 * @param {string} uuid
 * @param {string} event
 * @param {Object} payload
 */
function emitToUser(uuid, event, payload) {
    const socketId = onlineUsers.get(uuid);
    if (socketId && _io) {
        _io.to(socketId).emit(event, payload);
    }
}

/**
 * HTTP 서버에 Socket.io를 부착하고 이벤트 핸들러를 등록합니다.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
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

    io.on("connection", (socket) => {
        const { uuid } = socket.data.user;

        handleConnection(io, socket, uuid).catch((err) => {
            console.error("\x1b[31m[소켓 접속 처리 에러]\x1b[0m", err);
        });

        matchmaking.registerMatchmakingHandlers(io, socket, uuid);
        gameSession.registerGameHandlers(io, socket, uuid);

        socket.on("disconnect", () => {
            handleDisconnect(io, socket, uuid).catch((err) => {
                console.error("\x1b[31m[소켓 종료 처리 에러]\x1b[0m", err);
            });
            matchmaking.onDisconnect(io, uuid);
            gameSession.onDisconnect(io, uuid).catch((err) => {
                console.error("\x1b[31m[게임 소켓 종료 처리 에러]\x1b[0m", err);
            });
        });
    });

    return io;
}

/**
 * 핸드셰이크 단계에서 HttpOnly 쿠키의 JWT를 검증합니다.
 * 검증 성공 시 디코딩 결과를 `socket.data.user`에 저장합니다.
 * @param {import('socket.io').Socket} socket
 * @param {Function} next
 */
function authenticateSocket(socket, next) {
    try {
        const { accessToken } = cookie.parse(socket.handshake.headers.cookie || "");
        if (!accessToken) return next(new Error("UNAUTHORIZED"));

        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET || "default_secret_key");
        socket.data.user = decoded;
        next();
    } catch {
        next(new Error("UNAUTHORIZED"));
    }
}

/**
 * 새 소켓 연결을 처리합니다.
 * 기존 소켓이 있으면 force_disconnect 전송 후 강제 종료하고, 현재 소켓을 ONLINE으로 등록합니다.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {string} uuid
 */
async function handleConnection(io, socket, uuid) {
    const existingSocketId = onlineUsers.get(uuid);

    if (existingSocketId && existingSocketId !== socket.id) {
        const existingSocket = io.sockets.sockets.get(existingSocketId);

        if (existingSocket) {
            // disconnect 핸들러가 ONLINE 상태를 덮어쓰지 못하도록 플래그 설정
            existingSocket.data.forcedLogout = true;
            existingSocket.emit("force_disconnect", {
                message: "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.",
            });
            existingSocket.disconnect(true);
        }
    }

    onlineUsers.set(uuid, socket.id);
    await presenceService.setPresence(uuid, "ONLINE");
    await broadcastFriendStatus(io, uuid, "ONLINE");
}

/**
 * 소켓 연결 종료를 처리합니다.
 * 두 가지 가드로 "강제 종료된 구 소켓"이 OFFLINE을 덮어쓰는 것을 방지합니다:
 *  (a) `forcedLogout` 플래그 — handleConnection에서 표시
 *  (b) 맵 비교 — 이미 새 소켓이 등록된 경우 레이스 컨디션 방어
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {string} uuid
 */
async function handleDisconnect(io, socket, uuid) {
    if (socket.data.forcedLogout) return;
    if (onlineUsers.get(uuid) !== socket.id) return;

    onlineUsers.delete(uuid);
    await presenceService.setPresence(uuid, "OFFLINE");
    await broadcastFriendStatus(io, uuid, "OFFLINE");
    await userRepository.recordLogout(uuid);
}

/**
 * 상태 변경을 현재 접속 중인 ACCEPTED 친구에게만 전파합니다.
 * @param {import('socket.io').Server} io
 * @param {string} uuid   - 상태가 변경된 유저 UUID
 * @param {string} status - 'ONLINE' | 'OFFLINE'
 */
async function broadcastFriendStatus(io, uuid, status) {
    const friendUuids = await presenceService.getAcceptedFriendUuids(uuid);

    friendUuids.forEach((friendUuid) => {
        const friendSocketId = onlineUsers.get(friendUuid);
        if (friendSocketId) {
            io.to(friendSocketId).emit("friend_status_change", { uuid, status });
        }
    });
}

module.exports = { initSocket, emitToUser };
