import { useState } from "react"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthInputSlot from "@/domains/auth/components/AuthInputSlot.jsx"
import { useSocialSignup } from "@/domains/auth/hooks/useSocialSignup.js"

// 닉네임 입력칸 앞에 보여줄 사용자 아이콘입니다(SignupForm/SignupFields.jsx와 같은 모양).
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

// useSocialSignup의 status 중, 이 계정 정보 보완으로는 더 이상 진행할 수 없는(재시도가
// 아니라 로그인 화면으로 돌아가야 하는) 상태들입니다 — 가입 자격 만료·이미 처리된 요청
// (중복 제출)·기존 이메일과의 충돌입니다.
const BLOCKED_STATUSES = new Set(["expired", "cancelled", "conflict"])

// F-06 AC-02: Google 최초 로그인이 SIGNUP_REQUIRED로 끝나면 LoginPage가 이 화면을 렌더링해
// 닉네임·생년월일을 받아 가입을 완료합니다. 로딩/만료/충돌/재시도 같은 상태 전이 로직 자체는
// useSocialSignup(F-05, useSocialSignup.test.js로 이미 검증됨)이 갖고 있고, 이 컴포넌트는
// 그 status를 화면에 옮겨 그리기만 합니다. AuthScene이 children을 하나의 <form>으로
// 감싸므로(AuthFrame.jsx), 여기서는 중첩 <form>을 만들지 않고 제출 버튼을 직접
// onClick으로 처리합니다.
export default function SocialSignupForm({ intentToken, onCancel }) {
  const { status, errorMessage, submit } = useSocialSignup(intentToken)
  const [nickname, setNickname] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [localError, setLocalError] = useState(null)

  const isSubmitting = status === "submitting"

  const handleSubmit = async () => {
    if (isSubmitting) return
    if (!birthDate) {
      setLocalError("생년월일을 입력해주세요.")
      return
    }
    setLocalError(null)
    await submit({ nickname, birthDate })
  }

  if (status === "done") {
    return (
      <p className="mt-8 text-center font-subheading text-[13px] font-bold text-text-body/90">
        가입이 완료되었습니다. 로비로 이동합니다...
      </p>
    )
  }

  if (BLOCKED_STATUSES.has(status)) {
    return (
      <div className="mt-8 flex flex-1 flex-col items-center gap-4 text-center">
        <p role="alert" className="font-subheading text-[13px] font-bold text-red-300">{errorMessage}</p>
        <AuthImageButton type="button" onClick={onCancel} src={LOGIN_ASSETS.loginButton} label="로그인 화면으로" />
      </div>
    )
  }

  const visibleError = localError || (status === "error" ? errorMessage : null)

  return (
    <>
      <header className="text-center">
        <p className="mt-[40px] mb-[-10px] font-subheading text-[13px] font-bold leading-relaxed text-text-body/90">
          Google 계정으로 처음 오셨네요. 닉네임과 생년월일을 알려주세요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        <AuthInputSlot
          type="text"
          name="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          leadingIcon={<UserIcon />}
          placeholder="사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)"
        />

        <AuthInputSlot
          type="date"
          name="birthDate"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          leadingIcon={<CalendarIcon />}
          placeholder="생년월일을 선택하세요"
        />

        {visibleError && <p role="alert" className="px-2 text-xs text-red-400">{visibleError}</p>}

        <AuthImageButton
          type="button"
          onClick={handleSubmit}
          src={LOGIN_ASSETS.signupButton}
          label={isSubmitting ? "처리 중..." : "가입 완료"}
          className="mt-1 cursor-pointer"
        />

        <button type="button" onClick={onCancel} className="auth-text-link mt-2 text-center">
          취소하고 로그인 화면으로
        </button>
      </div>
    </>
  )
}
