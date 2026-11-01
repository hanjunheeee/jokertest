// 행동 줄 위 안내 한 줄: 요청 오류는 붉게, 그 밖엔 잠김 이유·제출 상태
// 행동 줄(ActionRow)이 씀
const TONE_CLASS = {
  error: "text-[#ff9d8d]",
  info: "text-[#e7d3ae]",
}

// 글이 없으면 자리째 안 그림 (줄 높이 아끼기)
export default function ActionMessage({ message }) {
  if (!message?.text) return null
  return (
    <p
      role={message.tone === "error" ? "alert" : "status"}
      data-ingame-action-message={message.tone}
      className={`truncate px-1 text-center font-subheading app-text-scaled [--app-text-size:0.78rem] leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] ${TONE_CLASS[message.tone] ?? TONE_CLASS.info}`}
    >
      {message.text}
    </p>
  )
}
