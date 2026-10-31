import {
  INGAME_SETTING_CHAT_CHECKBOXES,
  INGAME_SETTING_CHAT_SLIDER,
} from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { INGAME_SETTING_TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import { useSettingsStore } from "../../../../../settings/store/settingsStore.js"
import SettingCheckboxRow from "./SettingCheckboxRow.jsx"
import SettingSliderRow from "./SettingSliderRow.jsx"

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
