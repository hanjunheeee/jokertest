// 새 비밀번호 안내 문구·입력 칸 두 개·에러·변경 버튼
// pages/PasswordResetPage.jsx가 ready·submitting 상태에서 씀
import CardIntro from "./CardIntro.jsx"
import FieldLabel from "./FieldLabel.jsx"
import RecoveryAlert from "./RecoveryAlert.jsx"
import RecoveryButton from "./RecoveryButton.jsx"
import InputSlot from "@m/shared/ui/input/InputSlot.jsx"
import { LockIcon } from "@m/shared/ui/input/InputIcons.jsx"

// 보내는 중엔 fieldset으로 칸·버튼을 한 번에 잠금 (데스크톱과 같음)
export default function NewPasswordForm({ status, password, setPassword, passwordConfirm, setPasswordConfirm, formError }) {
  const isSubmitting = status === "submitting"

  return (
    <fieldset disabled={isSubmitting} className="contents">
      <CardIntro>새 비밀번호를 입력해주세요</CardIntro>

      <FieldLabel text="새 비밀번호">
        <InputSlot
          look="recovery"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8~64자 비밀번호"
          autoComplete="new-password"
          leadingIcon={<LockIcon />}
          passwordToggle
        />
      </FieldLabel>

      <FieldLabel text="새 비밀번호 확인">
        <InputSlot
          look="recovery"
          name="passwordConfirm"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder="비밀번호를 다시 입력하세요"
          autoComplete="new-password"
          leadingIcon={<LockIcon />}
          passwordToggle
        />
      </FieldLabel>

      {formError && <RecoveryAlert>{formError}</RecoveryAlert>}

      <RecoveryButton src="/button/버튼 프레임1.png" label={isSubmitting ? "변경 중" : "비밀번호 변경"} disabled={isSubmitting} />
    </fieldset>
  )
}
