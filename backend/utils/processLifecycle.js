// 프로세스 끝내기 도구, 종료 신호·예상 못 한 오류 받으면 정리 순서대로 닫고 끝냄
// index.js가 직접 켤 때(npm start·docker)만 붙임, 다시 켜기는 docker restart·pm2에 맡김

// 접속 중인 화면에 보내는 안내 (화면 shared/hooks/useSocket이 받아 안내만 띄움, 끊긴 뒤 자동 재접속은 그대로)
const SHUTDOWN_EVENT = "server_shutdown";
const SHUTDOWN_NOTICE = Object.freeze({
    code: "SERVER_SHUTDOWN",
    message: "서버 점검·업데이트로 잠시 연결이 끊깁니다. 잠시 뒤 자동으로 다시 연결돼요.",
});

// 정리 순서: draining 표시 → 새 연결 막기 → 안내 보내기 → 잠깐 기다림(안내 전달) → 소켓 닫기 → Redis 닫기 → DB 닫기 → 로그 닫기 → 종료
// markDraining·closeCluster는 Node 여러 개 자리 (단일 모드면 안 넘겨도 되고, 넘겨도 할 일 없음)
// - markDraining: 다른 Node가 이 Node로 새 사람·방을 안 보내게 하트비트에 표시 (조각 6 하나씩 바꾸기도 이 자리)
// - closeCluster: 하트비트 지우고 Redis 연결 닫기 (소켓 닫은 뒤라 어댑터 전송이 다 끝난 뒤)
// 한 번만 돎 (신호 두 번·오류 겹쳐도), forceMs 지나면 정리 덜 돼도 강제 종료
function createShutdown({
    server, io, closeDb, logFile, markDraining, closeCluster,
    exit = (code) => process.exit(code),
    log = console,
    graceMs = 1500,
    forceMs = 10000,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
} = {}) {
    let running = null;

    const wait = (ms) => new Promise((resolve) => {
        const timer = setTimeoutFn(resolve, ms);
        timer?.unref?.();
    });
    const step = async (label, fn) => {
        try { await fn(); } catch (error) { log.error(`[SHUTDOWN] ${label} 실패: ${error?.message ?? error}`); }
    };

    return function shutdown(reason, code = 0) {
        if (running) return running;
        running = (async () => {
            log.warn(`[SHUTDOWN] 시작 — ${reason}`);
            const force = setTimeoutFn(() => {
                log.error("[SHUTDOWN] 시간 초과 — 강제 종료");
                logFile?.close();
                exit(code || 1);
            }, forceMs);
            force?.unref?.();

            await step("draining 표시", () => markDraining?.());
            await step("새 연결 막기", () => { if (server?.listening) server.close(); });
            // 이 서버 접속자에게만 (서버 여러 대 어댑터 붙여도 남의 서버 사람은 안 건드림), local 없는 가짜 io는 그냥 emit
            await step("점검 안내", () => (io?.local ?? io)?.emit(SHUTDOWN_EVENT, SHUTDOWN_NOTICE));
            await wait(graceMs);
            await step("소켓 닫기", () => new Promise((resolve) => (io ? io.close(() => resolve()) : resolve())));
            await step("Redis 닫기", () => closeCluster?.());
            await step("DB 닫기", () => closeDb?.());
            log.warn(`[SHUTDOWN] 끝 — 종료 코드 ${code}`);
            logFile?.close();
            clearTimeoutFn(force);
            exit(code);
        })();
        return running;
    };
}

// 프로세스 사건 붙이기
// - 처리 안 된 Promise 거절: 기록만 (한 요청 실패로 판 전체를 끄지 않음)
// - 예상 못 한 오류: 기록 뒤 종료 코드 1 (상태 망가진 채 계속 도는 것보다 재시작이 안전)
// - SIGTERM(docker stop·pm2)·SIGINT(Ctrl+C): 깔끔히 종료 코드 0
function installProcessHandlers({ shutdown, proc = process, log = console }) {
    proc.on("unhandledRejection", (reason) => {
        log.error("[PROCESS] 처리 안 된 Promise 거절 (서버는 계속):", reason);
    });
    proc.on("uncaughtException", (error) => {
        log.error("[PROCESS] 예상 못 한 오류 — 정리 후 종료, 재시작에 맡김:", error);
        shutdown("uncaughtException", 1);
    });
    for (const signal of ["SIGTERM", "SIGINT"]) {
        proc.on(signal, () => shutdown(signal, 0));
    }
}

module.exports = { SHUTDOWN_EVENT, SHUTDOWN_NOTICE, createShutdown, installProcessHandlers };
