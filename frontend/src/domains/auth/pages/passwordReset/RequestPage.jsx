// 비밀번호 재설정 메일 요청 화면
// pages/PasswordResetPage.jsx가 PasswordResetRequestPage로 내보냄 (/password-reset/request)
import { useNavigate } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import AuthFrameBackButton from "@/domains/auth/components/AuthFrameBackButton.jsx"
import ResetRequestForm from "@/domains/auth/components/recovery/ResetRequestForm.jsx"
import SupportLink from "@/domains/auth/components/SupportLink.jsx"
import { RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"
import { REQUEST_TEXT, resendWaitText } from "@/domains/auth/constants/recoveryMessages.js"
import { useResetRequest } from "@/domains/auth/hooks/recovery/useResetRequest.js"

// 보냈으면 안내 + 다시 보내기, 아니면 입력 칸
export function PasswordResetRequestPage() {
  const navigate = useNavigate()
  const request = useResetRequest()

  // 뒤로 가기는 로그인 화면으로
  const handleBack = () => navigate("/login")

  return (
    <AuthScene onSubmit={request.handleSubmit}>
      <header className="text-center">
        <p className="mt-[64px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-relaxed text-text-body/90">
          가입할 때 등록한 이메일로 비밀번호 재설정 링크를 보내드려요
        </p>
      </header>

      <div className="mt-6 flex flex-1 flex-col gap-2">
        {request.status === "sent" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p role="status" className={`${RECOVERY_ALERT_CLASS} text-center`}>
              {REQUEST_TEXT.sent}
            </p>
            {/* 1분 동안 단추 끄고 남은 초를 보임 (서버도 1분 안은 메일을 안 보냄) */}
            <button
              type="button"
              onClick={request.handleResend}
              disabled={request.resendWaitSec > 0}
              className="auth-text-link disabled:cursor-not-allowed disabled:opacity-60"
            >
              다시 보내기
            </button>
            {request.resendWaitSec > 0 && (
              <p className="font-subheading app-text-scaled [--app-text-size:12px] text-text-body/80">
                {resendWaitText(request.resendWaitSec)}
              </p>
            )}
          </div>
        ) : (
          <ResetRequestForm
            status={request.status}
            email={request.email}
            setEmail={request.setEmail}
            formError={request.formError}
            onRetry={request.backToIdle}
          />
        )}
        {/* 로그인 못 하는 사람이 연락할 곳 (주소 없으면 안 보임) */}
        <SupportLink className="mt-auto" />
      </div>

      <AuthFrameBackButton onClick={handleBack} />
    </AuthScene>
  )
}
