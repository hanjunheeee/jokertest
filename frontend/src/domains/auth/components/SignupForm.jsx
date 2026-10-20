import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import {
  SIGNUP_FORM_BODY_CLASS,
  SIGNUP_HEADER_TEXT_CLASS,
  SIGNUP_HINT_TEXT_CLASS,
  SIGNUP_MODE_SWITCH_CLASS,
  SIGNUP_SUBMIT_BUTTON_CLASS,
  SIGNUP_SUBMIT_BUTTON_WRAP_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthModeSwitchPrompt from "@/domains/auth/components/AuthModeSwitchPrompt.jsx"
import SignupEmailVerification from "@/domains/auth/components/SignupEmailVerification.jsx"
import SignupFields from "@/domains/auth/components/SignupForm/SignupFields.jsx"
import SignupScrollArea from "@/domains/auth/components/SignupScrollArea.jsx"

// 회원가입 화면의 form 내용을 조립하는 컴포넌트입니다.
//
// F-31(AC-04): 인증 블록(발송·확인·카운트다운 UI)은 SignupEmailVerification.jsx 공용
// 컴포넌트로 옮겨, 소셜 가입 보완 화면(SocialSignupForm.jsx)과 같은 구현을 씁니다 —
// 이 파일의 나머지 입력·제출·전환 UI는 그대로입니다.
export default function SignupForm({
  formData, onChange, onSwitchToLogin,
  emailVerification, onSignupCodeChange, handleRequestSignupCode, handleVerifySignupCode, canSubmitSignup,
}) {
  return (
    <div className={SIGNUP_FORM_BODY_CLASS}>
      <header className="shrink-0 text-center">
        <p className={SIGNUP_HEADER_TEXT_CLASS}>
          무도회 입장을 위한 정보를 입력해주세요.
        </p>
      </header>

      {/* F-31b: 인증 UI를 포함하며 늘어난 내용을 스크롤 영역 안에 담습니다. */}
      <SignupScrollArea>
        <SignupFields formData={formData} handleInputChange={onChange} />

        <SignupEmailVerification
          emailVerification={emailVerification}
          onSignupCodeChange={onSignupCodeChange}
          handleRequestSignupCode={handleRequestSignupCode}
          handleVerifySignupCode={handleVerifySignupCode}
        />

        {!canSubmitSignup && (
          <p className={SIGNUP_HINT_TEXT_CLASS}>이메일 인증을 완료해야 가입할 수 있습니다.</p>
        )}

        {/* 회원가입 제출 버튼입니다. 이메일 인증 전에는 비활성화됩니다. */}
        <div className={SIGNUP_SUBMIT_BUTTON_WRAP_CLASS}>
          <AuthImageButton
            type="submit"
            src={LOGIN_ASSETS.signupButton}
            label="회원가입"
            className={SIGNUP_SUBMIT_BUTTON_CLASS}
            disabled={!canSubmitSignup}
          />
        </div>

        <div className={SIGNUP_MODE_SWITCH_CLASS}>
          <AuthModeSwitchPrompt question="이미 계정이 있으신가요?" actionLabel="로그인하기" onSwitch={onSwitchToLogin} />
        </div>
      </SignupScrollArea>
    </div>
  )
}
