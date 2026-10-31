import InGameTopControls from "./controls/InGameTopControls.jsx"
import PlayerRecordListPanel from "./controls/playerRecordList/PlayerRecordListPanel.jsx"
import SettingPanel from "./controls/ingameSetting/SettingPanel.jsx"
import { useInGameSidePanel } from "../hooks/useInGameSidePanel.js"

export default function InGamePlayerRecordArea() {
  const sidePanel = useInGameSidePanel()

  return (
    <>
      <InGameTopControls
        onMenuClick={sidePanel.openRecords}
        onSettingsClick={sidePanel.openSettings}
      />
      <PlayerRecordListPanel open={sidePanel.recordsOpen} onClose={sidePanel.close} />
      <SettingPanel open={sidePanel.settingsOpen} onClose={sidePanel.close} />
    </>
  )
}
