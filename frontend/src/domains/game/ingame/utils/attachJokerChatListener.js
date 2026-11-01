// 조커 채팅 받기: 모양 검사 통과하고 지금 판 것만 손잡이에 넘김
// 조커 채팅 세션 훅이 사용, 받기 등록은 socket/chat.js가 맡음
import { onJokerChat } from "../socket/chat.js"
import { parseJokerChatBroadcastPayload } from "./parseJokerChatBroadcastPayload.js"

export function attachJokerChatListener(socket, handler, getCurrentGameId) {
  const onMessage = (payload) => {
    const parsed = parseJokerChatBroadcastPayload(payload)
    if (!parsed) return
    if (parsed.gameId !== getCurrentGameId()) return
    handler(parsed)
  }
  return onJokerChat(socket, onMessage)
}
