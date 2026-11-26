// 결과 화면 우측 상단 180초 닫힘 타이머: 반 초마다 남은 초만 다시 그림
// pages/GameResultPage가 사용, 남은 초 계산은 데스크톱 useResultSecondsLeft 그대로 사용함
import { useResultSecondsLeft } from "@/domains/game/result/hooks/useGameResultReturnToMatching.js"

const TIMER_BOX_CLASS =
    "pointer-events-auto absolute right-3 top-2 z-20 flex items-baseline gap-1.5 rounded-sm border border-[#c8a878]/65 bg-[#120a06]/90 px-2.5 py-1 font-subheading text-[#f5e6c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 닫힘 시각이 있을 때만 남은 초 시계 표시
export default function CloseTimer({ closesAt }) {
    const secondsLeft = useResultSecondsLeft(closesAt)
    if (secondsLeft === null) return null

    return (
        <div
            role="timer"
            className={TIMER_BOX_CLASS}
            data-testid="result-close-timer"
            data-seconds-left={secondsLeft}
            aria-label={`결과 화면 남은 시간 ${secondsLeft}초, 끝나면 로비로 이동`}
            title="시간이 끝나면 로비로 이동합니다"
        >
            <span className="app-text-scaled [--app-text-size:0.76rem] font-semibold text-[#f0e0c8]" aria-hidden="true">
                남은 시간
            </span>
            <span className="app-text-scaled [--app-text-size:0.98rem] font-bold tabular-nums text-[#f5e6c8]" aria-hidden="true">
                {secondsLeft}초
            </span>
        </div>
    )
}
