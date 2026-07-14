import { GAME_SETUP_ASSETS, GAME_SETUP_TABS } from "../constants/gameSetupAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const TAB_BTN_CLASS =
  "interactive-scale relative w-[clamp(21rem,45vw,27rem)] shrink-0 leading-none"

const TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-1 font-subheading text-[clamp(1.35rem,1.95vw,1.58rem)] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

const TAB_NAV_CLASS =
  "mb-[clamp(0.15rem,0.35vh,0.25rem)] flex shrink-0 flex-nowrap items-center justify-center gap-[clamp(0.25rem,0.5vw,0.4rem)] overflow-visible -translate-y-[clamp(0.6rem,1.6vh,0.95rem)]"

/** 상단 탭 버튼 한 개입니다. */
function GameSetupTabButton({ tab, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      className={TAB_BTN_CLASS}
      aria-pressed={active}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={active ? GAME_SETUP_ASSETS.tabActive : GAME_SETUP_ASSETS.tabInactive}
        alt=""
        className="block h-auto w-full max-h-none select-none object-contain"
      />
      <span className={TAB_LABEL_CLASS}>{tab.label}</span>
    </button>
  )
}

/** 일반 / 회의&투표 탭 선택 영역입니다. */
export default function GameSetupTabs({ activeTab, onSelect }) {
  return (
    <nav className={TAB_NAV_CLASS} aria-label="인게임 설정 탭">
      {GAME_SETUP_TABS.map((tab) => (
        <GameSetupTabButton
          key={tab.id}
          tab={tab}
          active={activeTab === tab.id}
          onSelect={onSelect}
        />
      ))}
    </nav>
  )
}
