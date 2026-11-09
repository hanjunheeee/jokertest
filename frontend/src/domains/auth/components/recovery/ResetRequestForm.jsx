// 재설정 메일 요청 입력 칸·알림·버튼 묶음
// pages/passwordReset/RequestPage.jsx가 보내기 전 화면에 씀
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { MailIcon } from "@/shared/ui/InputIcons.jsx"
import RecoveryAlert from "./RecoveryAlert.jsx"
import { REQUEST_TEXT } from "@/domains/auth/constants/recoveryMessages.js"

// 보내는 중엔 fieldset으로 칸·버튼을 한 번에 잠금
export default function ResetRequestForm({ status, email, setEmail, formError, onRetry }) {
  const isFormDisabled = status === "submitting"

  return (
    <fieldset disabled={isFormDisabled} className="contents">
      <label className="font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body/80">
        이메일
        <AuthInputSlot
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="가입할 때 등록한 이메일을 입력하세요"
          autoComplete="email"
          leadingIcon={<MailIcon />}
        />
      </label>

      {formError && <RecoveryAlert>{formError}</RecoveryAlert>}

      {/* 결과 알림: 요청 너무 많음·통신 실패 */}
      {status === "rateLimited" && <RecoveryAlert>{REQUEST_TEXT.rateLimited}</RecoveryAlert>}
      {status === "failed" && <RecoveryAlert>{REQUEST_TEXT.failed}</RecoveryAlert>}

      <AuthImageButton
        type="submit"
        src="/button/버튼 프레임2.webp"
        label={status === "submitting" ? "전송 중" : "재설정 링크 보내기"}
        visibleLabel={status === "submitting" ? "전송 중" : "재설정 링크 보내기"}
        disabled={isFormDisabled}
        className="mt-1 cursor-pointer"
      />

      {/* 너무 많음·실패면 다시 입력 버튼 (입력 화면으로) */}
      {(status === "rateLimited" || status === "failed") && (
        <button type="button" onClick={onRetry} className="auth-text-link mt-1">다시 입력</button>
      )}
    </fieldset>
  )
}
