// 채팅 상태 줄: 오류 문구나 '전송 중' 한 줄
// 채팅 내용 틀(InGameChatContent)이 사용
// 상태 줄 글자 모양 (눌림 안 받음)
const STATUS_LINE_CLASS = "pointer-events-none px-1 text-[11px] text-white/80"

// 오류 먼저, 보내는 중이면 전송 중, 둘 다 아니면 안 그림
export default function InGameChatStatusLine({ status = null, error = null }) {
  if (error) {
    return <p className={STATUS_LINE_CLASS}>{error}</p>
  }
  if (status === "sending") {
    return <p className={STATUS_LINE_CLASS}>전송 중</p>
  }
  return null
}
