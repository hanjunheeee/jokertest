/**
 * 인게임 설정 — 본문 (헤더 + 탭 + 탭별 설정)
 */
import { useEffect, useMemo, useRef, useState } from "react"
import {
  INGAME_SETTING_DEFAULT_TAB,
  INGAME_SETTING_TABS,
} from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import {
  INGAME_SETTING_SCROLL_CLASS,
  INGAME_SETTING_SCROLL_WRAP_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import { useInGameSettingIsHost } from "../../../hooks/useInGameSettingIsHost.js"
import SettingChatTab from "./SettingChatTab.jsx"
import SettingRoomTab from "./SettingRoomTab.jsx"
import SettingSoundTab from "./SettingSoundTab.jsx"
import SettingTabs from "./SettingTabs.jsx"
import SidePanelHeader from "../SidePanelHeader.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

function SettingTabPanel({ activeTab, onOpenKickPlayer }) {
  if (activeTab === "chat") return <SettingChatTab />
  if (activeTab === "room") return <SettingRoomTab onOpenKickPlayer={onOpenKickPlayer} />
  return <SettingSoundTab />
}

export default function SettingPanelContent({ onOpenKickPlayer }) {
  const scrollRef = useRef(null)
  const isHost = useInGameSettingIsHost()
  const [activeTab, setActiveTab] = useState(INGAME_SETTING_DEFAULT_TAB)

  const visibleTabs = useMemo(
    () => INGAME_SETTING_TABS.filter((tab) => !tab.hostOnly || isHost),
    [isHost],
  )

  useEffect(() => {
    if (visibleTabs.some((tab) => tab.id === activeTab)) return
    setActiveTab(INGAME_SETTING_DEFAULT_TAB)
  }, [activeTab, visibleTabs])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidePanelHeader
        title="설정"
        subtitle="게임 중 빠르게 변경할 수 있는 설정입니다."
      />

      <SettingTabs tabs={visibleTabs} activeTab={activeTab} onSelect={setActiveTab} />

      <div className={`${INGAME_SETTING_SCROLL_WRAP_CLASS} w-full min-w-0`}>
        <div ref={scrollRef} className={INGAME_SETTING_SCROLL_CLASS}>
          <SettingTabPanel activeTab={activeTab} onOpenKickPlayer={onOpenKickPlayer} />
        </div>

        <Scrollbar scrollRef={scrollRef} />
      </div>
    </div>
  )
}
