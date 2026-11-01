// 일반 가입 모드 칸 (머리글, 입력 칸, 이메일 인증, 인증 전 안내, 가입 버튼, 로그인 전환), 데스크톱 SignupForm과 같은 순서
// pages/LoginPage.jsx가 가입 모드일 때 씀, 데스크톱의 안쪽 스크롤 칸 대신 액자가 길어지고 페이지가 굴림
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import ModeSwitch from "@m/domains/auth/components/login/ui/ModeSwitch.jsx"
import { HEADER_TEXT_CLASS, HINT_TEXT_CLASS } from "@m/domains/auth/components/login/ui/styles.js"
import SignupFields from "@m/domains/auth/components/signup/SignupFields.jsx"
import EmailVerification from "@m/domains/auth/components/signup/verification/EmailVerification.jsx"

// 가입 버튼: 데스크톱처럼 그림은 작게(약 6할 폭), 누르는 자리만 44px
const SUBMIT_LOOK = {
  button:
    "relative mx-auto flex min-h-11 w-[60%] cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none transition-transform duration-150 ease-out active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
  img: "pointer-events-none block h-auto w-full select-none",
  label: "",
}

// canSubmitSignup이 거짓이면 안내 띄우고 가입 버튼 잠금 (인증 전·보내는 중)
export default function SignupForm({ formData, onChange, onSwitchToLogin, verification, canSubmitSignup }) {
  return (
    <>
      <p className={HEADER_TEXT_CLASS}>무도회 입장을 위한 정보를 입력해주세요.</p>

      <div className="flex flex-col gap-2" role="region" aria-label="회원가입 입력">
        <SignupFields formData={formData} onChange={onChange} />

        <EmailVerification
          emailVerification={verification.emailVerification}
          onSignupCodeChange={verification.onSignupCodeChange}
          handleRequestSignupCode={verification.handleRequestSignupCode}
          handleVerifySignupCode={verification.handleVerifySignupCode}
        />

        {!canSubmitSignup && (
          <p className={HINT_TEXT_CLASS}>이메일 인증을 완료해야 가입할 수 있습니다.</p>
        )}

        <ImageButton
          type="submit"
          look={SUBMIT_LOOK}
          src={LOGIN_ASSETS.signupButton}
          ariaLabel="회원가입"
          disabled={!canSubmitSignup}
        />

        <ModeSwitch question="이미 계정이 있으신가요?" actionLabel="로그인하기" onSwitch={onSwitchToLogin} />
      </div>
    </>
  )
}
