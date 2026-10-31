export const NICKNAME_MIN_LENGTH = 2
export const NICKNAME_MAX_LENGTH = 8
export const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 64
export const PASSWORD_MAX_BYTES = 72

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

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

export function todayUtc() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function validateEmail(email) {
  if (typeof email !== "string" || !email.trim()) {
    return { ok: false, message: "이메일을 입력해주세요." }
  }
  return { ok: true, value: email.trim() }
}

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

export function validatePasswordConfirm(password, passwordConfirm) {
  if (password !== passwordConfirm) {
    return { ok: false, message: "비밀번호 확인이 일치하지 않습니다." }
  }
  return { ok: true }
}

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
