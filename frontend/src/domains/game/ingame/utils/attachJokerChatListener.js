import { parseJokerChatBroadcastPayload } from "./parseJokerChatBroadcastPayload.js"

export function attachJokerChatListener(socket, handler, getCurrentGameId) {
  const onMessage = (payload) => {
    const parsed = parseJokerChatBroadcastPayload(payload)
    if (!parsed) return
    if (parsed.gameId !== getCurrentGameId()) return
    handler(parsed)
  }
  socket.on("joker_chat_message", onMessage)
  return () => socket.off("joker_chat_message", onMessage)
}
