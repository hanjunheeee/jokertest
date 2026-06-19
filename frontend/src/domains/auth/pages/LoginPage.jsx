/**
 * 인증 페이지.
 *
 * page 계층은 라우팅 단위의 조합과 제어만 담당합니다.
 * - 로그인/회원가입 모드 상태
 * - formData 제어
 * - API 호출 후 authStore 갱신 및 페이지 이동
 *
 * 실제 화면 조각은 components/AuthScene, LoginForm, SignupForm으로 분리합니다.
 */
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { loginApi, signupApi, getMeApi } from "../api/auth"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import LoginForm from "@/domains/auth/components/LoginForm.jsx"
import SignupForm from "@/domains/auth/components/SignupForm.jsx"

import {
  selectIsAuthenticated,
  useAuthStore,
} from "@/domains/auth/store/authStore"

/** 로그인·회원가입 인증 흐름을 제어하고 하위 컴포넌트를 조합 */
export default function LoginPage() {
  const [rememberMe, setRememberMe] = useState(false)
  const [isSignupMode, setIsSignupMode] = useState(false)
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const login = useAuthStore((state) => state.login)

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nickname: "", // 회원가입 시에만 사용
  })

  // authStore에 로그인 사용자가 남아 있으면 서버 쿠키도 유효한지 확인한 뒤 로비로 보냅니다.
  useEffect(() => {
    if (!isAuthenticated) return

    getMeApi()
      .then(() => navigate("/lobby", { replace: true }))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** email·password·nickname 필드를 formData에 반영 */
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  /** 제출 시 회원가입·로그인 API 분기 후 성공 시 로비 이동 또는 가입 완료 안내 */
  const handleSubmit = async (e) => {
    e.preventDefault()

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
    }
  }

  return (
    <AuthScene onSubmit={handleSubmit}>
      {isSignupMode ? (
        <SignupForm
          formData={formData}
          onChange={handleInputChange}
          onSwitchToLogin={() => setIsSignupMode(false)}
        />
      ) : (
        <LoginForm
          formData={formData}
          rememberMe={rememberMe}
          onChange={handleInputChange}
          onRememberMeChange={setRememberMe}
          onSwitchToSignup={() => setIsSignupMode(true)}
        />
      )}
    </AuthScene>
  )
}
