// 전적 저장 상수 파일, 저장 확인 보관 최대 · 재시도 간격
// 저장·재시도 파일이 씀

// 저장 확인 보관 최대 개수 (넘치면 오래된 것부터 버림)
const CONFIRMED_MAX = 4096

// 실패하면 1초 → 5초 → 30초, 그 뒤로는 60초마다 (지도 07-②)
const RETRY_DELAYS_MS = [1_000, 5_000, 30_000]

// 정해진 간격 다 쓰면 이 간격으로 계속
const MAX_DELAY_MS = 60_000

module.exports = {
    CONFIRMED_MAX,
    RETRY_DELAYS_MS,
    MAX_DELAY_MS,
}
