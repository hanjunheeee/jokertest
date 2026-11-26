// 대기방에서 판 시작 뒤 인게임 화면으로 한 번만 이동시키는 함수
// useMatchingPage(game_started·스토어 구독·효과)·useGameResultReturnToMatching이 씀
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { traceMatchingFlow } from "../debug/matchingFlowTrace.js"
import { matchingRouterNavigate } from "./matchingRouterNavigate.js"
import { shouldLeaveMatchingForInGame } from "./shouldLeaveMatchingForInGame.js"
import { isInGameNavBlockedFromResultReturn } from "./resultReturnInGameNavBlock.js"

const MATCHING_PATH = "/game-matching"
const INGAME_PATH = "/ingame"

let lastInGameNavGameId = null

// 같은 판 이동 중복 막기 기억 지움 (결과 화면 복귀·시험 정리 때 씀)
export function resetInGameNavigationDedupe() {
  lastInGameNavGameId = null
}

// 대기방에서 활성 판 화면(/ingame)으로 이동 (같은 gameId 중복 호출은 막음)
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
  if (lastInGameNavGameId === gameId) {
    traceMatchingFlow("navigate_ingame_skipped", { reason: "dedupe", gameId, source })
    return false
  }
  const pathname = typeof window !== "undefined" ? window.location.pathname : ""
  // 주소만 먼저 /ingame이고 아직 이 판 이동을 안 거친 경우에만 라우터를 한 번 다시 맞춤
  if (pathname === INGAME_PATH) {
    lastInGameNavGameId = gameId
    traceMatchingFlow("navigate_ingame_resync", { gameId, source })
    matchingRouterNavigate(INGAME_PATH, { replace: true })
    navigate(INGAME_PATH, { replace: true })
    return true
  }
  if (pathname !== MATCHING_PATH) {
    traceMatchingFlow("navigate_ingame_skipped", { reason: "not_on_matching", gameId, source, pathname })
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