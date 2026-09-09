import InGameTopControls from "./controls/InGameTopControls.jsx"
import PlayerRecordListPanel from "./controls/playerRecordList/PlayerRecordListPanel.jsx"
import SettingPanel from "./controls/ingameSetting/SettingPanel.jsx"
import { useInGameSidePanel } from "../hooks/useInGameSidePanel.js"

/** 좌측 상단 버튼과 좌측 슬라이드 패널(전적목록·인게임 설정)을 한곳에서 관리합니다. */
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
