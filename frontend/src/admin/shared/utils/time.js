// 서버 시각(UTC 글자) → 한국 시각 글자 파일
// 관리자 화면 전부가 시각 보여 줄 때 씀 (서버는 늘 UTC, 화면만 한국 시각)
const KST_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// 예: '2026-11-10T03:00:00.000Z' → '2026-11-10 12:00', 빈 값·틀린 값 → '—'
export const formatKst = (iso) => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  // [{type:'year',value:'2026'}, …] → { year:'2026', month:'11', … }
  const part = Object.fromEntries(KST_PARTS.formatToParts(date).map(({ type, value }) => [type, value]))
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}`
}
