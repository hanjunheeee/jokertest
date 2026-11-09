// socket.io 서버 입구 파일, 연결·끊김 처리기 조립 + 사용자 전송·시험 손잡이 내보내기
// backend/index.js가 initSocket 부름, 연결 인증·접속 상태·알림 준비는 connection 폴더
const { Server } = require("socket.io");

// connection 파일은 옛 require 자리 그대로 둠, 모듈 불러오는 순서 안 바뀌게
// (인증 → sessionLifecycle, 접속 상태 → presence 서비스·matchmaking)
const {
    authenticateSocket, wrapSocketWithSessionGuard, startSessionRevocationWatcher, SESSION_CHECK_INTERVAL_MS,
    WATCH_FAILURE_LIMIT, EVENT_CHECK_CACHE_MS,
} = require("./connection/auth");
const { handleConnection, handleDisconnect } = require("./connection/presence");
const matchmaking     = require("./matchmaking");
const gameSession     = require("./gameSession");
const concurrencyService = require("../services/presence/concurrency");
const { logRejection } = require("./common/isolate");
// 접속 목록·io·사용자 전송은 emitter (서비스가 socket.js 안 거치고 보내게)
const { onlineUsers, setIo, emitToUser, joinUserChannel } = require("./emitter");
const { registerNotificationHandlers } = require("./connection/notifications");
// 점검 큰 안내(접속할 때 켜짐이면 한 번)·점검 시계(시작 시각에 이 Node 판·방 끝냄)
const maintenanceNotice = require("../services/ops/maintenanceNotice");
const { startMaintenanceClock } = require("../services/ops/maintenanceClock");
// 웹소켓만 쓰는 화면은 cors가 안 걸려 Origin을 직접 검사 (DP-034)
const { createOriginGuard } = require("./connection/originCheck");
// 소켓 접속 IP 읽기 (Express req.ip와 같은 규칙)
const { getSocketClientIp } = require("../utils/request");
// Node 여러 개: 접속 길잡이·장부 → Redis 위치 맞추기·노드 넘는 밀어내기·죽은 Node 줄 청소 (단일 모드면 그냥 지나감)
const { nodeRouting } = require("./connection/nodeRouting");
const { startLocationSync } = require("./connection/locationSync");
const { startReplaceSync } = require("./connection/replace");
const { startJanitor } = require("./connection/janitor");

// 소켓 사건 하나 최대 크기 (보안 점검 2026-11-09)
const MAX_SOCKET_MESSAGE_BYTES = 64 * 1024;

// 판·대기방도 같은 접속 목록 Map을 봄 (지금 소켓인지 가리기용)
gameSession.setOnlineUsersRegistry(onlineUsers);
matchmaking.setOnlineUsersRegistry(onlineUsers);

// 판 끝 전적 저장 쪽이 캐시 무효화 신호 보낼 창구 넣기
gameSession.setEmitToUser(emitToUser);

// socket.io 서버 켜기: 접속 인증 걸고 연결마다 처리기 붙임, 동시 접속 기록 주기도 켬
// CORS 주소는 index.js가 config에서 받아 넘김 (안 넘기면 FRONTEND_URL)
// allowRequest: Origin이 허용 목록(데스크톱·모바일)일 때만, Origin 없으면 운영 거절·개발 허용
function initSocket(httpServer, { corsOrigin = process.env.FRONTEND_URL, allowRequest = createOriginGuard() } = {}) {
    const io = new Server(httpServer, {
        cors: {
            origin:      corsOrigin,
            credentials: true,
            methods:     ["GET", "POST"],
        },
        allowRequest,
        // 웹소켓만 받음: 화면(데스크톱·모바일)·부하 시험 봇·e2e 도우미 다 웹소켓만 씀, polling 길 막아 받는 길 하나로 (부하 줄이기 2026-11-09)
        transports: ["websocket"],
        // 사건 하나 최대 64KB (기본 1MB, 큰 메시지로 메모리 쓰게 하기 막기, 채팅·설정은 몇 KB)
        maxHttpBufferSize: MAX_SOCKET_MESSAGE_BYTES,
    });

    // 서비스가 emitter로 보낼 수 있게 io 먼저 넣음
    setIo(io);

    // 접속 IP를 인증 앞에 정해 둠: nginx가 넘긴 진짜 사용자 IP (handshake.address는 nginx 컨테이너 IP)
    io.use((socket, next) => {
        socket.data.clientIp = getSocketClientIp(socket);
        next();
    });
    // 인증 못 받은 연결은 connection 처리기까지 못 옴
    io.use(authenticateSocket);
    // 이 사람 방·판이 다른 Node에 있으면 WRONG_NODE로 거절 → 화면이 그 Node로 다시 붙음 (인증 다음이라 uuid 있음)
    io.use(nodeRouting);
    io.on("connection", (socket) => registerConnectionHandlers(io, socket));

    // 장부 → Redis 위치, 다른 Node 새 접속 알림 받기, 청소 담당 (여러 번 불러도 한 번만)
    startLocationSync();
    startReplaceSync();
    startJanitor();
    // 점검 다시 읽을 때마다 시작 시각 타이머 맞추고 바뀐 안내 보냄 (io 생긴 뒤라 여기서)
    startMaintenanceClock();

    // 접속 수·판 수 주기 기록 (판 수는 gameSession이 셈)
    concurrencyService.startConcurrentSnapshotScheduler({
        onlineUsers,
        getGameSnapshot: gameSession.getActiveGamePresenceSnapshot,
    });

    return io;
}

