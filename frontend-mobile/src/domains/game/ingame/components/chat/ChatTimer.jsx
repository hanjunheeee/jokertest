// 채팅 칸 안 단계 타이머: 타이머 바 그림·줄어드는 게이지·끝 마커·MM:SS
// ChatPanel·CloseupSheet가 씀, 모양 값은 데스크톱 확대 타이머 상수 그대로 (타이머 자리가 채팅일 때만)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { useTurnProgress } from "@/domains/game/ingame/hooks/timebar/useTurnProgress.js"
import { INGAME_TIMEBAR_ASSETS } from "@/domains/game/ingame/constants/timebar/ingameTimebarAssets.js"
import {
    DIGITS_CLASS,
    FRAME_CLASS,
    GAUGE_INSET,
    GAUGE_WRAP_CLASS,
    MARKER_CLASS,
} from "@/domains/game/ingame/constants/timebar/ingameTimerLayout.js"
import { computeMarkerLeftPercent, computeMarkerOpacity } from "@/domains/game/ingame/utils/timebar/marker.js"
import { formatInGameTimebarClock } from "@/domains/game/ingame/utils/timebar/format.js"

// 타이머 바 그림 비율 (1377x114)
const FRAME_ASPECT = "1377 / 114"

// 셀 시간 없으면 00:00·빈 게이지 (데스크톱 확대 타이머와 같은 규칙)
export default function ChatTimer({ deadline }) {
    const { remainingRatio, remainingSec } = useTurnProgress(deadline)
    const active = Number.isFinite(remainingSec) && remainingSec >= 0
    const gaugeScale = active ? Math.max(0, Math.min(1, remainingRatio)) : 0

    return (
        <div className="flex shrink-0 justify-center px-2 pt-1.5 pb-1">
            <div
                className="relative w-full max-w-[22rem] [container-type:inline-size]"
                style={{ aspectRatio: FRAME_ASPECT }}
                data-ingame-phase-timer="chat-embedded"
            >
                <div className={GAUGE_WRAP_CLASS} style={GAUGE_INSET}>
                    <PublicAsset
                        src={INGAME_TIMEBAR_ASSETS.timerGauge}
                        alt=""
                        className="block h-full w-full origin-left select-none object-fill"
                        style={{ transform: `scaleX(${gaugeScale})` }}
                    />
                </div>
                <PublicAsset src={INGAME_TIMEBAR_ASSETS.timerFrame} alt="" className={FRAME_CLASS} />
                <PublicAsset
                    src={INGAME_TIMEBAR_ASSETS.timerCenterMarker}
                    alt=""
                    className={MARKER_CLASS}
                    style={{
                        left: `${computeMarkerLeftPercent(gaugeScale)}%`,
                        opacity: active ? computeMarkerOpacity(remainingSec) : 1,
                    }}
                />
                <span className={DIGITS_CLASS} role="timer" aria-label="남은 시간">
                    {active ? formatInGameTimebarClock(remainingSec) : "00:00"}
                </span>
            </div>
        </div>
    )
}
