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

// 아는 단계 이름 (모르면 스냅샷 안 받음)
export const KNOWN_PHASES = new Set(["ROLE_REVEAL", "NIGHT", "DAY", "TRIBUNAL", "ENDED"])

// 같은 날 안에서 단계가 뒤로 가는지 볼 때 쓰는 순위
export const PHASE_PROGRESS_RANK = Object.freeze({
  ROLE_REVEAL: 0, DAY: 1, TRIBUNAL: 2, NIGHT: 3, ENDED: 4,
})

// 밤 결과·재판 필드를 안 받는 단계 (와도 그 칸만 버리고 나머지 스냅샷은 받음)
export const PHASES_WITHOUT_DAY_TRIBUNAL_FIELDS = new Set(["ROLE_REVEAL", "NIGHT"])
// 낮 투표 판정 필드를 안 받는 단계: 밤엔 받음 (판정 뒤 새로고침해도 "왜 재판이 안 열렸나"가 보이게, 사용자 결정 2026-11-16)
export const PHASES_WITHOUT_DAY_VOTE_RESOLUTION = new Set(["ROLE_REVEAL"])

// 아는 낮 세부 단계·투표 결과·재판 결과 (모르면 스냅샷 안 받음)
export const KNOWN_DAY_PHASES = new Set(["DAY_DISCUSSION", "DAY_VOTE"])
// 재투표는 삭제돼 낮 투표 결과에서 뺌 (사용자 결정 2026-11-09), 기권 많음은 2026-11-16에 더함
// DEFENDANT_DISCONNECTED = 피고로 뽑힌 사람이 그 순간 끊겨 있어 재판 없이 밤 (사용자 결정 2026-11-16)
export const DAY_VOTE_OUTCOMES = new Set(["ABSTAINED", "ABSTAIN_MAJORITY", "TIE", "TRIBUNAL", "DEFENDANT_DISCONNECTED"])
// 피고 사망(피고가 나감·끊긴 피고 60초 지남)으로 닫힌 재판도 받음: 그 밤에 판이 끝나면 끝난 판 스냅샷에 실림 (취소는 옛 값, 받기만)
export const TRIBUNAL_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY", "CANCELLED", "DEFENDANT_DIED"])
