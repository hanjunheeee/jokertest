/**
 * 인게임 설정 — 사운드 탭
 *
 * 볼륨 값은 이 탭이 소유하지 않는다. 설정 화면(UI-05)과 같은 store(settingsStore)에
 * 반영해야 하므로 useInGameSettingPanel이 들고 있는 값을 그대로 받아 쓴다.
 */
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

      {/* F-16(AC-03): 설정 화면(SoundSettingsTab)의 같은 항목과 값이 하나다 — 여기서 켠
          음소거는 새로고침 뒤에도 유지되고, 초기화는 정해진 기본값(false)으로 되돌린다.
          배경음은 이 항목과 무관하게 계속 차단된다. */}
      <SettingCheckboxRow
        label={INGAME_SETTING_SFX_MUTE.label}
        checked={sfxMuted === true}
        onChange={onSfxMutedChange}
      />
    </div>
  )
}
