import {
  ACCOUNT_PANEL_CONFIRM_BTN_CLASS,
  ACCOUNT_PANEL_CONFIRM_BTN_IMG_CLASS,
  ACCOUNT_PANEL_CONFIRM_BTN_SRC,
  ACCOUNT_PANEL_CONFIRM_BTN_TEXT_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function ConfirmButton({ label, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={ACCOUNT_PANEL_CONFIRM_BTN_CLASS}
    >
      <PublicAsset src={ACCOUNT_PANEL_CONFIRM_BTN_SRC} alt="" className={ACCOUNT_PANEL_CONFIRM_BTN_IMG_CLASS} />

      <span className={ACCOUNT_PANEL_CONFIRM_BTN_TEXT_CLASS}>
        {label}
      </span>
    </button>
  )
}
