// F-29a: 아이디 찾기 입력 검증. backend/validation/findIdValidation.js와 trim·문자셋·
// 생년월일 규칙을 맞춘다 — 모듈 시스템이 달라(ESM/CommonJS) 코드를 그대로 공유할 수 없으므로
// findIdValidation.test.js와 backend/__tests__/findId.policy.test.js가 같은 판정을 유지한다.

export const NICKNAME_MIN_LENGTH = 2
export const NICKNAME_MAX_LENGTH = 50
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const FIND_ID_NICKNAME_WHITESPACE_MESSAGE = "닉네임에는 띄어쓰기를 사용할 수 없습니다."
export const FIND_ID_NICKNAME_CHARSET_MESSAGE = "닉네임은 한글, 영문, 숫자만 사용할 수 있습니다."
export const FIND_ID_NICKNAME_LENGTH_MESSAGE =
  `닉네임을 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해주세요.`
export const FIND_ID_BIRTH_DATE_MESSAGE = "생년월일을 선택해주세요."

/** trim 후에도 남는 공백(가운데 띄어쓰기)만 본다 — 앞뒤 공백은 서버와 같이 trim으로 무시한다. */
export function hasFindIdNicknameWhitespace(nickname) {
  if (typeof nickname !== "string") return false
  return /\s/.test(nickname.trim())
}

export function validateFindIdNickname(nickname) {
  if (typeof nickname !== "string") {
    return { ok: false, message: FIND_ID_NICKNAME_LENGTH_MESSAGE }
  }
  const trimmed = nickname.trim()
  if (trimmed.length === 0) {
    return { ok: false, message: FIND_ID_NICKNAME_LENGTH_MESSAGE }
  }
  if (hasFindIdNicknameWhitespace(nickname)) {
    return { ok: false, message: FIND_ID_NICKNAME_WHITESPACE_MESSAGE }
  }
  if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH) {
    return { ok: false, message: FIND_ID_NICKNAME_LENGTH_MESSAGE }
  }
  if (!NICKNAME_PATTERN.test(trimmed)) {
    return { ok: false, message: FIND_ID_NICKNAME_CHARSET_MESSAGE }
  }
  return { ok: true, value: trimmed }
}

export function validateFindIdLocalInput(nickname, birthDate) {
  const nicknameResult = validateFindIdNickname(nickname)
  if (!nicknameResult.ok) return nicknameResult
  if (typeof birthDate !== "string" || !ISO_DATE_PATTERN.test(birthDate)) {
    return { ok: false, message: FIND_ID_BIRTH_DATE_MESSAGE }
  }
  return { ok: true, nickname: nicknameResult.value, birthDate }
}
