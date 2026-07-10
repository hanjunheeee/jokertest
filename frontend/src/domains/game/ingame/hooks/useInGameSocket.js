import { useEffect } from "react"
import { getSocket } from "@/shared/socket/socketClient"
import { useInGameStore } from "../store/ingameStore.js"

/**
 * 인게임 화면 전용 소켓 동기화.
 * 서버가 내려준 GameState만 저장하고, 투표/밤 액션 판정은 프론트에서 하지 않습니다.
 */
export function useInGameSocket() {
  const gameId = useInGameStore((s) => s.gameId)

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const { setGamePayload, setGameError } = useInGameStore.getState()

    const handleState = (payload) => setGamePayload(payload)
    const handleError = (payload) => {
      const message = payload?.message ?? "인게임 상태 동기화 중 오류가 발생했습니다."
      setGameError(message)
      console.error("[인게임 소켓 오류]", message)
    }

    socket.on("game_state_sync", handleState)
    socket.on("game_state_update", handleState)
    socket.on("game_error", handleError)

    socket.emit("join_ingame", gameId ? { gameId } : {})

    return () => {
      socket.off("game_state_sync", handleState)
      socket.off("game_state_update", handleState)
      socket.off("game_error", handleError)
    }
  }, [gameId])
}
