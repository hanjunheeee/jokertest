import { PAGE_SOUND_CONTROL_AREA_CLASS } from "@/shared/constants/soundControlLayout.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"

/**
 * 우하단 사운드 조절바 영역 — 로비·게임 모드 선택 등과 같은 위치·간격입니다.
 * `children`으로 친구 목록 버튼 등을 같은 열 위쪽에 넣을 수 있습니다.
 */
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
