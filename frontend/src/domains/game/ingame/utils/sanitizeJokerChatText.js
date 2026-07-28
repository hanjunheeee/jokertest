const JOKER_CHAT_MAX_LENGTH = 150

// 금지 문자: LF(\n)만 제외한 C0 제어문자 전체(TAB 포함) . DEL . C1 제어문자(NEL 포함) .
// Arabic Letter Mark . LRM/RLM . bidi embedding/override . bidi isolate. bidi/서식 문자는
// 채팅에서 텍스트 표시 순서를 조작하는 스푸핑 벡터라 명시적으로 차단한다. 이 값은
// backend/game-core/gameSession.js와 수동으로 동기화된다(공유 모듈이 없는 저장소).
const JOKER_CHAT_FORBIDDEN_CHARS_PATTERN =
    /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/

/**
 * 서버 backend/game-core/gameSession.js의 sanitizeJokerChatText와 동일한 규칙.단계.
 * 순서: CRLF/CR 정규화 -> 금지 문자 검사(정규화된 문자열 기준) -> trim -> 길이 검사(1~150).
 */
export function sanitizeJokerChatText(rawText) {
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (JOKER_CHAT_FORBIDDEN_CHARS_PATTERN.test(normalized)) {
    return { ok: false, code: "INVALID_CHARACTERS" }
  }
  const trimmed = normalized.trim()
  if (trimmed.length === 0) return { ok: false, code: "EMPTY_MESSAGE" }
  if (trimmed.length > JOKER_CHAT_MAX_LENGTH) return { ok: false, code: "MESSAGE_TOO_LONG" }
  return { ok: true, text: trimmed }
}
