// 로그인 이메일·비밀번호 입력 칸
// components/LoginForm.jsx가 사용
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import { LockIcon, MailIcon } from "@/shared/ui/InputIcons.jsx"

// name이 formData 키와 같아야 useLoginPage 입력 처리가 맞는 칸을 고침
export default function LoginFields({ formData, onChange }) {
  return (
    <>
      <AuthInputSlot
        type="email"
        name="email"
        value={formData.email}
        onChange={onChange}
        leadingIcon={<MailIcon />}
        placeholder="이메일을 입력하세요"
        autoComplete="email"
      />

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
