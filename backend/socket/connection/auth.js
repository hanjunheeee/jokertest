// 소켓 연결 인증 파일, 접속 때 토큰·세션 검사 + 접속 뒤 세션 다시 검사 (사건마다·5초마다)
// socket.js가 부름 (io.use 접속 인증·연결마다 감싸기·주기 검사 켜기)
// sessionLifecycle은 모듈 객체로 불러 부를 때마다 읽음 (시험이 mock.method로 갈아끼움)
const cookie = require("cookie");

const sessionLifecycle = require("../../services/auth/sessionLifecycle");

// 접속 뒤 끊긴 세션이 사건 못 보내게 사건마다 다시 검사, disconnect는 정리 안 막게 뺌
// 검사가 던지면 로그만 남기고 처리기 안 부름
function wrapSocketWithSessionGuard(socket) {
    const registerListener = socket.on.bind(socket);
    socket.on = (event, listener) => {
        // 끊김 처리기는 감싸지 않음 (세션 끊겨도 정리는 돌아야 함)
        if (event === "disconnect") return registerListener(event, listener);

        return registerListener(event, async (...args) => {
            // 검사 자체가 실패하면 이번 사건만 버림 (연결은 안 끊음)
            let result;
            try {
                result = await sessionLifecycle.resolveSession(socket.data.user);
            } catch (err) {
                console.error("\x1b[31m[소켓 세션 재검증 에러]\x1b[0m", err);
                return;
            }
            // 끊긴 세션이면 까닭 알리고 연결 끊음, 처리기는 안 부름
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

// 주기 검사 간격 5초 (시험이 이 값만큼 가짜 시계 돌림)
const SESSION_CHECK_INTERVAL_MS = 5000;

// 사건 없어도 세션 끊김(로그아웃·비번 바꿈) 잡으려고 주기 검사, 검사 겹치지 않게 깃발 둠
// 실패 로그엔 오류 이름만 남김 (오류 문구에 민감 정보 섞일 수 있음)
function startSessionRevocationWatcher(socket) {
    let checking = false;
    let stopped = false;

    const timer = setInterval(() => {
        // 앞 검사가 안 끝났거나 멈췄으면 이번 차례 건너뜀
        if (checking || stopped) return;
        checking = true;

        sessionLifecycle.resolveSession(socket.data.user)
            // 기다리는 사이 멈췄으면(끊김) 결과 버림
            .then((result) => {
                if (stopped) return;
                if (!result.ok) {
                    socket.emit("force_disconnect", { message: result.message });
                    socket.disconnect(true);
                }
            })
            // 검사 실패도 끊음 (세션 확인 못 한 연결은 안 믿음)
            .catch((err) => {
                if (stopped) return;
                console.error("\x1b[31m[소켓 세션 주기 검사 실패]\x1b[0m", err?.name ?? "UnknownError");
                socket.emit("force_disconnect", { message: "세션 상태를 확인할 수 없어 연결이 종료되었습니다." });
                socket.disconnect(true);
            })
            .finally(() => { checking = false; });
    }, SESSION_CHECK_INTERVAL_MS);
    // 이 타이머 때문에 프로세스가 안 꺼지는 일 막기
    if (typeof timer.unref === "function") timer.unref();

    return {
        // 끊김 처리기가 부름, 멈춘 뒤 늦게 온 검사 결과도 무시함
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

        // 토큰 서명만 보지 않고 세션 살아 있는지·정지인지까지 봄 (로그아웃한 토큰 막기)
        const decoded = sessionLifecycle.verifyAccessToken(accessToken);
        const result   = await sessionLifecycle.resolveSession(decoded);
        if (!result.ok) return next(new Error("UNAUTHORIZED"));

        // 뒤 처리기가 쓸 사용자 정보 (uuid·세션 id), 세션 다시 검사에도 씀
        socket.data.user = decoded;
        next();
    // 토큰 풀기 실패(서명·만료)·조회 오류도 같은 거절
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
