// 파일 역할: useMatchmakingSearch.js - React 상태와 부수효과를 묶는 커스텀 훅입니다.
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore"
import { getSocket } from "@/shared/socket/socketClient"

/** 빠른 매칭 검색 시작/취소와 매칭 완료 이동을 묶는 훅입니다. */
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
