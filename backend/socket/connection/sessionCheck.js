// 소켓 세션 확인 파일, 소켓마다 마지막 통과 결과 잠깐 저장 + 5초 주기 검사를 접속자 전원 한 번에 (질의 묶음)
// socket/connection/auth.js가 부름 (사건 검사·접속 인증·주기 검사), sessionLifecycle은 모듈 객체로 불러 부를 때마다 읽음 (시험이 mock.method로 갈아끼움)
const sessionLifecycle = require("../../services/auth/sessionLifecycle");
const { onSessionsRevoked } = require("../../repositories/user/revokeSignal");

// 주기 검사 간격 5초 (시험이 이 값만큼 가짜 시계 돌림)
const SESSION_CHECK_INTERVAL_MS = 5000;

// 사건 검사가 통과 결과를 같이 쓰는 시간 5초 = 주기 검사 간격 (주기 검사가 늘 새로 채워 사건은 거의 DB 안 감)
// 이 서버에서 끊은 세션(로그아웃·비번 변경·새 로그인·정지 발견·탈퇴)은 끊김 알림으로 바로 지움
// 다른 서버·관리자 서버가 끊은 세션은 늦어도 이 시간 안에 막힘 (관리자 정지는 즉시 끊기 통로가 따로 끊음)
const EVENT_CHECK_CACHE_MS = SESSION_CHECK_INTERVAL_MS;

// 확인 하나가 이 시간 넘게 답이 없으면 실패로 봄 (DB 연결이 말없이 멈추면 그 확인을 기다리는 소켓 전원이 멈추던 것 막기)
// 실패면 사건은 SESSION_CHECK_FAILED 답, 주기 검사는 실패로 셈, 다음 확인은 새로 물음 (부하 시험 2026-11-09에 겪음)
const SESSION_CHECK_TIMEOUT_MS = 5000;

// 주기 검사가 DB 오류로 이만큼 연달아 실패해야 끊음 (DB 잠깐 흔들림에 접속자 전원 끊김 막기, BE-010)
const WATCH_FAILURE_LIMIT = 3;

// 이만큼 긴 access 토큰은 로그인 유지 안 한 세션 (서버 쪽 끝이 없어 토큰 만료를 소켓도 봄, BE-043)
// 로그인 유지 세션 토큰은 짧고 refresh로 바뀌어서 소켓이 처음 받은 토큰 만료로 끊으면 안 됨
const LONG_TOKEN_MIN_SECONDS = 60 * 60;

const LONG_TOKEN_EXPIRED = Object.freeze({ ok: false, message: "로그인 시간이 만료되었습니다. 다시 로그인해주세요." });

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

// 소켓마다 확인 상태: 마지막 통과 시각(묻기 시작한 시각) · 진행 중 확인 (끊긴 소켓은 저절로 사라짐)
const checkStates = new WeakMap();
function stateOf(socket) {
    let state = checkStates.get(socket);
    if (!state) {
        state = { okAt: -Infinity, pending: null, pendingStartedAt: -Infinity };
        checkStates.set(socket, state);
    }
    return state;
}

// 이 서버에서 그 사람 세션이 끊긴 시각 (uuid → 시각), 이보다 앞서 묻기 시작한 통과 결과는 안 믿음
// 커밋 전에 물어 옛 "살아 있음"을 받은 확인도 같이 걸러짐, 1분 지난 줄은 정리 (저장 결과가 5초라 그 뒤엔 쓸모없음)
const REVOKE_MEMORY_MS = 60 * 1000;
const revokedAt = new Map();
function rememberRevoked(uuid, at = Date.now()) {
    revokedAt.set(uuid, at);
    if (revokedAt.size < 1000) return;
    for (const [key, when] of revokedAt) {
        if (at - when > REVOKE_MEMORY_MS) revokedAt.delete(key);
    }
}

// 통과 결과가 아직 쓸 만한지: EVENT_CHECK_CACHE_MS 안 + 그 뒤 이 서버에서 끊김 없음
function hasFreshPass(socket, now = Date.now()) {
    const { okAt } = stateOf(socket);
    if (now - okAt >= EVENT_CHECK_CACHE_MS) return false;
    const revoked = revokedAt.get(socket.data?.user?.uuid);
    return revoked === undefined || okAt > revoked;
}

// 세션 검사 한 번: 토큰 만료 먼저 보고 세션·정지 확인 (batch: 같은 차례 확인 여럿을 질의 하나로)
async function checkSocketSession(socket) {
    if (isLongTokenExpired(socket.data.user)) return LONG_TOKEN_EXPIRED;
    return sessionLifecycle.resolveSession(socket.data.user, { batch: true });
}

