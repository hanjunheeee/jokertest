// 비밀번호 재설정 화면 (메일 링크의 token 확인 뒤 새 비밀번호 받기)
// pages/PasswordResetPage.jsx가 내보냄 (/password-reset), 상태는 useResetPage
import { useNavigate, useSearchParams } from "react-router-dom"
import AuthScene from "@/domains/auth/components/AuthScene.jsx"
import NewPasswordForm from "@/domains/auth/components/recovery/NewPasswordForm.jsx"
import ResetNotice from "@/domains/auth/components/recovery/ResetNotice.jsx"
import { RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"
import { RESET_TEXT } from "@/domains/auth/constants/recoveryMessages.js"
import { useResetPage } from "@/domains/auth/hooks/recovery/useResetPage.js"

// 확인 중 문구 글자 (알림 상자 없이)
const VERIFYING_TEXT_CLASS = "font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body"

// 안내 화면에선 Enter로 제출돼도 아무것도 안 함
const blockSubmit = (e) => e.preventDefault()

// 상태별 안내 문구·버튼 (ready·submitting이면 null이라 입력 화면)
function noticeFor(reset, { goToLogin, goToRequest }) {
  switch (reset.status) {
    case "verifying":
      return { role: "status", className: VERIFYING_TEXT_CLASS, text: "링크를 확인하고 있어요" }
    case "verifyFailed":
      return {
        role: "alert", className: RECOVERY_ALERT_CLASS, text: reset.verifyFailedMessage,
        actionLabel: "다시 확인", onAction: reset.retryVerify,
      }
    case "linkInvalid":
      // 만료·사용됨이 아니면 전부 잘못된 링크 문구
      return {
        role: "alert",
        className: RECOVERY_ALERT_CLASS,
        text: reset.linkInvalidReason === "EXPIRED" ? RESET_TEXT.linkExpired
          : reset.linkInvalidReason === "USED" ? RESET_TEXT.linkUsed
          : RESET_TEXT.linkInvalid,
        actionLabel: "다시 요청하기",
        onAction: goToRequest,
      }
    case "socialOnly":
      return {
        role: "alert", className: RECOVERY_ALERT_CLASS, text: RESET_TEXT.socialOnly,
        actionLabel: "로그인으로 이동", onAction: goToLogin,
      }
    case "done":
      return {
        role: "status", className: `${RECOVERY_ALERT_CLASS} text-center`, text: RESET_TEXT.done,
        actionLabel: "로그인으로 이동", onAction: goToLogin,
      }
    default:
      return null
  }
}

// 상태마다 AuthScene 안쪽만 바꿈 (바깥 AuthScene이 그대로여야 배경 영상이 다시 안 붙음)
export function PasswordResetPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") || ""
  const reset = useResetPage(token)

  // 로그인으로 (재설정 화면은 방문 기록에서 뺌)
  const goToLogin = () => navigate("/login", { replace: true })
  // 메일 다시 요청 화면으로
  const goToRequest = () => navigate("/password-reset/request")

  const notice = noticeFor(reset, { goToLogin, goToRequest })
  // 안내 상태면 안내만, 아니면 새 비밀번호 칸
  if (notice) {
    return (
      <AuthScene onSubmit={blockSubmit}>
        <ResetNotice {...notice} />
      </AuthScene>
    )
  }

  return (
    <AuthScene onSubmit={reset.handleSubmit}>
      <NewPasswordForm
        status={reset.status}
        password={reset.password}
        setPassword={reset.setPassword}
        passwordConfirm={reset.passwordConfirm}
        setPasswordConfirm={reset.setPasswordConfirm}
        formError={reset.formError}
      />
    </AuthScene>
  )
}
