// 계정 폼 결과 문구 한 줄 (성공·실패 색)
// 계정 폼 아래 줄·DiscordAccountLink가 씀
import {
  FEEDBACK_BASE_CLASS,
  FEEDBACK_ERROR_CLASS,
  FEEDBACK_SUCCESS_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"

// 문구가 없으면 안 그림
export default function FeedbackMsg({ msg }) {
  if (!msg) return null

  const colorClass = msg.type === "success" ? FEEDBACK_SUCCESS_CLASS : FEEDBACK_ERROR_CLASS

  return (
    <p className={`${FEEDBACK_BASE_CLASS} ${colorClass}`}>
      {msg.text}
    </p>
  )
}
