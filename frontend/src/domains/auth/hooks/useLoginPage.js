import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { checkEmailApi, getMeApi, loginApi, signupApi } from "../api/auth.api.js"
import { selectIsAuthenticated, useAuthStore } from "../store/auth.store.js"
import { useSignupEmailVerification } from "./useSignupEmailVerification.js"
import { validateSignupForm } from "../validation/signupValidation.js"

const INITIAL_FORM_DATA = { email: "", password: "", passwordConfirm: "", nickname: "", birthDate: "" }

export const SOCIAL_ERROR_MESSAGES = {
  OAUTH_CANCELLED: "소셜 로그인을 취소했습니다.",
  STATE_MISSING: "로그인 요청 정보가 없습니다. 다시 시도해주세요.",
  STATE_INVALID: "로그인 요청이 유효하지 않습니다. 다시 시도해주세요.",
  STATE_EXPIRED: "로그인 요청이 만료되었습니다. 다시 시도해주세요.",
  STATE_REUSED: "이미 처리된 로그인 요청입니다. 다시 시도해주세요.",
  STATE_FINGERPRINT_MISMATCH: "요청 출처가 일치하지 않습니다. 다시 시도해주세요.",
  EMAIL_CONFLICT: "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 연결해주세요.",
  EMAIL_MISSING: "소셜 계정에서 이메일 정보를 받지 못했습니다.",
  PROVIDER_INVALID: "소셜 로그인 정보를 확인할 수 없습니다.",
  GOOGLE_OAUTH_NOT_CONFIGURED: "지금은 Google 로그인을 사용할 수 없습니다.",
  GOOGLE_CODE_MISSING: "Google 인증 정보가 없습니다. 다시 시도해주세요.",
  GOOGLE_TOKEN_EXCHANGE_FAILED: "Google 인증에 실패했습니다. 다시 시도해주세요.",
  GOOGLE_PROFILE_FETCH_FAILED: "Google 프로필 조회에 실패했습니다. 다시 시도해주세요.",
  GOOGLE_PROFILE_INVALID: "Google 계정 정보를 확인할 수 없습니다.",
  GOOGLE_OAUTH_TIMEOUT: "Google 응답이 지연되었습니다. 다시 시도해주세요.",
  DISCORD_OAUTH_NOT_CONFIGURED: "지금은 Discord 로그인을 사용할 수 없습니다.",
  DISCORD_CODE_MISSING: "Discord 인증 정보가 없습니다. 다시 시도해주세요.",
  DISCORD_TOKEN_EXCHANGE_FAILED: "Discord 인증에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_FETCH_FAILED: "Discord 프로필 조회에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_INVALID: "Discord 계정 정보를 확인할 수 없습니다.",
  DISCORD_OAUTH_TIMEOUT: "Discord 응답이 지연되었습니다. 다시 시도해주세요.",
}
export const DEFAULT_SOCIAL_ERROR_MESSAGE = "소셜 로그인에 실패했습니다. 다시 시도해주세요."

export function mapSocialErrorCode(code) {
  if (typeof code === "string" && Object.prototype.hasOwnProperty.call(SOCIAL_ERROR_MESSAGES, code)) {
    return SOCIAL_ERROR_MESSAGES[code]
  }
  return DEFAULT_SOCIAL_ERROR_MESSAGE
}

export function resolveSocialLoginView({ socialIntent, socialError } = {}) {
  if (typeof socialIntent === "string" && socialIntent) {
    return { mode: "socialSignup", intentToken: socialIntent }
  }
  if (typeof socialError === "string" && socialError) {
    return { mode: "socialError", message: mapSocialErrorCode(socialError) }
  }
  return { mode: "default" }
}

export function useEmailAvailabilityCheck(email) {
  const [status, setStatus] = useState("idle")
  const [checkedEmail, setCheckedEmail] = useState(null)

  const latestRequestId = useRef(0)

  useEffect(() => {
    if (checkedEmail !== null && checkedEmail !== email) {
      setStatus("idle")
      setCheckedEmail(null)
    }
  }, [email, checkedEmail])

  const check = async () => {
    const trimmed = email.trim()
    if (!trimmed) return

    const requestId = ++latestRequestId.current
    setStatus("checking")
    setCheckedEmail(null)
    try {
      const { available } = await checkEmailApi(trimmed)
      if (latestRequestId.current !== requestId) return
      setStatus(available ? "available" : "duplicate")
      setCheckedEmail(trimmed)
    } catch {
      if (latestRequestId.current !== requestId) return
      setStatus("error")
      setCheckedEmail(null)
    }
  }

  return { status, check }
}

export function useLoginPage() {
  const [rememberMe, setRememberMe] = useState(false)

  const [isSignupMode, setIsSignupMode] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState(INITIAL_FORM_DATA)

  const {
    signupEmailVerification,
    handleSignupCodeChange,
    handleRequestSignupCode,
    handleVerifySignupCode,
    hasValidSignupProof,
    buildSignupPayload,
    reset: resetSignupEmailVerification,
  } = useSignupEmailVerification({ email: formData.email, active: isSignupMode })

  const submitInFlightRef = useRef(false)

  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const login = useAuthStore((state) => state.login)

  useEffect(() => {
    useAuthStore.getState().clearLoggedOutIntentionally()
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    getMeApi().then(() => navigate("/lobby", { replace: true })).catch(() => {})
  }, [isAuthenticated, navigate])

  const handleInputChange = (e) => {
    const { name, value } = e.target

    if (name === "email" && value !== formData.email) {
      resetSignupEmailVerification()
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitInFlightRef.current) return
    if (isSubmitting) return
    submitInFlightRef.current = true

    try {
      let signupPayload = null
      if (isSignupMode) {
        const validation = validateSignupForm(formData)
        if (!validation.ok) {
          alert(validation.message)
          return
        }

        signupPayload = buildSignupPayload()
        if (!signupPayload) {
          alert("이메일 인증을 완료해주세요.")
          return
        }
      }

      setIsSubmitting(true)
      try {
        if (isSignupMode) {
          const result = await signupApi({ ...formData, signupProof: signupPayload.signupProof })
          if (result?.success !== true) {
            alert("서버와 연결할 수 없습니다. 다시 시도해주세요.")
            return
          }
          alert("회원가입이 완료되었습니다! 로그인해주세요.")
          setIsSignupMode(false)
          resetSignupEmailVerification()
        } else {
          const { user } = await loginApi({ ...formData, rememberMe })
          login(user)
          navigate("/lobby")
        }
      } catch (error) {
        if (isSignupMode && (error.code === "SIGNUP_PROOF_REQUIRED" || error.code === "SIGNUP_PROOF_INVALID")) {
          resetSignupEmailVerification()
          alert(
            error.code === "SIGNUP_PROOF_REQUIRED"
              ? "이메일 인증이 필요합니다. 다시 인증해주세요."
              : "이메일 인증이 만료되었거나 이미 사용되었습니다. 다시 인증해주세요.",
          )
        } else {
          console.error("API 통신 에러")
          alert(error.message || "서버와 연결할 수 없습니다.")
        }
      } finally {
        setIsSubmitting(false)
      }
    } finally {
      submitInFlightRef.current = false
    }
  }

  return {
    formData,
    rememberMe,
    isSignupMode,
    handleInputChange,
    handleSubmit,
    setRememberMe,
    setIsSignupMode,
    signupEmailVerification,
    handleSignupCodeChange,
    handleRequestSignupCode,
    handleVerifySignupCode,
    canSubmitSignup: hasValidSignupProof && !isSubmitting,
  }
}
