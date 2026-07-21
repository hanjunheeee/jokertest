import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore"
import { getSocket } from "@/shared/socket/socketClient"

/** 빠른 매칭 검색 시작/취소와 매칭 완료 이동을 묶는 훅입니다. */
export function useMatchmakingSearch() {
  // 매칭이 완료되면 대기방 페이지로 이동할 때 사용합니다.
  const navigate = useNavigate()

  // Zustand 매칭 스토어에서 이 훅에 필요한 상태와 변경 함수만 구독합니다.
  // isSearching: 서버에서 상대를 찾는 중인지 여부
  // isInRoom: 매칭이 완료되어 생성된 방에 들어갔는지 여부
  const isSearching = useMatchingStore((state) => state.isSearching)
  const isInRoom = useMatchingStore((state) => state.isInRoom)
  const startSearch = useMatchingStore((state) => state.startSearch)
  const stopSearch = useMatchingStore((state) => state.stopSearch)

  // 매칭 스토어의 isInRoom이 true가 되면 매칭 대기방 화면으로 자동 이동합니다.
  // 현재 match_found 수신 후 setRoom을 호출하는 연결은 useSocket에 추가로 필요합니다.
  useEffect(() => {
    if (isInRoom) navigate("/game-matching")
  }, [isInRoom, navigate])

  // 랜덤 매칭 검색을 시작합니다.
  const startQuickMatch = () => {
    // App에서 생성해 공유 중인 Socket.IO 연결을 가져옵니다.
    const socket = getSocket()

    // 로그인 또는 소켓 연결이 완료되지 않았다면 요청하지 않습니다.
    if (!socket) return

    // 먼저 화면에 검색 오버레이가 나타나도록 로컬 상태를 변경합니다.
    startSearch()

    // 서버의 매칭 대기열에 현재 사용자를 추가하도록 요청합니다.
    socket.emit("join_matchmaking")
  }

  // 진행 중인 랜덤 매칭 검색을 취소합니다.
  const cancelQuickMatch = () => {
    // 연결된 소켓이 있을 때 서버 매칭 대기열에서 사용자를 제거합니다.
    getSocket()?.emit("leave_matchmaking")

    // 매칭 검색 오버레이를 닫도록 로컬 상태를 변경합니다.
    stopSearch()
  }

  // 페이지 컴포넌트에서 검색 상태와 시작·취소 함수를 사용할 수 있게 반환합니다.
  return {
    isSearching,
    startQuickMatch,
    cancelQuickMatch,
  }
}
