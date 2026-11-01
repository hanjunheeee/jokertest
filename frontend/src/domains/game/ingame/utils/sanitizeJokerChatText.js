const JOKER_CHAT_MAX_LENGTH = 150

const FORBIDDEN_CHARS_PATTERN =
    /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/

export function sanitizeJokerChatText(rawText) {
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (FORBIDDEN_CHARS_PATTERN.test(normalized)) {
    return { ok: false, code: "INVALID_CHARACTERS" }
  }
  const trimmed = normalized.trim()
  if (trimmed.length === 0) return { ok: false, code: "EMPTY_MESSAGE" }
  if (trimmed.length > JOKER_CHAT_MAX_LENGTH) return { ok: false, code: "MESSAGE_TOO_LONG" }
  return { ok: true, text: trimmed }
}
