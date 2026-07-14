import {
  ACCOUNT_PANEL_FEEDBACK_BASE_CLASS,
  ACCOUNT_PANEL_FEEDBACK_ERROR_CLASS,
  ACCOUNT_PANEL_FEEDBACK_SUCCESS_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"

export default function FeedbackMsg({ msg }) {
  // 아직 보여줄 메시지가 없으면 아무것도 렌더링하지 않습니다.
  if (!msg) return null

  // 성공 메시지와 실패 메시지의 색을 다르게 보여줍니다.
  const colorClass = msg.type === "success" ? ACCOUNT_PANEL_FEEDBACK_SUCCESS_CLASS : ACCOUNT_PANEL_FEEDBACK_ERROR_CLASS

  return (
    <p className={`${ACCOUNT_PANEL_FEEDBACK_BASE_CLASS} ${colorClass}`}>
      {msg.text}
    </p>
  )
}
