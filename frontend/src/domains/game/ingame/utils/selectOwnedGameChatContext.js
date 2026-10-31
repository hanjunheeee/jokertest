import { resolveInGameChatSendChannel, resolveInGameChatViewChannel } from "./inGameChatChannel.js"

const EMPTY_CONTEXT = Object.freeze({ gameId: null, viewChannel: null, sendChannel: null })

export function selectOwnedGameChatContext({ gameId, state } = {}, authUuid) {
  if (typeof authUuid !== "string" || authUuid.length === 0) return EMPTY_CONTEXT
  if (typeof gameId !== "string" || gameId.length === 0) return EMPTY_CONTEXT
  if (state === null || typeof state !== "object" || Array.isArray(state)) return EMPTY_CONTEXT
  if (state.self?.uuid !== authUuid) return EMPTY_CONTEXT

  return {
    gameId,
    viewChannel: resolveInGameChatViewChannel(state),
    sendChannel: resolveInGameChatSendChannel(state),
  }
}
