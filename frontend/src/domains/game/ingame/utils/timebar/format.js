// 시간 바 글자 만들기: 남은 시간 MM:SS·단계 표시 [구분-세부]
// 확대 타이머(InGameTimebarExpandedTimer)·시간 바 상태 글 상수·상태 글 고르기가 사용

// 남은 초 → MM:SS (음수·틀린 값은 00:00)
export function formatInGameTimebarClock(totalSec) {
  if (!Number.isFinite(totalSec)) return "00:00"
  const sec = Math.max(0, Math.floor(totalSec))
  const minutes = Math.floor(sec / 60)
  const seconds = sec % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

// 단계 표시 글 [낮-토론과 투표] 모양으로 통일 (둘 중 하나라도 비면 빈 글)
export function formatInGameTimebarPhaseTag(head, detail) {
  if (typeof head !== "string" || head.length === 0) return ""
  if (typeof detail !== "string" || detail.length === 0) return ""
  return `[${head}-${detail}]`
}
