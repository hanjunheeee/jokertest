// 소셜 가입 입력 칸 (불러오는 중 표시, 이메일+인증, 닉네임, 생년월일, 가입·취소 버튼)
// social/SocialSignupForm.jsx가 입력 화면에서 씀, signup = 데스크톱 useSocialSignup 결과
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { SignupCalendarIcon, MailIcon, ProfileIcon } from "@m/shared/ui/input/InputIcons.jsx"
import { ERROR_TEXT_CLASS, HINT_TEXT_CLASS, LINK_CLASS } from "@m/domains/auth/components/login/ui/styles.js"
import EmailVerification from "@m/domains/auth/components/signup/verification/EmailVerification.jsx"

// 보내는 중엔 입력 바꾸기를 무시함 (칸은 안 잠금, 데스크톱과 같음)
export default function SocialFields({
  signup, nickname, setNickname, birthDate, setBirthDate, visibleError, onSubmit, onCancel,
}) {
  const {
    status, emailVerificationRequired, canSubmit, intentStatus, email, handleEmailChange,
    emailVerification, handleSignupCodeChange, handleRequestSignupCode, handleVerifySignupCode,
  } = signup
  const isSubmitting = status === "submitting"

  return (
    <>
      {intentStatus === "loading" && (
        <p data-testid="social-intent-loading" className={HINT_TEXT_CLASS}>가입 정보를 불러오는 중입니다...</p>
      )}

      {/* 서버가 인증을 요구할 때만 이메일 칸 + 인증 칸 */}
      {emailVerificationRequired && (
        <>
          <InputSlot
            type="email"
            name="email"
            value={email}
            onChange={(e) => { if (!isSubmitting) handleEmailChange(e) }}
            leadingIcon={<MailIcon />}
            placeholder="이메일을 입력하세요"
            autoComplete="email"
            inputMode="email"
          />
          <EmailVerification
            emailVerification={emailVerification}
            onSignupCodeChange={handleSignupCodeChange}
            handleRequestSignupCode={handleRequestSignupCode}
            handleVerifySignupCode={handleVerifySignupCode}
          />
        </>
      )}

      <InputSlot
        type="text"
        name="nickname"
        value={nickname}
        onChange={(e) => { if (!isSubmitting) setNickname(e.target.value) }}
        leadingIcon={<ProfileIcon />}
        placeholder="닉네임 (2~8자, 한글/영문/숫자)"
        ariaLabel="사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)"
      />
      <InputSlot
        type="date"
        name="birthDate"
        value={birthDate}
        onChange={(e) => { if (!isSubmitting) setBirthDate(e.target.value) }}
        leadingIcon={<SignupCalendarIcon />}
        placeholder="생년월일을 선택하세요"
        ariaLabel="생년월일"
      />

      {/* 인증이 필요한데 아직 보낼 수 없으면 안내 (보내는 중엔 숨김) */}
      {emailVerificationRequired && !canSubmit && !isSubmitting && (
        <p className={HINT_TEXT_CLASS}>이메일 인증을 완료해야 가입할 수 있습니다.</p>
      )}
      {visibleError && <p role="alert" className={ERROR_TEXT_CLASS}>{visibleError}</p>}

      <ImageButton
        onClick={onSubmit}
        disabled={!canSubmit}
        src={LOGIN_ASSETS.signupButton}
        ariaLabel={isSubmitting ? "처리 중..." : "가입 완료"}
        className="mx-auto w-[86%]"
      />
      <button type="button" onClick={onCancel} className={`${LINK_CLASS} self-center`}>취소하고 로그인 화면으로</button>
    </>
  )
}
