// 그림 슬라이더 자리·모양 class와 손잡이 반폭
// RangeSlider가 씀
export const VALUE_CLASS =
  "mb-[0.12rem] pr-[clamp(0.5rem,0.9vw,0.7rem)] text-right font-subheading app-text-scaled [--app-text-size:clamp(1.22rem,1.75vw,1.42rem)] font-bold leading-none text-[#1a1008]"

// 손잡이 반폭, 막대 양끝 여백 계산에 씀
export const RANGE_SLIDER_KNOB_HALF = "clamp(0.65rem,0.95vw,0.78rem)"

export const RANGE_SLIDER_WRAP_CLASS =
  "relative flex h-[clamp(1.9rem,2.75vw,2.35rem)] w-full items-center justify-center"

export const TRACK_LANE_CLASS =
  "relative h-full w-[108%] max-w-none -translate-x-[4%]"

export const TRACK_CLASS =
  "pointer-events-none relative z-0 mx-auto block h-[clamp(1.45rem,2.1vw,1.85rem)] w-auto max-h-full max-w-full select-none"

export const RANGE_SLIDER_KNOB_CLASS =
  "pointer-events-none absolute top-[calc(50%-0.14rem)] z-[1] w-[clamp(1.3rem,1.85vw,1.55rem)] -translate-x-1/2 -translate-y-1/2 select-none"

export const CONTROL_CLASS = "w-[clamp(12.5rem,28%,16rem)] shrink-0"
