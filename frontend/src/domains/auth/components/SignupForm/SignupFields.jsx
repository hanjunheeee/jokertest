// 일반 가입 입력 칸 묶음 (이메일+중복확인, 비밀번호 두 칸, 닉네임, 생년월일)
// components/SignupForm.jsx가 스크롤 칸 안에 씀
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { LockIcon, MailIcon, ProfileIcon, SignupCalendarIcon } from "@/shared/ui/InputIcons.jsx"
import EmailCheckMessage from "@/domains/auth/components/SignupForm/EmailCheckMessage.jsx"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import {
  SIGNUP_EMAIL_CHECK_BUTTON_CLASS,
  SIGNUP_EMAIL_CHECK_BUTTON_LABEL_CLASS,
  SIGNUP_EMAIL_CHECK_BLOCK_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"
import { useEmailCheck } from "@/domains/auth/hooks/login/useEmailCheck.js"

// 중복확인은 이 칸에서만 쓰여서 훅을 여기서 부름
export default function SignupFields({ formData, handleInputChange }) {
  const { status: emailCheckStatus, check: handleCheckEmail } = useEmailCheck(formData.email)

  return (
    <>
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

      <AuthInputSlot
        type="text"
        name="nickname"
        value={formData.nickname}
        onChange={handleInputChange}
        leadingIcon={<ProfileIcon />}
        placeholder="사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)"
        compact
      />

      <AuthInputSlot
        type="date"
        name="birthDate"
        value={formData.birthDate}
        onChange={handleInputChange}
        leadingIcon={<SignupCalendarIcon />}
        placeholder="생년월일을 선택하세요"
        compact
      />
    </>
  )
}
