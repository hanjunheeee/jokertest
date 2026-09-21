const { Server } = require("socket.io");
const cookie = require("cookie");

const sessionLifecycle = require("../auth/sessionLifecycle");
const presenceService = require("../service/presence.service");
const matchmaking     = require("./matchmaking");
const gameSession     = require("./gameSession");
// 동시 접속 값은 onlineUsers와 활성 GameSession에서 매번 파생한다. 별도 증감 상태를 두지 않아
// canonical 교체·stale disconnect·재접속 유예 중에도 두 registry와 값이 어긋나지 않는다.
const concurrencyService = require("../service/concurrency.service");
// NOTE: Room→GameSession 전환(matchmaking.js), disconnect·명시적 이탈(leave_game_session)에
// 의한 GameSession 종료(gameSession.js — registry/matchmaking 정리 + game_ended 알림 +
// channel 정리)는 구현됐습니다. 이후 턴/페이즈 동기화는 아직 없습니다.

const onlineUsers = new Map();
gameSession.setOnlineUsersRegistry(onlineUsers);
// F-21(AC-05/AC-06): 대기방 채널 정리도 "떠나는 이 소켓이 아직 이 계정의 canonical 연결인가"를
// 물어야 한다 — 계정이 그 방에 앉아 있다는 사실만으로는 옛 소켓의 가입을 되살리는 것을 막지
// 못한다. gameSession과 **같은 방향**(socket.js → 하위 모듈)으로 주입한다.
matchmaking.setOnlineUsersRegistry(onlineUsers);

let _io = null;

function emitToUser(uuid, event, payload) {
    const socketId = onlineUsers.get(uuid);
    if (socketId && _io) {
        _io.to(socketId).emit(event, payload);
    }
}

// F-21(A-10): 전적 커밋 이후 개인 캐시 무효화를 보내는 경로다. registry와 **같은 방향**으로
// 주입한다 — gameSession.js가 이 파일을 지연 require하면 그 시점에 위 초기화가 함께 실행돼
// 주입된 registry를 덮어쓰게 되므로, 의존 방향을 socket.js → gameSession.js 한쪽으로 고정한다.
gameSession.setEmitToUser(emitToUser);

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

    // 주기 스냅샷은 소켓 이벤트가 아니라 독립 타이머로 돈다(연결이 없는 구간에도 표본이
    // 남아야 하므로). 여기서는 라이브 registry provider를 주입해 기동만 한다.
    concurrencyService.startConcurrentSnapshotScheduler({
        onlineUsers,
        getGameSnapshot: gameSession.getActiveGamePresenceSnapshot,
    });

    return io;
}

/**
 * disconnect 리스너 등록만 담당한다(connection 시점 handleConnection과 분리).
 * 이렇게 나눠 두면 registerConnectionHandlers 전체를 거치지 않고 disconnect 배선만
 * 단위 테스트할 수 있다 — handleConnection은 즉시 presence/DB 작업을 시작하므로,
 * 배선만 검증하려는 테스트가 그 부수효과까지 떠안지 않게 하기 위함이다.
 */
