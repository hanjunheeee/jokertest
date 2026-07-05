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
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환합니다.
  // 값을 바꾸는 함수(setXxx)를 호출하면 React가 이 컴포넌트를 다시 렌더링해서
  // 화면에 최신 상태가 반영됩니다. (변수에 직접 대입하면 화면이 갱신되지 않음)

  // rememberMe: "로그인 상태 유지" 체크박스가 체크됐는지 여부 (기본값 false)
  const [rememberMe, setRememberMe] = useState(false)
  // isSignupMode: 현재 화면이 회원가입 모드인지 여부. true면 SignupForm, false면 LoginForm을 보여줌
  const [isSignupMode, setIsSignupMode] = useState(false)
  // isSubmitting: API 요청이 진행 중인지 여부. true인 동안 중복 제출을 막는 용도
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  // authStore(전역 상태)에서 로그인 여부만 골라서 구독
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  // authStore의 login 액션(함수)만 꺼내서 사용
  const login = useAuthStore((state) => state.login)

  // formData: email/password/nickname 입력값을 하나의 객체로 묶어 관리하는 state.
  // 초기값은 전부 빈 문자열이고, handleInputChange에서 입력할 때마다 갱신됨
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
    // input의 name 속성값(예: "email")과 사용자가 입력한 value를 꺼냄
    const { name, value } = e.target
    // setFormData에 함수를 넘기면 인자로 "바로 직전 state"(prev)를 받을 수 있음.
    // ...prev로 기존 필드는 그대로 복사하고, [name]: value로 해당 필드만 덮어씀
    // (예: name이 "email"이면 { ...prev, email: value })
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  /** 제출 시 회원가입·로그인 API 분기 후 성공 시 로비 이동 또는 가입 완료 안내 */
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
