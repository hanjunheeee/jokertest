import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { SETTING_TABS } from "../constants/settingTabs.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const TAB_BTN_CLASS =
  "relative w-[clamp(6.25rem,11.5vw,8.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

const TAB_IMG_CLASS =
  "block h-auto w-full select-none object-contain object-center"

const TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(1.05rem,1.5vw,1.28rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

const TAB_NAV_CLASS =
  "mb-[clamp(0.55rem,1.3vh,0.75rem)] flex items-center justify-center gap-[clamp(0.48rem,1.08vw,0.75rem)]"

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
        className={TAB_IMG_CLASS}
      />
      <span className={TAB_LABEL_CLASS}>{tab.label}</span>
    </button>
  )
}

/** 일반/사운드 탭 선택 영역입니다. */
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
