// 동시 접속 스냅샷 상수 파일, 주기 값 못 읽으면 쓰는 기본 주기
// scheduler.js가 쓰고 index.js가 내보냄

// 1분마다 한 번 (환경변수 없거나 틀리면)
const DEFAULT_INTERVAL_MS = 60_000

module.exports = {
    DEFAULT_INTERVAL_MS,
}
