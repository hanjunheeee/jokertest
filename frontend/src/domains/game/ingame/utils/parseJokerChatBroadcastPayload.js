import { sanitizeJokerChatText } from "./sanitizeJokerChatText.js"

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
