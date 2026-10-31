import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

const KNOWN_NIGHT_TURN_ROLES = new Set(INGAME_NIGHT_TURN_ANNOUNCEMENTS.map((turn) => turn.role))

export function parseNightTurnStartedPayload({ payload, gameId, dayIndex }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, dayIndex: payloadDayIndex, role, deadline } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null

  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Number.isInteger(dayIndex) || payloadDayIndex !== dayIndex) return null

  if (typeof role !== "string" || !KNOWN_NIGHT_TURN_ROLES.has(role)) return null

  if (!Number.isFinite(deadline) || deadline <= 0) return null

  return { gameId: payloadGameId, dayIndex: payloadDayIndex, role, deadline }
}
