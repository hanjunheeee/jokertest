// 인게임 스토어 고정 값: 비우기 조각·본인 제출 키·밤 성공 연출 허용 값
// store/ingame/ 파일들과 스냅샷 반영 유틸이 사용

// 밤 차례 비우기 조각
export const CLEARED_NIGHT_TURN = Object.freeze({ nightTurnRole: null, nightTurnDeadline: null })

// 밤 개인 결과 비우기 조각
export const CLEARED_NIGHT_PRIVATE_RESULT = Object.freeze({ nightPrivateResult: null })

// 빈 밤 성공 대기열 (같은 참조인지로 비교하므로 하나만 씀)
export const EMPTY_NIGHT_SUCCESS_QUEUE = Object.freeze([])

// 서버가 본인 제출 상태로 알려 주는 키
export const SELF_SUBMISSION_KEYS = Object.freeze([
  "hasAcknowledgedRoleReveal",
  "isDayVoteReady",
  "hasSubmittedDayVote",
  "dayVoteTargetUuid",
  "dayVoteRound",
  "hasSubmittedTribunalVote",
])

// 밤 성공 연출 종류·시점·끝맺음 허용 값
export const NIGHT_SUCCESS_TYPES = new Set(["KILL", "HEAL", "INVESTIGATE", "CONFIRM"])
export const NIGHT_SUCCESS_PERSPECTIVES = new Set(["USER", "TARGET"])
export const NIGHT_SUCCESS_OUTCOMES = new Set(["COMPLETED", "ERROR", "SKIPPED"])

// 스냅샷 복구로 받은 밤 성공 표시 (다음 낮까지 창을 열어 둠)
export const NIGHT_SUCCESS_RESTORE_CONTEXT = Object.freeze({ mode: "RESTORE" })
