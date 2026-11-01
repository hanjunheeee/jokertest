// 로그인 화면 (/, /login): 로그인·일반 가입 칸, 주소에 socialIntent 있으면 소셜 가입 칸
// app/routes/index.jsx가 씀, 상태·제출·검사는 데스크톱 useLoginPage 그대로, 가입 단계 나누기만 모바일
import { useSearchParams } from "react-router-dom"
import { useLoginPage } from "@/domains/auth/hooks/useLoginPage"
import { resolveSocialLoginView } from "@/domains/auth/utils/socialErrors.js"
import Scene from "@m/domains/auth/components/login/scene/Scene.jsx"
import LoginForm from "@m/domains/auth/components/login/LoginForm.jsx"
import SocialErrorBanner from "@m/domains/auth/components/login/SocialErrorBanner.jsx"
import SignupForm from "@m/domains/auth/components/signup/SignupForm.jsx"
import SocialSignupForm from "@m/domains/auth/components/social/SocialSignupForm.jsx"
import { useSignupSteps } from "@m/domains/auth/hooks/useSignupSteps.js"

// 주소의 socialIntent·socialError로 화면 모드부터 고름
export default function LoginPage() {
  const page = useLoginPage()
  const steps = useSignupSteps()
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
      <Scene onSubmit={(e) => e.preventDefault()} frameSize="signup">
        <SocialSignupForm intentToken={socialView.intentToken} onCancel={clearSocialParams} />
      </Scene>
    )
  }

  // 가입 중간 단계에서 키보드 완료(Enter)는 다음 단계로, 마지막 단계만 진짜 제출
  const handleSubmit = (e) => {
    if (page.isSignupMode && !steps.isLastStep) {
      e.preventDefault()
      steps.next()
      return
    }
    page.handleSubmit(e)
  }

  // 가입으로 넘어갈 때마다 1단계부터
  const switchToSignup = () => {
    steps.reset()
    page.setIsSignupMode(true)
  }

  return (
    <Scene onSubmit={handleSubmit} frameSize={page.isSignupMode ? "signup" : "default"}>
      {/* 소셜 로그인 실패로 돌아왔으면 위에 실패 문구 */}
      {socialView.mode === "socialError" && <SocialErrorBanner message={socialView.message} />}

      {page.isSignupMode ? (
        <SignupForm
          formData={page.formData}
          onChange={page.handleInputChange}
          onSwitchToLogin={() => page.setIsSignupMode(false)}
          steps={steps}
          verification={{
            emailVerification: page.signupEmailVerification,
            onSignupCodeChange: page.handleSignupCodeChange,
            handleRequestSignupCode: page.handleRequestSignupCode,
            handleVerifySignupCode: page.handleVerifySignupCode,
          }}
          canSubmitSignup={page.canSubmitSignup}
        />
      ) : (
        <LoginForm
          formData={page.formData}
          rememberMe={page.rememberMe}
          onChange={page.handleInputChange}
          onRememberMeChange={page.setRememberMe}
          onSwitchToSignup={switchToSignup}
        />
      )}
    </Scene>
  )
}
