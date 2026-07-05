/**
 * 회원가입 폼 본문 — LoginPage에서 isSignupMode일 때 표시
 * 제출·API 호출은 부모 form의 handleSubmit이 처리
 *
 * props
 * - formData: { email, password, nickname } — LoginPage state와 공유
 * - onChange: handleInputChange — 필드 name으로 formData 갱신
 * - onSwitchToLogin: "로그인하기" 클릭 시 isSignupMode false
 */
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "./AuthImageButton.jsx"
import AuthInputSlot, { LockIcon, MailIcon } from "./AuthInputSlot.jsx"

/** 입력창 좌측 — 닉네임 필드 사용자 아이콘 */
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

/** 이메일·비밀번호·닉네임 입력과 회원가입 제출·로그인 전환 링크 */
export default function SignupForm({ formData, onChange, onSwitchToLogin }) {
  return (
    <>
      <header className="text-center">
        <p className="mt-[40px] mb-[-10px] font-subheading text-[13px] font-bold leading-relaxed text-text-body/90">
          새로운 모험을 위한 정보를 입력해주세요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
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

        <p className="mt-2 text-center font-subheading text-[13px] font-bold text-text-body">
          이미 계정이 있으신가요?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="auth-text-link"
          >
            로그인하기
          </button>
        </p>
      </div>
    </>
  )
}
