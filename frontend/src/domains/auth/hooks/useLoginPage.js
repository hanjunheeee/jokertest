import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getMeApi, loginApi, signupApi } from "@/domains/auth/api/auth.api"
import { selectIsAuthenticated, useAuthStore } from "@/domains/auth/store/auth.store"

const INITIAL_FORM_DATA = { email: "", password: "", nickname: "" }

// LoginPage에서 필요한 상태와 이벤트 처리를 한곳에 모은 훅입니다.
export function useLoginPage() {
  // "로그인 상태 유지" 체크박스 선택 여부입니다.
  const [rememberMe, setRememberMe] = useState(false)

  // false면 로그인 폼, true면 회원가입 폼을 보여줍니다.
  const [isSignupMode, setIsSignupMode] = useState(false)

  // API 요청 중 중복 제출을 막기 위한 상태입니다.
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 로그인/회원가입 입력값을 한 객체로 관리합니다.
  const [formData, setFormData] = useState(INITIAL_FORM_DATA)

  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const login = useAuthStore((state) => state.login)

  useEffect(() => {
    // 로그인 페이지에 들어오면 "사용자가 직접 로그아웃했다"는 표시를 초기화합니다.
    useAuthStore.getState().clearLoggedOutIntentionally()
  }, [])

  useEffect(() => {
    // 이미 로그인된 사용자가 로그인 페이지에 오면 현재 사용자 확인 후 로비로 보냅니다.
    if (!isAuthenticated) return
    getMeApi().then(() => navigate("/lobby", { replace: true })).catch(() => {})
  }, [isAuthenticated, navigate])

  // input의 name 값을 기준으로 formData의 같은 key를 업데이트합니다.
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // 현재 모드에 따라 로그인 또는 회원가입 요청을 보냅니다.
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      if (isSignupMode) {
        await signupApi(formData)
        alert("회원가입이 완료되었습니다! 로그인해주세요.")
        setIsSignupMode(false)
      } else {
        const { user } = await loginApi(formData)
        login(user)
        navigate("/lobby")
      }
    } catch (error) {
      console.error("API 통신 에러:", error)
      alert(error.message || "서버와 연결할 수 없습니다.")
    } finally {
      setIsSubmitting(false)
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
  }
}
