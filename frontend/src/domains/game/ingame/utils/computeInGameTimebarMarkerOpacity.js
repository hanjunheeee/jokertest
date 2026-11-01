import { INGAME_TIMEBAR_TIMER_MARKER_FADE_START_SEC } from "../constants/timebar/ingameTimebarLayout.js"

/** 남은 초가 fadeStart 이하이면 0→1 선형으로 투명해진다(카운트다운 없으면 1). */
export function computeInGameTimebarMarkerOpacity(
  remainingSec,
  fadeStartSec = INGAME_TIMEBAR_TIMER_MARKER_FADE_START_SEC,
) {
  if (!Number.isFinite(remainingSec) || remainingSec < 0) return 1
  if (remainingSec >= fadeStartSec) return 1
  return remainingSec / fadeStartSec
}
