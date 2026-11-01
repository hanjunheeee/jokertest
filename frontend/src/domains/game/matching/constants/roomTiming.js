// 대기방 요청 대기 시간·재시도 상수
// matching/socket과 hooks/room이 씀

// 요청 응답 기다리는 시간
export const START_TIMEOUT_MS = 8000
export const READY_TIMEOUT_MS = 5000
export const CHECK_TIMEOUT_MS = 5000

// 서버가 방을 아직 만드는 중(pending)일 때 다시 묻는 간격·횟수
export const PENDING_RETRY_MS = 700
export const PENDING_MAX_RETRIES = 3

// 판 끝난 뒤 파티 방 묻는 간격·응답 기다리는 시간
export const PARTY_POLL_MS = 2500
export const PARTY_POLL_TIMEOUT_MS = 5000
