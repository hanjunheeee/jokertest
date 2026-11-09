// 통계 화면 한국 날짜 파일, 시각 → 한국 날짜 글자 + 처음 기간(오늘까지 14일)
// StatsPage가 씀 (서버 기간도 한국 날짜라 같은 기준)
const DAY_MS = 24 * 60 * 60 * 1000
const KST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

// 예: 2026-11-09T16:00Z → '2026-11-10'
export const kstDateOf = (date) => KST_DATE.format(date)

// 처음 기간: 13일 전 ~ 오늘 (14일), 예: 2026-11-10 → { from:'2026-10-28', to:'2026-11-10' }
export const defaultRange = (now = new Date()) => ({ from: kstDateOf(new Date(now.getTime() - 13 * DAY_MS)), to: kstDateOf(now) })
