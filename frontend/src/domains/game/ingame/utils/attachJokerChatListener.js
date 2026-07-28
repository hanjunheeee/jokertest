import { parseJokerChatBroadcastPayload } from "./parseJokerChatBroadcastPayload.js"

/**
 * joker_chat_message 리스너 등록/해제를 순수 함수로 추출한다 — parser 호출과 gameId 필터링을
 * 이 함수 안에서 전담해, "이 메시지의 gameId가 지금 실제로 유효한 gameId와 같은가"를 handler
 * 호출 이전에 판정하는 1차 방어선 역할을 한다(다르면 handler 자체가 호출되지 않는다).
 */
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
