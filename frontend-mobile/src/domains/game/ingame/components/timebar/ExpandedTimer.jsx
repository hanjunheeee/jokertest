// 펼친 진행 바 아래쪽 타이머: 타이머 틀·줄어드는 게이지·게이지 끝 마커·MM:SS
// 진행 바(Timebar)가 씀, 마커 자리·흐려짐·시계 글은 데스크톱 timebar utils 그대로
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_TIMEBAR_ASSETS } from "@/domains/game/ingame/constants/timebar/ingameTimebarAssets.js"
import {
  DIGITS_CLASS,
  EXPANDED_WRAP_INSET,
  FRAME_CLASS,
  GAUGE_INSET,
  GAUGE_WRAP_CLASS,
  MARKER_CLASS,
} from "@/domains/game/ingame/constants/timebar/ingameTimerLayout.js"
import { computeMarkerLeftPercent, computeMarkerOpacity } from "@/domains/game/ingame/utils/timebar/marker.js"
import { formatInGameTimebarClock } from "@/domains/game/ingame/utils/timebar/format.js"

// 남은 시간이 없으면(재판 등) 00:00·빈 게이지
export default function ExpandedTimer({ remainingRatio = 0, remainingSec = null }) {
  const hasCountdown = Number.isFinite(remainingSec) && remainingSec >= 0
  const clockText = hasCountdown ? formatInGameTimebarClock(remainingSec) : "00:00"
  const gaugeScale = hasCountdown ? Math.max(0, Math.min(1, remainingRatio)) : 0
  const markerLeftPercent = computeMarkerLeftPercent(gaugeScale)
  const markerOpacity = hasCountdown ? computeMarkerOpacity(remainingSec) : 1

  return (
    <div className="pointer-events-none absolute" style={EXPANDED_WRAP_INSET}>
      <div className="relative h-full w-full">
        <div className={GAUGE_WRAP_CLASS} style={GAUGE_INSET}>
          <PublicAsset
            src={INGAME_TIMEBAR_ASSETS.timerGauge}
            alt=""
            data-timebar-gauge={gaugeScale.toFixed(3)}
            className="block h-full w-full origin-left select-none object-fill"
            style={{ transform: `scaleX(${gaugeScale})` }}
          />
        </div>
        <PublicAsset src={INGAME_TIMEBAR_ASSETS.timerFrame} alt="" className={FRAME_CLASS} />
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.timerCenterMarker}
          alt=""
          className={MARKER_CLASS}
          style={{ left: `${markerLeftPercent}%`, opacity: markerOpacity }}
        />
        <span className={DIGITS_CLASS} role="timer" aria-live="off">
          {clockText}
        </span>
      </div>
    </div>
  )
}