// 끊김 처리기: 세션 주기 검사 멈추고 판·접속 상태·대기방 정리, 셋은 서로 안 기다림
function registerDisconnectHandler(io, socket, uuid, sessionWatcher) {
    socket.on("disconnect", () => {
        sessionWatcher?.stop();
        gameSession.onDisconnect(io, socket, uuid).catch(logRejection("\x1b[31m[게임 소켓 종료 처리 에러]\x1b[0m"));
        handleDisconnect(io, socket, uuid).catch(logRejection("\x1b[31m[소켓 종료 처리 에러]\x1b[0m"));
        // 대기방 정리는 동기라 직접 잡음 (던져도 끊김 처리기 밖으로 안 새게)
        try {
            matchmaking.onDisconnect(io, socket, uuid);
        } catch (err) {
            console.error("[31m[대기방 끊김 처리 에러][0m", err);
        }
    });
}

// 연결 하나에 처리기 붙이기, uuid는 인증 단계가 넣은 토큰 값
function registerConnectionHandlers(io, socket) {
    const { uuid } = socket.data.user;

    // 사건 처리기 붙이기 전에 감쌈 (뒤에 붙는 처리기 전부 세션 검사 거치게)
    wrapSocketWithSessionGuard(socket);

    const sessionWatcher = startSessionRevocationWatcher(socket);

    // 계정 전용 채널 넣기 (한 사람 보내기는 이 채널로, 접속 목록 등록·옛 탭 끊기보다 먼저)
    joinUserChannel(socket, uuid);

    // 접속 상태·판 채널 다시 잇기는 안 기다림 (실패해도 로그만, 연결은 유지)
    handleConnection(io, socket, uuid).catch(logRejection("\x1b[31m[소켓 접속 처리 에러]\x1b[0m"));

    gameSession.resyncSessionRouting(socket, uuid, io).catch(logRejection("\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m"));

    // 대기방·판·알림 사건 등록, 옛 탭 요청 거르기용으로 지금 소켓 id 묻는 함수 넘김
    matchmaking.registerMatchmakingHandlers(io, socket, uuid, {
        getCurrentSocketId: (accountUuid) => onlineUsers.get(accountUuid) ?? null,
    });
    gameSession.registerGameHandlers(io, socket, uuid);
    registerNotificationHandlers(socket, uuid);
    maintenanceNotice.sendOnConnect(socket);

    registerDisconnectHandler(io, socket, uuid, sessionWatcher);
}

// 시험용: 접속 목록 Map 그대로 보기
function __getOnlineUsersForTests() {
    return onlineUsers;
}

module.exports = {
    initSocket,
    MAX_SOCKET_MESSAGE_BYTES,
    emitToUser,
    __getOnlineUsersForTests,
    // 시험이 연결 처리 조각을 하나씩 부르게 같이 내보냄
    __testables: {
        registerConnectionHandlers, registerDisconnectHandler, handleConnection, handleDisconnect,
        authenticateSocket, wrapSocketWithSessionGuard, registerNotificationHandlers,
        startSessionRevocationWatcher, SESSION_CHECK_INTERVAL_MS, WATCH_FAILURE_LIMIT, EVENT_CHECK_CACHE_MS,
    },
};
