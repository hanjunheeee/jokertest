/**
 * @file    socket.js
 * @desc    Socket.io 서버 초기화 및 "실시간 유저 세션 / 친구 상태 동기화" 로직을 담당합니다.
 *
 *  핵심 정책
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  1) 다중 접속 제한   : 동일 유저는 동시에 소켓 1개만 유지(기기 1대)  │
 *  │  2) 접속 상태 동기화 : connect → ONLINE, 완전한 disconnect → OFFLINE│
 *  │  3) 친구 브로드캐스트 : 상태가 바뀌면 ACCEPTED 친구에게만 실시간 전파│
 *  └──────────────────────────────────────────────────────────────────┘
 *
 *  주의: 인증(JWT)은 로그인 시 발급된 HttpOnly 쿠키(accessToken)를 그대로 사용합니다.
 *        프론트엔드는 socket.io-client 연결 시 withCredentials: true 옵션으로 쿠키를 함께 전송해야 합니다.
 */

const { Server } = require("socket.io");
const jwt    = require("jsonwebtoken");
const cookie = require("cookie");

const presenceService = require("../service/presence.service");

// ──────────────────────────────────────────────
// 서버 메모리 상태
// ──────────────────────────────────────────────

/**
 * 현재 접속 중인 유저의 매핑 정보 (uuid → socket.id)
 * - 다중 접속 제어("기존 연결이 있는가?")와 친구 브로드캐스트 대상("이 친구가 지금 접속 중인가?")
 *   판단에 모두 사용되는 단일 진실 공급원(Single Source of Truth)입니다.
 * - 서버가 여러 대(멀티 프로세스/멀티 인스턴스)로 확장되면 이 Map은 인스턴스별로 분리되어
 *   동작이 깨지므로, 추후 스케일 아웃 시에는 Redis 등 외부 저장소로 옮겨야 합니다.
 */
const onlineUsers = new Map();

// ──────────────────────────────────────────────
// 초기화 함수
// ──────────────────────────────────────────────

/**
 * @desc    HTTP 서버에 Socket.io를 부착하고 인증/이벤트 핸들러를 등록합니다.
 *          index.js에서 http.createServer(app) 직후 한 번만 호출되어야 합니다.
 *
 * @param   {Object} httpServer - Node.js의 http.Server 인스턴스
 * @returns {Object} 생성된 Socket.io 서버 인스턴스 (필요 시 다른 모듈에서 재사용 가능)
 */
function initSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL, // Express CORS 설정과 동일한 출처만 허용
            credentials: true,                // 쿠키(accessToken)를 핸드셰이크에 포함하기 위해 필수
            methods: ["GET", "POST"],
        },
    });

    io.use(authenticateSocket);

    io.on("connection", (socket) => {
        const { uuid } = socket.data.user;

        // 연결 직후: 다중 접속 정리 → 매핑 등록 → ONLINE 처리 → 친구 브로드캐스트
        handleConnection(io, socket, uuid).catch((error) => {
            console.error("\x1b[31m[소켓 접속 처리 에러]\x1b[0m", error);
        });

        socket.on("disconnect", () => {
            handleDisconnect(io, socket, uuid).catch((error) => {
                console.error("\x1b[31m[소켓 종료 처리 에러]\x1b[0m", error);
            });
        });
    });

    return io;
}

// ──────────────────────────────────────────────
// 인증 미들웨어 (핸드셰이크 단계)
// ──────────────────────────────────────────────

/**
 * @desc    소켓 연결(핸드셰이크) 시점에 HttpOnly 쿠키의 JWT를 검증합니다.
 *          REST API의 verifyToken 미들웨어와 동일한 검증 로직이며,
 *          socket.io는 express 미들웨어를 직접 재사용할 수 없어 별도로 구현합니다.
 *          검증 성공 시 디코딩된 유저 정보를 socket.data.user에 저장합니다.
 *
 * @param   {Object}   socket - 연결을 시도한 Socket.io 소켓 인스턴스
 * @param   {Function} next   - 다음 단계로 진행(또는 연결 거부)하는 콜백
 */
function authenticateSocket(socket, next) {
    try {
        const rawCookie = socket.handshake.headers.cookie;
        if (!rawCookie) {
            return next(new Error("UNAUTHORIZED"));
        }

        const { accessToken } = cookie.parse(rawCookie);
        if (!accessToken) {
            return next(new Error("UNAUTHORIZED"));
        }

        // 위조/만료된 토큰이면 catch 블록으로 빠져 연결이 거부됩니다.
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET || "default_secret_key");

        socket.data.user = decoded; // { uuid, role, sessionId }
        next();
    } catch (error) {
        next(new Error("UNAUTHORIZED"));
    }
}

// ──────────────────────────────────────────────
// 연결(Connection) 처리 — 다중 접속 제어 + ONLINE 동기화
// ──────────────────────────────────────────────

