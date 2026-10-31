import {
  ACCOUNT_PANEL_FEEDBACK_BASE_CLASS,
  ACCOUNT_PANEL_FEEDBACK_ERROR_CLASS,
  ACCOUNT_PANEL_FEEDBACK_SUCCESS_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"

export default function FeedbackMsg({ msg }) {
  if (!msg) return null

  const colorClass = msg.type === "success" ? ACCOUNT_PANEL_FEEDBACK_SUCCESS_CLASS : ACCOUNT_PANEL_FEEDBACK_ERROR_CLASS

  return (
    <p className={`${ACCOUNT_PANEL_FEEDBACK_BASE_CLASS} ${colorClass}`}>
      {msg.text}
    </p>
  )
}
