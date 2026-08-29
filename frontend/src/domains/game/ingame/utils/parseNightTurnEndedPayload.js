import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

const KNOWN_NIGHT_TURN_ROLES = new Set(INGAME_NIGHT_TURN_ANNOUNCEMENTS.map((turn) => turn.role))

/**
 * 서버의 night_turn_ended 방송을 현재 canonical 턴과 대조한다.
 * 다른 게임·날짜·역할에서 늦게 도착한 종료 방송은 현재 턴을 지우면 안 되므로 null로 버린다.
 */
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
