// 확대 타이머 바: 틀 그림·줄어드는 게이지·게이지 끝 마커·MM:SS
// 단계 타이머 묶음(InGamePhaseTurnTimerPanel)이 확대 시간 바 아래·채팅 틀 위에 씀
import { INGAME_TIMEBAR_ASSETS } from "../../constants/timebar/ingameTimebarAssets.js"
import {
  DIGITS_CLASS,
  EXPANDED_WRAP_INSET,
  FRAME_CLASS,
  GAUGE_INSET,
  GAUGE_WRAP_CLASS,
  MARKER_CLASS,
} from "../../constants/timebar/ingameTimerLayout.js"
import { computeMarkerLeftPercent, computeMarkerOpacity } from "../../utils/timebar/marker.js"
import { formatInGameTimebarClock } from "../../utils/timebar/format.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 셀 시간이 없으면 00:00·빈 게이지, standalone이면 부모 칸을 꽉 채움 (채팅 틀 안)
export default function InGameTimebarExpandedTimer({
  remainingRatio = 0,
  remainingSec = null,
  variant = "timebar",
}) {
  const hasActiveCountdown = Number.isFinite(remainingSec) && remainingSec >= 0
  const clockText = hasActiveCountdown ? formatInGameTimebarClock(remainingSec) : "00:00"
  const gaugeScale = hasActiveCountdown ? Math.max(0, Math.min(1, remainingRatio)) : 0
  const markerLeftPercent = computeMarkerLeftPercent(gaugeScale)
  const markerOpacity = hasActiveCountdown
    ? computeMarkerOpacity(remainingSec)
    : 1

  const isStandalone = variant === "standalone"

  return (
    <div
      className={
        isStandalone
          ? "pointer-events-none relative h-full w-full"
          : "pointer-events-none absolute"
      }
      style={isStandalone ? undefined : EXPANDED_WRAP_INSET}
      aria-hidden={false}
    >
      <div className="relative h-full w-full">
        <div className={GAUGE_WRAP_CLASS} style={GAUGE_INSET}>
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
          className={FRAME_CLASS}
        />
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.timerCenterMarker}
          alt=""
          className={MARKER_CLASS}
          style={{ left: `${markerLeftPercent}%`, opacity: markerOpacity }}
        />
        <span className={DIGITS_CLASS} role="timer" aria-live="polite">
          {clockText}
        </span>
      </div>
    </div>
  )
}
