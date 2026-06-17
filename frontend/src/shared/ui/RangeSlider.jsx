/**
 * 이미지 트랙·노브 range 슬라이더 — min~max 숫자 선택
 * (현재 import처 없음, 설정·볼륨 등 확장용 공통 컴포넌트)
 *
 * props
 * - value, min, max, onChange: 슬라이더 값
 * - ariaLabel: 접근성
 * - trackSrc, knobSrc: 트랙·노브 PNG (기본 rangeSliderAssets)
 * - controlClassName, valueClassName: 루트·상단 숫자 스타일
 *
 * 스타일은 constants/rangeSliderStyles.js 참고
 */
import { RANGE_SLIDER_ASSETS } from "@/shared/constants/rangeSliderAssets.js"
import {
  RANGE_SLIDER_CONTROL_CLASS,
  RANGE_SLIDER_KNOB_CLASS,
  RANGE_SLIDER_KNOB_HALF,
  RANGE_SLIDER_TRACK_CLASS,
  RANGE_SLIDER_TRACK_LANE_CLASS,
  RANGE_SLIDER_VALUE_CLASS,
  RANGE_SLIDER_WRAP_CLASS,
} from "@/shared/constants/rangeSliderStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** value를 0~1 비율로 — 노브 left calc용 */
function rangeRatio(value, min, max) {
  if (max === min) return 0 // 구간 없으면 시작 위치
  return (value - min) / (max - min)
}

/** 투명 input[type=range]로 조작하고 이미지 노브만 따라 움직이는 슬라이더 */
export default function RangeSlider({
  value,
  min,
  max,
  onChange,
  ariaLabel,
  trackSrc = RANGE_SLIDER_ASSETS.track,
  knobSrc = RANGE_SLIDER_ASSETS.knob,
  controlClassName = RANGE_SLIDER_CONTROL_CLASS,
  valueClassName = RANGE_SLIDER_VALUE_CLASS,
}) {
  const t = rangeRatio(value, min, max)

  return (
    <div className={controlClassName}>
      <p className={valueClassName} aria-live="polite">
        {value}
      </p>
      <div className={RANGE_SLIDER_WRAP_CLASS}>
        <div
          className={RANGE_SLIDER_TRACK_LANE_CLASS}
          style={{
            "--range-t": t,
            "--knob-half": RANGE_SLIDER_KNOB_HALF,
          }}
        >
          <PublicAsset
            src={trackSrc}
            alt=""
            className={RANGE_SLIDER_TRACK_CLASS}
          />
          <PublicAsset
            src={knobSrc}
            alt=""
            aria-hidden="true"
            className={RANGE_SLIDER_KNOB_CLASS}
            style={{
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
