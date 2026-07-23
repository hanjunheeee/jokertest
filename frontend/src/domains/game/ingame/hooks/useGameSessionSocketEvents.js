import { useEffect, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient"
import { useInGameStore } from "../store/ingameStore.js"
import { createGameEndedHandler } from "../utils/createGameEndedHandler.js"

/**
 * GameSession이 서버에서 종료되면(game_ended) 정리하고 /multiplay로 돌아간다.
 * ProtectedRoute에서 호출되어 로그인 상태가 유지되는 동안 라우트 전환과 무관하게
 * 계속 구독을 유지한다 — /ingame 마운트 시점에만 구독하면 game_started 이후
 * /ingame effect 등록 전 사이 구간에 도착하는 game_ended를 놓칠 수 있다.
 */
export function useGameSessionSocketEvents() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  useEffect(() => {
    if (!socket) return
    const handleGameEnded = createGameEndedHandler({
      // 클로저로 렌더 시점 gameId를 캡처하지 않고, 이벤트가 실제로 도착한 시점에
      // store에서 최신 gameId를 읽는다 — stale(늦게 도착한 이전 세션) game_ended가
      // 그 사이 시작된 새 GameSession을 잘못 지우는 것을 막는다.
      getCurrentGameId: () => useInGameStore.getState().gameId,
      clearGame: () => useInGameStore.getState().clearGame(),
      navigate,
    })
    socket.on("game_ended", handleGameEnded)
    return () => socket.off("game_ended", handleGameEnded)
  }, [socket, navigate])
}
