import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthModeSwitchPrompt from "@/domains/auth/components/AuthModeSwitchPrompt.jsx"
import LoginFields from "@/domains/auth/components/LoginForm/LoginFields.jsx"
import LoginOptions from "@/domains/auth/components/LoginForm/LoginOptions.jsx"
import SocialLoginButtons from "@/domains/auth/components/LoginForm/SocialLoginButtons.jsx"

// 로그인 화면의 form 내용을 조립하는 컴포넌트입니다.
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

        {/* 기본 로그인 제출 버튼입니다. */}
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
