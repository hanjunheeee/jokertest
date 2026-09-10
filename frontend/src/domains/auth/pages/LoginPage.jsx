// 파일 역할: LoginPage.jsx - 라우터에서 렌더링되는 페이지입니다.
import { useSearchParams } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import LoginForm from "@/domains/auth/components/LoginForm.jsx"
import SignupForm from "@/domains/auth/components/SignupForm.jsx"
import SocialSignupForm from "@/domains/auth/components/SocialSignupForm.jsx"
import { useLoginPage, resolveSocialLoginView } from "@/domains/auth/hooks/useLoginPage"

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

  // F-06 AC-02/AC-04: Google 콜백(user.controller.js googleAuthCallback)은 신규 계정이면
  // ?socialIntent=<token>으로, 실패하면 ?socialError=<code>로 이 페이지에 돌아온다 —
  // resolveSocialLoginView(useLoginPage.js)가 그 쿼리를 화면 모드로 번역한다.
  const [searchParams, setSearchParams] = useSearchParams()
  const socialView = resolveSocialLoginView({
    socialIntent: searchParams.get("socialIntent"),
    socialError: searchParams.get("socialError"),
  })

  // 소셜 가입 보완을 취소하거나 오류 안내를 닫으면, 다음에 같은 화면으로 돌아와도 지난
  // 시도의 쿼리가 남아있지 않도록 지운다.
  const clearSocialParams = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("socialIntent")
      next.delete("socialError")
      return next
    }, { replace: true })
  }

  if (socialView.mode === "socialSignup") {
    return (
      <AuthScene onSubmit={(e) => e.preventDefault()}>
        <SocialSignupForm intentToken={socialView.intentToken} onCancel={clearSocialParams} />
      </AuthScene>
    )
  }

  return (
    <AuthScene onSubmit={handleSubmit}>
      {socialView.mode === "socialError" && (
        <p role="alert" className="mt-2 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
          {socialView.message}
        </p>
      )}

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
