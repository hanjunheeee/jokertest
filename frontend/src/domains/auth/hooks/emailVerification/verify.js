// 인증번호 확인 요청 (맞으면 가입 증명 signupProof를 받음)
// hooks/useSignupEmailVerification.js의 handleVerifySignupCode가 부름 (ctx = 훅의 상태·ref 묶음)
import { verifySignupCodeApi } from "../../api/auth.api.js"
import { VERIFY_TEXT } from "../../constants/emailVerification.js"
import { verifyErrorKind } from "../../utils/emailVerification/errors.js"

// 실패하면 대부분 codeSent로 돌려 다시 적게 함, 만료·잠김만 다른 단계로
export async function verifyCode({ active, current, setState, genRef, inFlightRef }) {
  // 꺼짐 / 보낸 상태 아님 / 번호 빔 / 요청 진행 중이면 안 보냄
  if (!active) return
  if (current.stage !== "codeSent") return
  if (!current.code) return
  if (inFlightRef.current) return

  // 시계상 이미 만료면 서버에 안 묻고 만료로 바꿈
  if (current.codeExpiresAt !== null && Date.now() >= current.codeExpiresAt) {
    setState((prev) => (
      prev.stage === "codeSent"
        ? { ...prev, stage: "codeExpired", message: VERIFY_TEXT.expired }
        : prev
    ))
    return
  }

  inFlightRef.current = true
  const gen = genRef.current
  const targetEmail = current.email
  const code = current.code

  setState((prev) => ({ ...prev, stage: "verifying", message: "" }))

  try {
    const result = await verifySignupCodeApi({ email: targetEmail, code })
    if (genRef.current !== gen) return

    // 비어 있지 않은 문자열 증명이 와야 인증 끝으로 봄
    if (result?.ok === true && typeof result.signupProof === "string" && result.signupProof) {
      setState((prev) => ({ ...prev, stage: "verified", signupProof: result.signupProof, message: "" }))
      return
    }

    setState((prev) => ({ ...prev, stage: "codeSent", message: VERIFY_TEXT.retry }))
  } catch (error) {
    if (genRef.current !== gen) return

    const described = verifyErrorKind(error)
    if (described.kind === "CODE_INVALID") {
      setState((prev) => ({
        ...prev,
        stage: "codeSent",
        attemptsRemaining: described.attemptsRemaining,
        message: described.attemptsRemaining !== null
          ? `인증번호가 올바르지 않습니다. (남은 시도 ${described.attemptsRemaining}회)`
          : VERIFY_TEXT.wrongCode,
      }))
    } else if (described.kind === "CODE_EXPIRED") {
      setState((prev) => ({ ...prev, stage: "codeExpired", message: VERIFY_TEXT.expired }))
    } else if (described.kind === "TOO_MANY_ATTEMPTS") {
      setState((prev) => ({ ...prev, stage: "locked", message: VERIFY_TEXT.locked }))
    } else if (described.kind === "RATE_LIMITED") {
      setState((prev) => ({ ...prev, stage: "codeSent", message: VERIFY_TEXT.rateLimited }))
    } else if (described.kind === "INVALID_INPUT") {
      setState((prev) => ({ ...prev, stage: "codeSent", message: VERIFY_TEXT.badInput }))
    } else {
      setState((prev) => ({ ...prev, stage: "codeSent", message: VERIFY_TEXT.retry }))
    }
  } finally {
    inFlightRef.current = false
  }
}
