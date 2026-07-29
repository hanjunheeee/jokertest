/**
 * night_actions_resolved/night_action_result 방송이 현재 보고 있는 게임을 향한 것인지
 * 판정한다. 둘 다 payload.gameId가 활성 gameId와 일치할 때만 반영해야 한다 — stale(이전
 * 게임을 향한) 방송이 새 게임 state를 잘못 덮어쓰는 것을 막는다.
 */
export function shouldApplyNightBroadcastPayload({ payload, gameId }) {
  if (!gameId) return false
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return false
  return payload.gameId === gameId
}
