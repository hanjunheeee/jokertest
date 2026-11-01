// 일반 가입 모드 칸 (머리글, 단계 표시, 단계별 칸, 이전·다음·가입 버튼, 로그인 전환)
// pages/LoginPage.jsx가 가입 모드일 때 씀, 단계는 hooks/useSignupSteps.js
import { useEmailCheck } from "@/domains/auth/hooks/login/useEmailCheck.js"
import ModeSwitch from "@m/domains/auth/components/login/ui/ModeSwitch.jsx"
import { HEADER_TEXT_CLASS } from "@m/domains/auth/components/login/ui/styles.js"
import StepIndicator from "@m/domains/auth/components/signup/StepIndicator.jsx"
import AccountStep from "@m/domains/auth/components/signup/AccountStep.jsx"
import VerifyStep from "@m/domains/auth/components/signup/VerifyStep.jsx"
import ProfileStep from "@m/domains/auth/components/signup/ProfileStep.jsx"
import StepNav from "@m/domains/auth/components/signup/StepNav.jsx"

// 중복확인 결과는 단계를 오가도 남게 여기서 들고 있음
export default function SignupForm({ formData, onChange, onSwitchToLogin, steps, verification, canSubmitSignup }) {
  const { status: emailCheckStatus, check: handleCheckEmail } = useEmailCheck(formData.email)
  const { step, isLastStep, goTo, next, prev } = steps

  return (
    <>
      <p className={HEADER_TEXT_CLASS}>무도회 입장을 위한 정보를 입력해주세요.</p>
      <StepIndicator step={step} onSelect={goTo} />

      <section className="flex flex-col gap-2" role="region" aria-label="회원가입 입력">
        {step === 0 && (
          <AccountStep formData={formData} onChange={onChange} emailCheckStatus={emailCheckStatus} onCheckEmail={handleCheckEmail} />
        )}
        {step === 1 && (
          <VerifyStep email={formData.email} verification={verification} onBackToAccount={() => goTo(0)} />
        )}
        {step === 2 && <ProfileStep formData={formData} onChange={onChange} />}
      </section>

      <StepNav step={step} isLastStep={isLastStep} onPrev={prev} onNext={next} canSubmitSignup={canSubmitSignup} />
      <ModeSwitch question="이미 계정이 있으신가요?" actionLabel="로그인하기" onSwitch={onSwitchToLogin} />
    </>
  )
}
