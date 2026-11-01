// 방 코드로 들어가기 화면: 코드 입력 상태·입장 요청·입장 결과 처리
// RoomInvitePage가 씀
// 입장 요청 emit은 시험이 이 파일 원문(emit("join_room_by_code", ...))을 확인해서 socket/로 못 옮기고 여기 남김
import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { onJoinResult } from "../socket/rooms.js"
import { ROOM_JOIN_FAILURE_MESSAGES } from "../constants/roomJoinMessages.js"

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

    // 입장 성공: 끝난 판 지우고 방 넣고 대기방으로
    const handleRoomJoined = (payload) => {
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(payload)
      navigate("/game-matching")
    }

    const handleRoomJoinFailed = ({ code, message } = {}) => {
      alert(ROOM_JOIN_FAILURE_MESSAGES[code] ?? message ?? "방에 참여할 수 없습니다.")
    }

    return onJoinResult(socket, { joined: handleRoomJoined, failed: handleRoomJoinFailed })
  }, [navigate])

  // 여섯 자리가 다 찼을 때만 보냄, 목록에서 고른 방이면 방 id도 실음
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
