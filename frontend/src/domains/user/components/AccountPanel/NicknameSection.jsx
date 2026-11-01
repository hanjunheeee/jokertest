import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"
import {
  DIVIDER_SECTION_CLASS,
  PANEL_FORM_CLASS,
  PANEL_FORM_HEADING_CLASS,
  INPUT_WRAP_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import AccountPanelFormActions from "@/domains/user/components/AccountPanel/AccountPanelFormActions.jsx"
import UserIcon from "@/domains/user/components/AccountPanel/UserIcon.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

export default function NicknameSection({ nickname, setNickname, nicknameMsg, nicknameLoading, onSubmit }) {
  const handleSubmit = (event) => {
    if (typeof onSubmit !== "function") return
    dispatchUiSfx("ui-confirm", event)
    onSubmit(event)
  }

  return (
    <section className={DIVIDER_SECTION_CLASS}>
      <h3 className={PANEL_FORM_HEADING_CLASS}>닉네임 변경</h3>

      <form onSubmit={handleSubmit} className={PANEL_FORM_CLASS}>
        <div className={INPUT_WRAP_CLASS}>
          <AuthInputSlot
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="새 닉네임"
            autoComplete="off"
            leadingIcon={<UserIcon />}
          />
        </div>

        <AccountPanelFormActions msg={nicknameMsg} confirmDisabled={nicknameLoading} />
      </form>
    </section>
  )
}
