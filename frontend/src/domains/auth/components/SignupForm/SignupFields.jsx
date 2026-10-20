import AuthInputSlot, { LockIcon, MailIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import {
  SIGNUP_EMAIL_CHECK_BUTTON_CLASS,
  SIGNUP_EMAIL_CHECK_BUTTON_LABEL_CLASS,
  SIGNUP_EMAIL_CHECK_BLOCK_CLASS,
  SIGNUP_EMAIL_CHECK_MESSAGE_AVAILABLE_CLASS,
  SIGNUP_EMAIL_CHECK_MESSAGE_CLASS,
  SIGNUP_EMAIL_CHECK_MESSAGE_ERROR_CLASS,
  SIGNUP_EMAIL_CHECK_MESSAGE_LAYER_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"
import { useEmailAvailabilityCheck } from "@/domains/auth/hooks/useLoginPage.js"

// 닉네임 입력칸 앞에 보여줄 사용자 아이콘입니다.
function UserIcon() {
  return (
    <svg className="h-[20px] w-[20px] shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  )
}

// 생년월일 입력칸 앞에 보여줄 달력 아이콘입니다.
function CalendarIcon() {
  return (
    <svg className="h-[20px] w-[20px] shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

// 이메일 중복 확인 결과 메시지입니다. status가 idle이면 아무것도 보여주지 않습니다.
function EmailCheckMessage({ status }) {
  let message = null
  let toneClass = ""

  if (status === "checking") {
    message = "이메일 확인 중..."
    toneClass = "text-white/70"
  } else if (status === "available") {
    message = "사용할 수 있는 이메일입니다."
    toneClass = SIGNUP_EMAIL_CHECK_MESSAGE_AVAILABLE_CLASS
  } else if (status === "duplicate") {
    message = "이미 사용 중인 이메일입니다."
    toneClass = SIGNUP_EMAIL_CHECK_MESSAGE_ERROR_CLASS
  } else if (status === "error") {
    message = "중복 확인에 실패했습니다. 다시 시도해주세요."
    toneClass = SIGNUP_EMAIL_CHECK_MESSAGE_ERROR_CLASS
  }

  if (!message) return null

  return (
    <div className={SIGNUP_EMAIL_CHECK_MESSAGE_LAYER_CLASS} aria-live="polite">
      <p className={`${SIGNUP_EMAIL_CHECK_MESSAGE_CLASS} ${toneClass}`}>{message}</p>
    </div>
  )
}

// 회원가입에 필요한 이메일/비밀번호/닉네임/생년월일 입력칸 묶음입니다.
export default function SignupFields({ formData, handleInputChange }) {
  // 상태 로직은 useLoginPage.js의 useEmailAvailabilityCheck가 갖고 있습니다 — 이메일이
  // 바뀌면 이전 확인 결과가 자동으로 무효화됩니다.
  const { status: emailCheckStatus, check: handleCheckEmail } = useEmailAvailabilityCheck(formData.email)

  return (
    <>
      {/* 회원가입에 사용할 이메일 입력칸입니다. */}
      <AuthInputSlot
        type="email"
        name="email"
        value={formData.email}
        onChange={handleInputChange}
        leadingIcon={<MailIcon />}
        placeholder="이메일을 입력하세요"
        autoComplete="email"
        compact
      />

      {/* 입력 단계 이메일 중복 확인입니다. 최종 판정은 가입 제출 시 서버가 다시 내립니다. */}
      <div className={SIGNUP_EMAIL_CHECK_BLOCK_CLASS}>
        <AuthImageButton
          type="button"
          inline
          onClick={handleCheckEmail}
          src={LOGIN_ASSETS.emailCheckButton}
          label="이메일 중복확인"
          visibleLabel="이메일 중복확인"
          visibleLabelClassName={SIGNUP_EMAIL_CHECK_BUTTON_LABEL_CLASS}
          className={SIGNUP_EMAIL_CHECK_BUTTON_CLASS}
        />
        <EmailCheckMessage status={emailCheckStatus} />
      </div>

      {/* 새 비밀번호 입력칸입니다. passwordToggle로 보기/숨기기 버튼을 켭니다. */}
      <AuthInputSlot
        name="password"
        value={formData.password}
        onChange={handleInputChange}
        leadingIcon={<LockIcon />}
        passwordToggle
        placeholder="비밀번호를 입력하세요"
        autoComplete="new-password"
        compact
      />

      {/* 비밀번호 확인 입력칸입니다. */}
      <AuthInputSlot
        name="passwordConfirm"
        value={formData.passwordConfirm}
        onChange={handleInputChange}
        leadingIcon={<LockIcon />}
        passwordToggle
        placeholder="비밀번호를 다시 입력하세요"
        autoComplete="new-password"
        compact
      />

      {/* 게임에서 사용할 닉네임 입력칸입니다. */}
      <AuthInputSlot
        type="text"
        name="nickname"
        value={formData.nickname}
        onChange={handleInputChange}
        leadingIcon={<UserIcon />}
        placeholder="사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)"
        compact
      />

      {/* 생년월일 입력칸입니다. */}
      <AuthInputSlot
        type="date"
        name="birthDate"
        value={formData.birthDate}
        onChange={handleInputChange}
        leadingIcon={<CalendarIcon />}
        placeholder="생년월일을 선택하세요"
        compact
      />
    </>
  )
}
