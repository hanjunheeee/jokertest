// 소셜 로그인·소셜 가입 응답과 에러를 화면 값(모드·상태·문구)으로 바꾸기
// pages/LoginPage.jsx(로그인 화면 모드), hooks/socialSignup/*(가입 에러)가 사용, hooks/useLoginPage.js가 시험용으로 다시 내보냄
import { DEFAULT_SOCIAL_ERROR_MESSAGE, SOCIAL_ERROR_MESSAGES, SOCIAL_SIGNUP_TEXT } from "../constants/socialMessages.js"

// 모르는 코드는 기본 문구 (자기 키만 봐서 toString 같은 이름도 걸러 냄)
export function mapSocialErrorCode(code) {
  if (typeof code === "string" && Object.prototype.hasOwnProperty.call(SOCIAL_ERROR_MESSAGES, code)) {
    return SOCIAL_ERROR_MESSAGES[code]
  }
  return DEFAULT_SOCIAL_ERROR_MESSAGE
}

// 주소에 socialIntent가 있으면 소셜 가입, socialError만 있으면 에러 문구, 둘 다 없으면 보통 로그인
export function resolveSocialLoginView({ socialIntent, socialError } = {}) {
  if (typeof socialIntent === "string" && socialIntent) {
    return { mode: "socialSignup", intentToken: socialIntent }
  }
  if (typeof socialError === "string" && socialError) {
    return { mode: "socialError", message: mapSocialErrorCode(socialError) }
  }
  return { mode: "default" }
}

// 5xx 응답의 code는 믿지 않음
export const trustedErrorCode = (error) => (
  typeof error?.status === "number" && error.status >= 500 ? undefined : error?.code
)

// 가입 완료 응답의 user에 uuid가 있어야 가입된 걸로 봄
export const isCompletedSignupUser = (user) => (
  user !== null
  && typeof user === "object"
  && !Array.isArray(user)
  && typeof user.uuid === "string"
  && user.uuid.length > 0
)

// 가입 정보 불러오기 실패 → 바꿀 가입 상태(없으면 그대로)·문구
export function intentErrorView(error) {
  const code = trustedErrorCode(error)
  let status
  switch (code) {
    case "INTENT_EXPIRED":
    case "INTENT_INVALID":
      status = "expired"
      break
    case "INTENT_CONSUMED":
      status = "cancelled"
      break
    default:
  }
  // 믿을 code가 있을 때만 서버 문구를 씀
  const message = code
    ? (error?.message || SOCIAL_SIGNUP_TEXT.intentLoadFailed)
    : SOCIAL_SIGNUP_TEXT.intentLoadFailed
  return { status, message }
}

// 가입 완료 실패 → 가입 상태·문구, 인증 증명이 없거나 거절이면 proofLost
export function submitErrorView(error) {
  const code = trustedErrorCode(error)
  let status = "error"
  switch (code) {
    case "INTENT_EXPIRED":
      status = "expired"
      break
    case "INTENT_CONSUMED":
      status = "cancelled"
      break
    case "EMAIL_CONFLICT":
      status = "conflict"
      break
    default:
  }
  const proofLost = code === "SIGNUP_PROOF_REQUIRED" || code === "SIGNUP_PROOF_INVALID"
  // 5xx로 code를 버렸으면 통신 실패 문구, 아니면 서버 문구
  const message = code === "SIGNUP_PROOF_REQUIRED" ? SOCIAL_SIGNUP_TEXT.proofRequired
    : code === "SIGNUP_PROOF_INVALID" ? SOCIAL_SIGNUP_TEXT.proofInvalid
      : code !== error?.code ? SOCIAL_SIGNUP_TEXT.generic
        : error?.message || SOCIAL_SIGNUP_TEXT.cannotComplete
  return { status, message, proofLost }
}
