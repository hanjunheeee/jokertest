// 인증번호 받기 요청 (처음 받기·재발송)
// hooks/useSignupEmailVerification.js의 handleRequestSignupCode가 부름 (ctx = 훅의 상태·ref 묶음)
import { requestSignupCodeApi } from "../../api/auth.api.js"
import { VERIFY_TEXT } from "../../constants/emailVerification.js"
import { sendErrorKind } from "../../utils/emailVerification/errors.js"
import { isValidEmailFormat } from "../../validation/signupValidation.js"

// 보내고 나면 받은 재발송·만료 초를 지금 기준 시각으로 바꿔 저장함
export async function sendCode({ email, active, current, setState, genRef, inFlightRef }) {
  // 꺼짐 / 보내는 중·확인 중·끝남 / 주소 모양 틀림 / 요청 진행 중 / 재발송 대기 중이면 안 보냄
  if (!active) return
  if (current.stage === "sending" || current.stage === "verifying" || current.stage === "verified") return
  if (!isValidEmailFormat(email)) return
  if (inFlightRef.current) return
  if (current.resendAvailableAt !== null && Date.now() < current.resendAvailableAt) return

  // 요청 잠그고 세대 올림 (앞선 응답 버림), 실패 때 돌아갈 단계 기억
  inFlightRef.current = true
  const gen = ++genRef.current
  const stageBefore = current.stage
  const isResend = stageBefore !== "unverified"

  // 재발송이면 적던 인증번호를 비움
  setState((prev) => ({
    ...prev,
    stage: "sending",
    email,
    code: isResend ? "" : prev.code,
    message: "",
  }))

  try {
    const result = await requestSignupCodeApi({ email })
    // 그사이 초기화됐으면 응답 버림
    if (genRef.current !== gen) return

    // 재발송·만료 초가 숫자로 와야 보낸 걸로 봄
    if (result?.ok === true && Number.isFinite(result.resendAfterSec) && Number.isFinite(result.expiresInSec)) {
      const now = Date.now()
      setState((prev) => ({
        ...prev,
        stage: "codeSent",
        email,
        resendAvailableAt: now + result.resendAfterSec * 1000,
        codeExpiresAt: now + result.expiresInSec * 1000,
        attemptsRemaining: null,
        message: "",
      }))
      return
    }

    // ok·초 값이 안 맞는 응답은 못 보낸 걸로 보고 원래 단계로
    setState((prev) => ({ ...prev, stage: stageBefore, message: VERIFY_TEXT.retry }))
  } catch (error) {
    // 초기화됐으면 버림
    if (genRef.current !== gen) return

    // 너무 빨리 재발송: 처음이었으면 보낸 걸로 두고 대기 시각만 맞춤, 나머지는 원래 단계로 돌림
    const described = sendErrorKind(error)
    if (described.kind === "RESEND_TOO_SOON") {
      setState((prev) => ({
        ...prev,
        stage: stageBefore === "unverified" ? "codeSent" : stageBefore,
        email,
        resendAvailableAt: Date.now() + described.resendAfterSec * 1000,
        message: `${described.resendAfterSec}초 후 재발송할 수 있습니다.`,
      }))
    } else if (described.kind === "RATE_LIMITED") {
      setState((prev) => ({ ...prev, stage: stageBefore, message: VERIFY_TEXT.rateLimited }))
    } else if (described.kind === "INVALID_INPUT") {
      setState((prev) => ({ ...prev, stage: stageBefore, message: VERIFY_TEXT.badInput }))
    } else {
      setState((prev) => ({ ...prev, stage: stageBefore, message: VERIFY_TEXT.retry }))
    }
  } finally {
    inFlightRef.current = false
  }
}
