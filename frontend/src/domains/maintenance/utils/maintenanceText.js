// 점검 안내 글귀: 남은 시간·점검 시각 글, 다시 크게 띄울 단계(10분·1분 전), 전적 끝 이유 글
// 점검 스토어·점검 안내 훅·화면이 씀 (데스크톱·모바일 같이)

const MINUTE = 60 * 1000

// 다시 크게 띄우는 때: 10분 전 → 1단계, 1분 전 → 2단계
export const REOPEN_STAGES = Object.freeze([10 * MINUTE, MINUTE])

// 남은 시간(ms) → 단계 숫자 (예: 15분 → 0, 9분 → 1, 30초 → 2)
export function stageOf(remainingMs) {
  return REOPEN_STAGES.filter((limit) => remainingMs <= limit).length
}

// 시작 시각까지 남은 ms, 서버 시계 기준 (기기 시계 + 차이), 지났으면 0
export function remainingMs(startsAtMs, offsetMs, deviceNow) {
  if (!Number.isFinite(startsAtMs)) return 0
  return Math.max(0, startsAtMs - (deviceNow + offsetMs))
}

const pad = (n) => String(n).padStart(2, "0")

// 남은 시간 글 (예: 3723000 → "1시간 02분 03초", 125000 → "2분 05초", 9000 → "9초")
export function formatRemaining(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}시간 ${pad(m)}분 ${pad(s)}초`
  if (m > 0) return `${m}분 ${pad(s)}초`
  return `${s}초`
}

// 한국 시각으로 보여 줌 (기기 지역과 상관없이 같은 글)
const KOREAN_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

// 시각 글 (예: 2026-11-10T06:00:00Z → "11월 10일 오후 3:00"), 없으면 null
export function formatClock(ms) {
  if (!Number.isFinite(ms)) return null
  return KOREAN_TIME.format(new Date(ms))
}

// 전적 끝 이유 글: 점검으로 끝난 판만 글을 줌, 나머지는 null (예: "MAINTENANCE" → "점검으로 끝남")
export function describeWinReason(winReason) {
  return winReason === "MAINTENANCE" ? "점검으로 끝남" : null
}
