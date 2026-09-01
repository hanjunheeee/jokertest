/**
 * 인게임 설정 패널.
 */
import { useEffect, useState } from "react"
import SidePanel from "../SidePanel.jsx"
import SettingKickPlayerModal from "./kickPlayer/SettingKickPlayerModal.jsx"
import SettingPanelContent from "./SettingPanelContent.jsx"

export default function SettingPanel({ open, onClose }) {
  const [kickModalOpen, setKickModalOpen] = useState(false)

  useEffect(() => {
    if (!open) setKickModalOpen(false)
  }, [open])

  return (
    <>
      <SidePanel
        open={open}
        onClose={onClose}
        ariaLabel="인게임 설정"
        closeAriaLabel="인게임 설정 닫기"
      >
        <SettingPanelContent onOpenKickPlayer={() => setKickModalOpen(true)} />
      </SidePanel>

      <SettingKickPlayerModal
        open={open && kickModalOpen}
        onClose={() => setKickModalOpen(false)}
      />
    </>
  )
}
