/** backend/utils/roomCode.js CHARS와 동일 — I, O, 0, 1 제외 */
export const ROOM_CODE_ALLOWED_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const ALLOWED_CHAR_SET = new Set(ROOM_CODE_ALLOWED_CHARS.split(""))

export const ROOM_CODE_LENGTH = 6

/** 붙여넣기·다중 입력 문자열을 서버 방코드 charset에 맞게 정규화합니다. */
export function sanitizeRoomCode(text, maxLength = ROOM_CODE_LENGTH) {
  return String(text ?? "")
    .toUpperCase()
    .split("")
    .filter((char) => ALLOWED_CHAR_SET.has(char))
    .join("")
    .slice(0, maxLength)
}

/** 한 칸 입력용 — 허용 문자 중 마지막 1글자만 반환합니다. */
export function sanitizeRoomCodeChar(text) {
  return sanitizeRoomCode(text, ROOM_CODE_LENGTH).slice(-1)
}
