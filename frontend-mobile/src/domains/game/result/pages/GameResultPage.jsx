// 게임 결과 화면 (/gameresult): 연출 영상 → 결과(실제 판 또는 ?outcome= 미리보기) → 대기방·로비 버튼, 우측 상단 남은 시간(180초), 판마다 한 번 광고 창
// app/routes/index.jsx가 씀, 상태·동작은 hooks/useResultPage (데스크톱 결과 훅들을 부름)
import { useResultSecondsLeft } from "@/domains/game/result/hooks/useGameResultReturnToMatching.js"
import { useResultPage } from "../hooks/useResultPage.js"
import IntroVideo from "../components/intro/IntroVideo.jsx"
import ResultBoard from "../components/board/ResultBoard.jsx"
import Unavailable from "../components/board/Unavailable.jsx"
import ResultActions from "../components/actions/ResultActions.jsx"
import InterstitialAd from "@m/shared/ads/InterstitialAd.jsx"
import { useInterstitialAd } from "@m/shared/ads/useInterstitialAd.js"

// 남은 시간 칸: 스크롤해도 위에 붙어 있게 sticky, 승패 띠를 안 가리게 제 높이만큼 자리 차지
const CLOSE_TIMER_ROW_CLASS = "pointer-events-none sticky top-0 z-30 flex justify-end px-3 pt-2"
const CLOSE_TIMER_CLASS =
    "flex items-baseline gap-1.5 rounded-sm border border-[#c8a878]/60 bg-[#120a06]/85 px-3 py-1.5 font-subheading text-[#f5e6c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 남은 시간 칸: 이 칸만 반 초마다 다시 그림, 닫힘 시각 모르면 안 그림
function CloseTimer({ closesAt }) {
    const secondsLeft = useResultSecondsLeft(closesAt)
    if (secondsLeft === null) return null
    return (
        <div className={CLOSE_TIMER_ROW_CLASS}>
            <div
                role="timer"
                className={CLOSE_TIMER_CLASS}
                data-testid="result-close-timer"
                data-seconds-left={secondsLeft}
                aria-label={`결과 화면 남은 시간 ${secondsLeft}초, 끝나면 로비로 이동`}
            >
                <span className="text-xs text-[#f0e0c8]/85" aria-hidden="true">남은 시간</span>
                <span className="text-base font-bold tabular-nums" aria-hidden="true">{secondsLeft}초</span>
            </div>
        </div>
    )
}

// 단계별 화면 (wait는 판 상태 받는 동안 빈 화면)
export default function GameResultPage() {
    const page = useResultPage()
    // 결과가 다 나타난 뒤 광고 창 (영상·버튼 누름과 안 겹치게)
    const ad = useInterstitialAd({ stage: page.stage, isPreview: page.isPreview, outcome: page.view?.outcome ?? null })

    if (page.stage === "wait") return null
    if (page.stage === "intro") {
        return <IntroVideo outcome={page.view.outcome} onComplete={page.completeIntro} />
    }

    const hasResult = page.stage === "result"
    return (
        <>
            {hasResult ? <CloseTimer closesAt={page.closesAt} /> : null}
            {hasResult ? <ResultBoard {...page.view} /> : <Unavailable />}
            <ResultActions
                hasResult={hasResult}
                isReturning={page.isReturning}
                isExitPending={page.isExitPending}
                leaveNotice={page.leaveNotice}
                noticeSource={page.noticeSource}
                onReturnToMatching={page.returnToMatching}
                onExitToLobby={page.exitToLobby}
                onLeaveUnavailable={page.leaveUnavailable}
            />
            <InterstitialAd open={ad.open} mode={ad.mode} onClose={ad.close} />
        </>
    )
}
