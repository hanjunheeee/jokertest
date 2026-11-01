// 비밀번호 재설정 메일 요청 화면 (/password-reset/request)
// app/routes/index.jsx가 씀, 상태·검사·요청은 데스크톱 useResetRequest 그대로
import { useNavigate } from "react-router-dom"
import { useResetRequest } from "@/domains/auth/hooks/recovery/useResetRequest.js"
import RecoveryScene from "@m/domains/auth/components/recovery/scene/RecoveryScene.jsx"
import BottomAction from "@m/domains/auth/components/recovery/scene/BottomAction.jsx"
import ResetRequestForm from "@m/domains/auth/components/recovery/ResetRequestForm.jsx"
import RequestSent from "@m/domains/auth/components/recovery/RequestSent.jsx"

const FORM_ID = "password-reset-request-form"

// 보냈으면 안내 + 다시 보내기, 아니면 입력 칸 + 보내기 버튼
export default function PasswordResetRequestPage() {
  const navigate = useNavigate()
  const request = useResetRequest()
  const isSent = request.status === "sent"
  const isSubmitting = request.status === "submitting"

  // 뒤로 가기는 로그인 화면으로 (데스크톱과 같음)
  const handleBack = () => navigate("/login")

  return (
    <>
      <RecoveryScene formId={FORM_ID} onSubmit={request.handleSubmit} onBack={handleBack}>
        {isSent ? (
          <RequestSent />
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

      {isSent ? (
        <BottomAction label="다시 보내기" onClick={request.handleResend} />
      ) : (
        <BottomAction formId={FORM_ID} label={isSubmitting ? "전송 중" : "재설정 링크 보내기"} disabled={isSubmitting} />
      )}
    </>
  )
}
