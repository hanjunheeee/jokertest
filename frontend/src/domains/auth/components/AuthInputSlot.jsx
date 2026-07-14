import { useState } from "react"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 입력칸 안쪽에 들어가는 작은 아이콘들의 공통 크기와 색상입니다.
const inputIconClass = "h-[20px] w-[20px] shrink-0 text-neutral-600"

// 이메일 입력칸 앞에 보여줄 메일 아이콘입니다.
export function MailIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

// 비밀번호 입력칸 앞에 보여줄 자물쇠 아이콘입니다.
export function LockIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

// 비밀번호를 보이게 할 때 쓰는 눈 아이콘입니다.
function EyeIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

// 비밀번호를 숨길 때 쓰는 눈 가림 아이콘입니다.
function EyeOffIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M6.4 6.4C4 8.1 2.5 10 2 12s3.5 6 10 6c1.8 0 3.4-.4 4.8-1.1" />
      <path d="M17.6 17.6C20 15.9 21.5 14 22 12s-3.5-6-10-6c-1.3 0-2.5.2-3.6.6" />
    </svg>
  )
}

// 로그인/회원가입 화면에서 쓰는 이미지 배경 입력칸입니다.
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
  // 비밀번호를 화면에 보일지 숨길지 저장합니다.
  const [passwordVisible, setPasswordVisible] = useState(false)

  // 비밀번호 토글을 쓰는 입력칸이면 text/password를 상태에 따라 바꿉니다.
  const inputType = passwordToggle ? (passwordVisible ? "text" : "password") : type

  return (
    <div className="relative w-full">
      {/* 입력칸 배경 이미지를 먼저 깔아둡니다. */}
      <PublicAsset src={LOGIN_ASSETS.input} alt="" className="block h-auto w-full select-none" />

      {/* 실제 입력 요소들은 배경 이미지 위에 겹쳐서 올립니다. */}
      <div className="absolute inset-0 flex items-center gap-2 px-[9%] py-2">
        {/* 왼쪽 아이콘은 클릭을 막지 않도록 pointer-events를 꺼둡니다. */}
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

        {/* 비밀번호 입력칸일 때만 보기/숨기기 버튼을 보여줍니다. */}
        {passwordToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            className="group shrink-0 cursor-pointer border-0 bg-transparent p-0 text-neutral-600 transition-colors hover:text-neutral-800"
            // 이미지 버튼이라 화면 읽기 프로그램이 읽을 버튼 이름을 직접 넣습니다.
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
