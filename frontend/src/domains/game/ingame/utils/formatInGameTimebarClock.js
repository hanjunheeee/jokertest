/** 타이머바 우측 MM:SS — 음수·비유한 값은 00:00 */
export function formatInGameTimebarClock(totalSec) {
  if (!Number.isFinite(totalSec)) return "00:00"
  const sec = Math.max(0, Math.floor(totalSec))
  const minutes = Math.floor(sec / 60)
  const seconds = sec % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
