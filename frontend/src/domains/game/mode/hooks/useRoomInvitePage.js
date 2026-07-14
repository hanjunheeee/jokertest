import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"

/** 방코드 입력 페이지의 애니메이션 상태와 방 참여 소켓 이벤트를 관리합니다. */
export function useRoomInvitePage() {
  const navigate = useNavigate()

  // 프레임과 버튼 등장 애니메이션을 시작할지 표시합니다.
  const [uiVisible, setUiVisible] = useState(false)

  // 사용자가 입력한 6자리 방코드입니다.
  const [roomCode, setRoomCode] = useState("")

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const handleRoomJoined = (payload) => {
      useMatchingStore.getState().setRoom(payload)
      navigate("/game-matching")
    }

    const handleRoomJoinFailed = ({ message }) => {
      alert(message ?? "방에 참여할 수 없습니다.")
    }

    socket.on("room_joined", handleRoomJoined)
    socket.on("room_join_failed", handleRoomJoinFailed)

    return () => {
      socket.off("room_joined", handleRoomJoined)
      socket.off("room_join_failed", handleRoomJoinFailed)
    }
  }, [navigate])

  const joinRoom = () => {
    if (roomCode.length < 6) return
    getSocket()?.emit("join_room_by_code", { roomCode })
  }

  const goBackToModeSelect = () => {
    navigate("/gameMode")
  }

  return {
    uiVisible,
    roomCode,
    setRoomCode,
    joinRoom,
    goBackToModeSelect,
  }
}
