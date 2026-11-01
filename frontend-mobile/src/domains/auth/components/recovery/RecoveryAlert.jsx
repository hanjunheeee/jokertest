// 계정 찾기 화면 알림 상자 (에러·결과 안내 둘 다 이 모양, 데스크톱 RECOVERY_ALERT_CLASS 그대로)
// recovery 폼·결과·안내 컴포넌트가 씀
import { RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"

// role은 에러면 alert, 결과면 status
export default function RecoveryAlert({ role = "alert", className = "", children }) {
  return (
    <p role={role} className={`${RECOVERY_ALERT_CLASS} mt-2 break-keep text-center ${className}`}>
      {children}
    </p>
  )
}
