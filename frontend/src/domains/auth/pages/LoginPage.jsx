// 파일 역할: LoginPage.jsx - 라우터에서 렌더링되는 페이지입니다.
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import LoginForm from "@/domains/auth/components/LoginForm.jsx"
import SignupForm from "@/domains/auth/components/SignupForm.jsx"
import { useLoginPage } from "@/domains/auth/hooks/useLoginPage"

export default function LoginPage() {
  const {
    formData,
    rememberMe,
    isSignupMode,
    handleInputChange,
    handleSubmit,
    setRememberMe,
    setIsSignupMode,
  } = useLoginPage()

  return (
    <AuthScene onSubmit={handleSubmit}>
      {/* 현재 모드에 따라 로그인 폼과 회원가입 폼 중 하나를 보여줍니다. */}
      {isSignupMode ? (
        <SignupForm formData={formData} onChange={handleInputChange} onSwitchToLogin={() => setIsSignupMode(false)} />
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
