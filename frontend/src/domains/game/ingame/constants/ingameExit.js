// 판 나가기 고정 값: 응답 기다리는 시간과 나가기 상태 이름
// 나가기 훅(useInGameExit)과 hooks/exit/ 파일들이 사용

// 나가기·결과 조회 응답을 기다리는 시간
export const IN_GAME_EXIT_ACK_TIMEOUT_MS = 8000

// 나가기 진행 상태
export const EXIT_STATUS = Object.freeze({
  IDLE: "idle",
  PENDING: "pending",
  FAILED: "failed",
  UNRESOLVED: "unresolved",
})
