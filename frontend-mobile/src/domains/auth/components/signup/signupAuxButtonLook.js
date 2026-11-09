// 가입 보조 그림 버튼 (중복확인·인증번호 받기) — stretch보다 작게
// 가입 칸 EmailCheck·EmailVerification이 씀
import { IMAGE_BUTTON_LOOKS } from "@m/shared/ui/button/imageButtonLooks.js"

const AUX_LABEL_TEXT = "px-0.5 leading-tight app-text-scaled [--app-text-size:8px]"

export const SIGNUP_AUX_BUTTON_LOOK = {
  button: IMAGE_BUTTON_LOOKS.stretch.button.replace("min-h-11", "h-7"),
  img: "pointer-events-none block h-full w-full select-none object-fill",
  label: IMAGE_BUTTON_LOOKS.stretch.label,
  labelSize: AUX_LABEL_TEXT,
}

/** ImageButton은 labelClassName을 주면 labelSize를 안 씀 → 라벨 class에 반드시 포함 */
export const SIGNUP_AUX_BUTTON_LABEL_CLASS = `whitespace-nowrap ${AUX_LABEL_TEXT}`
export const SIGNUP_AUX_CODE_SEND_LABEL_CLASS = `!text-black whitespace-nowrap ${AUX_LABEL_TEXT}`

export const EMAIL_CHECK_BUTTON_CLASS = "w-[5.5rem] shrink-0"
export const CODE_SEND_BUTTON_CLASS = "w-[5.25rem] shrink-0"
