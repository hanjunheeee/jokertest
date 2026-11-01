import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import {
  SIGNUP_FORM_BODY_CLASS,
  HEADER_TEXT_CLASS,
  SIGNUP_HINT_TEXT_CLASS,
  MODE_SWITCH_CLASS,
  SUBMIT_BTN_CLASS,
  SUBMIT_BTN_WRAP_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthModeSwitchPrompt from "@/domains/auth/components/AuthModeSwitchPrompt.jsx"
import SignupEmailVerification from "@/domains/auth/components/SignupEmailVerification.jsx"
import SignupFields from "@/domains/auth/components/SignupForm/SignupFields.jsx"
import SignupScrollArea from "@/domains/auth/components/SignupScrollArea.jsx"

export default function SignupForm({
  formData, onChange, onSwitchToLogin,
  emailVerification, onSignupCodeChange, handleRequestSignupCode, handleVerifySignupCode, canSubmitSignup,
}) {
  return (
    <div className={SIGNUP_FORM_BODY_CLASS}>
      <header className="shrink-0 text-center">
        <p className={HEADER_TEXT_CLASS}>
          무도회 입장을 위한 정보를 입력해주세요.
        </p>
      </header>

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

        <div className={SUBMIT_BTN_WRAP_CLASS}>
          <AuthImageButton
            type="submit"
            src={LOGIN_ASSETS.signupButton}
            label="회원가입"
            className={SUBMIT_BTN_CLASS}
            disabled={!canSubmitSignup}
          />
        </div>

        <div className={MODE_SWITCH_CLASS}>
          <AuthModeSwitchPrompt question="이미 계정이 있으신가요?" actionLabel="로그인하기" onSwitch={onSwitchToLogin} />
        </div>
      </SignupScrollArea>
    </div>
  )
}
