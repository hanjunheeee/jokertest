// 가입 인증번호 받기·확인 실패를 종류로 가르기 (화면 문구는 부르는 쪽이 고름)
// hooks/emailVerification/send.js, hooks/emailVerification/verify.js가 사용
import { CODE_ERROR_STATUS } from "../../constants/emailVerification.js"

// code와 HTTP 상태가 둘 다 맞아야 아는 에러로 봄
function isKnown(error, code) {
  return error?.code === code && error?.status === CODE_ERROR_STATUS[code]
}

// 받기 실패 종류 (너무 빨리 재발송이면 기다릴 초도 같이)
export function sendErrorKind(error) {
  if (isKnown(error, "RESEND_TOO_SOON") && Number.isFinite(error.resendAfterSec)) {
    return { kind: "RESEND_TOO_SOON", resendAfterSec: error.resendAfterSec }
  }
  if (isKnown(error, "RATE_LIMITED")) return { kind: "RATE_LIMITED" }
  if (isKnown(error, "INVALID_INPUT")) return { kind: "INVALID_INPUT" }
  return { kind: "UNKNOWN" }
}

// 확인 실패 종류 (틀린 번호면 남은 횟수도 같이, 숫자 아니면 null)
export function verifyErrorKind(error) {
  if (isKnown(error, "CODE_INVALID")) {
    return { kind: "CODE_INVALID", attemptsRemaining: Number.isFinite(error.attemptsRemaining) ? error.attemptsRemaining : null }
  }
  if (isKnown(error, "CODE_EXPIRED")) return { kind: "CODE_EXPIRED" }
  if (isKnown(error, "TOO_MANY_ATTEMPTS")) return { kind: "TOO_MANY_ATTEMPTS" }
  if (isKnown(error, "RATE_LIMITED")) return { kind: "RATE_LIMITED" }
  if (isKnown(error, "INVALID_INPUT")) return { kind: "INVALID_INPUT" }
  return { kind: "UNKNOWN" }
}
