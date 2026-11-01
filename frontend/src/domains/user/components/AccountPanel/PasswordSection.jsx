import { LockIcon } from "@/shared/ui/InputIcons.jsx"
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import {
  DIVIDER_SECTION_CLASS,
  PANEL_FORM_CLASS,
  PANEL_FORM_HEADING_CLASS,
  INPUT_WRAP_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import AccountPanelFormActions from "@/domains/user/components/AccountPanel/AccountPanelFormActions.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

export default function PasswordSection({ pwForm, handlePwChange, pwMsg, pwLoading, onSubmit }) {
  const handleSubmit = (event) => {
    if (typeof onSubmit !== "function") return
    dispatchUiSfx("ui-confirm", event)
    onSubmit(event)
  }

  return (
    <section className={DIVIDER_SECTION_CLASS}>
      <h3 className={PANEL_FORM_HEADING_CLASS}>비밀번호 변경</h3>

      <form onSubmit={handleSubmit} className={PANEL_FORM_CLASS}>
        <div className={INPUT_WRAP_CLASS}>
          <AuthInputSlot
            name="currentPassword"
            value={pwForm.currentPassword}
            onChange={handlePwChange}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
            passwordToggle
            leadingIcon={<LockIcon />}
          />
        </div>

        <div className={INPUT_WRAP_CLASS}>
          <AuthInputSlot
            name="newPassword"
            value={pwForm.newPassword}
            onChange={handlePwChange}
            placeholder="새 비밀번호"
            autoComplete="new-password"
            passwordToggle
            leadingIcon={<LockIcon />}
          />
        </div>

        <AccountPanelFormActions msg={pwMsg} confirmDisabled={pwLoading} />
      </form>
    </section>
  )
}
