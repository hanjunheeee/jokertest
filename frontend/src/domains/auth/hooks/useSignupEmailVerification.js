import { useEffect, useRef, useState } from "react"
import { requestSignupCodeApi, verifySignupCodeApi } from "../api/auth.api.js"

const INITIAL_EMAIL_VERIFICATION = {
  stage: "unverified",
  email: "",
  code: "",
  signupProof: null,
  resendAvailableAt: null,
  codeExpiresAt: null,
  attemptsRemaining: null,
  message: "",
}

const SIGNUP_EMAIL_MAX_LENGTH = 100

export function isValidSignupEmailFormat(email) {
  if (typeof email !== "string") return false
  const trimmed = email.trim()
  if (!trimmed || trimmed.length > SIGNUP_EMAIL_MAX_LENGTH) return false
  if (/\s/.test(trimmed)) return false

  const atIndex = trimmed.indexOf("@")
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return false

  const domain = trimmed.slice(atIndex + 1)
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false

  return true
}

const GENERIC_SIGNUP_CODE_RETRY_MESSAGE = "서버와 통신할 수 없습니다. 다시 시도해주세요."

const SIGNUP_CODE_ERROR_STATUS = {
  RESEND_TOO_SOON: 429,
  RATE_LIMITED: 429,
  INVALID_INPUT: 400,
  CODE_INVALID: 400,
  CODE_EXPIRED: 400,
  TOO_MANY_ATTEMPTS: 429,
}

function isKnownSignupCodeError(error, code) {
  return error?.code === code && error?.status === SIGNUP_CODE_ERROR_STATUS[code]
}

function describeSignupCodeRequestError(error) {
  if (isKnownSignupCodeError(error, "RESEND_TOO_SOON") && Number.isFinite(error.resendAfterSec)) {
    return { kind: "RESEND_TOO_SOON", resendAfterSec: error.resendAfterSec }
  }
  if (isKnownSignupCodeError(error, "RATE_LIMITED")) return { kind: "RATE_LIMITED" }
  if (isKnownSignupCodeError(error, "INVALID_INPUT")) return { kind: "INVALID_INPUT" }
  return { kind: "UNKNOWN" }
}

function describeSignupCodeVerifyError(error) {
  if (isKnownSignupCodeError(error, "CODE_INVALID")) {
    return { kind: "CODE_INVALID", attemptsRemaining: Number.isFinite(error.attemptsRemaining) ? error.attemptsRemaining : null }
  }
  if (isKnownSignupCodeError(error, "CODE_EXPIRED")) return { kind: "CODE_EXPIRED" }
  if (isKnownSignupCodeError(error, "TOO_MANY_ATTEMPTS")) return { kind: "TOO_MANY_ATTEMPTS" }
  if (isKnownSignupCodeError(error, "RATE_LIMITED")) return { kind: "RATE_LIMITED" }
  if (isKnownSignupCodeError(error, "INVALID_INPUT")) return { kind: "INVALID_INPUT" }
  return { kind: "UNKNOWN" }
}

