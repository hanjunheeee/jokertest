const STATUS_LINE_CLASS = "pointer-events-none px-1 text-[11px] text-white/80"

export default function InGameChatStatusLine({ status = null, error = null }) {
  if (error) {
    return <p className={STATUS_LINE_CLASS}>{error}</p>
  }
  if (status === "sending") {
    return <p className={STATUS_LINE_CLASS}>전송 중</p>
  }
  return null
}
