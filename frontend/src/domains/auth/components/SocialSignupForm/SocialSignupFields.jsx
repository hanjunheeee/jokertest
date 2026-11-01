// 소셜 가입 스크롤 칸 안쪽 (불러오는 중 표시, 이메일+인증, 닉네임, 생년월일, 버튼)
// components/SocialSignupForm.jsx가 입력 화면에서 씀, signup = useSocialSignup 결과
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import { MailIcon, ProfileIcon, SignupCalendarIcon } from "@/shared/ui/InputIcons.jsx"
import SignupEmailVerification from "@/domains/auth/components/SignupEmailVerification.jsx"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import {
  SIGNUP_HINT_TEXT_CLASS,
  SIGNUP_SUBMIT_BUTTON_CLASS,
  SIGNUP_SUBMIT_BUTTON_WRAP_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"

// 보내는 중엔 입력 바꾸기를 무시함 (칸은 안 잠금)
export default function SocialSignupFields({
  signup, nickname, setNickname, birthDate, setBirthDate, visibleError, onSubmit, onCancel,
}) {
  const {
    status, emailVerificationRequired, canSubmit, intentStatus,
    email, handleEmailChange,
    emailVerification, handleSignupCodeChange, handleRequestSignupCode, handleVerifySignupCode,
  } = signup
  const isSubmitting = status === "submitting"
  const isIntentLoading = intentStatus === "loading"

  return (
    <>
      {isIntentLoading && (
        <p data-testid="social-intent-loading" className="px-2 text-xs text-white/70">
          가입 정보를 불러오는 중입니다...
        </p>
      )}

      {emailVerificationRequired && (
        <>
          <AuthInputSlot
            type="email"
            name="email"
            value={email}
            onChange={(e) => { if (!isSubmitting) handleEmailChange(e) }}
            leadingIcon={<MailIcon />}
            placeholder="이메일을 입력하세요"
            compact
          />
          <SignupEmailVerification
            emailVerification={emailVerification}
            onSignupCodeChange={handleSignupCodeChange}
            handleRequestSignupCode={handleRequestSignupCode}
            handleVerifySignupCode={handleVerifySignupCode}
          />
        </>
      )}

      <AuthInputSlot
        type="text"
        name="nickname"
        value={nickname}
        onChange={(e) => { if (!isSubmitting) setNickname(e.target.value) }}
        leadingIcon={<ProfileIcon />}
        placeholder="사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)"
        compact
      />

      <AuthInputSlot
        type="date"
        name="birthDate"
        value={birthDate}
        onChange={(e) => { if (!isSubmitting) setBirthDate(e.target.value) }}
        leadingIcon={<SignupCalendarIcon />}
        placeholder="생년월일을 선택하세요"
        compact
      />

      {emailVerificationRequired && !canSubmit && !isSubmitting && (
        <p className={SIGNUP_HINT_TEXT_CLASS}>이메일 인증을 완료해야 가입할 수 있습니다.</p>
      )}

      {visibleError && <p role="alert" className="px-2 text-[11px] text-red-400">{visibleError}</p>}

      <div className={SIGNUP_SUBMIT_BUTTON_WRAP_CLASS}>
        <AuthImageButton
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          src={LOGIN_ASSETS.signupButton}
          label={isSubmitting ? "처리 중..." : "가입 완료"}
          className={SIGNUP_SUBMIT_BUTTON_CLASS}
        />
      </div>

      <button type="button" onClick={onCancel} className="auth-text-link mt-2 text-center">
        취소하고 로그인 화면으로
      </button>
    </>
  )
}
