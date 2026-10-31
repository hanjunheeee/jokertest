import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

const KNOWN_NIGHT_TURN_ROLES = new Set(INGAME_NIGHT_TURN_ANNOUNCEMENTS.map((turn) => turn.role))

export function parseNightTurnEndedPayload({ payload, gameId, dayIndex, nightTurnRole }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, dayIndex: payloadDayIndex, role } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (typeof gameId !== "string" || payloadGameId !== gameId) return null
  if (!Number.isInteger(payloadDayIndex) || !Number.isInteger(dayIndex) || payloadDayIndex !== dayIndex) return null
  if (typeof role !== "string" || !KNOWN_NIGHT_TURN_ROLES.has(role)) return null
  if (typeof nightTurnRole !== "string" || role !== nightTurnRole) return null

  return { gameId: payloadGameId, dayIndex: payloadDayIndex, role }
}
