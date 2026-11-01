// 일반 가입 입력 칸 묶음 (이메일+중복확인, 비밀번호 두 칸, 닉네임, 생년월일), 순서·문구는 데스크톱 SignupFields와 같음
// signup/SignupForm.jsx가 씀
import { useEmailCheck } from "@/domains/auth/hooks/login/useEmailCheck.js"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { LockIcon, MailIcon, ProfileIcon, SignupCalendarIcon } from "@m/shared/ui/input/InputIcons.jsx"
import EmailCheck from "@m/domains/auth/components/signup/EmailCheck.jsx"

// 중복확인은 이 칸에서만 쓰여서 훅을 여기서 부름 (데스크톱과 같음), name이 formData 키와 같아야 함
export default function SignupFields({ formData, onChange }) {
  const { status: emailCheckStatus, check: handleCheckEmail } = useEmailCheck(formData.email)

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
      />
      <EmailCheck status={emailCheckStatus} onCheck={handleCheckEmail} />
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
      <InputSlot
        type="text"
        name="nickname"
        value={formData.nickname}
        onChange={onChange}
        leadingIcon={<ProfileIcon />}
        placeholder="사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)"
      />
      <InputSlot
        type="date"
        name="birthDate"
        value={formData.birthDate}
        onChange={onChange}
        leadingIcon={<SignupCalendarIcon />}
        placeholder="생년월일을 선택하세요"
      />
    </>
  )
}
