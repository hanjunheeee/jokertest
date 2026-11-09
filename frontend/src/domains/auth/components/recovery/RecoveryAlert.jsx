// 아이디 찾기·비밀번호 재설정 폼의 알림 한 줄 (읽어 주기 알림)
// FindIdForm·ResetRequestForm·NewPasswordForm이 씀
import { RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"

export default function RecoveryAlert({ children }) {
  return (
    <p role="alert" className={`${RECOVERY_ALERT_CLASS} mt-1 text-center`}>
      {children}
    </p>
  )
}
