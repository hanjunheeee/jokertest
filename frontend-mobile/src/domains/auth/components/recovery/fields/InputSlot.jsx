// 입력창 그림 배경 칸 (앞 아이콘·비밀번호 보기 버튼·날짜 칸 글자색), 데스크톱 AuthInputSlot의 모바일판
// recovery 폼 3개가 씀
import { useState } from "react"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { EyeIcon, EyeOffIcon } from "./InputIcons.jsx"

// 날짜 칸: 빈 값은 흐린 글자, 값이 있으면 흰 글자, 달력 단추는 어두운 바탕용 (데스크톱 auth-date-input 대신)
const DATE_EMPTY_CLASS = "[color-scheme:dark] [&::-webkit-datetime-edit]:text-white/55"
const DATE_FILLED_CLASS = "[color-scheme:dark] text-white"
const TEXT_CLASS = "text-white placeholder:text-white/55"

// 칸 높이 48px로 고정해 손가락 누르는 곳 확보, 그림은 칸 크기에 맞춰 늘림
export default function InputSlot({
  type = "text",
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  leadingIcon,
  passwordToggle = false,
  inputMode,
}) {
  const [passwordVisible, setPasswordVisible] = useState(false)
  const inputType = passwordToggle ? (passwordVisible ? "text" : "password") : type
  const colorClass = type === "date" ? (value ? DATE_FILLED_CLASS : DATE_EMPTY_CLASS) : TEXT_CLASS

  return (
    <div className="relative mt-1 h-12 w-full">
      <PublicAsset src={LOGIN_ASSETS.input} alt="" className="absolute inset-0 block h-full w-full select-none" />

      <div className="absolute inset-0 flex items-center gap-2 pl-[7%] pr-[5%]">
        {leadingIcon ? <span className="pointer-events-none flex items-center">{leadingIcon}</span> : null}

        <input
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className={`h-full min-w-0 flex-1 bg-transparent font-sans font-normal outline-none disabled:cursor-not-allowed disabled:opacity-60 ${colorClass}`}
        />

        {/* 비밀번호 칸만 보기 버튼 (누르는 곳 44px) */}
        {passwordToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            className="-mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-neutral-500 active:text-neutral-300"
            aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : null}
      </div>
    </div>
  )
}
