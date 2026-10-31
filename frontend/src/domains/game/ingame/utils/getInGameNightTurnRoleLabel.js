import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

export function getInGameNightTurnRoleLabel(role) {
  if (typeof role !== "string" || role.length === 0) return null
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.find((turn) => turn.role === role)?.label ?? null
}
