// 파일 역할: SoundSettingsTab.jsx - 화면을 구성하는 컴포넌트입니다.
import { SOUND_SETTING_VOLUMES } from "../../constants/soundSettings.js"
import { SETTING_ASSETS } from "../../constants/settingAssets.js"
import CheckBox from "@/shared/ui/CheckBox"
import RangeSlider from "@/shared/ui/RangeSlider"
import { useSoundSettings } from "../../hooks/useSoundSettings.js"

const ROW_CLASS =
  "flex shrink-0 items-center justify-between gap-[clamp(1rem,2.5vw,2rem)] border-b border-[#c4a574]/35 py-[clamp(0.35rem,0.85vh,0.5rem)] last:border-b-0"

const LABEL_CLASS =
  "min-w-0 flex-1 font-subheading app-text-scaled [--app-text-size:clamp(1.02rem,1.5vw,1.18rem)] font-bold leading-snug text-[#140c08]"

const SFX_MUTE_LABEL = "효과음 음소거"

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

      {/* F-16(AC-03): 효과음 음소거. 볼륨과 독립이라 음소거 중에 슬라이더를 움직여도 음소거는
          유지되고, 해제하면 그때의 Master × 효과음 곱이 그대로 적용된다. 배경음은 이 항목과
          무관하다 — 배경음은 Master × 배경음 슬라이더만 따른다(2026-09-22 AUDIO-01 완화). */}
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
