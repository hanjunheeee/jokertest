// 대기방 → 인게임 이동 (game_started·구독·ACK 보충이 같이 씀)
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { traceMatchingFlow } from "../debug/matchingFlowTrace.js"
import { matchingRouterNavigate } from "./matchingRouterNavigate.js"
import { shouldLeaveMatchingForInGame } from "./shouldLeaveMatchingForInGame.js"
import { isInGameNavBlockedFromResultReturn } from "./resultReturnInGameNavBlock.js"

const MATCHING_PATH = "/game-matching"
const INGAME_PATH = "/ingame"

let lastInGameNavGameId = null

export function resetInGameNavigationDedupe() {
  lastInGameNavGameId = null
}

export function navigateToInGameFromMatching(navigate, { gameId, source }) {
  if (typeof gameId !== "string" || gameId.length === 0) {
    traceMatchingFlow("navigate_ingame_skipped", { reason: "no_game_id", source })
    return false
  }
  if (isInGameNavBlockedFromResultReturn()) {
    traceMatchingFlow("navigate_ingame_skipped", { reason: "result_return_block", gameId, source })
    return false
  }
  const liveState = useInGameStore.getState().state
  if (!shouldLeaveMatchingForInGame(gameId, liveState)) {
    traceMatchingFlow("navigate_ingame_skipped", {
      reason: "not_active_game",
      gameId,
      source,
      phase: liveState?.phase ?? null,
    })
    return false
  }
  const pathname = typeof window !== "undefined" ? window.location.pathname : ""
  // 주소는 /ingame인데 Outlet은 아직 대기방이면 라우터만 다시 맞춤
  if (pathname === INGAME_PATH) {
    traceMatchingFlow("navigate_ingame_resync", { gameId, source })
    matchingRouterNavigate(INGAME_PATH, { replace: true })
    navigate(INGAME_PATH, { replace: true })
    return true
  }
  if (pathname !== MATCHING_PATH) {
    traceMatchingFlow("navigate_ingame_skipped", { reason: "not_on_matching", gameId, source, pathname })
    return false
  }
  if (lastInGameNavGameId === gameId) {
    traceMatchingFlow("navigate_ingame_skipped", { reason: "dedupe", gameId, source })
    return false
  }
  lastInGameNavGameId = gameId
  traceMatchingFlow("navigate_ingame_from_matching", { inGameId: gameId, source, pathname })
  matchingRouterNavigate(INGAME_PATH, { replace: true })
  navigate(INGAME_PATH, { replace: true })
  traceMatchingFlow("navigate_ingame_exec", {
    inGameId: gameId,
    source,
    pathname: typeof window !== "undefined" ? window.location.pathname : "",
  })
  return true
}