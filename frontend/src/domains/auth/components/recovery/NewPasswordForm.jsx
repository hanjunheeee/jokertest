// 새 비밀번호 머리글·입력 칸 두 개·에러·변경 버튼
// pages/passwordReset/ResetPage.jsx가 ready·submitting 상태에서 씀
import AuthInputSlot from "@/domains/auth/components/AuthInputSlot.jsx"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import { LockIcon } from "@/domains/auth/components/InputIcons.jsx"
import { AUTH_RECOVERY_ALERT_CLASS } from "@/domains/auth/constants/recoveryLayoutStyle.js"

// 보내는 중엔 fieldset으로 칸·버튼을 한 번에 잠금
export default function NewPasswordForm({ status, password, setPassword, passwordConfirm, setPasswordConfirm, formError }) {
  const isFormDisabled = status === "submitting"

  return (
    <>
      <header className="text-center">
        <p className="mt-[40px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-relaxed text-text-body/90">
          새 비밀번호를 입력해주세요
        </p>
      </header>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        <fieldset disabled={isFormDisabled} className="contents">
          <label className="font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body/80">
            새 비밀번호
            <AuthInputSlot
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8~64자 비밀번호"
              autoComplete="new-password"
              leadingIcon={<LockIcon />}
              passwordToggle
            />
          </label>

          <label className="mt-1 font-subheading app-text-scaled [--app-text-size:12px] font-bold text-text-body/80">
            새 비밀번호 확인
            <AuthInputSlot
              name="passwordConfirm"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="비밀번호를 다시 입력하세요"
              autoComplete="new-password"
              leadingIcon={<LockIcon />}
              passwordToggle
            />
          </label>

          {formError && (
            <p role="alert" className={`${AUTH_RECOVERY_ALERT_CLASS} mt-1 text-center`}>
              {formError}
            </p>
          )}

          <AuthImageButton
            type="submit"
            src="/button/버튼 프레임1.png"
            label={status === "submitting" ? "변경 중" : "비밀번호 변경"}
            visibleLabel={status === "submitting" ? "변경 중" : "비밀번호 변경"}
            disabled={isFormDisabled}
            className="mt-1 cursor-pointer"
          />
        </fieldset>
      </div>
    </>
  )
}
