// 이미지 배경 입력 칸 (앞 아이콘·비밀번호 보기 버튼·날짜 칸 글자색)
// auth 화면 입력 칸 전부와 user 계정 패널이 사용
import { useState } from "react"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { EyeIcon, EyeOffIcon } from "@/shared/ui/InputIcons.jsx"


// 날짜 칸 빈 값 글자색은 index.css가 이 class로 맞춤
export const AUTH_DATE_INPUT_CLASS = "auth-date-input"

// passwordToggle이면 type 대신 보기 상태로 password/text를 고름
export default function AuthInputSlot({
  type = "text",
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  leadingIcon,
  passwordToggle = false,
  compact = false,
  disabled = false,
  inputMode,
  inputTestId,
}) {
  const [passwordVisible, setPasswordVisible] = useState(false)

  const inputType = passwordToggle ? (passwordVisible ? "text" : "password") : type

  return (
    <div className={`relative w-full ${compact ? "origin-top -mb-0.5 scale-[0.97]" : ""}`}>
      <PublicAsset src={LOGIN_ASSETS.input} alt="" className="block h-auto w-full select-none" />

      <div className="absolute inset-0 flex items-center gap-2 px-[9%] py-2">
        {/* 앞 아이콘은 넘겼을 때만 */}
        {leadingIcon ? (
          <span className={`pointer-events-none flex items-center ${compact ? "scale-95" : ""}`}>{leadingIcon}</span>
        ) : null}

        {/* 날짜 칸은 값이 있을 때 class를 붙여 글자색을 바꿈, 나머지는 흰 글자 */}
        <input
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          inputMode={inputMode}
          data-testid={inputTestId}
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
            type === "date"
              ? `${AUTH_DATE_INPUT_CLASS}${value ? " auth-date-input--filled" : ""}`
              : "text-white placeholder:text-white/55"
          }`.trim()}
        />

        {/* 비밀번호 칸만 보기 버튼 */}
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
