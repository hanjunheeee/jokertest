/**
 * 인게임 설정 — 사운드 탭
 */
import { useState } from "react"
import { INGAME_SETTING_SOUND_VOLUMES } from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { INGAME_SETTING_TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import SettingSliderRow from "./SettingSliderRow.jsx"

export default function SettingSoundTab() {
  const [volumes, setVolumes] = useState(() =>
    Object.fromEntries(
      INGAME_SETTING_SOUND_VOLUMES.map(({ id, defaultValue }) => [id, defaultValue]),
    ),
  )

  return (
    <div className={INGAME_SETTING_TAB_BODY_CLASS}>
      {INGAME_SETTING_SOUND_VOLUMES.map(({ id, label, min, max }) => (
        <SettingSliderRow
          key={id}
          label={label}
          min={min}
          max={max}
          value={volumes[id]}
          onChange={(next) => setVolumes((prev) => ({ ...prev, [id]: next }))}
        />
      ))}
    </div>
  )
}
