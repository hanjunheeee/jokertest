export function shouldApplyNightBroadcastPayload({ payload, gameId }) {
  if (!gameId) return false
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return false
  return payload.gameId === gameId
}
