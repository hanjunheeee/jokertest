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
  maxLength,
  inputTestId,
  ariaLabel,
}) {
  const [passwordVisible, setPasswordVisible] = useState(false)

  // 비밀번호 보기 버튼 있으면 보기 상태가 type을 정함
  let inputType = type
  if (passwordToggle) inputType = passwordVisible ? "text" : "password"

  return (
    <div
      className={`relative w-full min-w-0 max-w-full overflow-hidden ${compact ? "origin-top -mb-1 scale-[0.96]" : ""}`}
    >
      <PublicAsset src={LOGIN_ASSETS.input} alt="" className="block h-auto w-full max-w-full select-none" />

      <div className="absolute inset-0 box-border flex min-w-0 items-center gap-1.5 overflow-hidden px-[9%] py-2">
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
          // 라벨 없이 placeholder만 있으면 글자를 쓰는 순간 화면 읽기로 칸 이름을 모름 → 이름 따로 둠
          aria-label={ariaLabel ?? placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          inputMode={inputMode}
          maxLength={maxLength}
          data-testid={inputTestId}
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
            type === "date"
              ? `${AUTH_DATE_INPUT_CLASS}${value ? " auth-date-input--filled" : ""}`
              : "text-white placeholder:text-white/55"
          }`.trim()}
        />

        {/* 비밀번호 칸만 보기 버튼 (어두운 입력칸 그림 위라 밝은 그림 색, 올리면 더 밝게, 키보드 초점 테두리는 문의 창 버튼과 같은 색) */}
        {passwordToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            className="group shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0 text-white/70 outline-none transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"
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
