// 가입 1단계: 이메일+중복확인, 비밀번호 두 칸
// signup/SignupForm.jsx가 step 0일 때 씀
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { LockIcon, MailIcon } from "@m/shared/ui/input/InputIcons.jsx"
import EmailCheck from "@m/domains/auth/components/signup/EmailCheck.jsx"

// name이 formData 키와 같아야 useLoginPage 입력 처리가 맞는 칸을 고침
export default function AccountStep({ formData, onChange, emailCheckStatus, onCheckEmail }) {
  return (
    <>
      <InputSlot
        type="email"
        name="email"
        value={formData.email}
        onChange={onChange}
        leadingIcon={<MailIcon />}
        placeholder="이메일을 입력하세요"
        autoComplete="email"
        inputMode="email"
      />
      <EmailCheck status={emailCheckStatus} onCheck={onCheckEmail} />
      <InputSlot
        name="password"
        value={formData.password}
        onChange={onChange}
        leadingIcon={<LockIcon />}
        passwordToggle
        placeholder="비밀번호를 입력하세요"
        autoComplete="new-password"
      />
      <InputSlot
        name="passwordConfirm"
        value={formData.passwordConfirm}
        onChange={onChange}
        leadingIcon={<LockIcon />}
        passwordToggle
        placeholder="비밀번호를 다시 입력하세요"
        autoComplete="new-password"
      />
    </>
  )
}
