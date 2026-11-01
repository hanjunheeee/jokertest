// 낮·죽은 사람 채팅 방송 검사 → 화면에 넣을 메시지 (틀리면 null)
// 낮 채팅 받기(attachGameChatListener)가 사용
import { sanitizeJokerChatText } from "./chatText.js"

// 판·보낸이·메시지 id·별명은 빈칸 아님, 보낸 시각·날짜는 0 이상 정수
export function parseGameChatBroadcastPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null

  const gameId = typeof payload.gameId === "string" ? payload.gameId.trim() : ""
  if (gameId.length === 0) return null

  const senderUuid = typeof payload.senderUuid === "string" ? payload.senderUuid.trim() : ""
  if (senderUuid.length === 0) return null

  const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : ""
  if (messageId.length === 0) return null

  const nickname = typeof payload.nickname === "string" ? payload.nickname.trim() : ""
  if (nickname.length === 0) return null

  if (!Number.isInteger(payload.sentAt) || payload.sentAt < 0) return null
  if (!Number.isInteger(payload.dayIndex) || payload.dayIndex < 0) return null

  // 글은 다듬어도 그대로여야 받음 (다듬으면 달라지는 글은 거절)
  if (typeof payload.text !== "string") return null
  const sanitized = sanitizeJokerChatText(payload.text)
  if (!sanitized.ok) return null
  if (sanitized.text !== payload.text) return null

  return {
    gameId,
    id: messageId,
    senderUuid,
    nickname,
    text: sanitized.text,
    sentAt: payload.sentAt,
    dayIndex: payload.dayIndex,
  }
}
