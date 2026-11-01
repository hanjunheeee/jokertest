import { useSearchParams } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import LoginForm from "@/domains/auth/components/LoginForm.jsx"
import SignupForm from "@/domains/auth/components/SignupForm.jsx"
import SocialSignupForm from "@/domains/auth/components/SocialSignupForm.jsx"
import { useLoginPage } from "@/domains/auth/hooks/useLoginPage"
import { resolveSocialLoginView } from "@/domains/auth/utils/socialErrors.js"

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
      <AuthScene onSubmit={(e) => e.preventDefault()} frameSize="signup">
        <SocialSignupForm intentToken={socialView.intentToken} onCancel={clearSocialParams} />
      </AuthScene>
    )
  }

  return (
    <AuthScene onSubmit={handleSubmit} frameSize={isSignupMode ? "signup" : "default"}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
