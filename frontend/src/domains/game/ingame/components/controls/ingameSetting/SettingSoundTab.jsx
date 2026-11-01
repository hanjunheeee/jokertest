// 설정 창 사운드 탭: 음량 밀대들과 효과음 음소거 체크
// 설정 창 내용(SettingPanelContent)이 사용, 음량 값은 위에서 받음
import {
  INGAME_SETTING_SFX_MUTE,
  INGAME_SETTING_SOUND_VOLUMES,
} from "../../../constants/controls/ingameSetting/ingameSettingData.js"
import { TAB_BODY_CLASS } from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import SettingCheckboxRow from "./SettingCheckboxRow.jsx"
import SettingSliderRow from "./SettingSliderRow.jsx"

// 음량 줄 목록은 공용 소리 설정 목록을 그대로 씀
export default function SettingSoundTab({ volumes, onVolumeChange, sfxMuted, onSfxMutedChange }) {
  return (
    <div className={TAB_BODY_CLASS}>
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
