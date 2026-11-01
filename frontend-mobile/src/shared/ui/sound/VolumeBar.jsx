// 배경음 크기 그림 막대 (막대 그림 + 투명 range + 손잡이 그림)
// SoundGroup이 씀
import { SOUND_CONTROL_ASSETS } from "@/shared/constants/soundControlAssets.js"
import { getSliderKnotLeftPercent } from "@/shared/constants/soundControlLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 투명 range가 조작을 받고, 손잡이 그림은 값 위치로 옮김 (모양은 look의 track·bar·input·knot)
export default function VolumeBar({ control, look }) {
  const { sliderValue, disabled, onVolumeChange } = control
  const valueAria = look.valueAria === false
    ? {}
    : { "aria-valuenow": Math.round(sliderValue * 100), "aria-valuemin": 0, "aria-valuemax": 100 }

  return (
    <div className={look.track}>
      <PublicAsset src={SOUND_CONTROL_ASSETS.sliderBar} alt="" className={look.bar} />
      <input
        type="range"
        disabled={disabled}
        min={0}
        max={1}
        step={0.05}
        value={sliderValue}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        className={look.input}
        aria-label="배경음 볼륨"
        {...valueAria}
      />
      <span className={look.knot} style={{ left: `${getSliderKnotLeftPercent(sliderValue)}%` }} aria-hidden="true">
        <PublicAsset src={SOUND_CONTROL_ASSETS.sliderKnot} alt="" className="block h-auto w-full select-none" />
      </span>
    </div>
  )
}
