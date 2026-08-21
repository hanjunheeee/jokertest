const NIGHT_TURN_ROLES = new Set(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])

/**
 * night_turn_changed payload를 검증해 안전하게 소비 가능한 형태로 파싱한다. gameId/dayIndex가
 * 활성 값과 정확히 일치하고 phase가 NIGHT이며 nightTurnRole이 null이거나 4개 canonical 역할 중
 * 하나일 때만 값을 반환하며, 그 외에는 null을 반환해 listener가 stale하거나 계약을 어긴 방송을
 * 무시하게 한다(parseDayVoteResolvedPayload/parseNightResultAppliedPayload와 동일한 원칙).
 */
export function parseNightTurnChangedPayload({ payload, gameId, dayIndex }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  if (!Number.isInteger(dayIndex)) return null
  if (payload.gameId !== gameId) return null
  if (payload.phase !== "NIGHT") return null
  if (payload.dayIndex !== dayIndex) return null
  if (payload.nightTurnRole !== null && !NIGHT_TURN_ROLES.has(payload.nightTurnRole)) return null

  return { gameId: payload.gameId, dayIndex: payload.dayIndex, phase: payload.phase, nightTurnRole: payload.nightTurnRole }
}
