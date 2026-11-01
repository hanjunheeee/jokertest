// 빠른 매칭 찾기 시작·취소, 방이 잡히면 대기방으로 이동
// 모드 선택 화면이 씀
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore"
import { getSocket } from "@/shared/socket/socketClient"
import { joinQueue, leaveQueue } from "../socket/matchmaking.js"

export function useMatchmakingSearch() {
  const navigate = useNavigate()

  const isSearching = useMatchingStore((state) => state.isSearching)
  const isInRoom = useMatchingStore((state) => state.isInRoom)
  const startSearch = useMatchingStore((state) => state.startSearch)
  const stopSearch = useMatchingStore((state) => state.stopSearch)

  useEffect(() => {
    if (isInRoom) navigate("/game-matching")
  }, [isInRoom, navigate])

  // 소켓 없으면 아무것도 안 함, 찾는 중 표시 먼저 켜고 보냄
  const startQuickMatch = () => {
    const socket = getSocket()

    if (!socket) return

    startSearch()

    joinQueue(socket)
  }

  const cancelQuickMatch = () => {
    leaveQueue()

    stopSearch()
  }

  return {
    isSearching,
    startQuickMatch,
    cancelQuickMatch,
  }
}
