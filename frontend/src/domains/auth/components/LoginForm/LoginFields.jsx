import AuthInputSlot from "@/domains/auth/components/AuthInputSlot.jsx"
import { LockIcon, MailIcon } from "@/domains/auth/components/InputIcons.jsx"

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
