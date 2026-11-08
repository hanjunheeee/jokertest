// 재설정 메일 요청 입력 칸·알림·버튼·다시 입력 링크 묶음
// pages/PasswordResetRequestPage.jsx가 보내기 전 화면에 씀
import { useResetRequestParchment } from "@m/domains/auth/hooks/recovery/useResetRequestParchment.js"
import FieldLabel from "./FieldLabel.jsx"
import RecoveryButton from "./RecoveryButton.jsx"
import TextLink from "./TextLink.jsx"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { MailIcon } from "@m/shared/ui/input/InputIcons.jsx"

// 보내는 중엔 fieldset으로 칸·버튼을 한 번에 잠금 (데스크톱과 같음)
export default function ResetRequestForm({ status, email, setEmail, formError, onRetry }) {
  const isSubmitting = status === "submitting"
  useResetRequestParchment({ status, formError })

  return (
    <fieldset disabled={isSubmitting} className="contents">
      <FieldLabel text="이메일">
        <InputSlot
          look="recovery"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="가입할 때 등록한 이메일을 입력하세요"
          autoComplete="email"
          inputMode="email"
          leadingIcon={<MailIcon />}
        />
      </FieldLabel>

      <RecoveryButton label={isSubmitting ? "전송 중" : "재설정 링크 보내기"} disabled={isSubmitting} />

      {/* 너무 많음·실패면 다시 입력 (입력 화면으로) */}
      {(status === "rateLimited" || status === "failed") && <TextLink onClick={onRetry}>다시 입력</TextLink>}
    </fieldset>
  )
}
