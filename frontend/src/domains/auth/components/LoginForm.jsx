// 로그인 모드 칸 (안내 문구, 이메일·비밀번호, 유지·찾기 링크, 로그인·소셜 버튼, 가입 전환)
// pages/LoginPage.jsx가 로그인 모드일 때 사용
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthModeSwitchPrompt from "@/domains/auth/components/AuthModeSwitchPrompt.jsx"
import LoginFields from "@/domains/auth/components/LoginForm/LoginFields.jsx"
import LoginOptions from "@/domains/auth/components/LoginForm/LoginOptions.jsx"
import SocialLoginButtons from "@/domains/auth/components/LoginForm/SocialLoginButtons.jsx"

// 제출은 바깥 액자 form이 받음 (로그인 버튼이 type=submit)
export default function LoginForm({ formData, rememberMe, onChange, onRememberMeChange, onSwitchToSignup }) {
  return (
    <>
      <header className="text-center">
        <p className="mt-[52px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-relaxed text-text-body/90">
          계정을 로그인 하여 무도회에 입장하세요.
        </p>
      </header>

      <div className="mt-5 flex flex-1 flex-col gap-2">
        <LoginFields formData={formData} onChange={onChange} />
        <LoginOptions rememberMe={rememberMe} onRememberMeChange={onRememberMeChange} />

        <AuthImageButton
          type="submit"
          src="/button/버튼 프레임2.png"
          label="로그인"
          visibleLabel="로그인"
          visibleLabelClassName="app-text-scaled [--app-text-size:22px]"
          className="mt-1 cursor-pointer"
        />

        <SocialLoginButtons rememberMe={rememberMe} />
        <AuthModeSwitchPrompt question="계정이 없으신가요?" actionLabel="회원가입" onSwitch={onSwitchToSignup} />
      </div>
    </>
  )
}
