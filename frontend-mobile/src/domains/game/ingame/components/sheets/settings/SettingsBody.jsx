// 설정 시트 몸통: 고른 탭 본문 하나만 그림 (채팅·방관리 아니면 사운드)
// SettingsSheet가 씀 (데스크톱 SettingPanelContent의 SettingTabPanel과 같은 갈래)
import ChatTab from "./ChatTab.jsx"
import RoomTab from "./RoomTab.jsx"
import SoundTab from "./SoundTab.jsx"

// 탭 이름에 맞는 본문
export default function SettingsBody({ activeTab, onOpenKickPlayer, volumes, onVolumeChange, sfxMuted, onSfxMutedChange }) {
  if (activeTab === "chat") return <ChatTab />
  if (activeTab === "room") return <RoomTab onOpenKickPlayer={onOpenKickPlayer} />
  return (
    <SoundTab
      volumes={volumes}
      onVolumeChange={onVolumeChange}
      sfxMuted={sfxMuted}
      onSfxMutedChange={onSfxMutedChange}
    />
  )
}
