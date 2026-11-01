// 로그인 모드 칸 (안내 문구, 이메일·비밀번호, 유지·찾기 링크, 로그인·소셜 버튼, 가입 전환)
// pages/LoginPage.jsx가 로그인 모드일 때 씀
import ImageButton from "@m/domains/auth/components/login/ui/ImageButton.jsx"
import InputSlot from "@m/domains/auth/components/login/ui/InputSlot.jsx"
import ModeSwitch from "@m/domains/auth/components/login/ui/ModeSwitch.jsx"
import { LockIcon, MailIcon } from "@m/domains/auth/components/login/ui/icons.jsx"
import { HEADER_TEXT_CLASS } from "@m/domains/auth/components/login/ui/styles.js"
import LoginOptions from "@m/domains/auth/components/login/LoginOptions.jsx"
import SocialButtons from "@m/domains/auth/components/login/SocialButtons.jsx"

// 제출은 바깥 액자 form이 받음 (로그인 버튼이 type=submit), name이 formData 키와 같아야 함
export default function LoginForm({ formData, rememberMe, onChange, onRememberMeChange, onSwitchToSignup }) {
  return (
    <>
      <p className={HEADER_TEXT_CLASS}>계정을 로그인 하여 무도회에 입장하세요.</p>

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
      <InputSlot
        name="password"
        value={formData.password}
        onChange={onChange}
        leadingIcon={<LockIcon />}
        passwordToggle
        placeholder="비밀번호를 입력하세요"
        autoComplete="current-password"
      />

      <LoginOptions rememberMe={rememberMe} onRememberMeChange={onRememberMeChange} />

      <ImageButton
        type="submit"
        src="/button/버튼 프레임2.png"
        label="로그인"
        visibleLabel="로그인"
        labelClassName="app-text-scaled [--app-text-size:22px]"
        className="mx-auto w-[94%]"
      />

      <SocialButtons rememberMe={rememberMe} />
      <ModeSwitch question="계정이 없으신가요?" actionLabel="회원가입" onSwitch={onSwitchToSignup} />
    </>
  )
}
