// 화면 오른쪽 아래 소리 조절 자리 PageSoundControlArea (children을 소리 조절 위에 같이 쌓음)
// library·settings·store 화면과 user 화면 틀이 씀
import { PAGE_SOUND_CONTROL_AREA_CLASS } from "@/shared/constants/soundControlLayout.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"

// 기본은 앱 전체 배경음 ref를 조절, visible이 false면 안 그림
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
