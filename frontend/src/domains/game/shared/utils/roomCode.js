// 방 코드 길이·모양 검사, 못 쓰는 글자 지우기, 복사 결과 판정
// matching 방코드 복사·mode 방코드 입력과 방 목록 행이 씀

// 방 코드 길이
export const ROOM_CODE_LENGTH = 6

// 영문·숫자로만 된 6자리
export const ROOM_CODE_PATTERN = new RegExp(`^[A-Za-z0-9]{${ROOM_CODE_LENGTH}}$`)

// 지울 글자 (영문·숫자 말고 전부)
const DISALLOWED_PATTERN = /[^A-Za-z0-9]/g

// 복사 못 할 때 문구
export const ROOM_CODE_COPY_ERRORS = {
  UNAVAILABLE: "방코드를 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
  CLIPBOARD_FAILED: "방코드를 복사하지 못했습니다. 화면의 코드를 직접 입력해 공유해주세요.",
}

// 복사 결과 표시 값 (복사 버튼 data-copy-status에 실림)
export const ROOM_CODE_COPY_RESULTS = Object.freeze({
  COPY_SUCCEEDED: "COPY_SUCCEEDED",
  CODE_UNAVAILABLE: "CODE_UNAVAILABLE",
  CLIPBOARD_FAILED: "CLIPBOARD_FAILED",
})

// 문자열 아니면 빈 문자열로 (대문자 바꾸기는 입력 훅이 함)
export function normalizeRoomCode(code) {
  return typeof code === "string" ? code : ""
}

// 영문·숫자 6자리인지
export function isValidRoomCode(code) {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(code))
}

// 한 칸 입력 정리: 허용 글자만 남기고 마지막 한 글자
export function normalizeRoomCodeChar(char) {
  return normalizeRoomCode(char).replace(DISALLOWED_PATTERN, "").slice(-1)
}

// 붙여넣은 글 정리: 허용 글자만 남기고 6자리까지
export function normalizeRoomCodeText(text) {
  return normalizeRoomCode(text)
    .replace(DISALLOWED_PATTERN, "")
    .slice(0, ROOM_CODE_LENGTH)
}

// 복사할 값 정하기 (형식 안 맞으면 못 함 + 이유 문구)
export function resolveRoomCodeCopy(code) {
  const value = normalizeRoomCode(code)

  if (!isValidRoomCode(value)) {
    return { ok: false, value: "", error: ROOM_CODE_COPY_ERRORS.UNAVAILABLE }
  }

  return { ok: true, value, error: "" }
}

// 복사 결과 표시 값 (형식 맞으면 성공, 아니면 코드 없음)
export function resolveRoomCodeCopyStatus(code) {
  return isValidRoomCode(code)
    ? ROOM_CODE_COPY_RESULTS.COPY_SUCCEEDED
    : ROOM_CODE_COPY_RESULTS.CODE_UNAVAILABLE
}
