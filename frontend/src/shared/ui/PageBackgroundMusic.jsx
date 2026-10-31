import { PAGE_SOUND_CONTROL_AREA_CLASS } from "@/shared/constants/soundControlLayout.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"

export default function PageSoundControlArea({
  audioRef = getGlobalBgmRef(),
  visible = true,
  className = PAGE_SOUND_CONTROL_AREA_CLASS,
  children = null,
}) {
  if (!visible) return null

  return (
    <div className={className}>
      {children}
      <SoundControl audioRef={audioRef} />
    </div>
  )
}
