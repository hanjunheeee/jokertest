// 비밀번호 재설정 메일 요청 화면 (/password-reset/request)
// app/routes/index.jsx가 씀, 상태·검사·요청은 데스크톱 useResetRequest 그대로
import { useNavigate } from "react-router-dom"
import { useResetRequest } from "@/domains/auth/hooks/recovery/useResetRequest.js"
import RecoveryScene from "@m/domains/auth/components/recovery/scene/RecoveryScene.jsx"
import ResetRequestForm from "@m/domains/auth/components/recovery/ResetRequestForm.jsx"
import ResetRequestSentDialog from "@m/domains/auth/components/recovery/ResetRequestSentDialog.jsx"

// 접수 안내는 양피지 창, 입력 칸은 그대로 유지
export default function PasswordResetRequestPage() {
  const navigate = useNavigate()
  const request = useResetRequest()

  // 뒤로 가기는 로그인 화면으로
  const handleBack = () => navigate("/login")

  return (
    <RecoveryScene
      intro="가입할 때 등록한 이메일로 비밀번호 재설정 링크를 보내드려요"
      onSubmit={request.handleSubmit}
      onBack={handleBack}
    >
      <ResetRequestForm
        status={request.status}
        email={request.email}
        setEmail={request.setEmail}
        formError={request.formError}
        onRetry={request.backToIdle}
      />
      <ResetRequestSentDialog
        open={request.status === "sent"}
        onConfirm={request.backToIdle}
        onResend={request.handleResend}
        resendDisabled={request.status === "submitting"}
      />
    </RecoveryScene>
  )
}
