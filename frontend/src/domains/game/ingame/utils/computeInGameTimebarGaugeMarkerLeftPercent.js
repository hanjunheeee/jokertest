import { INGAME_TIMEBAR_TIMER_GAUGE_INSET } from "../constants/timebar/ingameTimebarLayout.js"

function parseInsetPercent(value) {
  if (typeof value !== "string" || !value.endsWith("%")) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 게이지 scaleX(0~1) 끝점 — 다이아몬드 마커의 left(%) */
export function computeInGameTimebarGaugeMarkerLeftPercent(gaugeScale) {
  const left = parseInsetPercent(INGAME_TIMEBAR_TIMER_GAUGE_INSET.left)
  const right = parseInsetPercent(INGAME_TIMEBAR_TIMER_GAUGE_INSET.right)
  const trackWidth = 100 - left - right
  const scale = Math.max(0, Math.min(1, gaugeScale))
  return left + trackWidth * scale
}
