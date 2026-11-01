// socket.io 서버 입구 파일, 연결·끊김 처리기 조립 + 사용자 전송·시험 손잡이 내보내기
// backend/index.js가 initSocket 부름, 연결 인증·접속 상태·알림 준비는 connection 폴더
const { Server } = require("socket.io");

// connection 파일은 옛 require 자리 그대로 둠, 모듈 불러오는 순서 안 바뀌게
// (인증 → sessionLifecycle, 접속 상태 → presence 서비스·matchmaking)
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

// 판·대기방도 같은 접속 목록 Map을 봄 (지금 소켓인지 가리기용)
gameSession.setOnlineUsersRegistry(onlineUsers);
matchmaking.setOnlineUsersRegistry(onlineUsers);

// 판 끝 전적 저장 쪽이 캐시 무효화 신호 보낼 창구 넣기
gameSession.setEmitToUser(emitToUser);

// socket.io 서버 켜기: 접속 인증 걸고 연결마다 처리기 붙임, 동시 접속 기록 주기도 켬
function initSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin:      process.env.FRONTEND_URL,
            credentials: true,
            methods:     ["GET", "POST"],
        },
    });

    // 서비스가 emitter로 보낼 수 있게 io 먼저 넣음
    setIo(io);

    // 인증 못 받은 연결은 connection 처리기까지 못 옴
    io.use(authenticateSocket);
    io.on("connection", (socket) => registerConnectionHandlers(io, socket));

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
        matchmaking.onDisconnect(io, socket, uuid);
    });
}

// 연결 하나에 처리기 붙이기, uuid는 인증 단계가 넣은 토큰 값
function registerConnectionHandlers(io, socket) {
    const { uuid } = socket.data.user;

    // 사건 처리기 붙이기 전에 감쌈 (뒤에 붙는 처리기 전부 세션 검사 거치게)
    wrapSocketWithSessionGuard(socket);

    const sessionWatcher = startSessionRevocationWatcher(socket);

    // 접속 상태·판 채널 다시 잇기는 안 기다림 (실패해도 로그만, 연결은 유지)
    handleConnection(io, socket, uuid).catch(logRejection("\x1b[31m[소켓 접속 처리 에러]\x1b[0m"));

    gameSession.resyncSessionRouting(socket, uuid).catch(logRejection("\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m"));

    // 대기방·판·알림 사건 등록, 옛 탭 요청 거르기용으로 지금 소켓 id 묻는 함수 넘김
    matchmaking.registerMatchmakingHandlers(io, socket, uuid, {
        getCurrentSocketId: (accountUuid) => onlineUsers.get(accountUuid) ?? null,
    });
    gameSession.registerGameHandlers(io, socket, uuid);
    registerNotificationHandlers(socket, uuid);

    registerDisconnectHandler(io, socket, uuid, sessionWatcher);
}

// 시험용: 접속 목록 Map 그대로 보기
function __getOnlineUsersForTests() {
    return onlineUsers;
}

module.exports = {
    initSocket,
    emitToUser,
    __getOnlineUsersForTests,
    // 시험이 연결 처리 조각을 하나씩 부르게 같이 내보냄
    __testables: {
        registerConnectionHandlers, registerDisconnectHandler, handleConnection, handleDisconnect,
        authenticateSocket, wrapSocketWithSessionGuard, registerNotificationHandlers,
        startSessionRevocationWatcher, SESSION_CHECK_INTERVAL_MS,
    },
};
