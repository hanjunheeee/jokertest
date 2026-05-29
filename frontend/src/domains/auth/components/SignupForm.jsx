import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "./AuthImageButton.jsx"
import AuthInputSlot, { LockIcon, MailIcon } from "./AuthInputSlot.jsx"

function UserIcon() {
  return (
    <svg
      className="h-[20px] w-[20px] shrink-0 text-neutral-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  )
}

export default function SignupForm({ formData, onChange, onSwitchToLogin }) {
  return (
    <>
      <header className="text-center">
        <p className="mt-[40px] mb-[-10px] text-[13px] leading-relaxed text-text-body/90">
          새로운 모험을 위한 정보를 입력해주세요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        <AuthInputSlot
          type="text"
          name="login_id"
          value={formData.login_id}
          onChange={onChange}
          leadingIcon={<MailIcon />}
          placeholder="사용할 아이디를 입력하세요"
        />

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
          autoComplete="new-password"
        />

        <AuthInputSlot
          type="text"
          name="nickname"
          value={formData.nickname}
          onChange={onChange}
          leadingIcon={<UserIcon />}
          placeholder="사용할 닉네임을 입력하세요"
        />

        <AuthImageButton
          type="submit"
          src={LOGIN_ASSETS.signupButton}
          label="회원가입"
          className="mt-1 cursor-pointer"
        />

        <p className="mt-2 text-center text-[13px] text-text-body">
          이미 계정이 있으신가요?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="cursor-pointer font-bold text-amber-800 underline-offset-2 hover:underline"
          >
            로그인하기
          </button>
        </p>
      </div>
    </>
  )
}
