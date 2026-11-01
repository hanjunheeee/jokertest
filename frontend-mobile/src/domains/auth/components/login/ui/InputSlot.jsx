// 그림 배경 입력 칸 (앞 아이콘·비밀번호 보기 버튼·날짜 칸 글자색), 데스크톱 AuthInputSlot의 모바일판
// 로그인·가입·소셜 가입 입력 칸이 씀
import { useState } from "react"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { EyeIcon, EyeOffIcon } from "@m/domains/auth/components/login/ui/icons.jsx"

// 날짜 칸: 어두운 배경에 맞게 달력 아이콘을 밝히고, 값 없을 땐 흐린 글자
const DATE_INPUT_CLASS = "[color-scheme:dark] text-white"
const DATE_EMPTY_CLASS = "[&::-webkit-datetime-edit]:text-white/55"

// 높이 48px 고정 (그림은 칸에 맞게 늘림), passwordToggle이면 보기 상태로 password/text를 고름
export default function InputSlot({
  type = "text", name, value, onChange, placeholder, autoComplete, leadingIcon,
  passwordToggle = false, disabled = false, inputMode, inputTestId, ariaLabel,
}) {
  const [passwordVisible, setPasswordVisible] = useState(false)
  const inputType = passwordToggle ? (passwordVisible ? "text" : "password") : type
  const toneClass = type === "date"
    ? `${DATE_INPUT_CLASS} ${value ? "" : DATE_EMPTY_CLASS}`
    : "text-white placeholder:text-white/55"

  return (
    <div className="relative h-12 w-full">
      <PublicAsset src={LOGIN_ASSETS.input} alt="" className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />

      <div className="absolute inset-0 flex items-center gap-2 pl-[7%] pr-[3%]">
        {leadingIcon ? <span className="pointer-events-none flex items-center">{leadingIcon}</span> : null}

        <input
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          inputMode={inputMode}
          aria-label={ariaLabel ?? placeholder}
          data-testid={inputTestId}
          className={`h-full min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
        />

        {/* 비밀번호 칸만 보기 버튼, 누르는 자리 44px */}
        {passwordToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-neutral-600 active:scale-90"
            aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : null}
      </div>
    </div>
  )
}
