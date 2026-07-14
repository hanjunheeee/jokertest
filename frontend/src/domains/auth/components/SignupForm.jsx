import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthModeSwitchPrompt from "@/domains/auth/components/AuthModeSwitchPrompt.jsx"
import SignupFields from "@/domains/auth/components/SignupForm/SignupFields.jsx"

// 회원가입 화면의 form 내용을 조립하는 컴포넌트입니다.
export default function SignupForm({ formData, onChange, onSwitchToLogin }) {
  return (
    <>
      <header className="text-center">
        <p className="mt-[40px] mb-[-10px] font-subheading text-[13px] font-bold leading-relaxed text-text-body/90">
          새로운 모험을 위한 정보를 입력해주세요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        <SignupFields formData={formData} onChange={onChange} />

        {/* 회원가입 제출 버튼입니다. */}
        <AuthImageButton type="submit" src={LOGIN_ASSETS.signupButton} label="회원가입" className="mt-1 cursor-pointer" />

        <AuthModeSwitchPrompt question="이미 계정이 있으신가요?" actionLabel="로그인하기" onSwitch={onSwitchToLogin} />
      </div>
    </>
  )
}
