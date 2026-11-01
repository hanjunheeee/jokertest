// 조커 채팅 받기: 모양 검사 통과하고 지금 판 것만 손잡이에 넘기기, 화면용 메시지로 바꾸기
// 조커 채팅 세션 훅이 사용, 받기 등록은 socket/chat.js가 맡음
import { onJokerChat } from "../socket/chat.js"
import { sanitizeJokerChatText } from "./chatText.js"

// 받기 등록: 검사 통과하고 지금 판 것만 넘김, 끄는 함수를 돌려줌
export function attachJokerChatListener(socket, handler, getCurrentGameId) {
  const onMessage = (payload) => {
    const parsed = parseJokerChatBroadcastPayload(payload)
    if (!parsed) return
    if (parsed.gameId !== getCurrentGameId()) return
    handler(parsed)
  }
  return onJokerChat(socket, onMessage)
}

// 조커 채팅 방송 검사 (글이 검사 전후로 같아야 받음)
export function parseJokerChatBroadcastPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null

  const gameId = typeof payload.gameId === "string" ? payload.gameId.trim() : ""
  if (gameId.length === 0) return null

  const senderUuid = typeof payload.senderUuid === "string" ? payload.senderUuid.trim() : ""
  if (senderUuid.length === 0) return null

  const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : ""
  if (messageId.length === 0) return null

  if (!Number.isInteger(payload.sentAt) || payload.sentAt < 0) return null

  if (typeof payload.text !== "string") return null
  const sanitized = sanitizeJokerChatText(payload.text)
  if (!sanitized.ok) return null
  if (sanitized.text !== payload.text) return null

  return { gameId, senderUuid, text: sanitized.text, id: messageId, sentAt: payload.sentAt }
}

// 받은 메시지 → 화면용 (판에 없는 보낸이면 null)
export function toJokerChatUiMessage(networkMessage, getPlayerById) {
  const canonicalPlayer = getPlayerById?.(networkMessage.senderUuid)
  if (!canonicalPlayer) return null

  return {
    id: networkMessage.id,
    playerId: networkMessage.senderUuid,
    senderName: canonicalPlayer.nickname,
    text: networkMessage.text,
    sentAt: networkMessage.sentAt,
  }
}
