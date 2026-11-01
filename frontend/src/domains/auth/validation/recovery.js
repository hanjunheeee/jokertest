// 아이디 찾기(닉네임 띄어쓰기 포함)·재설정 메일 요청 입력 검사 (서버에 보내기 전에 걸러 냄)
// hooks/recovery/useFindId.js, hooks/recovery/useResetRequest.js가 사용
import { validateEmail } from "./signupValidation.js"

// 아이디 찾기 닉네임 규칙 (가입 검사와 따로 둠, 길이 상한이 다름, 백엔드 아이디 찾기 검사와 같은 판정)
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/
const NICKNAME_MIN = 2
const NICKNAME_MAX = 50
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// 아이디 찾기 안내 글 (띄어쓰기 글은 입력 중 알림에도 씀)
export const FIND_ID_NICKNAME_WHITESPACE_MESSAGE = "닉네임에는 띄어쓰기를 사용할 수 없습니다."
const NICKNAME_CHARSET_MSG = "닉네임은 한글, 영문, 숫자만 사용할 수 있습니다."
const NICKNAME_LENGTH_MSG = `닉네임을 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해주세요.`
const BIRTH_DATE_MSG = "생년월일을 선택해주세요."

// 재설정 메일 주소 규칙
const EMAIL_MAX = 100
const BAD_EMAIL = "이메일 형식이 올바르지 않습니다."

// 가운데 띄어쓰기 있는지 (앞뒤 공백은 서버처럼 잘라서 안 봄)
export function hasFindIdNicknameWhitespace(nickname) {
  if (typeof nickname !== "string") return false
  return /\s/.test(nickname.trim())
}

// 아이디 찾기 닉네임 검사: 빈칸 → 띄어쓰기 → 길이 → 글자 종류 순서, 맞으면 자른 값
export function validateFindIdNickname(nickname) {
  if (typeof nickname !== "string") {
    return { ok: false, message: NICKNAME_LENGTH_MSG }
  }
  const trimmed = nickname.trim()
  if (trimmed.length === 0) {
    return { ok: false, message: NICKNAME_LENGTH_MSG }
  }
  if (hasFindIdNicknameWhitespace(nickname)) {
    return { ok: false, message: FIND_ID_NICKNAME_WHITESPACE_MESSAGE }
  }
  if (trimmed.length < NICKNAME_MIN || trimmed.length > NICKNAME_MAX) {
    return { ok: false, message: NICKNAME_LENGTH_MSG }
  }
  if (!NICKNAME_PATTERN.test(trimmed)) {
    return { ok: false, message: NICKNAME_CHARSET_MSG }
  }
  return { ok: true, value: trimmed }
}

// 아이디 찾기 입력 검사: 닉네임 먼저, 생년월일은 날짜 모양만 봄, 맞으면 보낼 값
export function validateFindId(nickname, birthDate) {
  const nicknameResult = validateFindIdNickname(nickname)
  if (!nicknameResult.ok) return nicknameResult
  if (typeof birthDate !== "string" || !ISO_DATE.test(birthDate)) {
    return { ok: false, message: BIRTH_DATE_MSG }
  }
  return { ok: true, nickname: nicknameResult.value, birthDate }
}

// 재설정 메일 주소 검사: 빈칸 검사 뒤 길이·공백·@·도메인 순서로 봄
export function validateResetEmail(email) {
  const base = validateEmail(email)
  if (!base.ok) return base

  const value = base.value
  // 너무 길거나 중간에 공백
  if (value.length > EMAIL_MAX) return { ok: false, message: BAD_EMAIL }
  if (/\s/.test(value)) return { ok: false, message: BAD_EMAIL }

  // @ 앞뒤가 비면 안 됨
  const atIndex = value.indexOf("@")
  if (atIndex <= 0 || atIndex === value.length - 1) return { ok: false, message: BAD_EMAIL }

  // 도메인은 점이 있어야 하고 점으로 시작·끝나면 안 됨
  const domain = value.slice(atIndex + 1)
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return { ok: false, message: BAD_EMAIL }
  }

  return { ok: true, value }
}
