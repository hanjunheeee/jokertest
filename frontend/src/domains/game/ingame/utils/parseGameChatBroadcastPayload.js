import { sanitizeJokerChatText } from "./sanitizeJokerChatText.js"

/**
 * 서버가 보낸 day_chat_message_received / dead_chat_message_received payload를 network 모델로
 * 검증·변환한다. 반환 객체는 정확히 {gameId, id, senderUuid, nickname, text, sentAt, dayIndex}
 * 7개 키만 갖는다 — 원본 payload에 role/team/alive/allies 같은 추가 키가 섞여 있어도 반환값에는
 * 절대 포함되지 않는다(스프레드를 쓰지 않고 필드를 하나씩 명시적으로 골라 새 객체를 만든다).
 *
 * text는 서버와 동일한 정규화 규칙(sanitizeJokerChatText — 세 채널 공용)을 통과해야 하고,
 * 정규화 결과가 원문과 정확히 같아야 한다. 서버가 이미 정규화한 텍스트만 보내므로, 다르다면
 * 신뢰할 수 없는 경로에서 온 payload라는 뜻이라 통째로 폐기한다.
 */
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
