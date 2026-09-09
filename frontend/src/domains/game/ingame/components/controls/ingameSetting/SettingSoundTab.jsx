/**
 * 인게임 설정 — 사운드 탭
 *
 * 볼륨 값은 이 탭이 소유하지 않는다. 설정 화면(UI-05)과 같은 store(settingsStore)에
 * 반영해야 하므로 useInGameSettingPanel이 들고 있는 값을 그대로 받아 쓴다.
 */
import { INGAME_SETTING_SOUND_VOLUMES } from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { INGAME_SETTING_TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import SettingSliderRow from "./SettingSliderRow.jsx"

export default function SettingSoundTab({ volumes, onVolumeChange }) {
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
    </div>
  )
}
