// 판 안 설정 창: 옆 창 안 설정 내용과 그 위 추방 창·방 코드 창
// InGamePage가 사용, 열림 여부는 useInGameSidePanel 값으로 받음
import { useEffect, useState } from "react"
import RoomCodeViewModal from "@/domains/game/matching/components/RoomCodeViewModal.jsx"
import SidePanel from "../SidePanel.jsx"
import SettingKickPlayerModal from "../kickPlayer/SettingKickPlayerModal.jsx"
import SettingPanelContent from "./SettingPanelContent.jsx"
import { useInGameStore } from "../../../store/ingameStore.js"

// 설정 창이 추방 창·방 코드 창 여닫기를 들고 있음
export default function SettingPanel({ open, onClose }) {
  const [kickModalOpen, setKickModalOpen] = useState(false)
  const [roomCodeOpen, setRoomCodeOpen] = useState(false)
  const roomCode = useInGameStore((s) => s.state?.roomCode ?? null)

  // 설정 창이 닫히면 위 창 둘도 닫음 (다시 열 때 남아 있지 않게)
  useEffect(() => {
    if (!open) {
      setKickModalOpen(false)
      setRoomCodeOpen(false)
    }
  }, [open])

  // 닫힌 첫 그림에서도 위 창이 안 보이게 open을 같이 봄
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
