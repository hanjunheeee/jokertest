import { useRef } from "react"
import {
  SCROLL_CLASS,
  SCROLL_WRAP_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import { useInGameSettingIsHost } from "../../../hooks/useInGameSettingIsHost.js"
import { useInGameSettingPanel } from "../../../hooks/useInGameSettingPanel.js"
import SettingChatTab from "./SettingChatTab.jsx"
import SettingRoomCodeButton from "./SettingRoomCodeButton.jsx"
import SettingRoomTab from "./SettingRoomTab.jsx"
import SettingSoundTab from "./SettingSoundTab.jsx"
import SettingTabs from "./SettingTabs.jsx"
import SidePanelHeader from "../SidePanelHeader.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

function SettingTabPanel({
  activeTab, onOpenKickPlayer, volumes, onVolumeChange, sfxMuted, onSfxMutedChange,
}) {
  if (activeTab === "chat") return <SettingChatTab />
  if (activeTab === "room") {
    return <SettingRoomTab onOpenKickPlayer={onOpenKickPlayer} />
  }
  return (
    <SettingSoundTab
      volumes={volumes}
      onVolumeChange={onVolumeChange}
      sfxMuted={sfxMuted}
      onSfxMutedChange={onSfxMutedChange}
    />
  )
}


export default function SettingPanelContent({ onOpenKickPlayer, onOpenRoomCode }) {
  const scrollRef = useRef(null)
  const isHost = useInGameSettingIsHost()
  const { activeTab, setActiveTab, visibleTabs, volumes, setVolume, sfxMuted, setSfxMuted } =
    useInGameSettingPanel({ isHost })

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <SidePanelHeader
        title="설정"
        subtitle="게임 중 빠르게 변경할 수 있는 설정입니다."
      />

      <SettingTabs tabs={visibleTabs} activeTab={activeTab} onSelect={setActiveTab} />

      <div className={`${SCROLL_WRAP_CLASS} w-full min-w-0 pb-[clamp(2.35rem,7vh,3rem)]`}>
        <div ref={scrollRef} className={SCROLL_CLASS}>
          <SettingTabPanel
            activeTab={activeTab}
            onOpenKickPlayer={onOpenKickPlayer}
            onOpenRoomCode={onOpenRoomCode}
            volumes={volumes}
            onVolumeChange={setVolume}
            sfxMuted={sfxMuted}
            onSfxMutedChange={setSfxMuted}
          />
        </div>

        <Scrollbar scrollRef={scrollRef} />
      </div>

      <SettingRoomCodeButton onClick={() => onOpenRoomCode?.()} />
    </div>
  )
}
