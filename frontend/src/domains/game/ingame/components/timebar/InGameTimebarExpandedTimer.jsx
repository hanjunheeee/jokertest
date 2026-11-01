import { INGAME_TIMEBAR_ASSETS } from "../../constants/timebar/ingameTimebarAssets.js"
import {
  INGAME_TIMEBAR_EXPANDED_TIMER_WRAP_INSET,
  INGAME_TIMEBAR_TIMER_DIGITS_CLASS,
  INGAME_TIMEBAR_TIMER_FRAME_CLASS,
  INGAME_TIMEBAR_TIMER_GAUGE_INSET,
  INGAME_TIMEBAR_TIMER_GAUGE_WRAP_CLASS,
  INGAME_TIMEBAR_TIMER_MARKER_CLASS,
} from "../../constants/timebar/ingameTimebarLayout.js"
import { computeInGameTimebarGaugeMarkerLeftPercent } from "../../utils/computeInGameTimebarGaugeMarkerLeftPercent.js"
import { computeInGameTimebarMarkerOpacity } from "../../utils/computeInGameTimebarMarkerOpacity.js"
import { formatInGameTimebarClock } from "../../utils/formatInGameTimebarClock.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 확대 시간흐름바 하단 또는 채팅 상단 — 타이머바 프레임·게이지·중앙 마커·MM:SS. */
export default function InGameTimebarExpandedTimer({
  remainingRatio = 0,
  remainingSec = null,
  variant = "timebar",
}) {
  const hasActiveCountdown = Number.isFinite(remainingSec) && remainingSec >= 0
  const clockText = hasActiveCountdown ? formatInGameTimebarClock(remainingSec) : "00:00"
  const gaugeScale = hasActiveCountdown ? Math.max(0, Math.min(1, remainingRatio)) : 0
  const markerLeftPercent = computeInGameTimebarGaugeMarkerLeftPercent(gaugeScale)
  const markerOpacity = hasActiveCountdown
    ? computeInGameTimebarMarkerOpacity(remainingSec)
    : 1

  const isStandalone = variant === "standalone"

  return (
    <div
      className={
        isStandalone
          ? "pointer-events-none relative h-full w-full"
          : "pointer-events-none absolute"
      }
      style={isStandalone ? undefined : INGAME_TIMEBAR_EXPANDED_TIMER_WRAP_INSET}
      aria-hidden={false}
    >
      <div className="relative h-full w-full">
        <div className={INGAME_TIMEBAR_TIMER_GAUGE_WRAP_CLASS} style={INGAME_TIMEBAR_TIMER_GAUGE_INSET}>
          <PublicAsset
            src={INGAME_TIMEBAR_ASSETS.timerGauge}
            alt=""
            className="block h-full w-full origin-left select-none object-fill"
            style={{ transform: `scaleX(${gaugeScale})` }}
          />
        </div>
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.timerFrame}
          alt=""
          className={INGAME_TIMEBAR_TIMER_FRAME_CLASS}
        />
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.timerCenterMarker}
          alt=""
          className={INGAME_TIMEBAR_TIMER_MARKER_CLASS}
          style={{ left: `${markerLeftPercent}%`, opacity: markerOpacity }}
        />
        <span className={INGAME_TIMEBAR_TIMER_DIGITS_CLASS} role="timer" aria-live="polite">
          {clockText}
        </span>
      </div>
    </div>
  )
}
