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
