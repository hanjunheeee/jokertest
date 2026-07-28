const STATUS_LINE_CLASS = "pointer-events-none px-1 text-[11px] text-white/80"

/** error가 있으면 그 문구를, 없고 status가 sending이면 "전송 중"을, 둘 다 아니면 아무것도 렌더링하지 않는다. */
export default function InGameChatStatusLine({ status = null, error = null }) {
  if (error) {
    return <p className={STATUS_LINE_CLASS}>{error}</p>
  }
  if (status === "sending") {
    return <p className={STATUS_LINE_CLASS}>전송 중</p>
  }
  return null
}
