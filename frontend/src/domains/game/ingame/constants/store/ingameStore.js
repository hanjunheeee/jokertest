// 인게임 스토어 고정 값: 비우기 조각·본인 제출 키
// store/ingame/ 파일들과 utils/snapshot/self.js가 사용

// 밤 차례 비우기 조각
export const CLEARED_NIGHT_TURN = Object.freeze({ nightTurnRole: null, nightTurnDeadline: null })

// 낮 마감 시각 비우기 조각 (낮 벗어날 때 옛 시각이 타이머에 안 남게)
export const CLEARED_DAY_PHASE_TIMER = Object.freeze({ dayPhaseDeadline: null })

// 밤 개인 결과 비우기 조각
export const CLEARED_NIGHT_PRIVATE_RESULT = Object.freeze({ nightPrivateResult: null })

// 낮 시작 연출 비우기 조각 (새 판·새 밤·판 비우기 때)
export const CLEARED_DAWN_REPORT = Object.freeze({ dawnReport: null })

// 서버가 본인 제출 상태로 알려 주는 키
export const SELF_SUBMISSION_KEYS = Object.freeze([
  "hasAcknowledgedRoleReveal",
  "isDayVoteReady",
  "hasSubmittedDayVote",
  "dayVoteTargetUuid",
  "dayVoteRound",
  "hasSubmittedTribunalVote",
])

