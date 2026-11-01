// 설정 사운드 탭 (음량 슬라이더들 + 효과음 음소거)
// components/SettingContentArea.jsx가 씀
import { SOUND_SETTING_VOLUMES } from "../../../../shared/constants/soundSettings.js"
import { SETTING_ASSETS } from "../../constants/settingAssets.js"
import CheckBox from "@/shared/ui/CheckBox"
import RangeSlider from "@/shared/ui/RangeSlider"
import { useSoundSettings } from "../../../../shared/hooks/useSoundSettings.js"

const ROW_CLASS =
  "flex shrink-0 items-center justify-between gap-[clamp(1rem,2.5vw,2rem)] border-b border-[#c4a574]/35 py-[clamp(0.35rem,0.85vh,0.5rem)] last:border-b-0"

const LABEL_CLASS =
  "min-w-0 flex-1 font-subheading app-text-scaled [--app-text-size:clamp(1.02rem,1.5vw,1.18rem)] font-bold leading-snug text-[#140c08]"

const SFX_MUTE_LABEL = "효과음 음소거"

// 값·바꾸기는 공용 useSoundSettings로 (인게임 설정 창과 같은 값)
export default function SoundSettingsTab() {
  const { volumes, setVolume, sfxMuted, setSfxMuted } = useSoundSettings()

  return (
    <div className="flex min-h-0 flex-col pb-[clamp(0.35rem,0.85vh,0.5rem)]">
      {SOUND_SETTING_VOLUMES.map(({ id, label, min, max }) => (
        <div key={id} className={ROW_CLASS} data-setting-row>
          <span className={LABEL_CLASS}>{label}</span>
          <RangeSlider
            ariaLabel={label}
            min={min}
            max={max}
            value={volumes[id]}
            onChange={(next) => setVolume(id, next)}
          />
        </div>
      ))}

      {/* 효과음만 따로 끄기 */}
      <div className={ROW_CLASS} data-setting-row>
        <span className={LABEL_CLASS}>{SFX_MUTE_LABEL}</span>
        <CheckBox
          checked={sfxMuted}
          onChange={setSfxMuted}
          ariaLabel={SFX_MUTE_LABEL}
          checkboxSrc={SETTING_ASSETS.checkbox}
          checkMarkSrc={SETTING_ASSETS.checkMark}
        />
      </div>
    </div>
  )
}
