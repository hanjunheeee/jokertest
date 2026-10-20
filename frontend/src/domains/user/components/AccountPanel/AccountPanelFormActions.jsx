import {
  ACCOUNT_PANEL_ACTION_AREA_CLASS,
  ACCOUNT_PANEL_ACTION_BUTTON_ROW_CLASS,
  ACCOUNT_PANEL_FEEDBACK_LINE_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import ConfirmButton from "@/domains/user/components/AccountPanel/ConfirmButton.jsx"
import FeedbackMsg from "@/domains/user/components/AccountPanel/FeedbackMsg.jsx"

// 메시지가 있으면 한 줄 전체를 쓰고, 변경 버튼은 그 아래 오른쪽에 둡니다.
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
