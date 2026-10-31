export function parseDayPhaseChangedPayload({ payload, gameId, dayIndex }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, dayIndex: payloadDayIndex, dayPhase, round } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null

  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Number.isInteger(dayIndex) || payloadDayIndex !== dayIndex) return null

  if (dayPhase !== "DAY_VOTE") return null
  if (!Number.isInteger(round) || round < 1) return null

  return { gameId: payloadGameId, dayIndex: payloadDayIndex, dayPhase, round }
}
