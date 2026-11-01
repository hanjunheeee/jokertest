// 방 설정 위 탭 줄 (일반·회의&투표·역할 배정)
// SetupPanel이 씀, 데스크톱 탭 그림의 붉은/어두운 색을 CSS로 옮김 (가로 긴 그림이 좁은 칸에선 찌그러져서)
import { SETUP_TABS } from "../constants/setupLayout.js"

const BASE_CLASS =
  "flex min-h-11 flex-1 items-center justify-center rounded-sm border px-1 font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-tight tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)] transition-colors"

const ACTIVE_CLASS =
  "border-[#c9a77a] bg-gradient-to-b from-[#7a2b2b] to-[#4e1717] shadow-[inset_0_0_0_2px_rgba(0,0,0,0.35)]"

const IDLE_CLASS =
  "border-[#6d5a48] bg-gradient-to-b from-[#3e332c] to-[#251d18] text-[#f5f0e6]/80 shadow-[inset_0_0_0_2px_rgba(0,0,0,0.35)]"

// 탭 줄 (고른 탭은 붉은 판)
export default function SetupTabs({ activeTab, onSelect }) {
  return (
    <nav className="flex w-full gap-1.5 land:flex-col" role="tablist" aria-label="인게임 설정 탭">
      {SETUP_TABS.map((tab) => {
        const active = tab.id === activeTab
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.id)}
            className={`${BASE_CLASS} ${active ? ACTIVE_CLASS : IDLE_CLASS}`}
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
