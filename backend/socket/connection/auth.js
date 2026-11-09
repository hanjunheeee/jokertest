// 소켓 연결 인증 파일, 접속 때 토큰·세션 검사 + 사건마다 세션 다시 검사·사건 수 제한 (5초 주기 검사는 sessionCheck.js)
// socket.js가 부름 (io.use 접속 인증·연결마다 감싸기·주기 검사 켜기)
// sessionLifecycle은 모듈 객체로 불러 부를 때마다 읽음 (시험이 mock.method로 갈아끼움)
const cookie = require("cookie");

const sessionLifecycle = require("../../services/auth/sessionLifecycle");

// 결과 저장·주기 검사·토큰 만료 판정은 sessionCheck (사건 검사·주기 검사가 같은 결과를 같이 씀)
const {
    SESSION_CHECK_INTERVAL_MS, EVENT_CHECK_CACHE_MS, WATCH_FAILURE_LIMIT,
    disconnectCodeOf, checkForEvent, markChecked, startSessionRevocationWatcher,
} = require("./sessionCheck");

// 사건의 마지막 인자가 답 함수면 거절 답 (화면이 제 시간 초과까지 "처리 중"으로 안 남게, BE-042)
function replyRejected(args, code, message) {
    const ack = args[args.length - 1];
    if (typeof ack !== "function") return;
    try { ack({ ok: false, code, message }); } catch { /* 답 함수가 던져도 처리기는 그대로 끝냄 */ }
}

// 소켓 하나 사건 수 제한: 10초에 120번까지 (보통 판은 1초에 몇 번), 넘으면 그 사건 버림, 360번 넘으면 연결 끊음
// 사건 퍼붓기로 서버·DB 검사 줄을 막는 것 막기 (보안 점검 2026-11-09)
const EVENT_RATE_WINDOW_MS = 10 * 1000;
const EVENT_RATE_MAX = 120;
const EVENT_RATE_DISCONNECT_AT = 360;

// 사건 수 세기: 창 안 횟수 → "ok" / "drop"(버림) / "disconnect"(끊음)
function createEventRateLimiter({
    windowMs = EVENT_RATE_WINDOW_MS, max = EVENT_RATE_MAX, disconnectAt = EVENT_RATE_DISCONNECT_AT, now = Date.now,
} = {}) {
    let windowStart = now();
    let count = 0;
    return () => {
        const nowMs = now();
        if (nowMs - windowStart >= windowMs) {
            windowStart = nowMs;
            count = 0;
        }
        count += 1;
        if (count > disconnectAt) return "disconnect";
        if (count > max) return "drop";
        return "ok";
    };
}

// 접속 뒤 끊긴 세션이 사건 못 보내게 사건마다 다시 검사, disconnect는 정리 안 막게 뺌
// 사건은 온 순서대로 한 줄로 검사 뒤 처리기 부름 (검사 기다리는 사이 순서 바뀜 막기, BE-011)
// 처리기 끝까지는 안 기다림 (오래 걸리는 처리기가 뒤 사건을 막지 않게)
function wrapSocketWithSessionGuard(socket, { countEvent = createEventRateLimiter() } = {}) {
    const registerListener = socket.on.bind(socket);
    let line = Promise.resolve();

    // 검사 한 번 (EVENT_CHECK_CACHE_MS 안에 통과했으면 DB 안 감, 주기 검사가 통과 결과를 늘 새로 채움)
    const guard = () => checkForEvent(socket);

    socket.on = (event, listener) => {
        // 끊김 처리기는 감싸지 않음 (세션 끊겨도 정리는 돌아야 함)
        if (event === "disconnect") return registerListener(event, listener);

        return registerListener(event, (...args) => {
            // 너무 많으면 검사 줄에 넣지도 않음 (버린 사건은 답 함수에 알림, 계속 퍼부으면 끊음)
            const verdict = countEvent();
            if (verdict === "disconnect") {
                socket.disconnect(true);
                return line;
            }
            if (verdict === "drop") {
                replyRejected(args, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
                return line;
            }
            const turn = line.then(async () => {
                // 검사 자체가 실패하면 이번 사건만 버리고 답 함수 있으면 실패로 답함 (연결은 안 끊음)
                let result;
                try {
                    result = await guard();
                } catch (err) {
                    console.error("[31m[소켓 세션 재검증 에러][0m", err?.name ?? "UnknownError");
                    replyRejected(args, "SESSION_CHECK_FAILED", "잠시 후 다시 시도해주세요.");
                    return;
                }
                // 끊긴 세션이면 답 함수에 알리고 까닭 알린 뒤 연결 끊음, 처리기는 안 부름
                if (!result.ok) {
                    replyRejected(args, "SESSION_EXPIRED", result.message);
                    socket.emit("force_disconnect", { message: result.message, code: disconnectCodeOf(result) });
                    socket.disconnect(true);
                    return;
                }
                // 처리기는 부르기만 하고 안 기다림, 동기로 던져도 다음 사건 줄은 그대로
                try {
                    const returned = listener(...args);
                    if (returned && typeof returned.catch === "function") {
                        returned.catch((err) => console.error("[31m[소켓 사건 처리 에러][0m", err));
                    }
                } catch (err) {
                    console.error("[31m[소켓 사건 처리 에러][0m", err);
                }
            });
            line = turn;
            return turn;
        });
    };
    return socket;
}

// 접속 때 accessToken 쿠키 검사, 실패 까닭 안 드러나게 전부 UNAUTHORIZED 하나로 거절
async function authenticateSocket(socket, next) {
    try {
        const { accessToken } = cookie.parse(socket.handshake.headers.cookie || "");
        if (!accessToken) return next(new Error("UNAUTHORIZED"));

        // 토큰 서명만 보지 않고 세션 살아 있는지·정지인지까지 봄 (로그아웃한 토큰 막기)
        const decoded = sessionLifecycle.verifyAccessToken(accessToken);
        const checkedAt = Date.now();
        const result   = await sessionLifecycle.resolveSession(decoded, { batch: true });
        if (!result.ok) return next(new Error("UNAUTHORIZED"));

        // 뒤 처리기가 쓸 사용자 정보 (uuid·세션 id), 세션 다시 검사에도 씀
        socket.data.user = decoded;
        // 방금 통과했으니 첫 사건은 DB 안 감
        markChecked(socket, checkedAt);
        next();
    // 토큰 풀기 실패(서명·만료)·조회 오류도 같은 거절
    } catch {
        next(new Error("UNAUTHORIZED"));
    }
}

module.exports = {
    authenticateSocket,
    wrapSocketWithSessionGuard,
    createEventRateLimiter,
    EVENT_RATE_WINDOW_MS,
    EVENT_RATE_MAX,
    EVENT_RATE_DISCONNECT_AT,
    startSessionRevocationWatcher,
    SESSION_CHECK_INTERVAL_MS,
    EVENT_CHECK_CACHE_MS,
    WATCH_FAILURE_LIMIT,
};
