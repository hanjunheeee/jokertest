// 재설정 메일 보냄 안내 + 다시 보내기 링크
// pages/PasswordResetRequestPage.jsx가 보낸 뒤 씀
import { REQUEST_TEXT } from "@/domains/auth/constants/recoveryMessages.js"
import RecoveryAlert from "./RecoveryAlert.jsx"
import TextLink from "./TextLink.jsx"

// 가입 여부를 알려 주지 않는 문구 그대로 (데스크톱 REQUEST_TEXT.sent)
export default function RequestSent({ onResend }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <RecoveryAlert role="status">{REQUEST_TEXT.sent}</RecoveryAlert>
      <TextLink onClick={onResend}>다시 보내기</TextLink>
    </div>
  )
}
