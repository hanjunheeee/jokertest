// 확대 타이머 마커 계산: 게이지 끝 자리(%)·남은 초 따라 흐려지기
// 확대 타이머(InGameTimebarExpandedTimer)가 사용
import { GAUGE_INSET, MARKER_FADE_START_SEC } from "../../constants/timebar/ingameTimerLayout.js"

// "12%" 같은 글 → 숫자 (아니면 0)
function parseInsetPercent(value) {
  if (typeof value !== "string" || !value.endsWith("%")) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// 게이지 비율(0~1) 끝점 = 마커 left(%), 게이지 안쪽 길 기준으로 맞춤
export function computeMarkerLeftPercent(gaugeScale) {
  const left = parseInsetPercent(GAUGE_INSET.left)
  const right = parseInsetPercent(GAUGE_INSET.right)
  const trackWidth = 100 - left - right
  const scale = Math.max(0, Math.min(1, gaugeScale))
  return left + trackWidth * scale
}

// 남은 초가 기준 아래면 점점 투명해짐 (셀 시간이 없으면 그대로 보임)
export function computeMarkerOpacity(remainingSec, fadeStartSec = MARKER_FADE_START_SEC) {
  if (!Number.isFinite(remainingSec) || remainingSec < 0) return 1
  if (remainingSec >= fadeStartSec) return 1
  return remainingSec / fadeStartSec
}
