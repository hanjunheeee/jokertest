// 로그인 화면 (로그인·일반 가입 칸, 주소에 socialIntent 있으면 소셜 가입 칸)
// app/routes/index.jsx가 /와 /login에 붙임, 상태는 hooks/useLoginPage.js
import { useSearchParams } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import LoginForm from "@/domains/auth/components/LoginForm.jsx"
import SignupForm from "@/domains/auth/components/SignupForm.jsx"
import SocialSignupForm from "@/domains/auth/components/SocialSignupForm.jsx"
import { useLoginPage } from "@/domains/auth/hooks/useLoginPage"
import { resolveSocialLoginView } from "@/domains/auth/utils/socialErrors.js"

// 주소의 socialIntent·socialError로 화면 모드부터 고름
export default function LoginPage() {
  const {
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
    canSubmitSignup,
  } = useLoginPage()

  const [searchParams, setSearchParams] = useSearchParams()
  const socialView = resolveSocialLoginView({
    socialIntent: searchParams.get("socialIntent"),
    socialError: searchParams.get("socialError"),
  })

  // 소셜 가입 취소: 주소에서 소셜 값만 지움, 기록은 안 쌓음
  const clearSocialParams = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("socialIntent")
      next.delete("socialError")
      return next
    }, { replace: true })
  }

  // 소셜 가입 중: 액자 form 제출은 막음 (보내기는 가입 버튼이 함)
  if (socialView.mode === "socialSignup") {
    return (
      <AuthScene onSubmit={(e) => e.preventDefault()} frameSize="signup">
        <SocialSignupForm intentToken={socialView.intentToken} onCancel={clearSocialParams} />
      </AuthScene>
    )
  }

  // 보통 화면: 가입 모드면 가입 칸·넓은 액자, 아니면 로그인 칸
  return (
    <AuthScene onSubmit={handleSubmit} frameSize={isSignupMode ? "signup" : "default"}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 소셜 로그인 실패로 돌아왔으면 위에 실패 문구 */}
        {socialView.mode === "socialError" && (
          <p role="alert" className="mt-2 shrink-0 rounded bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
            {socialView.message}
          </p>
        )}

        {isSignupMode ? (
          <SignupForm
          formData={formData}
          onChange={handleInputChange}
          onSwitchToLogin={() => setIsSignupMode(false)}
          emailVerification={signupEmailVerification}
          onSignupCodeChange={handleSignupCodeChange}
          handleRequestSignupCode={handleRequestSignupCode}
          handleVerifySignupCode={handleVerifySignupCode}
          canSubmitSignup={canSubmitSignup}
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
      </div>
    </AuthScene>
  )
}