// sessionWatcher는 선택 인자다(F-29b AC-04) — registerConnectionHandlers를 통해서만 넘어오고,
// 기존 단위 시험(fake socket이 on(event,cb) 하나만 지원하며 once가 없다)은 이 인자 없이
// 그대로 호출한다. 이벤트마다 새 리스너를 등록하는 socket.once 대신, 이미 등록되는 이
// disconnect 콜백 안에서 함께 정리한다 — fake socket이 on을 단일 슬롯으로 구현해도(핸들러가
// 하나만 있어도) 깨지지 않는다.
function registerDisconnectHandler(io, socket, uuid, sessionWatcher) {
    socket.on("disconnect", () => {
        sessionWatcher?.stop();
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

// 연결 시점의 authenticateSocket 통과가 그 소켓의 남은 수명 내내 유효함을 보장하지 않는다
// — 연결 이후에 로그아웃·비밀번호 변경·정지가 일어나도 Socket.IO는 handshake 이후로는
// 아무 것도 다시 검사하지 않는다. socket.on을 감싸 disconnect를 제외한 모든 이벤트 앞에
// sessionLifecycle.resolveSession을 한 번 더 통과시킨다 — matchmaking.js·gameSession.js를
// 건드리지 않고도 "이미 연결된 소켓의 후속 보호 동작"까지 HTTP와 같은 검증 기준을
// 적용한다(F-03 AC-05/AC-09). 이벤트마다 DB 조회가 하나 더 붙는 비용은 있지만, 세션
// 폐기가 소켓에도 즉시 반영되어야 한다는 요구가 그 비용보다 우선한다.
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

// F-29b(AC-04): 이벤트 guard(wrapSocketWithSessionGuard)는 클라이언트가 다음 이벤트를 보낼
// 때까지 세션 폐기를 감지하지 못한다 — 비밀번호 재설정으로 세션이 폐기된 뒤에도 아무
// 이벤트를 보내지 않는 유휴 연결은 계속 열려 있었다. 연결마다 독립 타이머를 두어, 클라이언트
// 이벤트 없이도 일정 주기로 세션을 재검증한다.
const SESSION_CHECK_INTERVAL_MS = 5000;

function startSessionRevocationWatcher(socket) {
    let checking = false;
    let stopped = false;

    const timer = setInterval(() => {
        if (checking || stopped) return;
        checking = true;

        sessionLifecycle.resolveSession(socket.data.user)
            .then((result) => {
                if (stopped) return; // 늦게 끝난 검사는 disconnect 이후의 emit/disconnect를 만들지 않는다.
                if (!result.ok) {
                    socket.emit("force_disconnect", { message: result.message });
                    socket.disconnect(true);
                }
            })
            .catch((err) => {
                if (stopped) return; // stop() 이후의 늦은 실패는 emit·disconnect를 만들지 않는다.
                // 계약: 세션 재검증이 예외로 실패해도 연결을 열어 두지 않는다(성공 판정과
                // 마찬가지로 fail-closed). 로그에는 원문 오류 객체 대신 고정 문구와 오류 이름만
                // 남긴다 — 원문 오류에 요청 입력·SQL 상세가 실려 있을 수 있다(F-29b AC-06과
                // 같은 원칙).
                console.error("\x1b[31m[소켓 세션 주기 검사 실패]\x1b[0m", err?.name ?? "UnknownError");
                socket.emit("force_disconnect", { message: "세션 상태를 확인할 수 없어 연결이 종료되었습니다." });
                socket.disconnect(true);
            })
            .finally(() => { checking = false; });
    }, SESSION_CHECK_INTERVAL_MS);
    // 이 타이머 하나 때문에 Node 프로세스가 종료를 기다리지 않게 한다(테스트·정상 종료 모두).
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

    // disconnect 시점에 종료 표식(stopped=true)과 clearInterval을 함께 실행한다(아래
    // registerDisconnectHandler 호출에 전달) — io.close()도 연결된 소켓마다 disconnect를
    // 발생시키므로 여기서 함께 정리된다.
    const sessionWatcher = startSessionRevocationWatcher(socket);

    handleConnection(io, socket, uuid).catch((err) => {
        console.error("\x1b[31m[소켓 접속 처리 에러]\x1b[0m", err);
    });

    // 재접속 시 기존 활성 세션의 channel·activeGameId를 재바인딩한다(권한 부여 아님 — 라우팅
    // 정보만 동기화하는 fire-and-forget 부수효과).
    gameSession.resyncSessionRouting(socket, uuid).catch((err) => {
        console.error("\x1b[31m[세션 라우팅 재동기화 에러]\x1b[0m", err);
    });

    // F-20(AC-01): onlineUsers는 이 파일이 소유하는 canonical 소켓 등록부다. matchmaking이
    // 그 Map을 직접 들고 있게 하지 않고 "지금 이 계정의 socket.id" 하나만 읽는 접근자를
    // 넘긴다 — 세션 재검증 await 사이에 같은 계정의 새 로그인이 소켓을 교체하면, 교체된 옛
    // 소켓의 설정 저장 요청이 진입 시점에 거부된다(notifications_ready의 STALE_SOCKET와
    // 같은 이중 방어다). handleConnection이 onlineUsers를 자신의 첫 await 이전에 교체하므로
    // 이 접근자는 언제나 최신 값을 본다.
    matchmaking.registerMatchmakingHandlers(io, socket, uuid, {
        getCurrentSocketId: (accountUuid) => onlineUsers.get(accountUuid) ?? null,
    });
    gameSession.registerGameHandlers(io, socket, uuid);
    registerNotificationHandlers(socket, uuid);

    registerDisconnectHandler(io, socket, uuid, sessionWatcher);
}

/**
 * F-17 AC-07 · 신규 시스템 알림의 실제 생산 경계.
 *
 * 클라이언트(useNotificationSocketEvents)가 **초기 목록 복원을 마친 뒤**에만 보내는
 * notifications_ready를 받는다. 이 신호는 "이 계정의 알림 수신기가 준비됐다"는 사실만
 * 전달한다 — 계정·내용·대상은 전부 서버가 정한다(A-01). payload는 읽지 않는다.
 *
 * 반드시 registerConnectionHandlers의 wrapSocketWithSessionGuard **이후**에 등록해야
 * 한다(위 호출 순서) — 그래야 이 이벤트도 다른 이벤트와 같이 매번 sessionLifecycle로
 * 세션을 재검증하고, 연결 후 로그아웃·정지된 소켓은 여기 도달하지 못한다(F-03 AC-05).
 *
 * 추가로 onlineUsers의 현재 소켓과 자기 자신이 같은지 확인한다 — 같은 계정의 새 로그인이
 * 이 소켓을 교체한 뒤 도착한 늦은 ready가 생산을 트리거하지 않게 하는 이중 방어다.
 *
 * 저장·발행 실패는 여기서 끝난다. presence·친구 상태·게임/방 재접속 처리와 완전히 분리해,
 * 알림 생산 실패가 접속 자체를 망가뜨리지 않게 한다(A-02). ACK는 실패해도 클라이언트의
 * 조회·읽음·닫기를 잠그지 않는다 — 클라이언트는 재시도 상태로만 기록한다.
 */
function registerNotificationHandlers(socket, uuid) {
    socket.on("notifications_ready", (_payload, ack) => {
        const respond = (result) => {
            if (typeof ack === "function") {
                try { ack(result); } catch { /* ACK 전달 실패는 생산 결과를 바꾸지 않는다 */ }
            }
        };

        // 세션 가드를 통과한 socket.data.user가 유일한 계정 출처다. 이 소켓이 더 이상 이
        // 계정의 현재 소켓이 아니면 아무 것도 만들지 않는다.
        if (socket.data?.user?.uuid !== uuid || onlineUsers.get(uuid) !== socket.id) {
            respond({ ok: false, reason: "STALE_SOCKET" });
            return;
        }

        // require를 호출 시점으로 미룬다 — notification.service는 models를 거쳐 이 모듈을
        // 다시 require하는 순환 구조 위에 있다(achievementService의 emitToUser와 같은 이유).
        let notificationService;
        try {
            notificationService = require("../service/notification.service");
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

// HTTP의 verifyToken(auth.middleware.js)과 같은 sessionLifecycle.resolveSession을 호출해,
// 폐기된 세션·정지된 계정을 두 경로가 항상 같은 기준으로 거부하게 한다(F-03 AC-03/AC-05).
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
        // 새로고침·재접속으로 새로 만들어진 이 소켓을 원래 대기방 채널에 다시 넣는다.
        // 반드시 위의 기존 소켓 kick 이후에 실행돼야 한다 — kick이 일으키는 disconnect가
        // matchmaking에 "재접속 유예"를 예약하므로, 재가입이 그보다 앞서면 방금 예약된
        // 유예가 이 소켓의 상태를 덮어써 버린다.
        matchmaking.resyncRoomChannelOnReconnect(socket, uuid),
    ]);
}

async function handleDisconnect(io, socket, uuid) {
    if (socket.data.forcedLogout) return;
    if (onlineUsers.get(uuid) !== socket.id) return;

    onlineUsers.delete(uuid);
    // presence(친구 목록의 온라인 표시)만 내린다. 인증 세션(user_sessions.is_online)은
    // 여기서 건드리지 않는다 — 새로고침도 서버에는 socket disconnect로만 보이므로, 예전처럼
    // userRepository.recordLogout(uuid)을 부르면 verifyToken이 다음 요청부터 그 세션을
    // "이미 내려간 세션"으로 보고 401을 돌려줘, 새로고침만으로 로그아웃되는 문제가 생겼다.
    // 인증 세션을 내리는 일은 명시적 /auth/logout과 새 로그인 시의
    // markOnlineSessionsOffline(중복 로그인 정리)만 담당한다.
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

/** 테스트 전용: 라이브 onlineUsers Map 참조를 그대로 반환합니다(복제하지 않습니다). */
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
