import {
  CONFIRM_BTN_CLASS,
  CONFIRM_BTN_IMG_CLASS,
  CONFIRM_BTN_SRC,
  CONFIRM_BTN_TEXT_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function ConfirmButton({ label, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={CONFIRM_BTN_CLASS}
    >
      <PublicAsset src={CONFIRM_BTN_SRC} alt="" className={CONFIRM_BTN_IMG_CLASS} />

      <span className={CONFIRM_BTN_TEXT_CLASS}>
        {label}
      </span>
    </button>
  )
}
