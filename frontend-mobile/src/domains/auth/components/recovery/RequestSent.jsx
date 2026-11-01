// 재설정 메일 보냄 안내 (다시 보내기 버튼은 페이지가 바닥 줄에 둠)
// pages/PasswordResetRequestPage.jsx가 보낸 뒤 씀
import { REQUEST_TEXT } from "@/domains/auth/constants/recoveryMessages.js"
import CardIntro from "./CardIntro.jsx"
import RecoveryAlert from "./RecoveryAlert.jsx"

// 가입 여부를 알려 주지 않는 문구 그대로 (데스크톱 REQUEST_TEXT.sent)
export default function RequestSent() {
  return (
    <div className="flex flex-1 flex-col justify-center py-2">
      <CardIntro>가입할 때 등록한 이메일로 비밀번호 재설정 링크를 보내드려요</CardIntro>
      <RecoveryAlert role="status">{REQUEST_TEXT.sent}</RecoveryAlert>
    </div>
  )
}
