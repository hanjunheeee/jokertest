// 동시 접속 스냅샷 입구, 기본 주기·주기 켜기·끄기·스냅샷 계산·저장 모아 내보냄
// socket/socket.js가 주기 켬, 시험(시험 도우미 포함)이 끄기·계산·저장 바로 부름
const { DEFAULT_INTERVAL_MS } = require('./constants')
const { resolveIntervalMs, startConcurrentSnapshotScheduler, stopConcurrentSnapshotScheduler } = require('./scheduler')
const { getCurrentSnapshot, captureSnapshot } = require('./snapshot')

module.exports = {
    DEFAULT_INTERVAL_MS,
    resolveIntervalMs,
    getCurrentSnapshot,
    captureSnapshot,
    startConcurrentSnapshotScheduler,
    stopConcurrentSnapshotScheduler,
}
