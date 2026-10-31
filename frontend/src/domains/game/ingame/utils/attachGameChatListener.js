import { parseGameChatBroadcastPayload } from "./parseGameChatBroadcastPayload.js"
import { shouldAcceptGameChatMessage } from "./shouldAcceptGameChatMessage.js"

export function attachGameChatListener({ socket, eventName, channel, handler, getContext }) {
  const onMessage = (payload) => {
    const parsed = parseGameChatBroadcastPayload(payload)
    if (!parsed) return

    const context = getContext() ?? {}
    const accepted = shouldAcceptGameChatMessage({
      messageChannel: channel,
      messageGameId: parsed.gameId,
      currentGameId: context.gameId,
      currentAuthUuid: context.authUuid,
      currentViewChannel: context.viewChannel,
    })
    if (!accepted) return

    handler(channel, parsed, context)
  }

  socket.on(eventName, onMessage)
  return () => socket.off(eventName, onMessage)
}
