const INITIAL_SYNCED_STATE_BASE = { messages: [], draft: "", status: "idle", error: null }

/** gameId가 바뀌면 완전히 새로 시작한다(참조 동일성 유지 — 같은 gameId면 state 그대로 반환). */
function withGameSync(state, gameId) {
  if (gameId === state.gameId) return state
  return { gameId, ...INITIAL_SYNCED_STATE_BASE }
}

/**
 * JOKER 전용 NIGHT 채팅의 gameId 전환 원자성을 소유하는 reducer. gameId를 상태의 일부로
 * 직접 소유하고, RECEIVE/DRAFT/SEND/ACK/INVALIDATE 5종 액션 모두 action.gameId를 받아
 * 현재 gameId와 다르면 무시(RECEIVE만 예외 — withGameSync로 먼저 전환한 뒤 append)한다.
 */
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
