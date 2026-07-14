import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { SETTING_TABS } from "../constants/settingTabs.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const TAB_BTN_CLASS =
  "relative min-w-[clamp(5.75rem,11.5vw,7.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

const TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.95rem,1.35vw,1.15rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

const TAB_NAV_CLASS =
  "-translate-y-[clamp(0.85rem,2.2vh,1.35rem)] mb-[clamp(0.55rem,1.3vh,0.75rem)] flex justify-center gap-[clamp(0.35rem,0.8vw,0.55rem)]"

/** 설정 탭 버튼 한 개입니다. */
function SettingTabButton({ tab, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      className={TAB_BTN_CLASS}
      aria-pressed={active}
    >
      <PublicAsset
        src={active ? SETTING_ASSETS.tabActive : SETTING_ASSETS.tabInactive}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={TAB_LABEL_CLASS}>{tab.label}</span>
    </button>
  )
}

/** 일반/그래픽/소리/입력 탭 선택 영역입니다. */
export default function SettingTabs({ activeTab, onSelect }) {
  return (
    <nav className={TAB_NAV_CLASS} aria-label="설정 탭">
      {SETTING_TABS.map((tab) => (
        <SettingTabButton
          key={tab.id}
          tab={tab}
          active={activeTab === tab.id}
          onSelect={onSelect}
        />
      ))}
    </nav>
  )
}
