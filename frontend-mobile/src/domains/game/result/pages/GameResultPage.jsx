// 게임 결과 화면 (/gameresult): 연출 영상 → 결과판·우상단 180초 타이머·떠나기 안내와 단추 줄·판 끝 광고 창
// app/routes/index.jsx가 사용, 상태·동작은 hooks/useResultPage에서 받음
import { useResultPage } from "../hooks/useResultPage.js"
import IntroVideo from "../components/intro/IntroVideo.jsx"
import CloseTimer from "../components/board/CloseTimer.jsx"
import ResultBoard from "../components/board/ResultBoard.jsx"
import Unavailable from "../components/board/Unavailable.jsx"
import ResultActions from "../components/actions/ResultActions.jsx"
import InterstitialAd from "@m/shared/ads/InterstitialAd.jsx"
import { useInterstitialAd } from "@m/shared/ads/useInterstitialAd.js"

// 단계별 결과 화면 렌더링
export default function GameResultPage() {
    const page = useResultPage()
    // 결과가 다 나타난 뒤 광고 창 표시
    const ad = useInterstitialAd({ stage: page.stage, isPreview: page.isPreview, outcome: page.view?.outcome ?? null })

    if (page.stage === "wait") return null
    if (page.stage === "intro") {
        return <IntroVideo outcome={page.view.outcome} onComplete={page.completeIntro} />
    }

    const hasResult = page.stage === "result"
    return (
        <div className="relative flex h-full min-h-0 w-full flex-col bg-black">
            {hasResult ? <CloseTimer closesAt={page.closesAt} /> : null}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                {hasResult ? <ResultBoard {...page.view} /> : <Unavailable />}
            </div>
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
        </div>
    )
}
