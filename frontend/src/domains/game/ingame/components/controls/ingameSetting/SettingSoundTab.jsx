import {
  INGAME_SETTING_SFX_MUTE,
  INGAME_SETTING_SOUND_VOLUMES,
} from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { INGAME_SETTING_TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import SettingCheckboxRow from "./SettingCheckboxRow.jsx"
import SettingSliderRow from "./SettingSliderRow.jsx"

export default function SettingSoundTab({ volumes, onVolumeChange, sfxMuted, onSfxMutedChange }) {
  return (
    <div className={INGAME_SETTING_TAB_BODY_CLASS}>
      {INGAME_SETTING_SOUND_VOLUMES.map(({ id, label, min, max }) => (
        <SettingSliderRow
          key={id}
          label={label}
          min={min}
          max={max}
          value={volumes[id]}
          onChange={(next) => onVolumeChange(id, next)}
        />
      ))}

      <SettingCheckboxRow
        label={INGAME_SETTING_SFX_MUTE.label}
        checked={sfxMuted === true}
        onChange={onSfxMutedChange}
      />
    </div>
  )
}