export function useSignupEmailVerification({ email = "", active = true, attemptKey = "" } = {}) {
  const [emailVerification, setEmailVerification] = useState(INITIAL_EMAIL_VERIFICATION)

  const verificationGenerationRef = useRef(0)
  const verificationRequestInFlightRef = useRef(false)
  const [, forceVerificationTick] = useState(0)

  const resetSignature = `${active ? "1" : "0"}\u0000${attemptKey ?? ""}\u0000${email}`
  const [appliedSignature, setAppliedSignature] = useState(resetSignature)
  if (appliedSignature !== resetSignature) {
    setAppliedSignature(resetSignature)
    verificationGenerationRef.current += 1
    setEmailVerification(INITIAL_EMAIL_VERIFICATION)
  }

  useEffect(() => () => { verificationGenerationRef.current += 1 }, [])

  useEffect(() => {
    const relevantStages = new Set(["codeSent", "codeExpired", "locked"])
    if (!relevantStages.has(emailVerification.stage)) return undefined

    const id = setInterval(() => {
      setEmailVerification((prev) => {
        if (prev.stage === "codeSent" && prev.codeExpiresAt !== null && Date.now() >= prev.codeExpiresAt) {
          return { ...prev, stage: "codeExpired", message: "인증번호가 만료되었습니다. 다시 받아주세요." }
        }
        return prev
      })
      forceVerificationTick((tick) => tick + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [emailVerification.stage])

  const handleSignupCodeChange = (e) => {
    const { value } = e.target
    setEmailVerification((prev) => ({ ...prev, code: value }))
  }

  const handleRequestSignupCode = async () => {
    const current = emailVerification

    if (!active) return
    if (current.stage === "sending" || current.stage === "verifying" || current.stage === "verified") return
    if (!isValidSignupEmailFormat(email)) return
    if (verificationRequestInFlightRef.current) return
    if (current.resendAvailableAt !== null && Date.now() < current.resendAvailableAt) return

    verificationRequestInFlightRef.current = true
    const requestGeneration = ++verificationGenerationRef.current
    const stageBeforeSend = current.stage
    const isResend = stageBeforeSend !== "unverified"

    setEmailVerification((prev) => ({
      ...prev,
      stage: "sending",
      email,
      code: isResend ? "" : prev.code,
      message: "",
    }))

    try {
      const result = await requestSignupCodeApi({ email })
      if (verificationGenerationRef.current !== requestGeneration) return

      if (result?.ok === true && Number.isFinite(result.resendAfterSec) && Number.isFinite(result.expiresInSec)) {
        const now = Date.now()
        setEmailVerification((prev) => ({
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

      setEmailVerification((prev) => ({ ...prev, stage: stageBeforeSend, message: GENERIC_SIGNUP_CODE_RETRY_MESSAGE }))
    } catch (error) {
      if (verificationGenerationRef.current !== requestGeneration) return

      const described = describeSignupCodeRequestError(error)
      if (described.kind === "RESEND_TOO_SOON") {
        setEmailVerification((prev) => ({
          ...prev,
          stage: stageBeforeSend === "unverified" ? "codeSent" : stageBeforeSend,
          email,
          resendAvailableAt: Date.now() + described.resendAfterSec * 1000,
          message: `${described.resendAfterSec}초 후 재발송할 수 있습니다.`,
        }))
      } else if (described.kind === "RATE_LIMITED") {
        setEmailVerification((prev) => ({ ...prev, stage: stageBeforeSend, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }))
      } else if (described.kind === "INVALID_INPUT") {
        setEmailVerification((prev) => ({ ...prev, stage: stageBeforeSend, message: "입력을 확인해주세요." }))
      } else {
        setEmailVerification((prev) => ({ ...prev, stage: stageBeforeSend, message: GENERIC_SIGNUP_CODE_RETRY_MESSAGE }))
      }
    } finally {
      verificationRequestInFlightRef.current = false
    }
  }

  const handleVerifySignupCode = async () => {
    const current = emailVerification

    if (!active) return
    if (current.stage !== "codeSent") return
    if (!current.code) return
    if (verificationRequestInFlightRef.current) return

    if (current.codeExpiresAt !== null && Date.now() >= current.codeExpiresAt) {
      setEmailVerification((prev) => (
        prev.stage === "codeSent"
          ? { ...prev, stage: "codeExpired", message: "인증번호가 만료되었습니다. 다시 받아주세요." }
          : prev
      ))
      return
    }

    verificationRequestInFlightRef.current = true
    const requestGeneration = verificationGenerationRef.current
    const targetEmail = current.email
    const code = current.code

    setEmailVerification((prev) => ({ ...prev, stage: "verifying", message: "" }))

    try {
      const result = await verifySignupCodeApi({ email: targetEmail, code })
      if (verificationGenerationRef.current !== requestGeneration) return

      if (result?.ok === true && typeof result.signupProof === "string" && result.signupProof) {
        setEmailVerification((prev) => ({ ...prev, stage: "verified", signupProof: result.signupProof, message: "" }))
        return
      }

      setEmailVerification((prev) => ({ ...prev, stage: "codeSent", message: GENERIC_SIGNUP_CODE_RETRY_MESSAGE }))
    } catch (error) {
      if (verificationGenerationRef.current !== requestGeneration) return

      const described = describeSignupCodeVerifyError(error)
      if (described.kind === "CODE_INVALID") {
        setEmailVerification((prev) => ({
          ...prev,
          stage: "codeSent",
          attemptsRemaining: described.attemptsRemaining,
          message: described.attemptsRemaining !== null
            ? `인증번호가 올바르지 않습니다. (남은 시도 ${described.attemptsRemaining}회)`
            : "인증번호가 올바르지 않습니다.",
        }))
      } else if (described.kind === "CODE_EXPIRED") {
        setEmailVerification((prev) => ({ ...prev, stage: "codeExpired", message: "인증번호가 만료되었습니다. 다시 받아주세요." }))
      } else if (described.kind === "TOO_MANY_ATTEMPTS") {
        setEmailVerification((prev) => ({ ...prev, stage: "locked", message: "오입력 횟수를 초과했습니다. 다시 받아주세요." }))
      } else if (described.kind === "RATE_LIMITED") {
        setEmailVerification((prev) => ({ ...prev, stage: "codeSent", message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }))
      } else if (described.kind === "INVALID_INPUT") {
        setEmailVerification((prev) => ({ ...prev, stage: "codeSent", message: "입력을 확인해주세요." }))
      } else {
        setEmailVerification((prev) => ({ ...prev, stage: "codeSent", message: GENERIC_SIGNUP_CODE_RETRY_MESSAGE }))
      }
    } finally {
      verificationRequestInFlightRef.current = false
    }
  }

  const hasValidSignupProof = (
    active
    && emailVerification.stage === "verified"
    && emailVerification.email === email
    && typeof emailVerification.signupProof === "string"
    && emailVerification.signupProof.length > 0
  )

  const buildSignupPayload = () => (
    hasValidSignupProof ? { email: emailVerification.email, signupProof: emailVerification.signupProof } : null
  )

  const reset = () => {
    verificationGenerationRef.current += 1
    setEmailVerification(INITIAL_EMAIL_VERIFICATION)
  }

  const nowForCountdown = Date.now()
  const resendRemainingSec = emailVerification.resendAvailableAt !== null
    ? Math.max(0, Math.ceil((emailVerification.resendAvailableAt - nowForCountdown) / 1000))
    : 0
  const codeRemainingSec = (emailVerification.stage === "codeSent" && emailVerification.codeExpiresAt !== null)
    ? Math.max(0, Math.ceil((emailVerification.codeExpiresAt - nowForCountdown) / 1000))
    : null

  return {
    signupEmailVerification: {
      stage: emailVerification.stage,
      code: emailVerification.code,
      message: emailVerification.message,
      attemptsRemaining: emailVerification.attemptsRemaining,
      resendRemainingSec,
      codeRemainingSec,
    },
    handleSignupCodeChange,
    handleRequestSignupCode,
    handleVerifySignupCode,
    hasValidSignupProof,
    buildSignupPayload,
    reset,
  }
}
