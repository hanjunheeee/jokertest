// 방 설정 위 탭 줄 (일반·회의&투표), 탭 그림·글자·순서는 데스크톱 GameSetupTabs와 같음
// SetupPanel이 씀, 폰 세로는 두 칸 나란히, 폰 가로는 왼쪽 세로 줄
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import { GAME_SETUP_TABS } from "@/domains/game/setup/constants/gameSetupOptions.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const TAB_BTN_CLASS =
  "group relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none land:flex-none"

// 그림은 늘여 깔고 누를 때만 살짝 줄어듦
const TAB_IMG_CLASS =
  "pointer-events-none absolute inset-0 block h-full w-full select-none object-fill transition-transform group-active:scale-[0.97]"

const TAB_LABEL_CLASS =
  "pointer-events-none relative whitespace-nowrap px-1 font-subheading app-text-scaled [--app-text-size:1.1rem] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 탭 줄 (고른 탭은 활성 그림, 데스크톱처럼 aria-pressed)
export default function SetupTabs({ activeTab, onSelect }) {
  return (
    <nav className="flex w-full gap-1.5 land:flex-col" aria-label="인게임 설정 탭">
      {GAME_SETUP_TABS.map((tab) => {
        const active = tab.id === activeTab
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
