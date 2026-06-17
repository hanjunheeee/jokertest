/** RangeSlider 상단 — 현재 값 숫자 표시 */
export const RANGE_SLIDER_VALUE_CLASS =
  "mb-[0.12rem] pr-[clamp(0.5rem,0.9vw,0.7rem)] text-right font-subheading text-[clamp(1.22rem,1.75vw,1.42rem)] font-bold leading-none text-[#1a1008]"

/** 노브 반지름 — calc inset (트랙 밖으로 안 나가게) */
export const RANGE_SLIDER_KNOB_HALF = "clamp(0.65rem,0.95vw,0.78rem)"

/** 트랙·노브·투명 range input을 겹치는 슬라이더 영역 wrapper */
export const RANGE_SLIDER_WRAP_CLASS =
  "relative flex h-[clamp(1.9rem,2.75vw,2.35rem)] w-full items-center justify-center"

/** 트랙 이미지 비율 유지·가로만 축소 */
export const RANGE_SLIDER_TRACK_LANE_CLASS =
  "relative h-full w-[108%] max-w-none -translate-x-[4%]"

/** 슬라이더 트랙 PNG 이미지 */
export const RANGE_SLIDER_TRACK_CLASS =
  "pointer-events-none relative z-0 mx-auto block h-[clamp(1.45rem,2.1vw,1.85rem)] w-auto max-h-full max-w-full select-none"

/** value 비율에 따라 left로 이동하는 노브 이미지 */
export const RANGE_SLIDER_KNOB_CLASS =
  "pointer-events-none absolute top-[calc(50%-0.14rem)] z-[1] w-[clamp(1.3rem,1.85vw,1.55rem)] -translate-x-1/2 -translate-y-1/2 select-none"

/** RangeSlider 루트 — 값 텍스트 + 슬라이더 한 덩어리 너비 */
export const RANGE_SLIDER_CONTROL_CLASS = "w-[clamp(12.5rem,28%,16rem)] shrink-0"
