// 채팅 상태 줄: 오류 문구나 '전송 중' 한 줄
// 채팅 내용 틀(InGameChatContent)이 사용
// 상태 줄 글자 모양 (눌림 안 받음, 흰 글 그대로)
// 새 채팅 틀은 이 자리가 어두운 막대가 아니라 종이 위라 어두운 반투명 바탕을 깖 (바탕 없으면 대비 4.0)
const STATUS_LINE_CLASS = "pointer-events-none rounded-sm bg-black/40 px-1.5 text-[11px] text-white"

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
