// 동시 접속 스냅샷 주기 파일, 주기 값 풀기 + 켜기·끄기
// 켠 핸들은 이 파일 let 하나에만 둠 (두 번 켜기 막기)
const { DEFAULT_SNAPSHOT_INTERVAL_MS } = require('./constants')
const { captureConcurrentSnapshot } = require('./snapshot')

// 켜진 주기 핸들, 꺼지면 null
let intervalHandle = null

// 양의 정수 아니면 기본 주기
function resolveIntervalMs(value = process.env.CONCURRENT_SNAPSHOT_INTERVAL_MS) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SNAPSHOT_INTERVAL_MS
}

// 이미 켜졌으면 그 핸들 그대로, 프로세스 종료는 안 막음(unref)
function startConcurrentSnapshotScheduler({
    onlineUsers,
    getGameSnapshot,
    model,
    now,
    intervalMs,
    setIntervalFn = setInterval,
} = {}) {
    if (intervalHandle !== null) return intervalHandle

    const tick = () => {
        void captureConcurrentSnapshot({ onlineUsers, getGameSnapshot, model, now })
    }
    intervalHandle = setIntervalFn(tick, resolveIntervalMs(intervalMs))
    if (typeof intervalHandle?.unref === 'function') intervalHandle.unref()
    return intervalHandle
}

// 켜진 것만 끄고 핸들 비움
function stopConcurrentSnapshotScheduler({ clearIntervalFn = clearInterval } = {}) {
    if (intervalHandle === null) return
    clearIntervalFn(intervalHandle)
    intervalHandle = null
}

module.exports = {
    resolveIntervalMs,
    startConcurrentSnapshotScheduler,
    stopConcurrentSnapshotScheduler,
}
