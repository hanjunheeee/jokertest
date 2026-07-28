/**
 * 렌더링 시점 마스킹 — state.gameId가 currentGameId와 다르면(아직 GAME_CHANGED가 반영되지
 * 않은 한 틱 등) 이전 게임의 draft/messages/status/error를 절대 노출하지 않는다.
 */
export function selectJokerChatView(state, currentGameId) {
  if (state.gameId !== currentGameId) {
    return { draft: "", messages: [], status: "idle", error: null }
  }
  return { draft: state.draft, messages: state.messages, status: state.status, error: state.error }
}
