// 설정 탭 줄 (일반·회의&투표), 고른 탭은 활성 그림
// SettingsEditSheet가 씀, 탭 그림·이름·순서는 데스크톱 GameSetupTabs와 같음 (폰 세로는 나란히, 가로는 왼쪽 세로 줄)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import { GAME_SETUP_TABS } from "@/domains/game/setup/constants/gameSetupOptions.js"
import { TAB_BTN_CLASS, TAB_IMG_CLASS, TAB_LABEL_CLASS } from "../../constants/settingsEditStyle.js"

// 탭 줄 (데스크톱처럼 aria-pressed)
export default function SettingsTabs({ activeTab, onSelect }) {
  return (
    <nav className="flex w-full gap-1.5 land:flex-col" aria-label="인게임 설정 탭">
      {GAME_SETUP_TABS.map((tab) => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(tab.id)}
            className={TAB_BTN_CLASS}
          >
            <PublicAsset
              src={active ? GAME_SETUP_ASSETS.tabActive : GAME_SETUP_ASSETS.tabInactive}
              alt=""
              className={TAB_IMG_CLASS}
            />
            <span className={TAB_LABEL_CLASS}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
