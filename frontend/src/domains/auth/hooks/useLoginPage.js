// 로그인 화면 상태 (로그인·일반 가입 모드 전환, 입력값, 이미 로그인돼 있으면 로비로)
// pages/LoginPage.jsx가 사용, 제출은 login/useLoginSubmit.js가 맡음
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getMeApi } from "../api/auth.api.js"
import { selectIsAuthenticated, useAuthStore } from "../store/auth.store.js"
import { useSignupEmailVerification } from "./useSignupEmailVerification.js"
import { useLoginSubmit } from "./login/useLoginSubmit.js"

// 시험이 이 경로로 가져가는 이름 (화면 코드는 원래 파일에서 가져감)
export { SOCIAL_ERROR_MESSAGES, DEFAULT_SOCIAL_ERROR_MESSAGE } from "../constants/socialMessages.js"
export { mapSocialErrorCode, resolveSocialLoginView } from "../utils/socialErrors.js"
export { useEmailCheck as useEmailAvailabilityCheck } from "./login/useEmailCheck.js"

// 입력값 시작 값 (로그인·가입 공통)
const INITIAL_FORM_DATA = { email: "", password: "", passwordConfirm: "", nickname: "", birthDate: "" }

// 로그인과 일반 가입이 입력값(formData) 하나를 같이 씀
export function useLoginPage() {
  const [rememberMe, setRememberMe] = useState(false)
  const [isSignupMode, setIsSignupMode] = useState(false)
  const [formData, setFormData] = useState(INITIAL_FORM_DATA)

  // 이메일 인증은 가입 모드에서만 켬
  const {
    signupEmailVerification,
    handleSignupCodeChange,
    handleRequestSignupCode,
    handleVerifySignupCode,
    hasValidSignupProof,
    buildSignupPayload,
    reset: resetVerification,
  } = useSignupEmailVerification({ email: formData.email, active: isSignupMode })

  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const login = useAuthStore((state) => state.login)

  const { isSubmitting, handleSubmit } = useLoginSubmit({
    formData, rememberMe, isSignupMode, setIsSignupMode, buildSignupPayload, resetVerification, login, navigate,
  })

  // 로그인 화면에 오면 "일부러 로그아웃함" 표시를 지움
  useEffect(() => {
    useAuthStore.getState().clearLoggedOutIntentionally()
  }, [])

  // 이미 로그인돼 있으면 서버 세션 확인 뒤 로비로 (확인 실패면 그대로 둠)
  useEffect(() => {
    if (!isAuthenticated) return
    getMeApi().then(() => navigate("/lobby", { replace: true })).catch(() => {})
  }, [isAuthenticated, navigate])

  // 주소가 바뀌면 받은 이메일 인증을 버림
  const handleInputChange = (e) => {
    const { name, value } = e.target

    if (name === "email" && value !== formData.email) {
      resetVerification()
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
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
    // 가입 버튼은 증명 있고 보내는 중 아닐 때만
    canSubmitSignup: hasValidSignupProof && !isSubmitting,
  }
}
