// 그림 배경 입력 칸 (앞 아이콘·비밀번호 보기 버튼·날짜 칸 글자색), 데스크톱 AuthInputSlot의 모바일판
// 로그인·가입·소셜 가입·계정 찾기·계정 관리 칸이 씀
import { useState } from "react"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { EyeIcon, EyeOffIcon } from "@m/shared/ui/input/InputIcons.jsx"
import { INPUT_SLOT_LOOKS } from "@m/shared/ui/input/inputSlotLooks.js"

// 날짜 칸 글자색 (빈 값은 흐리게)
function toneOf(look, type, value) {
  if (type !== "date") return look.text
  return value ? look.dateFilled : look.dateEmpty
}

// 높이 48px 고정 (그림은 칸에 맞게 늘림), passwordToggle이면 보기 상태로 password/text를 고름
// look = inputSlotLooks 이름 또는 같은 모양 객체 (한 화면만 쓰는 모양은 그 화면이 객체로 넘김)
export default function InputSlot({
  look = "login", type = "text", name, value, onChange, placeholder, autoComplete, leadingIcon,
  passwordToggle = false, disabled = false, inputMode, inputTestId, ariaLabel,
}) {
  const style = typeof look === "string" ? INPUT_SLOT_LOOKS[look] : look
  const [passwordVisible, setPasswordVisible] = useState(false)
  const inputType = passwordToggle ? (passwordVisible ? "text" : "password") : type

  return (
    <div className={style.wrap}>
      <PublicAsset src={LOGIN_ASSETS.input} alt="" className={style.img} />

      <div className={style.row}>
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
          aria-label={style.namedByPlaceholder ? ariaLabel ?? placeholder : ariaLabel}
          data-testid={inputTestId}
          className={`${style.input} ${toneOf(style, type, value)}`}
        />

        {/* 비밀번호 칸만 보기 버튼, 누르는 자리 44px (없으면 오른쪽 여백만) */}
        {passwordToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            className={style.toggle}
            aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            {passwordVisible ? <EyeOffIcon className={style.eyeIcon} /> : <EyeIcon className={style.eyeIcon} />}
          </button>
        ) : style.spacer ? (
          <span className={style.spacer} aria-hidden="true" />
        ) : null}
      </div>
    </div>
  )
}
