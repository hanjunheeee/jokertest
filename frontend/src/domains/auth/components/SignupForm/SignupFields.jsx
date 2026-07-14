import AuthInputSlot, { LockIcon, MailIcon } from "@/domains/auth/components/AuthInputSlot.jsx"

// 닉네임 입력칸 앞에 보여줄 사용자 아이콘입니다.
function UserIcon() {
  return (
    <svg className="h-[20px] w-[20px] shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  )
}

// 회원가입에 필요한 이메일/비밀번호/닉네임 입력칸 묶음입니다.
export default function SignupFields({ formData, onChange }) {
  return (
    <>
      {/* 회원가입에 사용할 이메일 입력칸입니다. */}
      <AuthInputSlot
        type="email"
        name="email"
        value={formData.email}
        onChange={onChange}
        leadingIcon={<MailIcon />}
        placeholder="이메일을 입력하세요"
        autoComplete="email"
      />

      {/* 새 비밀번호 입력칸입니다. passwordToggle로 보기/숨기기 버튼을 켭니다. */}
      <AuthInputSlot
        name="password"
        value={formData.password}
        onChange={onChange}
        leadingIcon={<LockIcon />}
        passwordToggle
        placeholder="비밀번호를 입력하세요"
        autoComplete="new-password"
      />

      {/* 게임에서 사용할 닉네임 입력칸입니다. */}
      <AuthInputSlot
        type="text"
        name="nickname"
        value={formData.nickname}
        onChange={onChange}
        leadingIcon={<UserIcon />}
        placeholder="사용할 닉네임을 입력하세요"
      />
    </>
  )
}
