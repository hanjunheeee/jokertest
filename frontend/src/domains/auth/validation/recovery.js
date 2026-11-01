// 아이디 찾기·재설정 메일 요청 입력 검사 (서버에 보내기 전에 걸러 냄)
// hooks/recovery/useFindId.js, hooks/recovery/useResetRequest.js가 사용
import { validateEmail } from "./signupValidation.js"

// 아이디 찾기 닉네임 규칙 (가입 검사와 따로 둠, 길이 상한이 다름)
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/
const NICKNAME_MIN = 2
const NICKNAME_MAX = 50
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// 재설정 메일 주소 규칙
const EMAIL_MAX = 100
const BAD_EMAIL = "이메일 형식이 올바르지 않습니다."

// 아이디 찾기 입력 검사: 닉네임 먼저, 생년월일은 날짜 모양만 봄
export function validateFindId(nickname, birthDate) {
  const trimmed = nickname.trim()
  if (trimmed.length < NICKNAME_MIN || trimmed.length > NICKNAME_MAX || !NICKNAME_PATTERN.test(trimmed)) {
    return { ok: false, message: `닉네임을 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해주세요.` }
  }
  if (!ISO_DATE.test(birthDate)) {
    return { ok: false, message: "생년월일을 선택해주세요." }
  }
  return { ok: true }
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