/**
 * @desc    새로운 소켓 연결을 처리합니다.
 *          1) 같은 유저의 기존 소켓이 떠 있으면 force_disconnect를 보내고 강제 종료
 *          2) 메모리 맵을 새 소켓으로 갱신
 *          3) DB를 ONLINE으로 갱신하고 친구들에게 브로드캐스트
 *
 * @param   {Object} io     - Socket.io 서버 인스턴스
 * @param   {Object} socket - 새로 연결된 소켓
 * @param   {string} uuid   - 연결한 유저의 UUID
 */
async function handleConnection(io, socket, uuid) {
    // 1) 다중 접속(기기/탭) 차단 — 기존에 연결되어 있던 소켓을 찾는다.
    const existingSocketId = onlineUsers.get(uuid);

    if (existingSocketId && existingSocketId !== socket.id) {
        const existingSocket = io.sockets.sockets.get(existingSocketId);

        if (existingSocket) {
            // 이 소켓은 "다중 접속으로 인해 강제 종료되는 것"임을 표시해 둔다.
            // → 잠시 뒤 발생할 그 소켓의 disconnect 핸들러가 DB를 OFFLINE으로
            //   덮어쓰지 않도록(=새 소켓이 이미 만든 ONLINE 상태 보존) 막는 용도.
            existingSocket.data.forcedLogout = true;

            existingSocket.emit("force_disconnect", {
                message: "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.",
            });

            // true: 트랜스포트(엔진) 레벨까지 즉시 종료
            existingSocket.disconnect(true);
        }
    }

    // 2) 현재 접속자로 등록 (기존 매핑이 있었다면 새 소켓 ID로 덮어씀)
    onlineUsers.set(uuid, socket.id);

    // 3) DB 상태 동기화 + 친구 브로드캐스트
    await presenceService.setPresence(uuid, "ONLINE");
    await broadcastFriendStatus(io, uuid, "ONLINE");
}

// ──────────────────────────────────────────────
// 종료(Disconnect) 처리 — 진짜 종료일 때만 OFFLINE 동기화
// ──────────────────────────────────────────────

/**
 * @desc    소켓 연결 종료를 처리합니다.
 *          ⚠️ 다중 접속 제어로 인해 "기존 소켓"이 강제 종료되는 경우에는
 *             새 소켓이 이미 ONLINE 상태를 만들어 두었으므로 절대 OFFLINE으로 덮어쓰면 안 됩니다.
 *          아래 두 가지 가드로 이를 방지합니다:
 *            (a) handleConnection에서 표시해 둔 forcedLogout 플래그
 *            (b) 메모리 맵에 저장된 소켓ID가 "지금 끊어진 소켓"과 같은지 재확인 (레이스 컨디션 방어)
 *
 * @param   {Object} io     - Socket.io 서버 인스턴스
 * @param   {Object} socket - 종료된 소켓
 * @param   {string} uuid   - 종료한 유저의 UUID
 */
async function handleDisconnect(io, socket, uuid) {
    // (a) 다중 접속 제어로 강제 종료된 '구' 소켓 → 아무 것도 하지 않고 종료
    if (socket.data.forcedLogout) {
        return;
    }

    // (b) 맵에 남아있는 소켓ID가 현재 종료된 소켓과 다르면,
    //     이미 새로운 연결이 그 자리를 대체한 상태이므로 맵/DB를 건드리지 않는다.
    if (onlineUsers.get(uuid) !== socket.id) {
        return;
    }

    // 여기까지 왔다면 "진짜로" 마지막 연결이 끊긴 것 — 매핑 제거 후 OFFLINE 동기화
    onlineUsers.delete(uuid);

    await presenceService.setPresence(uuid, "OFFLINE");
    await broadcastFriendStatus(io, uuid, "OFFLINE");
}

// ──────────────────────────────────────────────
// 친구 브로드캐스트 공통 로직
// ──────────────────────────────────────────────

/**
 * @desc    특정 유저의 상태 변경을, 현재 접속 중인(메모리에 존재하는) ACCEPTED 친구들에게만 전파합니다.
 *          접속해 있지 않은 친구는 onlineUsers Map에 없으므로 자동으로 스킵됩니다.
 *
 * @param   {Object} io     - Socket.io 서버 인스턴스
 * @param   {string} uuid   - 상태가 변경된 유저의 UUID
 * @param   {string} status - 'ONLINE' | 'OFFLINE'
 */
async function broadcastFriendStatus(io, uuid, status) {
    const friendUuids = await presenceService.getAcceptedFriendUuids(uuid);

    friendUuids.forEach((friendUuid) => {
        const friendSocketId = onlineUsers.get(friendUuid);
        if (!friendSocketId) return; // 친구가 오프라인이면 보낼 대상이 없으므로 스킵

        io.to(friendSocketId).emit("friend_status_change", { uuid, status });
    });
}

module.exports = { initSocket };
