const SANITIZE_CODE_MESSAGES = {
  EMPTY_MESSAGE: "메시지를 입력해주세요.",
  MESSAGE_TOO_LONG: "메시지는 150자 이하로 입력해주세요.",
  INVALID_CHARACTERS: "사용할 수 없는 문자가 포함되어 있습니다.",
}

const FALLBACK_MESSAGE = "메시지를 보낼 수 없습니다."

/** sanitizeJokerChatText의 실패 code를 사용자에게 보여줄 문구로 변환한다. */
export function mapJokerChatSanitizeCodeToMessage(code) {
  return SANITIZE_CODE_MESSAGES[code] ?? FALLBACK_MESSAGE
}
