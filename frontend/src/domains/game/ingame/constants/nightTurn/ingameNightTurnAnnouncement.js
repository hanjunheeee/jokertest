// 밤 차례 안내: 역할별 글·보여 주는 시간·안내할지 판단
// 밤 차례 안내 창·안내 훅·utils/nightTurn.js·진행 바 상태 글이 사용

// 밤 차례가 오는 역할별 이름·안내 글
export const INGAME_NIGHT_TURN_ANNOUNCEMENTS = Object.freeze([
  Object.freeze({ role: "JOKER", label: "광대", message: "광대의 시간입니다" }),
  Object.freeze({ role: "DOCTOR", label: "의사", message: "의사의 시간입니다" }),
  Object.freeze({ role: "GUARD", label: "경비원", message: "경비원의 시간입니다" }),
  Object.freeze({ role: "WITCH_HUNTER", label: "마녀사냥꾼", message: "마녀사냥꾼의 시간입니다" }),
])

// 안내 보여 주는 시간과 닫기 버튼 글
export const ANNOUNCEMENT_MS = 2600

export const CLOSE_LABEL = "확인"

// 안내할 역할·날짜인지 (날짜가 이상하면 안 함)
export function isAnnounceableNightTurnRole(role, dayIndex) {
  if (typeof role !== "string" || role.length === 0) return false
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return false
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.some((turn) => turn.role === role)
}

// 역할 → 안내 내용 (안내 안 하면 null)
export function getInGameNightTurnAnnouncement(role, dayIndex) {
  if (!isAnnounceableNightTurnRole(role, dayIndex)) return null
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.find((turn) => turn.role === role) ?? null
}
