import BackButton from "@/shared/ui/BackButton.jsx"
import { AUTH_FRAME_BACK_BUTTON_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"

export default function AuthFrameBackButton({ onClick, ariaLabel = "뒤로 가기" }) {
  return (
    <BackButton
      size="compact"
      ariaLabel={ariaLabel}
      onClick={onClick}
      className={AUTH_FRAME_BACK_BUTTON_CLASS}
    />
  )
}
