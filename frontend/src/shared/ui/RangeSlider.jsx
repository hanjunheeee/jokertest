/**
 * 이미지 트랙·노브 range 슬라이더 — min~max 숫자 선택
 * (현재 import처 없음, 설정·볼륨 등 확장용 공통 컴포넌트)
 *
 * props
 * - value, min, max, onChange: 슬라이더 값
 * - ariaLabel: 접근성
 * - trackSrc, knobSrc: 트랙·노브 PNG (기본 rangeSliderAssets)
 * - controlClassName, valueClassName: 루트·상단 숫자 스타일
 * - wrapClassName, trackLaneClassName, trackClassName, knobClassName: 트랙·노브 레이아웃 오버라이드
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
  value, // 현재 선택된 값 — 부모가 소유하는 제어 컴포넌트라 이 값을 그대로 보여줌
  min, // 선택 가능한 최솟값
  max, // 선택 가능한 최댓값
  onChange, // 슬라이더를 움직일 때 호출할 콜백. 새 숫자 값을 인자로 넘겨줌
  ariaLabel, // 스크린리더가 읽어줄 설명
  trackSrc = RANGE_SLIDER_ASSETS.track, // 트랙(막대) 배경 이미지
  knobSrc = RANGE_SLIDER_ASSETS.knob, // 노브(손잡이) 이미지
  controlClassName = RANGE_SLIDER_CONTROL_CLASS, // 루트 레이아웃 클래스
  valueClassName = RANGE_SLIDER_VALUE_CLASS, // 상단 숫자 표시 클래스
  wrapClassName = RANGE_SLIDER_WRAP_CLASS,
  trackLaneClassName = RANGE_SLIDER_TRACK_LANE_CLASS,
  trackClassName = RANGE_SLIDER_TRACK_CLASS,
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
              left: "calc(var(--knob-half) + (100% - 2 * var(--knob-half)) * var(--range-t))",
            }}
          />
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            aria-label={ariaLabel}
            // 사용자가 슬라이더를 드래그/클릭할 때마다 실행. input 값은 문자열이라
            // Number()로 변환한 뒤 부모가 넘겨준 onChange 콜백으로 전달
            onChange={(event) => onChange(Number(event.target.value))}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      </div>
    </div>
  )
}
