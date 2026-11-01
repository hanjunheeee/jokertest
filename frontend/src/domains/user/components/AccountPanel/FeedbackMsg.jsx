import {
  FEEDBACK_BASE_CLASS,
  FEEDBACK_ERROR_CLASS,
  FEEDBACK_SUCCESS_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"

export default function FeedbackMsg({ msg }) {
  if (!msg) return null

  const colorClass = msg.type === "success" ? FEEDBACK_SUCCESS_CLASS : FEEDBACK_ERROR_CLASS

  return (
    <p className={`${FEEDBACK_BASE_CLASS} ${colorClass}`}>
      {msg.text}
    </p>
  )
}
