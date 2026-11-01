// 설정 창 내용: 머리·탭 줄·고른 탭 본문·방 코드 보기 버튼
// 설정 창(SettingPanel)이 사용, 탭·소리 값은 useInGameSettingPanel이 줌
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

// 고른 탭 본문 하나만 그림 (채팅·방관리 아니면 사운드)
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


// 방장일 때만 방관리 탭이 보임 (useInGameSettingIsHost로 봄)
export default function SettingPanelContent({ onOpenKickPlayer, onOpenRoomCode }) {
  const scrollRef = useRef(null)
  const isHost = useInGameSettingIsHost()
  const { activeTab, setActiveTab, visibleTabs, volumes, setVolume, sfxMuted, setSfxMuted } =
    useInGameSettingPanel({ isHost })

  // 탭 본문은 스크롤 칸 안, 방 코드 버튼은 칸 밖 아래에 고정
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
