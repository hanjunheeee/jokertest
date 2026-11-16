// 빠른 매칭 찾기 시작·취소, 방이 잡히면 대기방으로 이동
// GameModePage가 씀, 빠른 매칭 카드는 일부러 잠가 둠(서버 거절만 받아 찾는 중을 닫음)
import { useEffect, useRef, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient"
import { joinQueue, leaveQueue, onQueueRefused } from "../socket/matchmaking.js"

// 빠른 매칭 상태·동작
export function useMatchmakingSearch() {
  const navigate = useNavigate()

  const isSearching = useMatchingStore((state) => state.isSearching)
  const isInRoom = useMatchingStore((state) => state.isInRoom)
  const startSearch = useMatchingStore((state) => state.startSearch)
  const stopSearch = useMatchingStore((state) => state.stopSearch)

  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 화면이 열릴 때부터 남아 있던 옛 방 정보인지 (로비 입장 정리 답이 비워 줄 때까지 안 따라감)
  const leftoverRoomRef = useRef(isInRoom)

  // 이 화면에서 새로 방이 잡히면 대기방으로 이동
  // 옛 방 정보를 따라가면 정리 답이 오기 전에 화면을 떠나 그 답을 버리게 되고 옛 대기방으로 끌려감
  useEffect(() => {
    if (!isInRoom) {
      leftoverRoomRef.current = false
      return
    }
    if (leftoverRoomRef.current) return
    navigate("/game-matching")
  }, [isInRoom, navigate])

  // 찾는 중에 서버가 거절하면 찾는 중 표시 끄고 이유 알림
  useEffect(() => {
    if (!socket || !isSearching) return undefined
    return onQueueRefused(socket, ({ message } = {}) => {
      stopSearch()
      alert(message ?? "빠른 매칭을 시작할 수 없습니다.")
    })
  }, [socket, isSearching, stopSearch])

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
