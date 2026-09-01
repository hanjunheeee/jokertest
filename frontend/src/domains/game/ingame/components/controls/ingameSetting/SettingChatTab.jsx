/**
 * 인게임 설정 — 채팅 탭
 */
import { useState } from "react"
import {
  INGAME_SETTING_CHAT_CHECKBOXES,
  INGAME_SETTING_CHAT_SLIDER,
} from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { INGAME_SETTING_TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import SettingCheckboxRow from "./SettingCheckboxRow.jsx"
import SettingSliderRow from "./SettingSliderRow.jsx"

export default function SettingChatTab() {
  const [textSize, setTextSize] = useState(INGAME_SETTING_CHAT_SLIDER.defaultValue)
  const [checks, setChecks] = useState(() =>
    Object.fromEntries(
      INGAME_SETTING_CHAT_CHECKBOXES.map(({ id, defaultChecked }) => [id, defaultChecked]),
    ),
  )

  return (
    <div className={INGAME_SETTING_TAB_BODY_CLASS}>
      <SettingSliderRow
        label={INGAME_SETTING_CHAT_SLIDER.label}
        min={INGAME_SETTING_CHAT_SLIDER.min}
        max={INGAME_SETTING_CHAT_SLIDER.max}
        value={textSize}
        onChange={setTextSize}
      />

      {INGAME_SETTING_CHAT_CHECKBOXES.map(({ id, label }) => (
        <SettingCheckboxRow
          key={id}
          label={label}
          checked={checks[id]}
          onChange={(next) => setChecks((prev) => ({ ...prev, [id]: next }))}
        />
      ))}
    </div>
  )
}
