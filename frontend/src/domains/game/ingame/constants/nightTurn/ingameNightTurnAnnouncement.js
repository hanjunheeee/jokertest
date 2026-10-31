export const INGAME_NIGHT_TURN_ANNOUNCEMENTS = Object.freeze([
  Object.freeze({ role: "JOKER", label: "광대", message: "광대의 시간입니다" }),
  Object.freeze({ role: "DOCTOR", label: "의사", message: "의사의 시간입니다" }),
  Object.freeze({ role: "GUARD", label: "경비원", message: "경비원의 시간입니다" }),
  Object.freeze({ role: "WITCH_HUNTER", label: "마녀사냥꾼", message: "마녀사냥꾼의 시간입니다" }),
])

export const INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS = 2600

export const INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL = "확인"

export function isInGameAnnounceableNightTurnRole(role, dayIndex) {
  if (typeof role !== "string" || role.length === 0) return false
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return false
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.some((turn) => turn.role === role)
}

export function getInGameNightTurnAnnouncement(role, dayIndex) {
  if (!isInGameAnnounceableNightTurnRole(role, dayIndex)) return null
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.find((turn) => turn.role === role) ?? null
}
