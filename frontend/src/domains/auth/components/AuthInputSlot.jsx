/**
 * 로그인·회원가입 입력 슬롯 — 입력창 PNG 위에 아이콘·input·비밀번호 토글
 * LoginPage, SignupForm에서 email·password·nickname 필드에 사용
 *
 * props
 * - type: input type (passwordToggle 없을 때, 기본 "text")
 * - name, value, onChange: 제어 컴포넌트 — 부모 formData와 연동
 * - placeholder, autoComplete: input 속성
 * - leadingIcon: 좌측 아이콘 (MailIcon, LockIcon, UserIcon 등)
 * - passwordToggle: true면 우측 눈 아이콘으로 표시/숨김 전환
 *
 * 에셋은 constants/loginAssets.js의 input 참고
 */
import { useState } from "react"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const inputIconClass = "h-[20px] w-[20px] shrink-0 text-neutral-600"

/** 입력창 좌측 — 이메일 필드 봉투 아이콘 */
export function MailIcon() {
  return (
    <svg
      className={inputIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

/** 입력창 좌측 — 비밀번호 필드 자물쇠 아이콘 */
export function LockIcon() {
  return (
    <svg
      className={inputIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

/** 입력창 우측 토글 — 비밀번호 숨김 상태(클릭 시 표시) */
function EyeIcon() {
  return (
    <svg
      className={inputIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

/** 입력창 우측 토글 — 비밀번호 표시 중(클릭 시 숨김) */
function EyeOffIcon() {
  return (
    <svg
      className={inputIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M6.4 6.4C4 8.1 2.5 10 2 12s3.5 6 10 6c1.8 0 3.4-.4 4.8-1.1" />
      <path d="M17.6 17.6C20 15.9 21.5 14 22 12s-3.5-6-10-6c-1.3 0-2.5.2-3.6.6" />
    </svg>
  )
}

/** 입력창 프레임·아이콘·필드를 한 줄로 묶는 인증 입력 슬롯 */
export default function AuthInputSlot({
  type = "text",
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  leadingIcon,
  passwordToggle = false,
}) {
  const [passwordVisible, setPasswordVisible] = useState(false)
  const inputType = passwordToggle
    ? passwordVisible
      ? "text"
      : "password" // 토글 on이면 평문 표시
    : type

  return (
    <div className="relative w-full">
      <PublicAsset
        src={LOGIN_ASSETS.input}
        alt=""
        className="block h-auto w-full select-none"
      />
      <div className="absolute inset-0 flex items-center gap-2 px-[9%] py-2">
        <span className="pointer-events-none flex items-center">{leadingIcon}</span>
        <input
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/55"
        />
        {passwordToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            className="group shrink-0 cursor-pointer border-0 bg-transparent p-0 text-neutral-600 transition-colors hover:text-neutral-800"
            aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            <span className="interactive-scale-sm block">
              {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
