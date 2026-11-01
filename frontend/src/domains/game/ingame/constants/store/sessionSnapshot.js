// 세션 스냅샷 검사 고정 값: 역할별 팀·단계 이름·단계 진행 순위·판정 결과 이름
// utils/snapshot/ 파일들이 사용

// 역할 → 팀 (본인 역할·팀이 짝이 맞는지 볼 때)
export const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}

export const KNOWN_PHASES = new Set(["ROLE_REVEAL", "NIGHT", "DAY", "TRIBUNAL", "ENDED"])

// 같은 날 안에서 단계가 뒤로 가는지 볼 때 쓰는 순위
export const PHASE_PROGRESS_RANK = Object.freeze({
  ROLE_REVEAL: 0, DAY: 1, TRIBUNAL: 2, NIGHT: 3, ENDED: 4,
})

// 밤 결과·낮 투표·재판 필드가 오면 안 되는 단계
export const PHASES_WITHOUT_DAY_TRIBUNAL_FIELDS = new Set(["ROLE_REVEAL", "NIGHT"])

export const KNOWN_DAY_PHASES = new Set(["DAY_DISCUSSION", "DAY_VOTE"])
export const DAY_VOTE_OUTCOMES = new Set(["ABSTAINED", "TIE", "TRIBUNAL", "REVOTE"])
export const TRIBUNAL_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])
