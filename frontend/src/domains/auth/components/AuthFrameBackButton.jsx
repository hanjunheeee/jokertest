// 인증 액자 왼쪽 아래 작은 뒤로 가기 버튼
// pages/FindIdPage.jsx, pages/passwordReset/RequestPage.jsx가 사용
import BackButton from "@/shared/ui/BackButton.jsx"
import { FRAME_BACK_BTN_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"

// 공용 BackButton에 액자 안 자리 class만 입힘
export default function AuthFrameBackButton({ onClick, ariaLabel = "뒤로 가기" }) {
  return (
    <BackButton
      size="compact"
      ariaLabel={ariaLabel}
      onClick={onClick}
      className={FRAME_BACK_BTN_CLASS}
    />
  )
}
