// 가입 입력 검사 (이메일·닉네임·생년월일·비밀번호) 규칙과 날짜 계산
// 일반 가입·소셜 가입·비밀번호 재설정·이메일 인증 훅이 사용, 경계값은 시험 fixture와 맞춤
export const NICKNAME_MIN_LENGTH = 2
export const NICKNAME_MAX_LENGTH = 8
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 64
export const PASSWORD_MAX_BYTES = 72

const EMAIL_MAX_LENGTH = 100

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// YYYY-MM-DD를 UTC 날짜로, 2월 30일처럼 넘어가는 날짜는 null
export function parseIsoDateUtc(value) {
  if (typeof value !== "string") return null
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  const rollOver = date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
  if (rollOver) return null
  return date
}

// 오늘 0시 (UTC, 미래 생년월일 비교용)
export function todayUtc() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

// 빈칸만 막고 앞뒤 공백 뺀 값을 돌려줌
export function validateEmail(email) {
  if (typeof email !== "string" || !email.trim()) {
    return { ok: false, message: "이메일을 입력해주세요." }
  }
  return { ok: true, value: email.trim() }
}

// 인증번호 받기 전 주소 모양 검사: 길이·공백·@ 앞뒤·도메인 점
export function isValidEmailFormat(email) {
  if (typeof email !== "string") return false
  const trimmed = email.trim()
  if (!trimmed || trimmed.length > EMAIL_MAX_LENGTH) return false
  if (/\s/.test(trimmed)) return false

  const atIndex = trimmed.indexOf("@")
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return false

  const domain = trimmed.slice(atIndex + 1)
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false

  return true
}

// 닉네임: 빈칸 → 길이 → 글자 종류 순서
export function validateNickname(nickname) {
  if (typeof nickname !== "string" || !nickname.trim()) {
    return { ok: false, message: "닉네임을 입력해주세요." }
  }
  const trimmed = nickname.trim()
  if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH) {
    return { ok: false, message: `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자여야 합니다.` }
  }
  if (!NICKNAME_PATTERN.test(trimmed)) {
    return { ok: false, message: "닉네임은 한글, 영문, 숫자만 사용할 수 있습니다." }
  }
  return { ok: true, value: trimmed }
}

// 생년월일: 빈칸 → 날짜 모양 → 미래 날짜 순서
export function validateBirthDate(birthDate) {
  if (typeof birthDate !== "string" || !birthDate.trim()) {
    return { ok: false, message: "생년월일을 입력해주세요." }
  }
  const parsed = parseIsoDateUtc(birthDate.trim())
  if (!parsed) {
    return { ok: false, message: "생년월일 형식이 올바르지 않습니다." }
  }
  if (parsed.getTime() > todayUtc().getTime()) {
    return { ok: false, message: "생년월일은 미래일 수 없습니다." }
  }
  return { ok: true, value: birthDate.trim() }
}

// 비밀번호: 빈칸 → 글자 수 → 바이트 수 (서버 bcrypt가 72바이트까지만 써서 같은 상한으로 막음)
export function validatePassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, message: "비밀번호를 입력해주세요." }
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: `비밀번호는 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자여야 합니다.` }
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return { ok: false, message: `비밀번호는 ${PASSWORD_MAX_BYTES}바이트를 넘을 수 없습니다.` }
  }
  return { ok: true, value: password }
}

// 비밀번호 확인 칸이 같은지
export function validatePasswordConfirm(password, passwordConfirm) {
  if (password !== passwordConfirm) {
    return { ok: false, message: "비밀번호 확인이 일치하지 않습니다." }
  }
  return { ok: true }
}

// 일반 가입 전체 검사: 이메일 → 닉네임 → 비밀번호 → 확인 → 생년월일 순서, 첫 실패 하나만 돌려줌
export function validateSignupForm({ email, password, passwordConfirm, nickname, birthDate }) {
  const emailResult = validateEmail(email)
  if (!emailResult.ok) return emailResult

  const nicknameResult = validateNickname(nickname)
  if (!nicknameResult.ok) return nicknameResult

  const passwordResult = validatePassword(password)
  if (!passwordResult.ok) return passwordResult

  const confirmResult = validatePasswordConfirm(password, passwordConfirm)
  if (!confirmResult.ok) return confirmResult

  const birthDateResult = validateBirthDate(birthDate)
  if (!birthDateResult.ok) return birthDateResult

  return { ok: true }
}
