// 조커 채팅 상태 바꾸기와 지금 판 기준 화면 값 고르기
// 조커 채팅 세션 훅이 사용

// 판이 바뀔 때 되돌릴 처음 값 (판 id 빼고)
const INITIAL_SYNCED_STATE_BASE = { messages: [], draft: "", status: "idle", error: null }

// 다른 판이면 처음 상태로 바꿈
function withGameSync(state, gameId) {
  if (gameId === state.gameId) return state
  return { gameId, ...INITIAL_SYNCED_STATE_BASE }
}

// 판 바뀜·받기·입력·보내기·응답·무효화에 따라 상태 바꿈 (다른 판 동작은 무시)
export function jokerChatReducer(state, action) {
  switch (action.type) {
    case "GAME_CHANGED":
      return withGameSync(state, action.gameId)

    // 받기: 다른 판 메시지면 그 판으로 새로 시작하고 붙임
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
      // 성공: 보낸 글 그대로면 입력 비움 (그사이 고쳤으면 둠)
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

// 다른 판 상태면 빈 화면 값
export function selectJokerChatView(state, currentGameId) {
  if (state.gameId !== currentGameId) {
    return { draft: "", messages: [], status: "idle", error: null }
  }
  return { draft: state.draft, messages: state.messages, status: state.status, error: state.error }
}
