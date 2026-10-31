import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { completeSocialSignupApi, getSocialSignupIntentApi } from "../api/auth.api.js"
import { useAuthStore } from "../store/auth.store.js"
import { useSignupEmailVerification } from "./useSignupEmailVerification.js"
import { validateNickname, validateBirthDate } from "../validation/signupValidation.js"

const trustedErrorCode = (error) => (
  typeof error?.status === "number" && error.status >= 500 ? undefined : error?.code
)

const GENERIC_COMMUNICATION_ERROR_MESSAGE = "서버와 통신할 수 없습니다. 다시 시도해주세요."

const isCompletedSignupUser = (user) => (
  user !== null
  && typeof user === "object"
  && !Array.isArray(user)
  && typeof user.uuid === "string"
  && user.uuid.length > 0
)

export function useSocialSignup(intentToken) {
  const [status, setStatus] = useState("idle")
  const [errorMessage, setErrorMessage] = useState(null)
  const [intentStatus, setIntentStatus] = useState("loading")
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false)
  const [email, setEmail] = useState("")
  const [intentAttempt, setIntentAttempt] = useState(0)
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  const submittingRef = useRef(false)
  const intentGenerationRef = useRef(0)

  const verification = useSignupEmailVerification({
    email,
    active: intentStatus === "ready" && emailVerificationRequired,
    attemptKey: `${typeof intentToken === "string" ? intentToken : ""}:${intentAttempt}`,
  })

  useEffect(() => {
    const generation = ++intentGenerationRef.current

    if (typeof intentToken !== "string" || !intentToken) {
      setIntentStatus("error")
      setStatus("expired")
      setErrorMessage("소셜 로그인 세션이 만료되었습니다. 다시 시도해주세요.")
      return undefined
    }

    setIntentStatus("loading")
    setEmailVerificationRequired(false)
    setEmail("")
    setStatus("idle")
    setErrorMessage(null)

    getSocialSignupIntentApi({ intentToken })
      .then((data) => {
        if (intentGenerationRef.current !== generation) return // 이미 무효화됨(교체·재시도·언마운트)
        if (typeof data?.emailVerificationRequired !== "boolean") {
          setIntentStatus("error")
          setErrorMessage("가입 정보를 불러오지 못했습니다. 다시 시도해주세요.")
          return
        }
        setEmailVerificationRequired(data.emailVerificationRequired)
        setIntentStatus("ready")
      })
      .catch((error) => {
        if (intentGenerationRef.current !== generation) return

        const code = trustedErrorCode(error)
        switch (code) {
          case "INTENT_EXPIRED":
          case "INTENT_INVALID":
            setIntentStatus("error")
            setStatus("expired")
            break
          case "INTENT_CONSUMED":
            setIntentStatus("error")
            setStatus("cancelled")
            break
          default:
            setIntentStatus("error")
        }
        setErrorMessage(
          code ? (error?.message || "가입 정보를 불러오지 못했습니다. 다시 시도해주세요.")
            : "가입 정보를 불러오지 못했습니다. 다시 시도해주세요.",
        )
      })

    return () => { intentGenerationRef.current += 1 }
  }, [intentToken, intentAttempt])

  const retryIntent = () => {
    if (typeof intentToken !== "string" || !intentToken) return
    setIntentAttempt((attempt) => attempt + 1)
  }

  const handleEmailChange = (e) => {
    const { value } = e.target
    if (value !== email) verification.reset()
    setEmail(value)
  }

  const canSubmit = (
    intentStatus === "ready"
    && status !== "submitting"
    && status !== "done"
    && (!emailVerificationRequired || verification.hasValidSignupProof)
  )

  const submit = async ({ nickname, birthDate }) => {
    if (submittingRef.current) return

    if (typeof intentToken !== "string" || !intentToken) {
      setStatus("expired")
      setErrorMessage("소셜 로그인 세션이 만료되었습니다. 다시 시도해주세요.")
      return
    }

    if (intentStatus !== "ready") {
      setStatus("error")
      setErrorMessage("가입 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.")
      return
    }

    const nicknameResult = validateNickname(nickname)
    if (!nicknameResult.ok) {
      setStatus("error")
      setErrorMessage(nicknameResult.message)
      return
    }

    let birthDateValue
    if (birthDate) {
      const birthDateResult = validateBirthDate(birthDate)
      if (!birthDateResult.ok) {
        setStatus("error")
        setErrorMessage(birthDateResult.message)
        return
      }
      birthDateValue = birthDateResult.value
    }

    let verifiedPayload
    if (emailVerificationRequired) {
      verifiedPayload = verification.buildSignupPayload()
      if (!verifiedPayload) {
        setStatus("error")
        setErrorMessage("이메일 인증을 완료해주세요.")
        return
      }
    }

    submittingRef.current = true
    const submitGeneration = intentGenerationRef.current
    setStatus("submitting")
    setErrorMessage(null)
    try {
      const result = await completeSocialSignupApi({
        intentToken,
        nickname: nicknameResult.value,
        birthDate: birthDateValue,
        email: verifiedPayload?.email,
        signupProof: verifiedPayload?.signupProof,
      })
      if (intentGenerationRef.current !== submitGeneration) return // 이미 무효화됨
      if (!isCompletedSignupUser(result?.user)) {
        setStatus("error")
        setErrorMessage(GENERIC_COMMUNICATION_ERROR_MESSAGE)
        return
      }
      login(result.user)
      setStatus("done")
      navigate("/lobby")
    } catch (error) {
      if (intentGenerationRef.current !== submitGeneration) return // 이미 무효화됨

      const code = trustedErrorCode(error)
      switch (code) {
        case "INTENT_EXPIRED":
          setStatus("expired")
          break
        case "INTENT_CONSUMED":
          setStatus("cancelled")
          break
        case "EMAIL_CONFLICT":
          setStatus("conflict")
          break
        case "SIGNUP_PROOF_REQUIRED":
        case "SIGNUP_PROOF_INVALID":
          verification.reset()
          setStatus("error")
          break
        default:
          setStatus("error")
      }
      setErrorMessage(
        code === "SIGNUP_PROOF_REQUIRED" ? "이메일 인증이 필요합니다. 다시 인증해주세요."
          : code === "SIGNUP_PROOF_INVALID" ? "이메일 인증이 만료되었거나 이미 사용되었습니다. 다시 인증해주세요."
            : code !== error?.code ? GENERIC_COMMUNICATION_ERROR_MESSAGE
              : error?.message || "가입을 완료할 수 없습니다.",
      )
    } finally {
      submittingRef.current = false
    }
  }

  const reset = () => {
    submittingRef.current = false
    setStatus("idle")
    setErrorMessage(null)
  }

  return {
    status,
    errorMessage,
    submit,
    reset,
    intentStatus,
    emailVerificationRequired,
    retryIntent,
    canSubmit,
    email,
    handleEmailChange,
    emailVerification: verification.signupEmailVerification,
    handleSignupCodeChange: verification.handleSignupCodeChange,
    handleRequestSignupCode: verification.handleRequestSignupCode,
    handleVerifySignupCode: verification.handleVerifySignupCode,
  }
}
