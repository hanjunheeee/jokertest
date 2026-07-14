import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  MATCHING_PARTY_SLOTS_DUMMY_10,
  MATCHING_ROOM_CODE_DUMMY,
} from "../constants/gameMatchingAssets.js"
import { useMatchingRoom } from "./useMatchingRoom"
import { useMatchingStore } from "../store/matchingStore"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { getSocket } from "@/shared/socket/socketClient"

/** 매칭 대기 페이지에서 필요한 상태 계산과 페이지 이동을 묶습니다. */
export function useMatchingPage() {
  const navigate = useNavigate()

  // 입장 페이드인이 끝나서 UI를 보여줘도 되는지 표시합니다.
  const [uiVisible, setUiVisible] = useState(false)

  // 초대코드 공유 모달이 열려 있는지 표시합니다.
  const [roomCodeOpen, setRoomCodeOpen] = useState(false)

  const { isInRoom, players, roomCode, hostUuid, clearRoom } = useMatchingStore()
  const myUuid = useAuthStore((s) => s.user?.uuid)
  const isHost = isInRoom && myUuid === hostUuid

  const handleRoomDeleted = useCallback(() => navigate("/multiplay"), [navigate])
  const handleGameStarted = useCallback(() => navigate("/ingame"), [navigate])

  const { deleteRoom, startGame } = useMatchingRoom({
    onRoomDeleted: handleRoomDeleted,
    onGameStarted: handleGameStarted,
  })

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleBack = () => {
    getSocket()?.emit("leave_room")
    clearRoom()
    navigate("/multiplay")
  }

  const slots = isInRoom
    ? players.map((player) => ({ id: player.uuid, ready: true }))
    : MATCHING_PARTY_SLOTS_DUMMY_10

  const displayRoomCode = isInRoom ? roomCode : MATCHING_ROOM_CODE_DUMMY

  return {
    uiVisible,
    roomCodeOpen,
    openRoomCode: () => setRoomCodeOpen(true),
    closeRoomCode: () => setRoomCodeOpen(false),
    slots,
    roomCode: displayRoomCode,
    partyCount: slots.length,
    isHost,
    startGame,
    deleteRoom,
    handleBack,
  }
}
