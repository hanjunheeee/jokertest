/**
 * 인게임 설정 — 채팅 / 사운드 / 방관리 탭 선택
 */
import { INGAME_SETTING_ASSETS } from "../../../constants/controls/ingameSetting/ingameSettingAssets.js"
import {
  INGAME_SETTING_TAB_BUTTON_CLASS,
  INGAME_SETTING_TAB_IMAGE_CLASS,
  INGAME_SETTING_TAB_LABEL_ACTIVE_CLASS,
  INGAME_SETTING_TAB_LABEL_CLASS,
  INGAME_SETTING_TAB_LABEL_INACTIVE_CLASS,
  INGAME_SETTING_TAB_NAV_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

function SettingTabButton({ tab, active, onSelect }) {
  const labelColorClass = active
    ? INGAME_SETTING_TAB_LABEL_ACTIVE_CLASS
    : INGAME_SETTING_TAB_LABEL_INACTIVE_CLASS

  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      className={INGAME_SETTING_TAB_BUTTON_CLASS}
      aria-pressed={active}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={active ? INGAME_SETTING_ASSETS.tabActive : INGAME_SETTING_ASSETS.tabInactive}
        alt=""
        className={INGAME_SETTING_TAB_IMAGE_CLASS}
      />
      <span className={`${INGAME_SETTING_TAB_LABEL_CLASS} ${labelColorClass}`.trim()}>
        {tab.label}
      </span>
    </button>
  )
}

export default function SettingTabs({ tabs, activeTab, onSelect }) {
  return (
    <nav className={INGAME_SETTING_TAB_NAV_CLASS} aria-label="인게임 설정 탭">
      {tabs.map((tab) => (
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
