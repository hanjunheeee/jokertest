// 대기방(/game-matching)에서 판 id가 생기면 인게임으로 (페이지 훅과 별도, 로그인 보호 경로에서 항상 켬)
import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { navigateToInGameFromMatching } from "../utils/navigateToInGame.js"
import { shouldLeaveMatchingForInGame } from "../utils/shouldLeaveMatchingForInGame.js"

const MATCHING_PATH = "/game-matching"

export function useNavigateToInGameFromMatching() {
  const navigate = useNavigate()
  const location = useLocation()
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)

  useEffect(() => {
    if (!shouldLeaveMatchingForInGame(gameId, gameState)) return
    if (location.pathname !== MATCHING_PATH) return
    navigateToInGameFromMatching(navigate, { gameId, source: "protected_route_effect" })
  }, [gameId, gameState, location.pathname, navigate])

  useEffect(() => {
    let prevGameId = useInGameStore.getState().gameId
    return useInGameStore.subscribe((state) => {
      const nextGameId = state.gameId
      if (nextGameId === prevGameId) return
      prevGameId = nextGameId
      if (!shouldLeaveMatchingForInGame(nextGameId, state.state)) return
      if (window.location.pathname !== MATCHING_PATH) return
      navigateToInGameFromMatching(navigate, { gameId: nextGameId, source: "protected_route_subscribe" })
    })
  }, [navigate])
}