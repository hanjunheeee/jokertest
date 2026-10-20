/**
 * 인게임 설정 — 채팅 탭
 */
import {
  INGAME_SETTING_CHAT_CHECKBOXES,
  INGAME_SETTING_CHAT_SLIDER,
} from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { INGAME_SETTING_TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import { useSettingsStore } from "../../../../../settings/store/settingsStore.js"
import SettingCheckboxRow from "./SettingCheckboxRow.jsx"
import SettingSliderRow from "./SettingSliderRow.jsx"

// F-15(AC-02/AC-06): 값 자체는 settingsStore(설정 화면과 공유하는 저장소)에 둔다 — 컴포넌트
// 지역 state로 두면 패널이 닫혔다 열릴 때마다(SidePanel의 AnimatePresence가 본문을
// 언마운트한다) 기본값으로 되돌아가고, 새로고침 후에도 유지되지 않는다. store는 "아직 고른
// 적 없음"(null)만 보관하고, 기본값이 무엇인지는 이 도메인(ingameSettingData.js)이 정한다.
function defaultChatChecks() {
  return Object.fromEntries(
    INGAME_SETTING_CHAT_CHECKBOXES.map(({ id, defaultChecked }) => [id, defaultChecked]),
  )
}

export default function SettingChatTab() {
  const storedTextSize = useSettingsStore((s) => s.chatTextSize)
  const setChatTextSize = useSettingsStore((s) => s.setChatTextSize)
  const storedChecks = useSettingsStore((s) => s.chatChecks)
  const setChatCheck = useSettingsStore((s) => s.setChatCheck)

  const textSize = storedTextSize ?? INGAME_SETTING_CHAT_SLIDER.defaultValue
  // store에 일부 키만 있어도(예: show-time만 토글) 나머지는 ingameSettingData 기본값을 유지한다.
  const checks = { ...defaultChatChecks(), ...(storedChecks ?? {}) }

  return (
    <div className={INGAME_SETTING_TAB_BODY_CLASS}>
      <SettingSliderRow
        label={INGAME_SETTING_CHAT_SLIDER.label}
        min={INGAME_SETTING_CHAT_SLIDER.min}
        max={INGAME_SETTING_CHAT_SLIDER.max}
        value={textSize}
        onChange={setChatTextSize}
      />

      {INGAME_SETTING_CHAT_CHECKBOXES.map(({ id, label }) => (
        <SettingCheckboxRow
          key={id}
          label={label}
          checked={Boolean(checks[id])}
          onChange={(next) => setChatCheck(id, next)}
        />
      ))}
    </div>
  )
}
