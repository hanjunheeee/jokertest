// 설정 시트 탭 줄: 탭마다 그림 버튼, 고른 탭은 밝은 그림·글자색
// SettingsSheet가 시트 머리에 씀 (데스크톱 SettingTabs와 같은 그림)
import { INGAME_SETTING_ASSETS } from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingAssets.js"
import ImageButton from "../parts/ImageButton.jsx"

// 받은 탭만 그림 (방장 아니면 방관리 탭은 빠진 채로 옴)
export default function Tabs({ tabs, activeTab, onSelect }) {
  return (
    <nav className="flex w-full gap-1.5" aria-label="인게임 설정 탭">
      {tabs.map((tab) => {
        const active = activeTab === tab.id
        return (
          <ImageButton
            key={tab.id}
            label={tab.label}
            src={active ? INGAME_SETTING_ASSETS.tabActive : INGAME_SETTING_ASSETS.tabInactive}
            pressed={active}
            onClick={() => onSelect(tab.id)}
            className="h-11 flex-1"
            labelClassName={active ? "text-[#e8f0dc]" : "text-[#ebe2cc]/90"}
            testId={`setting-tab-${tab.id}`}
          />
        )
      })}
    </nav>
  )
}
