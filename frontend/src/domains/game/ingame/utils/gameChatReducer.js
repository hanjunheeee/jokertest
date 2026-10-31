import { INGAME_CHAT_CHANNELS } from "./inGameChatChannel.js"

function emptyChannelState() {
  return { messages: [], draft: "", status: "idle", error: null, generation: 0, pendingToken: null }
}

export function initialGameChatState() {
  return {
    gameId: null,
    authUuid: null,
    [INGAME_CHAT_CHANNELS.DAY]: emptyChannelState(),
    [INGAME_CHAT_CHANNELS.DEAD]: emptyChannelState(),
  }
}

function isKnownChannel(channel) {
  return channel === INGAME_CHAT_CHANNELS.DAY || channel === INGAME_CHAT_CHANNELS.DEAD
}

function isAuthenticated(authUuid) {
  return typeof authUuid === "string" && authUuid.length > 0
}

function normalizeIdentity(gameId, authUuid) {
  if (!isAuthenticated(authUuid)) return { gameId: null, authUuid: null }
  return { gameId: typeof gameId === "string" && gameId.length > 0 ? gameId : null, authUuid }
}

function isCurrentIdentity(state, action) {
  return (
    isAuthenticated(state.authUuid) &&
    state.gameId !== null &&
    action.gameId === state.gameId &&
    action.authUuid === state.authUuid
  )
}

function withIdentitySync(state, gameId, authUuid) {
  const identity = normalizeIdentity(gameId, authUuid)
  if (identity.gameId === state.gameId && identity.authUuid === state.authUuid) return state
  return { ...initialGameChatState(), ...identity }
}

function invalidateChannel(channelState) {
  return {
    ...channelState,
    status: "idle",
    error: null,
    generation: channelState.generation + 1,
    pendingToken: null,
  }
}

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
      if (channelState.generation !== action.generation) return state
      if (channelState.pendingToken === null || channelState.pendingToken !== action.requestToken) return state

      if (!action.ok) {
        return {
          ...state,
          [action.channel]: { ...channelState, status: "idle", error: action.message, pendingToken: null },
        }
      }

      const draft = channelState.draft === action.requestDraft ? "" : channelState.draft
      return {
        ...state,
        [action.channel]: { ...channelState, status: "idle", error: null, pendingToken: null, draft },
      }
    }

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

const MASKED_VIEW = Object.freeze({ draft: "", messages: [], status: "idle", error: null, generation: null })

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
