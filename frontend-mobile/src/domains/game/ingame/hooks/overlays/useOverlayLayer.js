// 인게임 연출 층 훅: 데스크톱 InGamePage의 연출 훅 호출·열림 조건을 같은 순서로 옮김
// OverlayLayer가 씀, 잠금·역할 다시 보기 값은 overlayBridge로 화면 틀에 넘김
import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import {
    selectDawnReport,
    useInGameStore,
} from "@/domains/game/ingame/store/ingameStore.js"
import { useInGameSnapshotRebindPending } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameNightPrivateResult } from "@/domains/game/ingame/hooks/useInGameNightPrivateResult.js"
import { useInGameOverlayStack } from "@/domains/game/ingame/hooks/useInGameOverlayStack.js"
import { useInGameTribunalExpulsionPresentation } from "@/domains/game/ingame/hooks/useInGameTribunalExpulsionPresentation.js"
import { useInGameResultNavigation } from "@/domains/game/ingame/hooks/useInGameResultNavigation.js"
import { isWideChatLayout } from "@m/domains/game/ingame/hooks/chat/useWideChat.js"
import { isTribunalPresentationOpen } from "@m/domains/game/ingame/utils/tribunalOpen.js"
import { useOverlayBridge } from "./overlayBridge.js"
import { useDeadChoice } from "./useDeadChoice.js"

// 화면 틀이 읽을 잠금·역할 다시 보기 값 넘김 (useOverlayLayer 맨 끝에서만 부름, 훅 순서 그대로)
function usePublishOverlayState({ interactionBlocked, surfaceLocked, overlayOpen, roleReveal }) {
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
        setOverlayState({ interactionBlocked, surfaceLocked, overlayOpen, roleRevealAvailable, reopenRoleReveal })
    }, [interactionBlocked, surfaceLocked, overlayOpen, roleRevealAvailable, reopenRoleReveal, setOverlayState])

    // 연출 층이 빠지면 잠금 풂
    useEffect(() => () => setOverlayState({
        interactionBlocked: false, surfaceLocked: false, overlayOpen: false, roleRevealAvailable: false, reopenRoleReveal: null,
    }), [setOverlayState])
}

// 연출마다 열림·값 묶음 (앞 연출이 열려 있으면 뒤 연출은 hold로 미룸, 데스크톱과 같음)
export function useOverlayLayer() {
    const gameState = useInGameStore((s) => s.state)
    const identityRebindPending = useInGameSnapshotRebindPending()

    const tribunalExpulsion = useInGameTribunalExpulsionPresentation({ hold: false })
    const expulsionBusy = tribunalExpulsion.open || tribunalExpulsion.pending

    // 낮 시작 연출 (밤에 죽은 사람·아무 일도 없음): 남아 있으면 pending, 추방 영상이 끝난 뒤 열림
    // 차례: 낮 시작 연출 → "낮이 되었습니다"·밤 개인 결과, 판이 끝났으면 연출 → 결과 화면 (데스크톱과 같음)
    const report = useInGameStore(selectDawnReport)
    const dawnReportPending = report !== null
    const dawnReport = {
        report,
        open: dawnReportPending && !expulsionBusy,
        finish: () => {
            if (report) useInGameStore.getState().finishDawnReport(report.key)
        },
    }

    const {
        roleReveal,
        phaseEntrance,
        nightTurn,
        entryPreparingActive,
        interactionBlocked,
    } = useInGameOverlayStack({
        deathRevealActive: expulsionBusy,
        dawnReportActive: dawnReportPending,
    })

    const nightPrivateResult = useInGameNightPrivateResult({
        hold: roleReveal.open || expulsionBusy || dawnReportPending,
    })

    // 결과 화면 이동은 추방 영상·낮 시작 연출이 끝난 뒤로 미룸 (밤 암살로 판이 끝나면 연출 뒤 결과 화면, 데스크톱과 같음)
    useInGameResultNavigation({
        hold: identityRebindPending || expulsionBusy || dawnReportPending,
    })

    const deadChoice = useDeadChoice({
        blocked: roleReveal.open || dawnReportPending || nightPrivateResult.open,
    })

    // 재판 연출 열림 조건 (문지기 컴포넌트와 같음)
    // 세로 카톡형은 재판 중에도 채팅방·시트를 씀 → 화면 잠금은 전면 연출을 띄우는 넓은 배치에서만
    const tribunalOpen = isTribunalPresentationOpen(gameState)
    const tribunalLocksSurface = tribunalOpen && isWideChatLayout()

    const surfaceLocked = interactionBlocked || nightPrivateResult.open || deadChoice.open
        || dawnReport.open || tribunalLocksSurface || tribunalExpulsion.open

    // 겹 창 닫는 신호: 화면이 잠기는 연출 + 밤 차례 안내 (밤 차례 안내는 화면을 안 잠그지만 "닫기" 단추가 시트에 가려짐)
    // 죽은 사람의 단계 안내는 저절로 닫히고 잠그지 않아서 여기 안 들어감 (죽은 사람 채팅·시트를 안 끊음)
    const overlayOpen = surfaceLocked || nightTurn.open

    usePublishOverlayState({ interactionBlocked, surfaceLocked, overlayOpen, roleReveal })

    return {
        players: gameState?.players ?? [],
        entryPreparingActive,
        roleReveal,
        phaseEntrance,
        nightTurn,
        dawnReport,
        nightPrivateResult,
        deadChoice,
        tribunalExpulsion,
    }
}
