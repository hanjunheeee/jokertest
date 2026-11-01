// 설정 창 탭 줄: 탭마다 그림 버튼, 고른 탭은 다른 그림·글자색
// 설정 창 내용(SettingPanelContent)이 사용
import { INGAME_SETTING_ASSETS } from "../../../constants/controls/ingameSetting/ingameSettingAssets.js"
import {
  TAB_BTN_CLASS,
  TAB_IMG_CLASS,
  TAB_LABEL_ACTIVE_CLASS,
  TAB_LABEL_CLASS,
  TAB_LABEL_INACTIVE_CLASS,
  TAB_NAV_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 탭 버튼 하나 (고른 탭이면 밝은 그림, aria-pressed로도 알림)
function SettingTabButton({ tab, active, onSelect }) {
  const labelColorClass = active
    ? TAB_LABEL_ACTIVE_CLASS
    : TAB_LABEL_INACTIVE_CLASS

  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      className={TAB_BTN_CLASS}
      aria-pressed={active}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={active ? INGAME_SETTING_ASSETS.tabActive : INGAME_SETTING_ASSETS.tabInactive}
        alt=""
        className={TAB_IMG_CLASS}
      />
      <span className={`${TAB_LABEL_CLASS} ${labelColorClass}`.trim()}>
        {tab.label}
      </span>
    </button>
  )
}

// 받은 탭만 그림 (방장 아니면 방관리 탭은 빠진 채로 옴)
export default function SettingTabs({ tabs, activeTab, onSelect }) {
  return (
    <nav className={TAB_NAV_CLASS} aria-label="인게임 설정 탭">
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
