// 게임 결과 화면 (/gameresult): 연출 영상 → 결과(실제 판 또는 ?outcome= 미리보기) → 대기방·로비 버튼
// app/routes/index.jsx가 씀, 상태·동작은 hooks/useResultPage (데스크톱 결과 훅들을 부름)
import { useResultPage } from "../hooks/useResultPage.js"
import IntroVideo from "../components/intro/IntroVideo.jsx"
import ResultBoard from "../components/board/ResultBoard.jsx"
import Unavailable from "../components/board/Unavailable.jsx"
import ResultActions from "../components/actions/ResultActions.jsx"

// 단계별 화면 (wait는 판 상태 받는 동안 빈 화면)
export default function GameResultPage() {
    const page = useResultPage()

    if (page.stage === "wait") return null
    if (page.stage === "intro") {
        return <IntroVideo outcome={page.view.outcome} onComplete={page.completeIntro} />
    }

    const hasResult = page.stage === "result"
    return (
        <>
            {hasResult ? <ResultBoard {...page.view} /> : <Unavailable />}
            <ResultActions
                hasResult={hasResult}
                isReturning={page.isReturning}
                onReturnToMatching={page.returnToMatching}
                onExitToLobby={page.exitToLobby}
                onLeaveUnavailable={page.leaveUnavailable}
            />
        </>
    )
}
