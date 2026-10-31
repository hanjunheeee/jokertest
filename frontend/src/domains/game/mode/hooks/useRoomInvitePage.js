import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"

const ROOM_JOIN_FAILURE_MESSAGES = {
  ROOM_CODE_MISMATCH: "입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요.",
  ROOM_NOT_FOUND: "방을 찾을 수 없습니다. 이미 사라진 방일 수 있어요.",
  ROOM_ALREADY_STARTED: "이미 게임이 시작된 방이라 입장할 수 없습니다.",
  ROOM_FULL: "방 정원이 가득 찼습니다.",
  CODE_REQUIRED: "입장 코드를 입력해주세요.",
  SESSION_ENDED: "이미 끝난 게임의 방이라 입장할 수 없습니다. 새 방을 만들어주세요.",
  INVALID_REQUEST: "잘못된 참가 요청입니다. 방 코드로는 일반 참가만 할 수 있습니다.",
}

export function useRoomInvitePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedRoomId = typeof location.state?.roomId === "string" ? location.state.roomId : null

  const [uiVisible, setUiVisible] = useState(false)

  const [roomCode, setRoomCode] = useState("")

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const handleRoomJoined = (payload) => {
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(payload)
      navigate("/game-matching")
    }

    const handleRoomJoinFailed = ({ code, message } = {}) => {
      alert(ROOM_JOIN_FAILURE_MESSAGES[code] ?? message ?? "방에 참여할 수 없습니다.")
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
    getSocket()?.emit("join_room_by_code", {
      roomCode,
      ...(selectedRoomId ? { roomId: selectedRoomId } : {}),
    })
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
