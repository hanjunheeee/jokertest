// 결과 화면 상태 묶음: 그릴 값(실제 판·미리보기) 고르기, 새로고침 직후 기다림, 연출 끝남, 버튼 동작
// pages/GameResultPage가 씀 (데스크톱 GameResultPage 안 state·effect를 모바일 쪽으로 옮긴 것, 데스크톱은 안 고침)
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { GAME_RESULT_OUTCOMES } from "@/domains/game/result/constants/gameResultPreviewData.js"
import { BOOTSTRAP_HOLD_MS } from "@/domains/game/result/constants/gameResultUnavailable.js"
import { useGameResultData } from "@/domains/game/result/hooks/useGameResultData.js"
import { useGameResultPreview } from "@/domains/game/result/hooks/useGameResultPreview.js"
import { useGameResultReturnToMatching } from "@/domains/game/result/hooks/useGameResultReturnToMatching.js"
import { useInGameExit } from "@/domains/game/ingame/hooks/useInGameExit.js"
import { useInGameSessionSnapshotSync } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"

// 화면 단계(wait·intro·result·unavailable)와 버튼 동작 돌려줌
export function useResultPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const live = useGameResultData()
    const preview = useGameResultPreview()
    const { requestExit } = useInGameExit()
    const { requestReturnToMatching, isReturning } = useGameResultReturnToMatching()
    const bootstrapStatus = useInGameSessionSnapshotSync()

    // 진행 중인 판이 있으면 ?outcome= 미리보기는 안 씀
    const hasLiveSession = useInGameStore((s) => Boolean(s.state) && s.state.phase !== "ENDED")
    const previewRequested =
        !hasLiveSession && GAME_RESULT_OUTCOMES.includes(searchParams.get("outcome"))
    const view = live ?? (previewRequested ? preview : null)

    // 판 상태 받는 중이면 최대 BOOTSTRAP_HOLD_MS까지 빈 화면으로 기다림
    const [holdExpired, setHoldExpired] = useState(false)
    useEffect(() => {
        if (view || bootstrapStatus !== "checking") return undefined
        const timer = window.setTimeout(() => setHoldExpired(true), BOOTSTRAP_HOLD_MS)
        return () => window.clearTimeout(timer)
    }, [view, bootstrapStatus])
    const bootstrapPending = bootstrapStatus === "checking" && !holdExpired

    // 연출은 승패 값마다 한 번 (승패가 바뀌면 다시 재생, effect 대신 끝난 승패를 기억)
    const [introDoneFor, setIntroDoneFor] = useState(null)
    const outcome = view?.outcome ?? null
    const completeIntro = () => setIntroDoneFor(outcome)

    let stage = "unavailable"
    if (!view && bootstrapPending) stage = "wait"
    else if (view && introDoneFor !== outcome) stage = "intro"
    else if (view) stage = "result"

    // 대기방으로 (누르는 중이면 무시)
    const returnToMatching = () => {
        if (!isReturning) requestReturnToMatching()
    }

    // 결과 없을 때 버튼: 데스크톱과 같이 /multiplay로
    const leaveUnavailable = () => navigate("/multiplay", { replace: true })

    return {
        stage,
        view,
        completeIntro,
        returnToMatching,
        isReturning,
        exitToLobby: requestExit,
        leaveUnavailable,
    }
}
