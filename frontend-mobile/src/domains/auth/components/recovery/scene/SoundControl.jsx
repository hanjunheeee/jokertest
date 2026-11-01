// 배경음 조절 (음소거 아이콘 버튼 + 그림 슬라이더), 데스크톱 SoundControl의 모바일 크기판
// scene/SceneTopBar.jsx가 씀
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets"
import { getSliderKnotLeftPercent } from "@/shared/constants/soundControlLayout"
import { useAudioControl } from "@/shared/hooks/useAudioControl"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 값·동작은 데스크톱 useAudioControl 그대로, 크기만 폰 위 줄에 맞춤 (누르는 곳 44px)
export default function SoundControl({ audioRef = getGlobalBgmRef() }) {
  const { sliderValue, isSilent, disabled, onVolumeChange, toggleMute } = useAudioControl(audioRef)
  const percent = Math.round(sliderValue * 100)
  const knotLeft = getSliderKnotLeftPercent(sliderValue)

  return (
    <div className="flex items-center" role="group" aria-label="사운드 조절">
      {/* 배경음 끈 빌드면 잠그고 이유를 title로 보여 줌 */}
      <button
        type="button"
        disabled={disabled}
        onClick={toggleMute}
        className="relative z-10 -mr-2 size-11 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none active:scale-95 disabled:cursor-not-allowed"
        aria-label={disabled ? "배경음 사용 안 함" : isSilent ? "음소거 해제" : "음소거"}
        title={disabled ? "배경음 사용 안 함" : undefined}
        aria-pressed={isSilent}
      >
        <PublicAsset
          src={isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon}
          alt=""
          className="block h-auto w-full select-none"
        />
      </button>

      <div className="relative w-[7.5rem] shrink-0 md:w-[10rem]">
        <PublicAsset src={SOUND_CONTROL_ASSETS.sliderBar} alt="" className="block h-auto w-full select-none" />
        {/* 투명 range가 조작을 받음, 막대 그림보다 높게 잡아 손가락으로 잡기 쉽게 */}
        <input
          type="range"
          disabled={disabled}
          min={0}
          max={1}
          step={0.05}
          value={sliderValue}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          className="absolute inset-x-0 top-1/2 z-20 h-11 w-full -translate-y-1/2 cursor-pointer opacity-0"
          aria-label="배경음 볼륨"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        {/* 손잡이 자리 class는 데스크톱 SOUND_CONTROL_CLASSES.sliderKnotWrap 값 (Tailwind가 데스크톱 상수를 못 훑어서 글자로 씀) */}
        <span
          className="pointer-events-none absolute top-1/2 z-10 w-[24%] min-w-[0.9rem] max-w-[1.15rem] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${knotLeft}%` }}
          aria-hidden="true"
        >
          <PublicAsset src={SOUND_CONTROL_ASSETS.sliderKnot} alt="" className="block h-auto w-full select-none" />
        </span>
      </div>
    </div>
  )
}
