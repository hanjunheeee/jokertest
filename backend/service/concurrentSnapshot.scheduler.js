const concurrentUsersService = require("./concurrentUsers.service");
const concurrentSnapshotRepository = require("../repositories/concurrentSnapshot.repositories");

/** 기본 스냅샷 주기(ms). 운영 지표용 표본이라 분 단위면 충분합니다. */
const DEFAULT_SNAPSHOT_INTERVAL_MS = 60_000;

// 프로세스당 하나만 도는 주기 타이머. null이면 스케줄러가 꺼져 있다는 뜻입니다.
let intervalId = null;

/**
 * 지금의 동시 접속 상태를 한 건 기록합니다.
 *
 * 이 함수는 어떤 경우에도 reject하지 않습니다 — 상태 조회 실패든 DB 쓰기 실패든 로그만 남기고
 * false를 돌려줍니다. 스냅샷 저장은 소켓 연결·해제·게임 로직과 완전히 분리된 부수 작업이고,
 * 여기서 새어나간 rejection이 unhandled rejection 정책에 걸려 서버를 죽이면 그 분리가
 * 무의미해지기 때문입니다(AC-03).
 *
 * captured_at은 호출 시각을 그대로 씁니다(모델이 timestamps:false라 자동으로 채워지지 않음).
 * nowFn을 주입하면 테스트가 시각까지 결정적으로 검증할 수 있습니다.
 */
async function captureConcurrentSnapshot(deps = {}) {
    const nowFn = deps.nowFn ?? Date.now;
    const repository = deps.repository ?? concurrentSnapshotRepository;

    let state;
    try {
        state = concurrentUsersService.getConcurrentState();
    } catch (err) {
        console.error("[동시 접속 스냅샷 상태 조회 실패]", { code: "SNAPSHOT_STATE_ERROR" });
        return false;
    }

    try {
        await repository.createSnapshot({
            captured_at: new Date(nowFn()),
            total: state.total,
            lobby: state.lobby,
            in_game: state.in_game,
            room_count: state.room_count,
        });
        return true;
    } catch (err) {
        // 저장 실패는 이 표본 하나를 잃을 뿐입니다 — 다음 주기에 다시 시도하고, 인메모리
        // 카운터는 이 실패에 전혀 영향을 받지 않습니다(카운터는 DB를 진실원으로 삼지 않음).
        console.error("[동시 접속 스냅샷 저장 실패]", { code: "SNAPSHOT_PERSIST_ERROR" });
        return false;
    }
}

/**
 * 주기 스냅샷을 시작합니다. 이미 돌고 있으면 아무 것도 다시 걸지 않고 기존 타이머를 그대로
 * 돌려줍니다(멱등) — initSocket이 여러 번 불려도 타이머가 두 벌 걸리지 않습니다.
 *
 * 타이머는 소켓·HTTP 요청 경로 밖의 독립 타이머입니다. 어떤 요청 핸들러의 await 체인에도
 * 들어가지 않으므로 저장이 느리거나 실패해도 연결·해제·게임 로직을 막지 않습니다.
 * 살아있는 타이머 하나 때문에 프로세스가 종료되지 못하는 일이 없도록 unref합니다.
 *
 * intervalMs·setIntervalFn·clearIntervalFn·nowFn·repository를 deps로 주입할 수 있습니다
 * (gameSession.js 타이머들의 deps 관례와 동일 — 테스트가 실제 시간을 기다리지 않게 하기 위함).
 */
function startConcurrentSnapshotScheduler(deps = {}) {
    if (intervalId !== null) return intervalId;

    const intervalMs = Number.isInteger(deps.intervalMs) && deps.intervalMs > 0
        ? deps.intervalMs
        : DEFAULT_SNAPSHOT_INTERVAL_MS;
    const setIntervalFn = deps.setIntervalFn ?? setInterval;

    intervalId = setIntervalFn(() => {
        // captureConcurrentSnapshot은 스스로 모든 실패를 삼키지만, 미래에 그 계약이 깨져도
        // 타이머 콜백에서 rejection이 새어나가지 않도록 한 겹 더 막아 둔다.
        captureConcurrentSnapshot(deps).catch(() => {});
    }, intervalMs);

    if (typeof intervalId?.unref === "function") intervalId.unref();
    return intervalId;
}

/** 주기 스냅샷을 멈춥니다. 돌고 있지 않으면 아무 것도 하지 않습니다(no-op). */
function stopConcurrentSnapshotScheduler(deps = {}) {
    if (intervalId === null) return;
    const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
    clearIntervalFn(intervalId);
    intervalId = null;
}

module.exports = {
    DEFAULT_SNAPSHOT_INTERVAL_MS,
    startConcurrentSnapshotScheduler,
    stopConcurrentSnapshotScheduler,
    captureConcurrentSnapshot,
};
