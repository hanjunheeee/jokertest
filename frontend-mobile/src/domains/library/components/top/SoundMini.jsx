// 위 줄 작은 배경음 조절 (음소거 그림 버튼 + 짧은 슬라이더)
// top/LibraryTopBar.jsx가 씀, 데스크톱 SoundControl(화면 UI라 못 부름)과 같은 훅·그림
import { useAudioControl } from "@/shared/hooks/useAudioControl.js"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import MuteButton from "@m/shared/ui/sound/MuteButton.jsx"
import { TAP_CLASS } from "@m/domains/library/constants/libraryStyle.js"

// 값·동작은 데스크톱 useAudioControl, 슬라이더는 쓸어 넘기기와 안 섞이게 data-no-swipe
export default function SoundMini() {
  const control = useAudioControl(getGlobalBgmRef())
  const { sliderValue, disabled, onVolumeChange } = control

  return (
    <div className="flex shrink-0 items-center" role="group" aria-label="사운드 조절" data-no-swipe>
      <MuteButton control={control} className={TAP_CLASS} iconClassName="block h-9 w-9 select-none object-contain" />
      <input
        type="range"
        disabled={disabled}
        min={0}
        max={1}
        step={0.05}
        value={sliderValue}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        className="h-11 w-[clamp(4rem,18vw,6.5rem)] cursor-pointer accent-[#c9a46a] disabled:opacity-40"
        aria-label="배경음 볼륨"
      />
    </div>
  )
}
