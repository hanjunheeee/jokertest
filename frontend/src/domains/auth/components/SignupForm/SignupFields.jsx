import AuthInputSlot, { LockIcon, MailIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
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

// 이메일 중복 확인 결과 메시지입니다. status가 idle/checking이면 아무것도 보여주지 않습니다.
function EmailCheckMessage({ status }) {
  if (status === "checking") return <p className="px-2 text-xs text-white/70">이메일 확인 중...</p>
  if (status === "available") return <p className="px-2 text-xs text-emerald-400">사용할 수 있는 이메일입니다.</p>
  if (status === "duplicate") return <p className="px-2 text-xs text-red-400">이미 사용 중인 이메일입니다.</p>
  if (status === "error") return <p className="px-2 text-xs text-red-400">중복 확인에 실패했습니다. 다시 시도해주세요.</p>
  return null
}

// 회원가입에 필요한 이메일/비밀번호/닉네임/생년월일 입력칸 묶음입니다.
export default function SignupFields({ formData, onChange }) {
  // 상태 로직은 useLoginPage.js의 useEmailAvailabilityCheck가 갖고 있습니다 — 이메일이
  // 바뀌면 이전 확인 결과가 자동으로 무효화됩니다.
  const { status: emailCheckStatus, check: handleCheckEmail } = useEmailAvailabilityCheck(formData.email)

  // F-31b 재검토(AC-04 소비처 연결): AuthInputSlot에 onChange 참조만 그대로 넘기면 실제
  // 호출부가 이 컴포넌트 밖으로 밀려나 useLoginPage.js::handleInputChange 소비처 연결이
  // 끊긴 것으로 판정된다 — 이 함수 안에서 명시적으로 호출한다.
  const handleFieldChange = (e) => onChange(e)

  return (
    <>
      {/* 회원가입에 사용할 이메일 입력칸입니다. */}
      <AuthInputSlot
        type="email"
        name="email"
        value={formData.email}
        onChange={handleFieldChange}
        leadingIcon={<MailIcon />}
        placeholder="이메일을 입력하세요"
        autoComplete="email"
      />

      {/* 입력 단계 이메일 중복 확인입니다. 최종 판정은 가입 제출 시 서버가 다시 내립니다. */}
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={handleCheckEmail}
          className="cursor-pointer rounded bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20"
        >
          이메일 중복확인
        </button>
        <EmailCheckMessage status={emailCheckStatus} />
      </div>

      {/* 새 비밀번호 입력칸입니다. passwordToggle로 보기/숨기기 버튼을 켭니다. */}
      <AuthInputSlot
        name="password"
        value={formData.password}
        onChange={handleFieldChange}
        leadingIcon={<LockIcon />}
        passwordToggle
        placeholder="비밀번호를 입력하세요"
        autoComplete="new-password"
      />

      {/* 비밀번호 확인 입력칸입니다. */}
      <AuthInputSlot
        name="passwordConfirm"
        value={formData.passwordConfirm}
        onChange={handleFieldChange}
        leadingIcon={<LockIcon />}
        passwordToggle
        placeholder="비밀번호를 다시 입력하세요"
        autoComplete="new-password"
      />

      {/* 게임에서 사용할 닉네임 입력칸입니다. */}
      <AuthInputSlot
        type="text"
        name="nickname"
        value={formData.nickname}
        onChange={handleFieldChange}
        leadingIcon={<UserIcon />}
        placeholder="사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)"
      />

      {/* 생년월일 입력칸입니다. */}
      <AuthInputSlot
        type="date"
        name="birthDate"
        value={formData.birthDate}
        onChange={handleFieldChange}
        leadingIcon={<CalendarIcon />}
        placeholder="생년월일을 선택하세요"
      />
    </>
  )
}
