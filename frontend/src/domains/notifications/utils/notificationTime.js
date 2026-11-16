// 알림 받은 시각 글자 만들기 (한국 시각 "11월 16일 10:00")
// 알림 항목 한 줄(NotificationItem)이 씀

// 이상한 값이면 빈 글자 (화면이 시각 칸을 안 그림), 문의 목록 날짜와 같은 모양
// 예) "2026-11-16T01:00:00.000Z" → "11월 16일 10:00" / undefined·"abc" → ""
export function formatNotificationTime(value) {
  if (value === null || value === undefined) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date)
}
