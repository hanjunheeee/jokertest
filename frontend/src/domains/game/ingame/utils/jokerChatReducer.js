const INITIAL_SYNCED_STATE_BASE = { messages: [], draft: "", status: "idle", error: null }

function withGameSync(state, gameId) {
  if (gameId === state.gameId) return state
  return { gameId, ...INITIAL_SYNCED_STATE_BASE }
}

export function jokerChatReducer(state, action) {
  switch (action.type) {
    case "GAME_CHANGED":
      return withGameSync(state, action.gameId)

    case "RECEIVE": {
      const synced = withGameSync(state, action.gameId)
      return { ...synced, messages: [...synced.messages, action.message] }
    }

    case "DRAFT":
      if (action.gameId !== state.gameId) return state
      return { ...state, draft: action.draft }

    case "SEND":
      if (action.gameId !== state.gameId) return state
      return { ...state, status: "sending", error: null }

    case "ACK": {
      if (action.gameId !== state.gameId) return state
      if (action.ok) {
        const draft = state.draft === action.requestDraft ? "" : state.draft
        return { ...state, status: "idle", error: null, draft }
      }
      return { ...state, status: "idle", error: action.message }
    }

    case "INVALIDATE":
      if (action.gameId !== state.gameId) return state
      return { ...state, status: "idle", error: null, messages: [] }

    default:
      return state
  }
}
