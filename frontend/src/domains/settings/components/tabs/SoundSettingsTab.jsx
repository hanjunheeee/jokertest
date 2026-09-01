import { useState } from "react"
import { SOUND_SETTING_VOLUMES } from "../../constants/soundSettings.js"
import RangeSlider from "@/shared/ui/RangeSlider"

const ROW_CLASS =
  "flex shrink-0 items-center justify-between gap-[clamp(1rem,2.5vw,2rem)] border-b border-[#c4a574]/35 py-[clamp(0.35rem,0.85vh,0.5rem)] last:border-b-0"

const LABEL_CLASS =
  "min-w-0 flex-1 font-subheading text-[clamp(1.02rem,1.5vw,1.18rem)] font-bold leading-snug text-[#140c08]"

export default function SoundSettingsTab() {
  const [volumes, setVolumes] = useState(() =>
    Object.fromEntries(
      SOUND_SETTING_VOLUMES.map(({ id, defaultValue }) => [id, defaultValue]),
    ),
  )

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
            onChange={(next) => setVolumes((prev) => ({ ...prev, [id]: next }))}
          />
        </div>
      ))}
    </div>
  )
}
