// 비밀번호 재설정 메일 요청 화면 (/password-reset/request)
// app/routes/index.jsx가 씀, 상태·검사·요청은 데스크톱 useResetRequest 그대로
import { useNavigate } from "react-router-dom"
import { useResetRequest } from "@/domains/auth/hooks/recovery/useResetRequest.js"
import RecoveryScene from "@m/domains/auth/components/recovery/scene/RecoveryScene.jsx"
import ResetRequestForm from "@m/domains/auth/components/recovery/ResetRequestForm.jsx"
import RequestSent from "@m/domains/auth/components/recovery/RequestSent.jsx"

// 보냈으면 안내 + 다시 보내기, 아니면 입력 칸 (데스크톱과 같음)
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
      {request.status === "sent" ? (
        <RequestSent onResend={request.handleResend} />
      ) : (
        <ResetRequestForm
          status={request.status}
          email={request.email}
          setEmail={request.setEmail}
          formError={request.formError}
          onRetry={request.backToIdle}
        />
      )}
    </RecoveryScene>
  )
}
