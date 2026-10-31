import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore"
import { getSocket } from "@/shared/socket/socketClient"

export function useMatchmakingSearch() {
  const navigate = useNavigate()

  const isSearching = useMatchingStore((state) => state.isSearching)
  const isInRoom = useMatchingStore((state) => state.isInRoom)
  const startSearch = useMatchingStore((state) => state.startSearch)
  const stopSearch = useMatchingStore((state) => state.stopSearch)

  useEffect(() => {
    if (isInRoom) navigate("/game-matching")
  }, [isInRoom, navigate])

  const startQuickMatch = () => {
    const socket = getSocket()

    if (!socket) return

    startSearch()

    socket.emit("join_matchmaking")
  }

  const cancelQuickMatch = () => {
    getSocket()?.emit("leave_matchmaking")

    stopSearch()
  }

  return {
    isSearching,
    startQuickMatch,
    cancelQuickMatch,
  }
}
