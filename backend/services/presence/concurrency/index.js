// 동시 접속 스냅샷 입구, 옛 concurrency.service와 같은 이름만 골라 내보냄
// socket.js가 주기 켜기, 시험이 스냅샷 계산·저장을 바로 부름
const { DEFAULT_SNAPSHOT_INTERVAL_MS } = require('./constants')
const { resolveIntervalMs, startConcurrentSnapshotScheduler, stopConcurrentSnapshotScheduler } = require('./scheduler')
const { getCurrentSnapshot, captureConcurrentSnapshot } = require('./snapshot')

module.exports = {
    DEFAULT_SNAPSHOT_INTERVAL_MS,
    resolveIntervalMs,
    getCurrentSnapshot,
    captureConcurrentSnapshot,
    startConcurrentSnapshotScheduler,
    stopConcurrentSnapshotScheduler,
}
