export function selectJokerChatView(state, currentGameId) {
  if (state.gameId !== currentGameId) {
    return { draft: "", messages: [], status: "idle", error: null }
  }
  return { draft: state.draft, messages: state.messages, status: state.status, error: state.error }
}
