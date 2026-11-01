// 인게임 연출 층 훅: 데스크톱 InGamePage의 연출 훅 호출·열림 조건을 같은 순서로 옮김
// OverlayLayer가 씀, 잠금·역할 다시 보기 값은 overlayBridge로 화면 틀에 넘김
import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import {
    isSameReceiptScope,
    readInGameReceiptScope,
    selectNightPresentationWait,
    useInGameStore,
} from "@/domains/game/ingame/store/ingameStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useInGameSnapshotRebindPending } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameNightPrivateResult } from "@/domains/game/ingame/hooks/useInGameNightPrivateResult.js"
import { useInGameNightSuccessPresentation } from "@/domains/game/ingame/hooks/useInGameNightSuccessPresentation.js"
import { useInGameOverlayStack } from "@/domains/game/ingame/hooks/useInGameOverlayStack.js"
import { useInGameTribunalExpulsionPresentation } from "@/domains/game/ingame/hooks/useInGameTribunalExpulsionPresentation.js"
import { useInGameResultNavigation } from "@/domains/game/ingame/hooks/useInGameResultNavigation.js"
import { useOverlayBridge } from "./overlayBridge.js"
import { useDeadChoice } from "./useDeadChoice.js"

// 연출마다 열림·값 묶음 (앞 연출이 열려 있으면 뒤 연출은 hold로 미룸, 데스크톱과 같음)
export function useOverlayLayer() {
    const gameId = useInGameStore((s) => s.gameId)
    const gameState = useInGameStore((s) => s.state)
    const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
    const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
    const identityRebindPending = useInGameSnapshotRebindPending()

    const tribunalExpulsion = useInGameTribunalExpulsionPresentation({ hold: false })
    const expulsionBusy = tribunalExpulsion.open || tribunalExpulsion.pending
    const { roleReveal, phaseEntrance, nightTurn, interactionBlocked } = useInGameOverlayStack({
        deathRevealActive: expulsionBusy,
    })

    const nightSuccess = useInGameNightSuccessPresentation({
        hold: roleReveal.open || expulsionBusy,
    })
    const nightPrivateResult = useInGameNightPrivateResult({
        hold: roleReveal.open || expulsionBusy || nightSuccess.open,
    })

    // 다른 사람 밤 연출 대기: 같은 판·같은 밤·같은 수신 범위일 때만
    const wait = useInGameStore(selectNightPresentationWait)
    const waitOwned = wait !== null
        && wait.gameId === gameId
        && gameState?.phase === "NIGHT"
        && gameState?.dayIndex === wait.nightDayIndex
        && isSameReceiptScope(wait.scope, readInGameReceiptScope({ accountId: authUuid, identityGeneration }))
    const waitOpen = waitOwned && !nightSuccess.open

    // 결과 화면 이동은 추방·밤 성공 연출이 끝난 뒤로 미룸
    useInGameResultNavigation({
        hold: identityRebindPending || expulsionBusy || nightSuccess.open || nightSuccess.pending,
    })

    const deadChoice = useDeadChoice({
        blocked: roleReveal.open || nightSuccess.open || nightPrivateResult.open || waitOpen,
    })

    // 재판 연출 열림 조건 (문지기 컴포넌트와 같음)
    const tribunalOpen = gameState?.phase === "TRIBUNAL"
        && Boolean(gameState?.tribunal?.defendantUuid)
        && gameState.tribunal.resolved !== true

    const surfaceLocked = interactionBlocked || nightPrivateResult.open || deadChoice.open
        || nightSuccess.open || waitOpen || tribunalOpen || tribunalExpulsion.open

    // 화면 틀이 읽을 잠금·역할 다시 보기 값 넘김
    const setOverlayState = useOverlayBridge((s) => s.setOverlayState)
    const roleRevealAvailable = Boolean(roleReveal.roleInfo)
    // reopen은 그릴 때마다 새 함수라 ref에 두고 고정 함수만 넘김 (틀 다시 그리기 → 무한 반복 막기)
    const reopenRef = useRef(roleReveal.reopen)
    useLayoutEffect(() => {
        reopenRef.current = roleReveal.reopen
    })
    const reopenRoleReveal = useCallback(() => reopenRef.current?.(), [])
    useEffect(() => {
        setOverlayState({ interactionBlocked, surfaceLocked, roleRevealAvailable, reopenRoleReveal })
    }, [interactionBlocked, surfaceLocked, roleRevealAvailable, reopenRoleReveal, setOverlayState])

    // 연출 층이 빠지면 잠금 풂
    useEffect(() => () => setOverlayState({
        interactionBlocked: false, surfaceLocked: false, roleRevealAvailable: false, reopenRoleReveal: null,
    }), [setOverlayState])

    return {
        players: gameState?.players ?? [],
        roleReveal,
        phaseEntrance,
        nightTurn,
        nightSuccess,
        nightPrivateResult,
        waitOpen,
        deadChoice,
        tribunalExpulsion,
    }
}