// 답이 SESSION_CHECK_TIMEOUT_MS 안에 안 오면 실패로 (늦게 온 답은 버림)
function withCheckTimeout(promise) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error("세션 확인 시간 초과");
            error.name = "SessionCheckTimeout";
            reject(error);
        }, SESSION_CHECK_TIMEOUT_MS);
        timer.unref?.();
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// 확인 한 번, 통과면 묻기 시작한 시각을 통과 시각으로
// 같은 소켓 확인이 진행 중이면 같이 기다림 (단 그 확인이 끊김 알림 전에 시작했으면 새로 물음)
function runCheck(socket) {
    const state = stateOf(socket);
    const revoked = revokedAt.get(socket.data?.user?.uuid);
    if (state.pending && (revoked === undefined || state.pendingStartedAt > revoked)) return state.pending;
    const startedAt = Date.now();
    state.pendingStartedAt = startedAt;
    const pending = withCheckTimeout(checkSocketSession(socket))
        .then((result) => {
            if (result?.ok) state.okAt = Math.max(state.okAt, startedAt);
            return result;
        })
        .finally(() => {
            if (state.pending === pending) state.pending = null;
        });
    state.pending = pending;
    return pending;
}

// 접속 인증이 통과시킨 소켓은 그 시각을 통과 시각으로 (첫 사건이 또 DB 안 가게)
function markChecked(socket, at = Date.now()) {
    const state = stateOf(socket);
    state.okAt = Math.max(state.okAt, at);
}

// 사건 검사: 토큰 만료는 늘 보고, 쓸 만한 통과 결과 있으면 DB 안 감
function checkForEvent(socket) {
    if (isLongTokenExpired(socket.data.user)) return Promise.resolve(LONG_TOKEN_EXPIRED);
    if (hasFreshPass(socket)) return Promise.resolve({ ok: true });
    return runCheck(socket);
}

// 이 서버에서 세션 끊기면(로그아웃·비번 변경·새 로그인·정지 발견·탈퇴) 그 사람 통과 결과 무효 (다음 사건부터 DB 다시 봄)
onSessionsRevoked((uuid) => rememberRevoked(uuid));

// ── 주기 검사: 타이머 하나로 접속자 전원을 같은 차례에 확인 (확인이 한 질의로 묶임) ──
const watchers = new Set();
let watchTimer = null;

function tickAll() {
    for (const watcher of watchers) watcher.tick();
}

// 사건 없어도 세션 끊김(로그아웃·비번 바꿈) 잡으려고 주기 검사, 검사 겹치지 않게 깃발 둠
// 세션이 끊겼다는 답이면 바로 끊고, 검사 자체 실패(DB 오류)는 연달아 WATCH_FAILURE_LIMIT번일 때만 끊음
// 실패 로그엔 오류 이름만 남김 (오류 문구에 민감 정보 섞일 수 있음)
function startSessionRevocationWatcher(socket) {
    let checking = false;
    let stopped = false;
    let failures = 0;

    const watcher = {
        socket,
        tick() {
            // 앞 검사가 안 끝났거나 멈췄으면 이번 차례 건너뜀
            if (checking || stopped) return;
            checking = true;
            runCheck(socket)
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
        },
    };

    watchers.add(watcher);
    if (watchTimer === null) {
        watchTimer = setInterval(tickAll, SESSION_CHECK_INTERVAL_MS);
        // 이 타이머 때문에 프로세스가 안 꺼지는 일 막기
        if (typeof watchTimer.unref === "function") watchTimer.unref();
    }

    return {
        // 끊김 처리기가 부름, 멈춘 뒤 늦게 온 검사 결과도 무시함, 마지막 하나가 멈추면 타이머도 멈춤
        stop() {
            stopped = true;
            watchers.delete(watcher);
            if (watchers.size === 0 && watchTimer !== null) {
                clearInterval(watchTimer);
                watchTimer = null;
            }
        },
    };
}

module.exports = {
    SESSION_CHECK_INTERVAL_MS,
    SESSION_CHECK_TIMEOUT_MS,
    EVENT_CHECK_CACHE_MS,
    WATCH_FAILURE_LIMIT,
    isLongTokenExpired,
    disconnectCodeOf,
    checkForEvent,
    markChecked,
    startSessionRevocationWatcher,
    __testables: { hasFreshPass, rememberRevoked, revokedAt },
};
