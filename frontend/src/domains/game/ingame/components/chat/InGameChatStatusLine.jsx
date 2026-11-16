// 채팅 상태 줄: 오류 문구나 '전송 중' 한 줄
// 채팅 내용 틀(InGameChatContent)이 사용
// 상태 줄 글자 모양 (눌림 안 받음, 틀 가운데 어두운 막대 위에 놓임 — 크게 보기에선 종이 끝에 걸쳐 흐린 흰색은 덜 보여 흰색 그대로)
const STATUS_LINE_CLASS = "pointer-events-none px-1 text-[11px] text-white"

// 오류 먼저, 보내는 중이면 전송 중, 둘 다 아니면 안 그림
export default function InGameChatStatusLine({ status = null, error = null }) {
  if (error) {
    return <p role="alert" className={STATUS_LINE_CLASS}>{error}</p>
  }
  if (status === "sending") {
    return <p role="status" className={STATUS_LINE_CLASS}>전송 중</p>
  }
  return null
}
