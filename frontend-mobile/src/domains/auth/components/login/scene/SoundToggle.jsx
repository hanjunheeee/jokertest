// 배경음 조절 (음소거 아이콘 + 작은 그림 슬라이더), 데스크톱 SoundControl의 모바일판
// login/scene/TopBar.jsx가 오른쪽 위에 씀, 값·동작은 데스크톱 useAudioControl 그대로
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets"
import { getSliderKnotLeftPercent } from "@/shared/constants/soundControlLayout"
import { useAudioControl } from "@/shared/hooks/useAudioControl"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 아이콘 44px, 슬라이더는 위아래로 누르는 자리를 넓혀 손가락으로 끌기 쉽게 함
export default function SoundToggle() {
  const { sliderValue, isSilent, disabled, onVolumeChange, toggleMute } = useAudioControl(getGlobalBgmRef())
  const percent = Math.round(sliderValue * 100)

  return (
    <div className="flex items-center" role="group" aria-label="사운드 조절">
      <button
        type="button"
        disabled={disabled}
        onClick={toggleMute}
        className="relative z-10 -mr-2 h-11 w-11 shrink-0 cursor-pointer border-0 bg-transparent p-0 active:scale-95 disabled:opacity-60"
        aria-label={disabled ? "배경음 사용 안 함" : isSilent ? "음소거 해제" : "음소거"}
        title={disabled ? "배경음 사용 안 함" : undefined}
        aria-pressed={isSilent}
      >
        <PublicAsset
          src={isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon}
          alt=""
          className="block h-full w-full select-none"
        />
      </button>

      <div className="relative w-24 shrink-0 land:w-28! md:w-36">
        <PublicAsset src={SOUND_CONTROL_ASSETS.sliderBar} alt="" className="block h-auto w-full select-none" />
        {/* 투명 range가 조작을 받고, 손잡이 그림은 값 위치로 옮김 */}
        <input
          type="range"
          disabled={disabled}
          min={0}
          max={1}
          step={0.05}
          value={sliderValue}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          className="absolute inset-x-0 -inset-y-3 z-20 h-[calc(100%+1.5rem)] w-full cursor-pointer opacity-0"
          aria-label="배경음 볼륨"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <span
          className="pointer-events-none absolute top-1/2 z-10 w-[0.95rem] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${getSliderKnotLeftPercent(sliderValue)}%` }}
          aria-hidden="true"
        >
          <PublicAsset src={SOUND_CONTROL_ASSETS.sliderKnot} alt="" className="block h-auto w-full select-none" />
        </span>
      </div>
    </div>
  )
}
