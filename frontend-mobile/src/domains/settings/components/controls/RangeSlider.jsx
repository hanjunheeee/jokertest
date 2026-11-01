// 그림 슬라이더 (막대·손잡이 그림, 누르는 칸 높이 44px 이상)
// rows/SliderRow.jsx와 controls/BgmControl.jsx가 씀
import { RANGE_SLIDER_ASSETS } from "@/shared/constants/rangeSliderAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { knobLeft, ratioOf, useSliderDrag } from "../../hooks/useSliderDrag.js"

// 설정 막대: 손잡이 반폭(12px)만큼 양끝을 띄움
const SETTING_EDGE = { startPx: 12, endPx: 12 }

// role=slider로 직접 그림 (투명 range는 iOS에서 막대를 눌러 옮기지 못해서)
export default function RangeSlider({
    value,
    min,
    max,
    step = 1,
    onChange,
    ariaLabel,
    ariaValueText,
    disabled = false,
    trackSrc = RANGE_SLIDER_ASSETS.track,
    knobSrc = RANGE_SLIDER_ASSETS.knob,
    edge = SETTING_EDGE,
    trackClassName = "block h-auto w-full select-none",
    knobClassName = "w-6",
    className = "",
}) {
    const { trackRef, handlers } = useSliderDrag({ value, min, max, step, edge, disabled, onChange })
    const t = ratioOf(value, min, max)

    return (
        <div
            ref={trackRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={ariaLabel}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-valuetext={ariaValueText}
            aria-disabled={disabled || undefined}
            {...handlers}
            className={`relative flex min-h-11 w-full touch-pan-y select-none items-center outline-none focus-visible:ring-2 focus-visible:ring-[#8b5a2b]/60 ${disabled ? "opacity-50" : "cursor-pointer"} ${className}`}
        >
            <PublicAsset src={trackSrc} alt="" draggable={false} className={`pointer-events-none ${trackClassName}`} />
            {/* 손잡이는 값 계산과 같은 구간 안에서 움직임 */}
            <PublicAsset
                src={knobSrc}
                alt=""
                aria-hidden="true"
                draggable={false}
                className={`pointer-events-none absolute top-1/2 h-auto -translate-x-1/2 -translate-y-1/2 select-none ${knobClassName}`}
                style={{ left: knobLeft(edge, t) }}
            />
        </div>
    )
}
