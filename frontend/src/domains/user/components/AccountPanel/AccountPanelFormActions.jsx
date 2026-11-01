// 계정 폼 아래 줄 (결과 문구 + 확인 버튼)
// 닉네임·비밀번호 칸이 씀
import {
  PANEL_ACTION_AREA_CLASS,
  PANEL_ACTION_BTN_ROW_CLASS,
  PANEL_FEEDBACK_LINE_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import ConfirmButton from "@/domains/user/components/AccountPanel/ConfirmButton.jsx"
import FeedbackMsg from "@/domains/user/components/AccountPanel/FeedbackMsg.jsx"

// 결과 문구가 있을 때만 문구 줄을 보임
export default function AccountPanelFormActions({ msg, confirmLabel = "변경", confirmDisabled = false }) {
  return (
    <div className={PANEL_ACTION_AREA_CLASS}>
      {msg ? (
        <div className={PANEL_FEEDBACK_LINE_CLASS}>
          <FeedbackMsg msg={msg} />
        </div>
      ) : null}
      <div className={PANEL_ACTION_BTN_ROW_CLASS}>
        <ConfirmButton label={confirmLabel} disabled={confirmDisabled} />
      </div>
    </div>
  )
}
