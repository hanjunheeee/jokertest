export const ROOM_CODE_LENGTH = 6

export const ROOM_CODE_PATTERN = new RegExp(`^[A-Za-z0-9]{${ROOM_CODE_LENGTH}}$`)

const ROOM_CODE_DISALLOWED_PATTERN = /[^A-Za-z0-9]/g

export const ROOM_CODE_COPY_ERRORS = {
  UNAVAILABLE: "방코드를 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
  CLIPBOARD_FAILED: "방코드를 복사하지 못했습니다. 화면의 코드를 직접 입력해 공유해주세요.",
}

export const ROOM_CODE_COPY_RESULTS = Object.freeze({
  COPY_SUCCEEDED: "COPY_SUCCEEDED",
  CODE_UNAVAILABLE: "CODE_UNAVAILABLE",
  CLIPBOARD_FAILED: "CLIPBOARD_FAILED",
})

export function normalizeRoomCode(code) {
  return typeof code === "string" ? code : ""
}

export function isValidRoomCode(code) {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(code))
}

export function normalizeRoomCodeChar(char) {
  return normalizeRoomCode(char).replace(ROOM_CODE_DISALLOWED_PATTERN, "").slice(-1)
}

export function normalizeRoomCodeText(text) {
  return normalizeRoomCode(text)
    .replace(ROOM_CODE_DISALLOWED_PATTERN, "")
    .slice(0, ROOM_CODE_LENGTH)
}

export function resolveRoomCodeCopy(code) {
  const value = normalizeRoomCode(code)

  if (!isValidRoomCode(value)) {
    return { ok: false, value: "", error: ROOM_CODE_COPY_ERRORS.UNAVAILABLE }
  }

  return { ok: true, value, error: "" }
}

export function resolveRoomCodeCopyStatus(code) {
  return isValidRoomCode(code)
    ? ROOM_CODE_COPY_RESULTS.COPY_SUCCEEDED
    : ROOM_CODE_COPY_RESULTS.CODE_UNAVAILABLE
}
