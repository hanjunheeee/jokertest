// 채팅 글 검사(금지 문자·빈 글·길이)와 검사 실패 문구
// 게임·조커 채팅 세션 훅과 채팅 방송 검사가 사용

// 글 길이 상한과 막는 글자(제어 문자·글 방향을 바꾸는 숨은 문자)
const JOKER_CHAT_MAX_LENGTH = 150

const FORBIDDEN_CHARS_PATTERN =
    // eslint-disable-next-line no-control-regex -- 제어 문자를 막으려고 일부러 범위에 넣음
    /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/

// 줄바꿈 맞추고 금지 문자·빈 글·길이 검사 (통과하면 앞뒤 공백 뺀 글)
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

// 실패 코드별 문구와 모르는 코드용 기본 문구
const SANITIZE_CODE_MESSAGES = {
  EMPTY_MESSAGE: "메시지를 입력해주세요.",
  MESSAGE_TOO_LONG: "메시지는 150자 이하로 입력해주세요.",
  INVALID_CHARACTERS: "사용할 수 없는 문자가 포함되어 있습니다.",
}

const FALLBACK_MESSAGE = "메시지를 보낼 수 없습니다."

// 검사 실패 코드 → 화면 문구
export function mapJokerChatSanitizeCodeToMessage(code) {
  return SANITIZE_CODE_MESSAGES[code] ?? FALLBACK_MESSAGE
}
