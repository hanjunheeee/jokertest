// 설정 시트 사운드 탭: 음량 밀대들(전체·배경음·효과음)과 효과음 음소거 체크
// SettingsBody가 씀, 값은 위에서 받음 (데스크톱 SettingSoundTab과 같은 목록)
import {
  INGAME_SETTING_SFX_MUTE,
  INGAME_SETTING_SOUND_VOLUMES,
} from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js"
import CheckRow from "./CheckRow.jsx"
import SliderRow from "./SliderRow.jsx"
import { TAB_BODY_CLASS } from "./rowStyle.js"

// 음량 줄 목록은 공용 소리 설정 목록을 그대로 씀
export default function SoundTab({ volumes, onVolumeChange, sfxMuted, onSfxMutedChange }) {
  return (
    <div className={TAB_BODY_CLASS}>
      {INGAME_SETTING_SOUND_VOLUMES.map(({ id, label, min, max }) => (
        <SliderRow
          key={id}
          label={label}
          min={min}
          max={max}
          value={volumes[id]}
          onChange={(next) => onVolumeChange(id, next)}
        />
      ))}
      <CheckRow
        label={INGAME_SETTING_SFX_MUTE.label}
        checked={sfxMuted === true}
        onChange={onSfxMutedChange}
      />
    </div>
  )
}
