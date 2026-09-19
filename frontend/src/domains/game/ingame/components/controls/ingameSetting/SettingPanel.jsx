/**
 * 인게임 설정 패널.
 *
 * F-24(AC-01): 진행 중 "방 코드 보기"는 대기방과 **같은 모달**(RoomCodeViewModal)을 쓴다 —
 * 표시·복사·실패 안내 계약이 두 화면에서 갈리지 않게 하기 위해서다. 코드의 원천은 서버가
 * game_started/get_session_snapshot에 실어 준 state.roomCode 하나뿐이다. 값이 없으면 모달이
 * 스스로 "확인할 수 없음"과 비활성 복사를 보여준다(여기서 더미 코드를 만들지 않는다).
 */
import { useEffect, useState } from "react"
import RoomCodeViewModal from "@/domains/game/matching/components/RoomCodeViewModal.jsx"
import SidePanel from "../SidePanel.jsx"
import SettingKickPlayerModal from "./kickPlayer/SettingKickPlayerModal.jsx"
import SettingPanelContent from "./SettingPanelContent.jsx"
import { useInGameStore } from "../../../store/ingameStore.js"

export default function SettingPanel({ open, onClose }) {
  const [kickModalOpen, setKickModalOpen] = useState(false)
  const [roomCodeOpen, setRoomCodeOpen] = useState(false)
  const roomCode = useInGameStore((s) => s.state?.roomCode ?? null)

  useEffect(() => {
    if (!open) {
      setKickModalOpen(false)
      setRoomCodeOpen(false)
    }
  }, [open])

  return (
    <>
      <SidePanel
        open={open}
        onClose={onClose}
        ariaLabel="인게임 설정"
        closeAriaLabel="인게임 설정 닫기"
      >
        <SettingPanelContent
          onOpenKickPlayer={() => setKickModalOpen(true)}
          onOpenRoomCode={() => setRoomCodeOpen(true)}
        />
      </SidePanel>

      <SettingKickPlayerModal
        open={open && kickModalOpen}
        onClose={() => setKickModalOpen(false)}
      />

      <RoomCodeViewModal
        open={open && roomCodeOpen}
        onClose={() => setRoomCodeOpen(false)}
        roomCode={roomCode}
      />
    </>
  )
}
