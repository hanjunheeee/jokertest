/**
 * 멀티플레이 매칭 대기 화면.
 *
 * matchingStore에 방 데이터가 있으면 실제 플레이어·방 코드를 표시합니다.
 * 없으면 prototype 더미로 폴백 (게임 만들기 흐름 호환).
 *
 * - 방장: 게임시작·방 삭제 가능
 * - 비방장: 방 나가기
 */
import { motion } from "framer-motion"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import MatchingPopupPanel from "../components/MatchingPopupPanel.jsx"
import RoomCodeViewModal from "../components/RoomCodeViewModal.jsx"
import MatchingPartyHeader from "../components/MatchingPartyHeader.jsx"
import {
  GAME_MATCHING_ASSETS,
  MATCHING_PARTY_SLOTS_DUMMY_10,
  MATCHING_ROOM_CODE_DUMMY,
} from "../constants/gameMatchingAssets.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { BG_FADE_TRANSITION, UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { useMatchingStore } from "../store/matchingStore"
import { useMatchingRoom } from "../hooks/useMatchingRoom"
import { getSocket } from "@/shared/socket/socketClient"
import { useAuthStore } from "@/domains/auth/store/authStore"

export default function GameMatchingPage() {
  const navigate = useNavigate()
  const [uiVisible, setUiVisible]   = useState(false)
  const [roomCodeOpen, setRoomCodeOpen] = useState(false)

  const { isInRoom, players, roomCode, hostUuid, clearRoom } = useMatchingStore()
  const myUuid = useAuthStore((s) => s.user?.uuid)
  const isHost = isInRoom && myUuid === hostUuid

  // 게임 시작 시 게임 화면으로 이동 — 게임 화면 미구현 중이므로 로비로 임시 이동
  const handleRoomDeleted = useCallback(() => navigate('/multiplay'), [navigate])
  const handleGameStarted = useCallback(() => navigate('/lobby'),     [navigate])

  const { deleteRoom, startGame } = useMatchingRoom({
    onRoomDeleted: handleRoomDeleted,
    onGameStarted: handleGameStarted,
  })

  // 다음 프레임에서 uiVisible 전환 — 마운트 직후 즉시 전환 시 transition이 무시됨
  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleBack = () => {
    getSocket()?.emit('leave_room')
    clearRoom()
    navigate('/multiplay')
  }

  // store에 방 데이터가 없으면 prototype 더미 표시 (게임 만들기 흐름)
  const slots      = isInRoom ? players.map((p) => ({ id: p.uuid, ready: true })) : MATCHING_PARTY_SLOTS_DUMMY_10
  const code       = isInRoom ? roomCode : MATCHING_ROOM_CODE_DUMMY
  const partyCount = slots.length

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(GAME_MATCHING_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: uiVisible ? 1 : 0 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <MatchingPopupPanel
        visible={uiVisible}
        slots={slots}
        onRoomCodeView={() => setRoomCodeOpen(true)}
        isHost={isHost}
        onStartGame={startGame}
        onDeleteRoom={deleteRoom}
        onLeaveRoom={handleBack}
      />

      <RoomCodeViewModal
        open={roomCodeOpen}
        onClose={() => setRoomCodeOpen(false)}
        roomCode={code}
      />

      <MatchingPartyHeader
        visible={uiVisible}
        partyCount={partyCount}
        transition={UI_REVEAL_TRANSITION}
      />

      <div className="absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <SoundControl />
      </div>

      <MotionBackButton
        ariaLabel="멀티플레이 선택으로 돌아가기"
        initial={{ opacity: 0, y: 8 }}
        animate={uiVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={handleBack}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      />
    </div>
  )
}
