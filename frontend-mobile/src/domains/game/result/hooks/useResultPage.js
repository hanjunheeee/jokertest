// 결과 화면 상태 묶음: 그릴 값(실제 판·미리보기) 고르기, 새로고침 직후 기다림, 연출 끝남, 버튼 동작·떠나기 실패 안내·닫힘 시각
// pages/GameResultPage가 씀 (데스크톱 GameResultPage 안 state·effect를 모바일 쪽으로 옮긴 것, 데스크톱은 안 고침)
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
import { selectResultExitFailureNotice } from "@/domains/game/ingame/utils/exitConfirm.js"
import { useInGameSessionSnapshotSync } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"

// 화면 단계(wait·intro·result·unavailable)와 버튼 동작 돌려줌
export function useResultPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const live = useGameResultData()
    const preview = useGameResultPreview()
    // "로비로" 버튼은 이름대로 로비로 감 (판 중 나가기는 멀티 화면), 실패 안내는 버튼 위에 그려 알림 창은 끔
    const { requestExit, exitStatus, exitErrorCode, isExitPending } =
        useInGameExit({ destination: "/lobby", alertExitFailure: false })
    const { requestReturnToMatching, isReturning, returnError, clearReturnError } = useGameResultReturnToMatching()
    // 서버가 준 닫힘 시각, 서버가 닫으면 로비로
    const { closesAt } = useGameResultCloseTimer()
    // 안내는 마지막에 누른 버튼 것만 (exit·return)
    const [noticeSource, setNoticeSource] = useState(null)
    const exitNotice = selectResultExitFailureNotice(exitStatus, exitErrorCode)
    // 예: "return"이고 정원 참 → "대기방 정원이 가득 차 들어갈 수 없습니다.", 누른 적 없으면 null
    const leaveNotice = { exit: exitNotice, return: returnError }[noticeSource] ?? null
    // 판이 끝나 승패 값이 이미 있으면 판 상태를 다시 묻지 않음 (연출·승패가 흔들리지 않게)
    const freezeSnapshotSync = useInGameStore(
        (s) => s.state?.phase === "ENDED" && Boolean(s.state?.winResult),
    )
    const bootstrapStatus = useInGameSessionSnapshotSync({ enabled: !freezeSnapshotSync })

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

    // 대기방으로: 로비로 가는 중엔 막음 / 로비로: 대기방 가는 중엔 막음 (늦은 답이 반대쪽으로 끌고 가지 않게)
    const returnToMatching = () => {
        if (isReturning || isExitPending) return
        setNoticeSource("return")
        requestReturnToMatching()
    }
    const exitToLobby = () => {
        if (isReturning) return
        setNoticeSource("exit")
        clearReturnError()
        requestExit()
    }

    // 결과 없을 때 "로비로 돌아가기" 버튼: 데스크톱과 같이 /lobby로
    const leaveUnavailable = () => navigate("/lobby", { replace: true })

    return {
        stage,
        view,
        // 판 없이 ?outcome= 로 본 미리보기인지 (한 판 끝 광고 판 번호 고를 때 씀)
        isPreview: !live && previewRequested,
        completeIntro,
        returnToMatching,
        isReturning,
        isExitPending,
        exitToLobby,
        leaveUnavailable,
        leaveNotice,
        noticeSource,
        closesAt,
    }
}
