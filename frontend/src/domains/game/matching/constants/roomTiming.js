// 대기방 요청 대기 시간·재시도 상수
// matching/socket과 hooks/room이 씀

// 요청 응답 기다리는 시간
export const START_TIMEOUT_MS = 8000
export const READY_TIMEOUT_MS = 5000
export const CHECK_TIMEOUT_MS = 5000

// 서버가 방을 아직 만드는 중(pending)일 때 다시 묻는 간격·횟수
export const PENDING_RETRY_MS = 700
export const PENDING_MAX_RETRIES = 3

// 방 확인 실패 뒤 조용히 다시 확인하는 간격
export const FAILED_RECHECK_MS = 5000
