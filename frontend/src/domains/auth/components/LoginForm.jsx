import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
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
        <p className="mt-[40px] mb-[-10px] font-subheading text-[13px] font-bold leading-relaxed text-text-body/90">
          계정을 로그인 하여 모험을 계속하세요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        <LoginFields formData={formData} onChange={onChange} />
        <LoginOptions rememberMe={rememberMe} onRememberMeChange={onRememberMeChange} />

        {/* 기본 로그인 제출 버튼입니다. */}
        <AuthImageButton type="submit" src={LOGIN_ASSETS.loginButton} label="로그인" className="mt-1 cursor-pointer" />

        <SocialLoginButtons />
        <AuthModeSwitchPrompt question="계정이 없으신가요?" actionLabel="회원가입" onSwitch={onSwitchToSignup} />
      </div>
    </>
  )
}
