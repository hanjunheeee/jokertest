import {
  ACCOUNT_PANEL_ACTION_AREA_CLASS,
  ACCOUNT_PANEL_ACTION_BUTTON_ROW_CLASS,
  ACCOUNT_PANEL_FEEDBACK_LINE_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import ConfirmButton from "@/domains/user/components/AccountPanel/ConfirmButton.jsx"
import FeedbackMsg from "@/domains/user/components/AccountPanel/FeedbackMsg.jsx"

export default function AccountPanelFormActions({ msg, confirmLabel = "변경", confirmDisabled = false }) {
  return (
    <div className={ACCOUNT_PANEL_ACTION_AREA_CLASS}>
      {msg ? (
        <div className={ACCOUNT_PANEL_FEEDBACK_LINE_CLASS}>
          <FeedbackMsg msg={msg} />
        </div>
      ) : null}
      <div className={ACCOUNT_PANEL_ACTION_BUTTON_ROW_CLASS}>
        <ConfirmButton label={confirmLabel} disabled={confirmDisabled} />
      </div>
    </div>
  )
}
