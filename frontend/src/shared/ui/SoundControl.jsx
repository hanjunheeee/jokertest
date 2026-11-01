// 배경음 조절 (음소거 아이콘 버튼 + 그림 슬라이더)
// auth·matching·mode·setup·lobby 화면 컨트롤과 PageSoundControlArea가 씀
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets"
import {
  SOUND_CONTROL_CLASSES,
  getSliderKnotLeftPercent,
} from "@/shared/constants/soundControlLayout"
import { useAudioControl } from "@/shared/hooks/useAudioControl"
import { getGlobalBgmRef } from "@/shared/hooks/useBgmRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 값·동작은 useAudioControl이 맡고 여기선 그림만
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
        className={`relative z-10 shrink-0 ${SOUND_CONTROL_CLASSES.iconSize} ${SOUND_CONTROL_CLASSES.iconOverlap} cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90`}
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

      <div className={`relative shrink-0 ${SOUND_CONTROL_CLASSES.barWidth} ${SOUND_CONTROL_CLASSES.barOffset}`}>
        <PublicAsset src={SOUND_CONTROL_ASSETS.sliderBar} alt="" className={SOUND_CONTROL_CLASSES.sliderBar} />
        {/* 투명 range가 조작을 받고, 손잡이 그림은 값 위치로 옮김 */}
        <input
          type="range"
          disabled={disabled}
          min={0}
          max={1}
          step={0.05}
          value={sliderValue}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          className="peer absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
          aria-label="배경음 볼륨"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <span className={SOUND_CONTROL_CLASSES.sliderKnotWrap} style={{ left: `${knotLeft}%` }} aria-hidden="true">
          <span className="interactive-scale-peer-sm block w-full">
            <PublicAsset
              src={SOUND_CONTROL_ASSETS.sliderKnot}
              alt=""
              className={SOUND_CONTROL_CLASSES.sliderKnotImage}
            />
          </span>
        </span>
      </div>
    </div>
  )
}
