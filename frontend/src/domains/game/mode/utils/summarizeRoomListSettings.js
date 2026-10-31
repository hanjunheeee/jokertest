const ROLE_LABELS = Object.freeze({
  JOKER: "광대",
  DOCTOR: "의사",
  GUARD: "경비원",
  WITCH_HUNTER: "마녀사냥꾼",
})

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function summarizeRoomListSettings(settings) {
  if (!isPlainObject(settings)) return { roles: null, times: null, ariaText: null }

  let roles = null
  if (settings.roleCompositionMode === "custom" && isPlainObject(settings.roleCounts)) {
    const parts = Object.keys(ROLE_LABELS)
      .filter((role) => Number.isInteger(settings.roleCounts[role]) && settings.roleCounts[role] > 0)
      .map((role) => `${ROLE_LABELS[role]} ${settings.roleCounts[role]}`)
    if (parts.length > 0) roles = parts.join(" · ")
  } else if (Number.isInteger(settings.jokerCount)) {
    roles = `${ROLE_LABELS.JOKER} ${settings.jokerCount}`
  }

  const timeParts = []
  if (Number.isInteger(settings.dayDiscussionTime)) timeParts.push(`토론 ${settings.dayDiscussionTime}초`)
  if (Number.isInteger(settings.dayVoteTime)) timeParts.push(`투표 ${settings.dayVoteTime}초`)
  if (Number.isInteger(settings.nightActionTime)) timeParts.push(`밤 ${settings.nightActionTime}초`)
  const times = timeParts.length > 0 ? timeParts.join(" · ") : null

  const ariaParts = []
  if (roles) ariaParts.push(`직업 구성 ${roles}`)
  if (times) ariaParts.push(times)

  return { roles, times, ariaText: ariaParts.length > 0 ? ariaParts.join(", ") : null }
}
