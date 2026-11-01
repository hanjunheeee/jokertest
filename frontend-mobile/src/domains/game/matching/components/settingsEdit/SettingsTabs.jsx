// 설정 탭 줄 (일반·회의&투표), 고른 탭은 활성 그림
// SettingsEditSheet가 씀, 탭 그림·이름은 데스크톱 GameSetupTabs와 같음
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import { GAME_SETUP_TABS } from "@/domains/game/setup/constants/gameSetupOptions.js"

// 탭 줄 (두 칸 반반)
export default function SettingsTabs({ activeTab, onSelect }) {
  return (
    <nav className="grid shrink-0 grid-cols-2 gap-2" aria-label="인게임 설정 탭">
      {GAME_SETUP_TABS.map((tab) => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(tab.id)}
            className="relative flex h-11 cursor-pointer items-center justify-center overflow-hidden border-0 bg-transparent p-0 active:scale-[0.97]"
          >
            <PublicAsset
              src={active ? GAME_SETUP_ASSETS.tabActive : GAME_SETUP_ASSETS.tabInactive}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
            />
            <span className="relative font-subheading app-text-scaled [--app-text-size:1rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]">
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
