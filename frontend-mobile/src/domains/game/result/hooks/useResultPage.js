// 결과 화면 상태 묶음: 그릴 값 고르기, 새로고침 직후 기다림, 연출 끝남, 닫힘 시계, 떠나기 실패 안내와 단추 동작
// pages/GameResultPage가 사용, 데스크톱 결과·나가기 훅들을 조합함
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { GAME_RESULT_OUTCOMES } from "@/domains/game/result/constants/gameResultPreviewData.js"
import { BOOTSTRAP_HOLD_MS } from "@/domains/game/result/constants/gameResultUnavailable.js"
import { useGameResultData } from "@/domains/game/result/hooks/useGameResultData.js"
import { useGameResultPreview } from "@/domains/game/result/hooks/useGameResultPreview.js"
import {
    useGameResultCloseTimer,
    useGameResultReturnToMatching,
} from "@/domains/game/result/hooks/useGameResultReturnToMatching.js"
import { useInGameExit } from "@/domains/game/ingame/hooks/useInGameExit.js"
import { useInGameSessionSnapshotSync } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { selectResultExitFailureNotice } from "@/domains/game/ingame/utils/exitConfirm.js"

// 화면 단계(wait·intro·result·unavailable)와 닫힘 시각·떠나기 안내·단추 동작 반환
export function useResultPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const live = useGameResultData()
    const preview = useGameResultPreview()
    // "로비로" 실패 안내는 단추 줄 위에 인라인으로 그리므로 알림 창은 끔
    const { requestExit, exitStatus, exitErrorCode, isExitPending } =
        useInGameExit({ destination: "/lobby", alertExitFailure: false })
    const { requestReturnToMatching, isReturning, returnError, clearReturnError } =
        useGameResultReturnToMatching()
    const { closesAt } = useGameResultCloseTimer()
    const [noticeSource, setNoticeSource] = useState(null)
    const exitNotice = selectResultExitFailureNotice(exitStatus, exitErrorCode)
    const leaveNotice = { exit: exitNotice, return: returnError }[noticeSource] ?? null

    const freezeSnapshotSync = useInGameStore(
        (s) => s.state?.phase === "ENDED" && Boolean(s.state?.winResult),
    )
    const bootstrapStatus = useInGameSessionSnapshotSync({ enabled: !freezeSnapshotSync })

    // 진행 중인 판이 있으면 ?outcome= 미리보기는 쓰지 않음
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

    // 연출은 승패 값마다 한 번만 재생함
    const [introDoneFor, setIntroDoneFor] = useState(null)
    const outcome = view?.outcome ?? null
    const completeIntro = () => setIntroDoneFor(outcome)

    let stage = "unavailable"
    if (!view && bootstrapPending) stage = "wait"
    else if (view && introDoneFor !== outcome) stage = "intro"
    else if (view) stage = "result"

    // 대기방으로 이동 요청 (양쪽 중 하나라도 진행 중이면 무시)
    const returnToMatching = () => {
        if (isReturning || isExitPending) return
        setNoticeSource("return")
        requestReturnToMatching()
    }

    // 로비로 나가기 요청 (대기방 이동 중이면 무시, 이전 복귀 오류는 지움)
    const exitToLobby = () => {
        if (isReturning) return
        setNoticeSource("exit")
        clearReturnError()
        requestExit()
    }

    // 결과 없을 때 로비로 이동
    const leaveUnavailable = () => navigate("/lobby", { replace: true })

    return {
        stage,
        view,
        isPreview: !live && previewRequested,
        closesAt,
        leaveNotice,
        noticeSource,
        completeIntro,
        returnToMatching,
        isReturning,
        isExitPending,
        leaveLocked: isReturning || isExitPending,
        exitToLobby,
        leaveUnavailable,
    }
}
