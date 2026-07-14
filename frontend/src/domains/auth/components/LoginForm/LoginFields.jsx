import AuthInputSlot, { LockIcon, MailIcon } from "@/domains/auth/components/AuthInputSlot.jsx"

// 로그인에 필요한 이메일/비밀번호 입력칸 묶음입니다.
export default function LoginFields({ formData, onChange }) {
  return (
    <>
      {/* 이메일 입력칸입니다. formData.email 값을 보여주고, 변경되면 부모 form 상태를 업데이트합니다. */}
      <AuthInputSlot
        type="email"
        name="email"
        value={formData.email}
        onChange={onChange}
        leadingIcon={<MailIcon />}
        placeholder="이메일을 입력하세요"
        autoComplete="email"
      />

      {/* 비밀번호 입력칸입니다. passwordToggle로 보기/숨기기 버튼을 켭니다. */}
      <AuthInputSlot
        name="password"
        value={formData.password}
        onChange={onChange}
        leadingIcon={<LockIcon />}
        passwordToggle
        placeholder="비밀번호를 입력하세요"
        autoComplete="current-password"
      />
    </>
  )
}
