import { useState } from "react"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthInputSlot, { MailIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import SignupEmailVerification from "@/domains/auth/components/SignupEmailVerification.jsx"
import { useSocialSignup } from "@/domains/auth/hooks/useSocialSignup.js"
import {
  SIGNUP_FORM_BODY_CLASS,
  SIGNUP_HEADER_TEXT_CLASS,
  SIGNUP_HINT_TEXT_CLASS,
  SIGNUP_SUBMIT_BUTTON_CLASS,
  SIGNUP_SUBMIT_BUTTON_WRAP_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"
import SignupScrollArea from "@/domains/auth/components/SignupScrollArea.jsx"

function UserIcon() {
  return (
    <svg className="h-[20px] w-[20px] shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="h-[20px] w-[20px] shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

const BLOCKED_STATUSES = new Set(["expired", "cancelled", "conflict"])

export default function SocialSignupForm({ intentToken, onCancel }) {
  const {
    status, errorMessage, submit,
    intentStatus, emailVerificationRequired, retryIntent, canSubmit,
    email, handleEmailChange,
    emailVerification, handleSignupCodeChange, handleRequestSignupCode, handleVerifySignupCode,
  } = useSocialSignup(intentToken)
  const [nickname, setNickname] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [localError, setLocalError] = useState(null)

  const isSubmitting = status === "submitting"

  const handleSubmit = async () => {
    if (isSubmitting) return
    if (!canSubmit) return
    if (!birthDate) {
      setLocalError("생년월일을 입력해주세요.")
      return
    }
    setLocalError(null)
    await submit({ nickname, birthDate })
  }

  if (status === "done") {
    return (
      <p className="mt-8 text-center font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body/90">
        가입이 완료되었습니다. 로비로 이동합니다...
      </p>
    )
  }

  if (BLOCKED_STATUSES.has(status)) {
    return (
      <div className="mt-8 flex flex-1 flex-col items-center gap-4 text-center">
        <p role="alert" className="font-subheading app-text-scaled [--app-text-size:13px] font-bold text-red-300">{errorMessage}</p>
        <AuthImageButton type="button" onClick={onCancel} src={LOGIN_ASSETS.loginButton} label="로그인 화면으로" />
      </div>
    )
  }

  if (intentStatus === "error") {
    return (
      <div className="mt-8 flex flex-1 flex-col items-center gap-4 text-center">
        <p role="alert" className="font-subheading app-text-scaled [--app-text-size:13px] font-bold text-red-300">
          {errorMessage || "가입 정보를 불러오지 못했습니다. 다시 시도해주세요."}
        </p>
        <button type="button" data-testid="social-intent-retry" onClick={retryIntent} className="auth-text-link">
          다시 시도
        </button>
        <button type="button" onClick={onCancel} className="auth-text-link">
          로그인 화면으로
        </button>
      </div>
    )
  }

  const visibleError = localError || (status === "error" ? errorMessage : null)
  const isIntentLoading = intentStatus === "loading"

  return (
    <div className={SIGNUP_FORM_BODY_CLASS}>
      <header className="shrink-0 text-center">
        <p className={SIGNUP_HEADER_TEXT_CLASS}>
          {emailVerificationRequired
            ? "소셜 계정으로 처음 오셨네요. 이메일 인증과 닉네임·생년월일이 필요해요"
            : "소셜 계정으로 처음 오셨네요. 닉네임과 생년월일을 알려주세요"}
        </p>
      </header>

      <SignupScrollArea>
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
          leadingIcon={<UserIcon />}
          placeholder="사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)"
          compact
        />

        <AuthInputSlot
          type="date"
          name="birthDate"
          value={birthDate}
          onChange={(e) => { if (!isSubmitting) setBirthDate(e.target.value) }}
          leadingIcon={<CalendarIcon />}
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
            onClick={handleSubmit}
            disabled={!canSubmit}
            src={LOGIN_ASSETS.signupButton}
            label={isSubmitting ? "처리 중..." : "가입 완료"}
            className={SIGNUP_SUBMIT_BUTTON_CLASS}
          />
        </div>

        <button type="button" onClick={onCancel} className="auth-text-link mt-2 text-center">
          취소하고 로그인 화면으로
        </button>
      </SignupScrollArea>
    </div>
  )
}
