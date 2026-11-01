// 빠른 매칭 찾기 시작·취소, 방이 잡히면 대기방으로 이동
// GameModePage가 씀
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore"
import { getSocket } from "@/shared/socket/socketClient"
import { joinQueue, leaveQueue } from "../socket/matchmaking.js"

// 빠른 매칭 상태·동작
export function useMatchmakingSearch() {
  const navigate = useNavigate()

  const isSearching = useMatchingStore((state) => state.isSearching)
  const isInRoom = useMatchingStore((state) => state.isInRoom)
  const startSearch = useMatchingStore((state) => state.startSearch)
  const stopSearch = useMatchingStore((state) => state.stopSearch)

  // 방이 잡히면(방에 들어가면) 대기방으로 이동
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

  // 취소: 줄 빠지고 찾는 중 표시 끔
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
