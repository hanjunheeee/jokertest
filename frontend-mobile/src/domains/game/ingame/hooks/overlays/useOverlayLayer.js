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
import { nightWaitCoversSelf } from "@/domains/game/ingame/utils/selfAlive.js"
import { isTribunalPresentationOpen } from "@m/domains/game/ingame/utils/tribunalOpen.js"
import { useOverlayBridge } from "./overlayBridge.js"
import { useDeadChoice } from "./useDeadChoice.js"

// 다른 사람 밤 연출 대기가 내 것인지: 같은 판·같은 밤·같은 수신 범위일 때만
function isWaitOwned(wait, { gameId, gameState, authUuid, identityGeneration }) {
    return wait !== null
        && wait.gameId === gameId
        && gameState?.phase === "NIGHT"
        && gameState?.dayIndex === wait.nightDayIndex
        && isSameReceiptScope(wait.scope, readInGameReceiptScope({ accountId: authUuid, identityGeneration }))
}

// 화면 틀이 읽을 잠금·역할 다시 보기 값 넘김 (useOverlayLayer 맨 끝에서만 부름, 훅 순서 그대로)
function usePublishOverlayState({ interactionBlocked, surfaceLocked, roleReveal }) {
    const setOverlayState = useOverlayBridge((s) => s.setOverlayState)
    const roleRevealAvailable = Boolean(roleReveal.roleInfo)
    // reopen은 그릴 때마다 새 함수라 ref에 두고 고정 함수만 넘김 (틀 다시 그리기 → 무한 반복 막기)
    const reopenRef = useRef(roleReveal.reopen)
    useLayoutEffect(() => {
        reopenRef.current = roleReveal.reopen
    })
    const reopenRoleReveal = useCallback(() => reopenRef.current?.(), [])
    // 그리기 전에 넘김: 연출이 뜨는 첫 화면부터 판·채팅·행동이 잠김 (effect면 한 번 그린 뒤라 그 사이 누를 수 있었음)
    useLayoutEffect(() => {
        setOverlayState({ interactionBlocked, surfaceLocked, roleRevealAvailable, reopenRoleReveal })
    }, [interactionBlocked, surfaceLocked, roleRevealAvailable, reopenRoleReveal, setOverlayState])

    // 연출 층이 빠지면 잠금 풂
    useEffect(() => () => setOverlayState({
        interactionBlocked: false, surfaceLocked: false, roleRevealAvailable: false, reopenRoleReveal: null,
    }), [setOverlayState])
}

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

    const wait = useInGameStore(selectNightPresentationWait)
    const waitOwned = isWaitOwned(wait, { gameId, gameState, authUuid, identityGeneration })
    const waitOpen = waitOwned && !nightSuccess.open
    // 죽은 사람은 대기 창이 안 덮음 → 밤에도 죽은 사람 채팅 씀 (다른 연출 미루기는 waitOpen 그대로)
    const waitCovers = waitOpen && nightWaitCoversSelf(gameState)

    // 결과 화면 이동은 추방·밤 성공 연출(영상)이 끝난 뒤로 미룸, "최종 결과" 창만 남았으면 안 미룸 (데스크톱과 같음, 결과 X-1)
    useInGameResultNavigation({
        hold: identityRebindPending || expulsionBusy || nightSuccess.pending,
    })

    const deadChoice = useDeadChoice({
        blocked: roleReveal.open || nightSuccess.open || nightPrivateResult.open || waitOpen,
    })

    // 재판 연출 열림 조건 (문지기 컴포넌트와 같음)
    const tribunalOpen = isTribunalPresentationOpen(gameState)

    const surfaceLocked = interactionBlocked || nightPrivateResult.open || deadChoice.open
        || nightSuccess.open || waitCovers || tribunalOpen || tribunalExpulsion.open

    usePublishOverlayState({ interactionBlocked, surfaceLocked, roleReveal })

    return {
        players: gameState?.players ?? [],
        roleReveal,
        phaseEntrance,
        nightTurn,
        nightSuccess,
        nightPrivateResult,
        waitOpen,
        waitCovers,
        deadChoice,
        tribunalExpulsion,
    }
}
