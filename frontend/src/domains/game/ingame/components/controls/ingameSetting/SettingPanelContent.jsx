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
  activeTab, onOpenKickPlayer, onOpenRoomCode, volumes, onVolumeChange, sfxMuted, onSfxMutedChange,
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

const COMMON_ACTION_WRAP_CLASS = "px-[1.15rem] pb-[0.9rem] pt-[0.2rem]"
const COMMON_ACTION_BTN_CLASS =
  "cursor-pointer border-0 bg-transparent p-0 font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.15vw,1rem)] font-semibold text-[#f5e6c8] underline decoration-dotted underline-offset-4"

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
