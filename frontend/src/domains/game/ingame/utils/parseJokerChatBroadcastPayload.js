import { sanitizeJokerChatText } from "./sanitizeJokerChatText.js"

/**
 * 서버가 보낸 joker_chat_message 브로드캐스트 payload를 network 모델로 검증·변환한다.
 * 반환 객체는 정확히 {gameId, senderUuid, text, id, sentAt} 5개 키만 갖는다 — 원본 payload에
 * role/team/nickname 등 추가 키가 있어도 반환값에는 절대 포함되지 않는다(스프레드를 쓰지 않고
 * 필드를 하나씩 명시적으로 골라 새 객체를 만든다).
 */
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
