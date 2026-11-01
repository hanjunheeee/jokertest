// 낮·죽은 사람 채팅 상태 바꾸기와 지금 판·계정 기준 화면 값 고르기
// 낮 채팅 세션 훅(useInGameGameChatSession)이 사용
import { INGAME_CHAT_CHANNELS } from "./inGameChatChannel.js"

// 채널 하나의 처음 상태 (세대·보낸 표식으로 옛 응답을 가림)
function emptyChannelState() {
  return { messages: [], draft: "", status: "idle", error: null, generation: 0, pendingToken: null }
}

// 처음 상태: 판·계정 없음, 낮·죽은 사람 채널 비어 있음
export function initialGameChatState() {
  return {
    gameId: null,
    authUuid: null,
    [INGAME_CHAT_CHANNELS.DAY]: emptyChannelState(),
    [INGAME_CHAT_CHANNELS.DEAD]: emptyChannelState(),
  }
}

// 이 상태가 다루는 채널(낮·죽은 사람)인지
function isKnownChannel(channel) {
  return channel === INGAME_CHAT_CHANNELS.DAY || channel === INGAME_CHAT_CHANNELS.DEAD
}

// 로그인 계정 id가 있는지
function isAuthenticated(authUuid) {
  return typeof authUuid === "string" && authUuid.length > 0
}

// 계정이 없으면 판도 비움, 판 id는 빈칸이면 null
function normalizeIdentity(gameId, authUuid) {
  if (!isAuthenticated(authUuid)) return { gameId: null, authUuid: null }
  return { gameId: typeof gameId === "string" && gameId.length > 0 ? gameId : null, authUuid }
}

// 동작의 판·계정이 지금 상태와 같은지 (로그인·판이 있어야 함)
function isCurrentIdentity(state, action) {
  return (
    isAuthenticated(state.authUuid) &&
    state.gameId !== null &&
    action.gameId === state.gameId &&
    action.authUuid === state.authUuid
  )
}

// 판·계정이 바뀌면 처음 상태로 되돌림 (같으면 그대로)
function withIdentitySync(state, gameId, authUuid) {
  const identity = normalizeIdentity(gameId, authUuid)
  if (identity.gameId === state.gameId && identity.authUuid === state.authUuid) return state
  return { ...initialGameChatState(), ...identity }
}

// 보내던 것 버리기: 세대 올리고 보낸 표식 지움 (메시지·입력은 둠)
function invalidateChannel(channelState) {
  return {
    ...channelState,
    status: "idle",
    error: null,
    generation: channelState.generation + 1,
    pendingToken: null,
  }
}

// 동작별 상태 바꾸기 (다른 판·계정·모르는 채널 동작은 무시)
export function gameChatReducer(state, action) {
  switch (action.type) {
    case "CONTEXT_CHANGED":
      return withIdentitySync(state, action.gameId, action.authUuid)

    case "RECEIVE": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state
      const channelState = state[action.channel]
      return {
        ...state,
        [action.channel]: { ...channelState, messages: [...channelState.messages, action.message] },
      }
    }

    case "DRAFT": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state
      return { ...state, [action.channel]: { ...state[action.channel], draft: action.draft } }
    }

    case "SEND": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state
      // 보낸 표식이 없으면 무시 (응답 짝을 못 맞춤)
      if (typeof action.requestToken !== "string" || action.requestToken.length === 0) return state
      return {
        ...state,
        [action.channel]: { ...state[action.channel], status: "sending", error: null, pendingToken: action.requestToken },
      }
    }

    case "LOCAL_ERROR": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state
      return { ...state, [action.channel]: { ...state[action.channel], status: "idle", error: action.message } }
    }

    case "ACK": {
      if (!isCurrentIdentity(state, action)) return state
      if (!isKnownChannel(action.channel)) return state

      const channelState = state[action.channel]
      // 무효화 뒤 응답이거나 다른 보내기의 응답이면 버림
      if (channelState.generation !== action.generation) return state
      if (channelState.pendingToken === null || channelState.pendingToken !== action.requestToken) return state

      // 실패: 문구 보이고 입력은 둠
      if (!action.ok) {
        return {
          ...state,
          [action.channel]: { ...channelState, status: "idle", error: action.message, pendingToken: null },
        }
      }

      // 성공: 보낸 글 그대로면 입력 비움 (그사이 고쳤으면 둠)
      const draft = channelState.draft === action.requestDraft ? "" : channelState.draft
      return {
        ...state,
        [action.channel]: { ...channelState, status: "idle", error: null, pendingToken: null, draft },
      }
    }

    // 연결 끊김·판·채널 바뀜: 두 채널 다 보내던 것 버림
    case "INVALIDATE":
      return {
        ...state,
        [INGAME_CHAT_CHANNELS.DAY]: invalidateChannel(state[INGAME_CHAT_CHANNELS.DAY]),
        [INGAME_CHAT_CHANNELS.DEAD]: invalidateChannel(state[INGAME_CHAT_CHANNELS.DEAD]),
      }

    default:
      return state
  }
}

// 보여 줄 수 없을 때 빈 화면 값 (generation null이면 훅이 보내기를 막음)
const MASKED_VIEW = Object.freeze({ draft: "", messages: [], status: "idle", error: null, generation: null })

// 지금 계정·판이고 볼 수 있는 채널일 때만 그 채널 화면 값
export function selectGameChatView(state, currentGameId, currentAuthUuid, accessibleChannel) {
  if (!isAuthenticated(currentAuthUuid)) return MASKED_VIEW
  if (state.authUuid !== currentAuthUuid) return MASKED_VIEW
  if (state.gameId === null || state.gameId !== currentGameId) return MASKED_VIEW
  if (!isKnownChannel(accessibleChannel)) return MASKED_VIEW

  const channelState = state[accessibleChannel]
  return {
    draft: channelState.draft,
    messages: channelState.messages,
    status: channelState.status,
    error: channelState.error,
    generation: channelState.generation,
  }
}
