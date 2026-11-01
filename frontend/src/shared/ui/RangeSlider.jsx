// 그림 슬라이더 (막대·손잡이 그림 위에 안 보이는 range 입력)
// settings 일반·소리 탭과 ingame 설정 창 슬라이더 줄이 씀
import { RANGE_SLIDER_ASSETS } from "@/shared/constants/rangeSliderAssets.js"
import {
  CONTROL_CLASS,
  RANGE_SLIDER_KNOB_CLASS,
  RANGE_SLIDER_KNOB_HALF,
  TRACK_CLASS,
  TRACK_LANE_CLASS,
  VALUE_CLASS,
  RANGE_SLIDER_WRAP_CLASS,
} from "@/shared/constants/rangeSliderStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 0~1 위치, min=max면 0 (0으로 나누기 막기)
function rangeRatio(value, min, max) {
  if (max === min) return 0
  return (value - min) / (max - min)
}

// 조작은 투명 input이 받고, 손잡이 그림은 css 변수(--range-t)로 따라감
export default function RangeSlider({
  value,
  min,
  max,
  onChange,
  ariaLabel,
  trackSrc = RANGE_SLIDER_ASSETS.track,
  knobSrc = RANGE_SLIDER_ASSETS.knob,
  controlClassName = CONTROL_CLASS,
  valueClassName = VALUE_CLASS,
  wrapClassName = RANGE_SLIDER_WRAP_CLASS,
  trackLaneClassName = TRACK_LANE_CLASS,
  trackClassName = TRACK_CLASS,
  knobClassName = RANGE_SLIDER_KNOB_CLASS,
}) {
  const t = rangeRatio(value, min, max)

  return (
    <div className={controlClassName}>
      <p className={valueClassName} aria-live="polite">
        {value}
      </p>
      <div className={wrapClassName}>
        <div
          className={trackLaneClassName}
          style={{
            "--range-t": t,
            "--knob-half": RANGE_SLIDER_KNOB_HALF,
          }}
        >
          <PublicAsset
            src={trackSrc}
            alt=""
            className={trackClassName}
          />
          <PublicAsset
            src={knobSrc}
            alt=""
            aria-hidden="true"
            className={knobClassName}
            style={{
              // 손잡이 반폭만큼 양끝을 띄워 막대 밖으로 안 나가게
              left: "calc(var(--knob-half) + (100% - 2 * var(--knob-half)) * var(--range-t))",
            }}
          />
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            aria-label={ariaLabel}
            onChange={(event) => onChange(Number(event.target.value))}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
    </div>
  )
}
