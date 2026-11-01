// 소켓 연결 인증 파일, 접속 때 토큰·세션 검사 + 접속 뒤 세션 다시 검사 (사건마다·5초마다)
// socket.js가 부름 (io.use 인증·연결 처리기 등록), 세션 판정은 sessionLifecycle 모듈 객체로 불러 시험 갈아끼우기 먹게 함
const cookie = require("cookie");

const sessionLifecycle = require("../../services/auth/sessionLifecycle");

// 접속 뒤 끊긴 세션이 사건 못 보내게 사건마다 다시 검사, disconnect는 정리 안 막게 뺌
// 검사가 던지면 로그만 남기고 처리기 안 부름
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

// 사건 없어도 세션 끊김(로그아웃·비번 바꿈) 잡으려고 주기 검사, 검사 겹치지 않게 깃발 둠
// 실패 로그엔 오류 이름만 남김 (오류 문구에 민감 정보 섞일 수 있음)
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

// 접속 때 accessToken 쿠키 검사, 실패 까닭 안 드러나게 전부 UNAUTHORIZED 하나로 거절
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

module.exports = {
    authenticateSocket,
    wrapSocketWithSessionGuard,
    startSessionRevocationWatcher,
    SESSION_CHECK_INTERVAL_MS,
};
