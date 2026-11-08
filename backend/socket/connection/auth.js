// 소켓 연결 인증 파일, 접속 때 토큰·세션 검사 + 접속 뒤 세션 다시 검사 (사건마다·5초마다)
// socket.js가 부름 (io.use 접속 인증·연결마다 감싸기·주기 검사 켜기)
// sessionLifecycle은 모듈 객체로 불러 부를 때마다 읽음 (시험이 mock.method로 갈아끼움)
const cookie = require("cookie");

const sessionLifecycle = require("../../services/auth/sessionLifecycle");

// 사건 검사 결과 잠깐 저장하는 시간 1초 (사건마다 DB 두 번 가던 부하 줄이기, BE-012)
// 끊긴 세션은 늦어도 이 시간 뒤 사건부터 막히고, 5초 주기 검사가 따로 끊음
const EVENT_CHECK_CACHE_MS = 1000;

// 주기 검사가 DB 오류로 이만큼 연달아 실패해야 끊음 (DB 잠깐 흔들림에 접속자 전원 끊김 막기, BE-010)
const WATCH_FAILURE_LIMIT = 3;

// 이만큼 긴 access 토큰은 로그인 유지 안 한 세션 (서버 쪽 끝이 없어 토큰 만료를 소켓도 봄, BE-043)
// 로그인 유지 세션 토큰은 짧고 refresh로 바뀌어서 소켓이 처음 받은 토큰 만료로 끊으면 안 됨
const LONG_TOKEN_MIN_SECONDS = 60 * 60;

// 로그인 유지 안 한 세션 토큰이 만료됐는지
function isLongTokenExpired(user, now = Date.now()) {
    const { exp, iat } = user ?? {};
    if (!Number.isFinite(exp) || !Number.isFinite(iat)) return false;
    if (exp - iat < LONG_TOKEN_MIN_SECONDS) return false;
    return exp * 1000 <= now;
}

// 끊을 때 실을 code: 정지·비활성은 그 까닭, 나머지는 세션 끝 (화면은 code 모르면 전처럼 로그아웃)
const ACCOUNT_DISCONNECT_CODES = new Set(["ACCOUNT_BANNED", "ACCOUNT_INACTIVE"]);
function disconnectCodeOf(result) {
    return ACCOUNT_DISCONNECT_CODES.has(result?.code) ? result.code : "SESSION_EXPIRED";
}

// 세션 검사 한 번: 토큰 만료 먼저 보고 세션·정지 확인
async function checkSocketSession(socket) {
    if (isLongTokenExpired(socket.data.user)) {
        return { ok: false, message: "로그인 시간이 만료되었습니다. 다시 로그인해주세요." };
    }
    return sessionLifecycle.resolveSession(socket.data.user);
}

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
    let lastOkAt = -Infinity;

    // 검사 한 번 (1초 안에 통과했으면 DB 안 감)
    const guard = async () => {
        if (Date.now() - lastOkAt < EVENT_CHECK_CACHE_MS) return { ok: true };
        const result = await checkSocketSession(socket);
        if (result.ok) lastOkAt = Date.now();
        return result;
    };

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

// 주기 검사 간격 5초 (시험이 이 값만큼 가짜 시계 돌림)
const SESSION_CHECK_INTERVAL_MS = 5000;

// 사건 없어도 세션 끊김(로그아웃·비번 바꿈) 잡으려고 주기 검사, 검사 겹치지 않게 깃발 둠
// 세션이 끊겼다는 답이면 바로 끊고, 검사 자체 실패(DB 오류)는 연달아 WATCH_FAILURE_LIMIT번일 때만 끊음
// 실패 로그엔 오류 이름만 남김 (오류 문구에 민감 정보 섞일 수 있음)
function startSessionRevocationWatcher(socket) {
    let checking = false;
    let stopped = false;
    let failures = 0;

    const timer = setInterval(() => {
        // 앞 검사가 안 끝났거나 멈췄으면 이번 차례 건너뜀
        if (checking || stopped) return;
        checking = true;

        // async 함수라 바로 불러도 던짐이 거절로 바뀜 (조회는 이 차례 안에 바로 시작)
        checkSocketSession(socket)
            // 기다리는 사이 멈췄으면(끊김) 결과 버림
            .then((result) => {
                if (stopped) return;
                failures = 0;
                if (!result.ok) {
                    socket.emit("force_disconnect", { message: result.message, code: disconnectCodeOf(result) });
                    socket.disconnect(true);
                }
            })
            // 검사 실패는 다음 차례에 다시, 연달아 실패가 쌓였을 때만 끊음 (세션 확인 못 한 연결을 끝없이 믿지는 않음)
            .catch((err) => {
                if (stopped) return;
                failures += 1;
                console.error("[31m[소켓 세션 주기 검사 실패][0m", err?.name ?? "UnknownError", { failures });
                if (failures < WATCH_FAILURE_LIMIT) return;
                socket.emit("force_disconnect", {
                    message: "세션 상태를 확인할 수 없어 연결이 종료되었습니다.",
                    code: "SESSION_CHECK_FAILED",
                });
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
    createEventRateLimiter,
    EVENT_RATE_WINDOW_MS,
    EVENT_RATE_MAX,
    EVENT_RATE_DISCONNECT_AT,
    startSessionRevocationWatcher,
    SESSION_CHECK_INTERVAL_MS,
    EVENT_CHECK_CACHE_MS,
    WATCH_FAILURE_LIMIT,
};
