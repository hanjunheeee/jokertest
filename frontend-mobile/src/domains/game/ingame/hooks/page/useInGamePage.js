// 인게임 화면 로직 훅: 옆 창(기록·설정)·나가기·스냅샷 맞추기·잘못된 판이면 밖으로·화면 잠금 값
// 모바일 InGamePage가 씀, 전면 연출이 뜨면 열어 둔 기록·설정 시트를 닫음
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import {
  isValidInGameSession,
  shouldRedirectOutOfInGame,
} from "@/domains/game/ingame/utils/selectInGameSessionGuard.js"
import { traceMatchingFlow } from "@/domains/game/matching/debug/matchingFlowTrace.js"
import { useInGameExit } from "@/domains/game/ingame/hooks/useInGameExit.js"
import { useInGameSessionSnapshotSync } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameSidePanel } from "@/domains/game/ingame/hooks/useInGameSidePanel.js"
import {
  selectInteractionBlocked,
  selectOverlayOpen,
  selectSurfaceLocked,
  useOverlayBridge,
  usePublishOverlayExit,
} from "@m/domains/game/ingame/hooks/overlays/overlayBridge.js"
import { isTribunalPresentationOpen } from "@m/domains/game/ingame/utils/tribunalOpen.js"

// 화면이 그릴 값 묶음
export function useInGamePage() {
  const sidePanel = useInGameSidePanel()
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const navigate = useNavigate()
  // useBlocker를 품고 있어 화면에서 한 번만 부르고, 사망 선택 창(연출 층)엔 bridge로 넘김
  const exit = useInGameExit()
  usePublishOverlayExit(exit)
  const snapshotSyncStatus = useInGameSessionSnapshotSync()

  // 연출 층이 계산한 잠금·역할 다시 보기 값 (데스크톱 interactionBlocked·surfaceLocked와 같은 조건)
  const interactionBlocked = useOverlayBridge(selectInteractionBlocked)
  const surfaceLocked = useOverlayBridge(selectSurfaceLocked)
  const overlayOpen = useOverlayBridge(selectOverlayOpen)
  const roleRevealAvailable = useOverlayBridge((s) => s.roleRevealAvailable)
  const reopenRoleReveal = useOverlayBridge((s) => s.reopenRoleReveal)

  // 재판·잠그는 단계 안내·낮 시작 결과·밤 차례 연출이 뜨면 기록·설정 시트를 닫음 (죽은 사람의 잠그지 않는 밤 안내는 유지)
  if ((isTribunalPresentationOpen(gameState) || overlayOpen) && sidePanel.openPanel !== null) {
    sidePanel.close()
  }

  const isValidGameSession = isValidInGameSession(gameId, gameState)

  // 스냅샷 확인이 끝났는데 맞는 판이 아니면 멀티플레이 화면으로
  useEffect(() => {
    if (!shouldRedirectOutOfInGame({ snapshotSyncStatus, gameId, gameState })) return
    traceMatchingFlow("ingame_redirect_multiplay", {
      snapshotSyncStatus,
      gameId,
      hasState: Boolean(gameState),
      stateId: gameState?.id ?? null,
      valid: isValidInGameSession(gameId, gameState),
    })
    navigate("/multiplay", { replace: true })
  }, [gameId, gameState, navigate, snapshotSyncStatus])

  return {
    isValidGameSession,
    snapshotSyncStatus,
    sidePanel,
    interactionBlocked,
    surfaceLocked,
    requestExit: exit.requestExit,
    roleRevealAvailable,
    reopenRoleReveal,
  }
}
