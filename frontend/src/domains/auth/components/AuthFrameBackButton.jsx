import BackButton from "@/shared/ui/BackButton.jsx"
import { AUTH_FRAME_BACK_BUTTON_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"

/** 아이디/비밀번호 찾기·재설정 요청 — 로그인 프레임 하단 좌측 이미지 뒤로가기 */
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
