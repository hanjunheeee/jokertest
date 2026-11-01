// 배경음 조절 (음소거 아이콘 + 그림 막대), 데스크톱 SoundControl을 좁은 위 줄 크기로
// top/SetupTopBar가 씀, 값·동작은 데스크톱 useAudioControl 그대로
import PublicAsset from "@/shared/ui/PublicAsset"
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets"
import { getSliderKnotLeftPercent } from "@/shared/constants/soundControlLayout"
import { useAudioControl } from "@/shared/hooks/useAudioControl"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"

// 아이콘 누르면 음소거, 막대 끌면 크기
export default function SoundControl() {
  const { sliderValue, isSilent, disabled, onVolumeChange, toggleMute } = useAudioControl(getGlobalBgmRef())
  const percent = Math.round(sliderValue * 100)

  return (
    <div className="flex shrink-0 items-center" role="group" aria-label="사운드 조절">
      <button
        type="button"
        disabled={disabled}
        onClick={toggleMute}
        aria-label={disabled ? "배경음 사용 안 함" : isSilent ? "음소거 해제" : "음소거"}
        aria-pressed={isSilent}
        className="relative z-10 flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0"
      >
        <PublicAsset
          src={isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon}
          alt=""
          className="block w-10 select-none"
        />
      </button>
      <div className="relative -ml-2 h-11 w-24">
        <PublicAsset
          src={SOUND_CONTROL_ASSETS.sliderBar}
          alt=""
          className="absolute inset-x-0 top-1/2 block h-auto w-full -translate-y-1/2 select-none"
        />
        {/* 투명 range가 조작을 받고, 손잡이 그림은 값 위치로 옮김 */}
        <input
          type="range"
          disabled={disabled}
          min={0}
          max={1}
          step={0.05}
          value={sliderValue}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
          aria-label="배경음 볼륨"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 z-10 w-3.5 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${getSliderKnotLeftPercent(sliderValue)}%` }}
        >
          <PublicAsset src={SOUND_CONTROL_ASSETS.sliderKnot} alt="" className="block h-auto w-full select-none" />
        </span>
      </div>
    </div>
  )
}
