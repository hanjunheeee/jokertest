import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

const KNOWN_NIGHT_TURN_ROLES = new Set(INGAME_NIGHT_TURN_ANNOUNCEMENTS.map((turn) => turn.role))

export function selectInGameNightTurnRole(state) {
  if (state === null || typeof state !== "object") return null
  if (state.phase !== "NIGHT") return null

  const dayIndex = state.dayIndex
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null

  const declared = state.nightTurnRole
  return typeof declared === "string" && KNOWN_NIGHT_TURN_ROLES.has(declared) ? declared : null
}
