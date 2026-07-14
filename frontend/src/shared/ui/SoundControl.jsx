import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets"
import {
  SOUND_CONTROL_CLASSES,
  getSliderKnotLeftPercent,
} from "@/shared/constants/soundControlLayout"
import { useAudioControl } from "@/shared/hooks/useAudioControl"
import PublicAsset from "@/shared/ui/PublicAsset"

// 배경음 볼륨과 음소거를 조절하는 UI 컴포넌트입니다.
export default function SoundControl({ audioRef }) {
  // 실제 audio 제어 로직은 훅에 맡기고, 여기서는 화면에 필요한 값만 꺼냅니다.
  const { sliderValue, isSilent, onVolumeChange, toggleMute } = useAudioControl(audioRef)

  // range input의 접근성 값은 0~100 기준으로 보여줍니다.
  const percent = Math.round(sliderValue * 100)

  // 커스텀 knob 이미지가 슬라이더 위에서 이동할 위치입니다.
  const knotLeft = getSliderKnotLeftPercent(sliderValue)

  return (
    <div className="flex items-center" role="group" aria-label="사운드 조절">
      {/* 사운드 on/off 버튼입니다. 현재 상태에 따라 그림과 화면 읽기용 버튼 이름이 바뀝니다. */}
      <button
        type="button"
        onClick={toggleMute}
        className={`relative z-10 shrink-0 ${SOUND_CONTROL_CLASSES.iconSize} ${SOUND_CONTROL_CLASSES.iconOverlap} cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90`}
        aria-label={isSilent ? "음소거 해제" : "음소거"}
        aria-pressed={isSilent}
      >
        <PublicAsset
          src={isSilent ? SOUND_CONTROL_ASSETS.noSoundIcon : SOUND_CONTROL_ASSETS.soundOnIcon}
          alt=""
          className="block h-auto w-full select-none"
        />
      </button>

      {/* 실제 input은 투명하게 덮고, 보이는 bar/knob은 이미지로 표현합니다. */}
      <div className={`relative shrink-0 ${SOUND_CONTROL_CLASSES.barWidth} ${SOUND_CONTROL_CLASSES.barOffset}`}>
        <PublicAsset src={SOUND_CONTROL_ASSETS.sliderBar} alt="" className={SOUND_CONTROL_CLASSES.sliderBar} />
        <input
          type="range"
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
        {/* input 값에 맞춰 움직이는 커스텀 knob 이미지입니다. */}
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
