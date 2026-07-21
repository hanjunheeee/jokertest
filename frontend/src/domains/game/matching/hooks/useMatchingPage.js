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

  const { isInRoom, players, roomCode, hostUuid, canStart, clearRoom } = useMatchingStore()
  const myUuid = useAuthStore((s) => s.user?.uuid)
  const isHost = isInRoom && myUuid === hostUuid
  // canStart는 서버가 계산해 store에 내려준 값을 그대로 쓴다(여기서 재계산하지 않음).
  const myPlayer = players.find((player) => player.uuid === myUuid)
  const isReady = Boolean(myPlayer?.isReady)

  const handleRoomDeleted = useCallback(() => navigate("/multiplay"), [navigate])
  const handleGameStarted = useCallback(() => navigate("/ingame"), [navigate])

  const { deleteRoom, startGame, setReady, isStarting, isSettingReady, isRoomVerified } = useMatchingRoom({
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

  // 준비 완료/준비 취소 버튼은 목표 상태(현재의 반대값)를 명시적으로 전달한다.
  const toggleReady = () => setReady(!isReady)

  const slots = isInRoom
    ? players.map((player) => ({ id: player.uuid, ready: Boolean(player.isReady) }))
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
    isReady,
    isSettingReady,
    toggleReady,
    canStart,
    isStarting,
    isRoomVerified,
    startGame,
    deleteRoom,
    handleBack,
  }
}
